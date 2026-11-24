const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const ts = require("typescript");

const source = readFileSync(join(__dirname, "../lib/restartProtectionPolicy.ts"), "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;
const mod = { exports: {} };
new Function("module", "exports", js)(mod, mod.exports);
const { mayRestartSetup } = mod.exports;

test("Restart Setup cannot bypass active bedtime protection without the hold", () => {
  assert.equal(mayRestartSetup({
    insideBedtime: true, screenTimeAuthorized: true,
    hasSelectedMode: true, activeException: false,
  }), false);
});
test("120-second exception permits restart, but not an uncompleted hold", () => {
  assert.equal(mayRestartSetup({
    insideBedtime: true, screenTimeAuthorized: true,
    hasSelectedMode: true, activeException: true,
  }), true);
});
test("outside bedtime or revoked authorization allows setup recovery", () => {
  for (const values of [
    { insideBedtime: false, screenTimeAuthorized: true, hasSelectedMode: true, activeException: false },
    { insideBedtime: true, screenTimeAuthorized: false, hasSelectedMode: true, activeException: false },
    { insideBedtime: true, screenTimeAuthorized: true, hasSelectedMode: false, activeException: false },
  ]) {
    assert.equal(mayRestartSetup(values), true);
  }
});
