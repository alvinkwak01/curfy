const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const ts = require("typescript");

// Compile just the pure time helper with the project's installed TypeScript.
const source = readFileSync(join(__dirname, "../lib/bedtimeWindow.ts"), "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;
const mod = { exports: {} };
new Function("module", "exports", js)(mod, mod.exports);
const { currentBedtimeWindow, nativeDateComponents } = mod.exports;

function at(text) { return new Date(text); }
function check(start, end, date, expected) {
  const window = currentBedtimeWindow(at(date), start, end);
  assert.equal(window !== null, expected);
}

test("overnight bedtime spans midnight and ends at wake time", () => {
  check("23:00", "06:00", "2026-10-31T23:00:00", true);
  check("23:00", "06:00", "2026-11-01T02:00:00", true);
  check("23:00", "06:00", "2026-11-01T06:00:00", false);
  check("23:00", "06:00", "2026-10-31T22:59:59", false);
});

test("daytime windows stay on the current date", () => {
  check("09:30", "17:00", "2026-10-31T11:00:00", true);
  check("09:30", "17:00", "2026-10-31T18:00:00", false);
});

test("invalid/same endpoints are rejected rather than silently protecting 24 hours", () => {
  assert.throws(() => currentBedtimeWindow(new Date(), "23:00", "23:00"));
  assert.throws(() => currentBedtimeWindow(new Date(), "24:00", "06:00"));
  assert.throws(() => currentBedtimeWindow(new Date(), "bad", "06:00"));
});

test("native date components retain the intended local calendar date", () => {
  assert.deepEqual(nativeDateComponents(at("2026-10-31T23:01:02")), {
    year: 2026, month: 10, day: 31, hour: 23, minute: 1, second: 2,
  });
});

test("DST boundaries are based on local dates, not 24-hour arithmetic", () => {
  const previous = process.env.TZ;
  process.env.TZ = "America/Los_Angeles";
  try {
    const spring = currentBedtimeWindow(at("2026-03-08T03:30:00"), "23:00", "06:00");
    assert.equal(spring?.start.getDate(), 7);
    assert.equal(spring?.end.getDate(), 8);
    assert.equal(spring?.end.getHours(), 6);
    // Spring-forward night is 7 hours, not 8.
    assert.equal((spring.end - spring.start) / 3_600_000, 7);

    const fall = currentBedtimeWindow(at("2026-11-01T01:30:00"), "23:00", "06:00");
    assert.equal(fall?.start.getDate(), 31);
    assert.equal(fall?.end.getDate(), 1);
    // Fall-back night is 9 hours, not 8.
    assert.equal((fall.end - fall.start) / 3_600_000, 9);
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
