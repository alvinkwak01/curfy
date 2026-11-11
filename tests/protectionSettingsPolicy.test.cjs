const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const ts = require("typescript");
const js = ts.transpileModule(
  readFileSync(join(__dirname, "../lib/protectionSettingsPolicy.ts"), "utf8"),
  { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }
).outputText;
const mod = { exports: {} };
new Function("module", "exports", js)(mod, mod.exports);
const { protectionSettingsChanged, allowProtectionReconfiguration } = mod.exports;

test("profile-only Settings change never requires native rescheduling", () => {
  const before = { bedtime: "23:00", wakeTime: "06:00", blockMode: "custom" };
  assert.equal(protectionSettingsChanged(before, { ...before }, false), false);
  assert.equal(allowProtectionReconfiguration({
    changingProtection: false, insideCurrentBedtime: true,
    authorized: true, hasConfiguredApp: true, activeException: false,
  }), true);
});
test("changing bedtime/wake/app picker requires an intentional protection change", () => {
  const prev = { bedtime: "23:00", wakeTime: "06:00", blockMode: "custom" };
  assert.equal(protectionSettingsChanged(prev, { ...prev, bedtime: "00:30" }, false), true);
  assert.equal(protectionSettingsChanged(prev, { ...prev, wakeTime: "07:00" }, false), true);
  assert.equal(protectionSettingsChanged(prev, { ...prev, blockMode: "social" }, false), true);
  assert.equal(protectionSettingsChanged(prev, prev, true), true);
});
test("Settings cannot be a one-tap bypass during active bedtime", () => {
  assert.equal(allowProtectionReconfiguration({
    changingProtection: true, insideCurrentBedtime: true,
    authorized: true, hasConfiguredApp: true, activeException: false,
  }), false);
});
test("configured protection can change after a completed exception or outside bedtime", () => {
  for (const settings of [
    { insideCurrentBedtime: false, authorized: true, hasConfiguredApp: true, activeException: false },
    { insideCurrentBedtime: true, authorized: true, hasConfiguredApp: true, activeException: true },
    { insideCurrentBedtime: true, authorized: false, hasConfiguredApp: true, activeException: false },
    { insideCurrentBedtime: true, authorized: true, hasConfiguredApp: false, activeException: false },
  ]) {
    assert.equal(allowProtectionReconfiguration({ changingProtection: true, ...settings }), true);
  }
});

test("switching Evening / Morning / Both is treated as a protected scheduling change", () => {
  const previous = { bedtime: "23:00", wakeTime: "06:00", blockMode: "custom", routine: "evening" };
  assert.equal(protectionSettingsChanged(previous, { ...previous, routine: "morning" }, false), true);
  assert.equal(protectionSettingsChanged(previous, { ...previous, routine: "both" }, false), true);
  assert.equal(protectionSettingsChanged(previous, { ...previous }, false), false);
});
