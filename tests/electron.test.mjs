import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { build } from "esbuild";

const binary = process.env.ELECTRON_TEST_BINARY;
const remotePath = process.env.ELECTRON_REMOTE_PATH;
for (const scenario of ["relaunch", "close", "stalled", "group", "stacking"]) {
	test(`real Electron: ${scenario}`, { skip: !binary || !remotePath || (scenario === "stacking" && process.platform !== "darwin") }, async () => {
		const dir = await mkdtemp(path.join(tmpdir(), "tray-electron-"));
		try {
			const bundle = path.join(dir, "plugin.cjs");
			const report = path.join(dir, "report.txt");
			const unrelatedBinary = path.join(dir, "unrelated");
			if (scenario === "stacking") await promisify(execFile)("/usr/bin/swiftc", [path.resolve("tests/electron/unrelated.swift"), "-o", unrelatedBinary], { timeout: 60000 });
			await build({ entryPoints: [["group", "stacking"].includes(scenario) ? "src/core/window-manager.ts" : "src/main.ts"], bundle: true, external: ["obsidian"], format: "cjs", outfile: bundle });
			const child = spawn(binary, [path.resolve("tests/electron/main.cjs")], {
				env: { ...process.env, ELECTRON_RUN_AS_NODE: "", TRAY_REMOTE_PATH: remotePath, TRAY_BUNDLE_PATH: bundle, TRAY_REPORT_PATH: report, TRAY_PROFILE_PATH: path.join(dir, "profile"), TRAY_SCENARIO: scenario, TRAY_UNRELATED_BINARY: unrelatedBinary },
				stdio: ["ignore", "pipe", "pipe"],
			});
			let output = "";
			child.stdout.on("data", (data) => { output += data; });
			child.stderr.on("data", (data) => { output += data; });
			const timeout = setTimeout(() => child.kill("SIGKILL"), ["group", "stacking"].includes(scenario) ? 23000 : 12000);
			const code = await new Promise((resolve, reject) => {
				child.on("error", reject);
				child.on("exit", resolve);
			}).finally(() => clearTimeout(timeout));
			const events = await readFile(report, "utf8");
			assert.equal(code, 0, events + output);
			if (scenario === "stacking") {
				assert.match(events, /stacking passed/);
				return;
			}
			if (scenario === "group") {
				assert.match(events, /group transitions passed/);
				return;
			}
			assert.match(events, /window position saved/);
			if (scenario === "close") assert.match(events, /tracked windows: 1/);
			else {
				assert.match(events, /relaunch scheduled/);
				assert.match(events, scenario === "stalled" ? /app exit/ : /app quit/);
			}
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
}
