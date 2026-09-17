import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { build } from "esbuild";

const binary = process.env.ELECTRON_TEST_BINARY;
const remotePath = process.env.ELECTRON_REMOTE_PATH;
for (const scenario of ["relaunch", "close", "stalled"]) {
	test(`real Electron: ${scenario}`, { skip: !binary || !remotePath }, async () => {
		const dir = await mkdtemp(path.join(tmpdir(), "tray-electron-"));
		try {
			const bundle = path.join(dir, "plugin.cjs");
			const report = path.join(dir, "report.txt");
			await build({ entryPoints: ["src/main.ts"], bundle: true, external: ["obsidian"], format: "cjs", outfile: bundle });
			const child = spawn(binary, [path.resolve("tests/electron/main.cjs")], {
				env: { ...process.env, ELECTRON_RUN_AS_NODE: "", TRAY_REMOTE_PATH: remotePath, TRAY_BUNDLE_PATH: bundle, TRAY_REPORT_PATH: report, TRAY_PROFILE_PATH: path.join(dir, "profile"), TRAY_SCENARIO: scenario },
				stdio: ["ignore", "pipe", "pipe"],
			});
			let output = "";
			child.stdout.on("data", (data) => { output += data; });
			child.stderr.on("data", (data) => { output += data; });
			const timeout = setTimeout(() => child.kill("SIGKILL"), 12000);
			const code = await new Promise((resolve, reject) => {
				child.on("error", reject);
				child.on("exit", resolve);
			}).finally(() => clearTimeout(timeout));
			const events = await readFile(report, "utf8");
			assert.equal(code, 0, events + output);
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
