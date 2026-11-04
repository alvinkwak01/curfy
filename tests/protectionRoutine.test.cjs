const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const ts = require("typescript");
function load(path) {
  const js = ts.transpileModule(readFileSync(join(__dirname, "..", path), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const mod = { exports: {} };
  new Function("module", "exports", js)(mod, mod.exports);
  return mod.exports;
}
const routine = load("lib/protectionRoutine.ts");
const time = load("lib/bedtimeWindow.ts");

test("Evening, Morning and Both use one continuous window with transparent defaults", () => {
  assert.deepEqual(routine.PROTECTION_ROUTINES.map(x => x.id), ["evening", "morning", "both"]);
  assert.deepEqual(routine.routineDefaults("evening"), { start: "23:00", end: "06:00" });
  assert.deepEqual(routine.routineDefaults("morning"), { start: "06:00", end: "09:00" });
  assert.deepEqual(routine.routineDefaults("both"), { start: "23:00", end: "09:00" });
  for (const option of routine.PROTECTION_ROUTINES) {
    const { start, end } = routine.routineDefaults(option.id);
    assert.doesNotThrow(() => time.assertMonitorableBedtimeSchedule(start, end));
  }
});

test("existing installations without a stored routine retain Evening and their saved clock times", () => {
  assert.equal(routine.parseProtectionRoutine(null), "evening");
  assert.equal(routine.parseProtectionRoutine(""), "evening");
  assert.equal(routine.parseProtectionRoutine("unknown"), "evening");
  assert.equal(routine.parseProtectionRoutine("morning"), "morning");
  assert.equal(routine.parseProtectionRoutine("both"), "both");
});

test("Morning shields selected apps after 6 AM and releases them at 9 AM, not at 3 AM", () => {
  const { start, end } = routine.routineDefaults("morning");
  assert.equal(time.isBedtimeWindowActive(new Date("2026-11-02T05:59:00"), start, end), false);
  assert.equal(time.isBedtimeWindowActive(new Date("2026-11-02T06:00:00"), start, end), true);
  assert.equal(time.isBedtimeWindowActive(new Date("2026-11-02T08:59:59"), start, end), true);
  assert.equal(time.isBedtimeWindowActive(new Date("2026-11-02T09:00:00"), start, end), false);
});

test("Evening ends at 6 AM; Both keeps shielding without a gap until 9 AM", () => {
  const evening = routine.routineDefaults("evening");
  const both = routine.routineDefaults("both");
  const checkpoints = [
    ["2026-11-01T22:59:00", false, false],
    ["2026-11-01T23:00:00", true, true],
    ["2026-11-02T03:00:00", true, true],
    ["2026-11-02T06:00:00", false, true],
    ["2026-11-02T08:59:59", false, true],
    ["2026-11-02T09:00:00", false, false],
  ];
  checkpoints.forEach(([at, expectedEvening, expectedBoth]) => {
    assert.equal(time.isBedtimeWindowActive(new Date(at), evening.start, evening.end), expectedEvening, "Evening " + at);
    assert.equal(time.isBedtimeWindowActive(new Date(at), both.start, both.end), expectedBoth, "Both " + at);
  });
});

test("routine uses timing labels, not inferred sleep and wake data", () => {
  assert.equal(routine.routineIsEveningBased("morning"), false);
  assert.equal(routine.routineIsEveningBased("evening"), true);
  assert.equal(routine.routineIsEveningBased("both"), true);
  assert.match(routine.startQuestion("morning"), /morning protection/);
  assert.equal(routine.clockLabel("23:00"), "11:00 PM");
  assert.equal(routine.clockLabel("06:00"), "6:00 AM");
});

test("users can see whether the app unlocks today or tomorrow", () => {
  assert.equal(routine.protectionWindowLabel("23:00", "06:00"), "11:00 PM → 6:00 AM (next day)");
  assert.equal(routine.protectionWindowLabel("06:00", "09:00"), "6:00 AM → 9:00 AM (same day)");
  assert.equal(routine.protectionWindowLabel("23:00", "09:00"), "11:00 PM → 9:00 AM (next day)");
  assert.equal(routine.cutoffDayLabel("08:00", "09:00"), "same day");
});

test("new onboarding infers reminder behavior from the start clock, never a routine question", () => {
  assert.equal(routine.inferRoutineFromStart("23:00"), "evening");
  assert.equal(routine.inferRoutineFromStart("02:00"), "evening");
  assert.equal(routine.inferRoutineFromStart("06:00"), "morning");
  assert.equal(routine.inferRoutineFromStart("14:00"), "morning");
  assert.throws(() => routine.inferRoutineFromStart("25:00"), /Invalid/);
});
