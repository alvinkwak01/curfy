const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const ts = require("typescript");

const js = ts.transpileModule(
  readFileSync(join(__dirname, "../lib/nightHistory.ts"), "utf8"),
  { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }
).outputText;
const mod = { exports: {} };
new Function("module", "exports", js)(mod, mod.exports);
const { countLoggedNightStreak, shouldStartNightLog } = mod.exports;

test("one recorded previous night still counts today before the next bedtime", () => {
  assert.equal(countLoggedNightStreak([{ date: "2026-10-31" }], new Date("2026-11-01T12:00:00")), 1);
});

test("duplicate log rows never inflate the consecutive-night streak", () => {
  const nights = ["2026-10-30", "2026-10-31", "2026-10-31"].map(date => ({ date }));
  assert.equal(countLoggedNightStreak(nights, new Date("2026-11-01T11:00:00")), 2);
});

test("a missing calendar day breaks the streak even when older rows exist", () => {
  assert.equal(countLoggedNightStreak([
    { date: "2026-10-31" }, { date: "2026-10-29" },
  ], new Date("2026-11-01T11:00:00")), 1);
  assert.equal(countLoggedNightStreak([
    { date: "2026-10-29" },
  ], new Date("2026-11-01T11:00:00")), 0);
});

test("calendar streak is correct through fall DST and spring DST", () => {
  const previous = process.env.TZ;
  process.env.TZ = "America/Los_Angeles";
  try {
    assert.equal(countLoggedNightStreak([
      { date: "2026-10-31" }, { date: "2026-10-30" },
    ], new Date("2026-11-01T03:30:00")), 2);
    assert.equal(countLoggedNightStreak([
      { date: "2026-03-07" }, { date: "2026-03-06" },
    ], new Date("2026-03-08T04:30:00")), 2);
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test("logging the next night doesn't depend on yesterday's in-memory locked flag", () => {
  const older = [{ date: "2026-11-01" }];
  assert.equal(shouldStartNightLog(older, "2026-11-02"), true);
  assert.equal(shouldStartNightLog(older, "2026-11-01"), false);
  assert.equal(shouldStartNightLog([{ date: "2026-11-02" }, ...older], "2026-11-02"), false);
});
