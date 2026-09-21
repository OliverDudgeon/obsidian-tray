import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { runInNewContext } from "node:vm";

const bundle = await build({ entryPoints: ["src/utils/accelerator.ts"], bundle: true, format: "cjs", write: false });
const module = { exports: {} };
runInNewContext(bundle.outputFiles[0].text, { module, exports: module.exports });
const { acceleratorFromEvent } = module.exports;

const press = (code, mods = {}) =>
	acceleratorFromEvent({ code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods });

test("maps codes and modifiers to accelerators", () => {
	assert.equal(press("KeyO", { metaKey: true, shiftKey: true }), "Meta+Shift+O");
	assert.equal(press("Digit1", { ctrlKey: true, altKey: true }), "Ctrl+Alt+1");
	assert.equal(press("ArrowUp", { ctrlKey: true }), "Ctrl+Up");
	assert.equal(press("F5"), "F5");
	assert.equal(press("Numpad3", { altKey: true }), "Alt+num3");
	assert.equal(press("Slash"), "/");
	assert.equal(press("NumpadEnter"), "Return");
});

test("ignores modifier-only and unknown keys", () => {
	assert.equal(press("ShiftLeft", { shiftKey: true }), null);
	assert.equal(press("MetaRight", { metaKey: true }), null);
	assert.equal(press("F25"), null);
});
