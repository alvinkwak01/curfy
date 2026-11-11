const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const ts = require("typescript");
const js = ts.transpileModule(
  readFileSync(join(__dirname, "../lib/timeWheelMath.ts"), "utf8"),
  { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }
).outputText;
const mod = { exports: {} };
new Function("module", "exports", js)(mod, mod.exports);
const { wrapTimeUnit, swipeSteps, flingSteps, clockString } = mod.exports;

test("swiping UP advances hours/minutes; DOWN reverses", () => {
  assert.equal(swipeSteps(-90, 30), 3);
  assert.equal(swipeSteps(90, 30), -3);
  assert.equal(swipeSteps(-13, 30), 0);
});
test("swipe can advance multiple minutes, not only one number", () => {
  assert.equal(wrapTimeUnit(40 + swipeSteps(-180, 30), 60), 46);
  assert.equal(wrapTimeUnit(1 + swipeSteps(120, 30), 24), 21);
});
test("clock wheels wrap naturally at midnight and 59 minutes", () => {
  assert.equal(clockString(23 + 1, 59 + 1), "00:00");
  assert.equal(clockString(-1, -1), "23:59");
  assert.equal(wrapTimeUnit(59 + 4, 60), 3);
});
test("momentum is finite and deliberate, never an unbounded wheel spin", () => {
  assert.equal(flingSteps(0.1), 0);
  assert.ok(flingSteps(-4) > 0);
  assert.ok(flingSteps(4) < 0);
  assert.equal(flingSteps(-100), 6);
  assert.equal(flingSteps(100), -6);
  assert.equal(flingSteps(NaN), 0);
});
test("bad gesture inputs cannot change the selected clock number", () => {
  assert.equal(swipeSteps(NaN, 30), 0);
  assert.equal(swipeSteps(-100, 0), 0);
  assert.throws(() => wrapTimeUnit(5, 0), /Invalid/);
});
