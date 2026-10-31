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
const { currentBedtimeWindow, isBedtimeWindowActive, nativeDateComponents } = mod.exports;

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
  assert.equal(isBedtimeWindowActive(new Date(), "23:00", "23:00"), false);
  assert.equal(isBedtimeWindowActive(new Date(), "bad", "06:00"), false);
});

test("native date components retain the local instant and timezone offset", () => {
  const date = at("2026-10-31T23:01:02");
  assert.deepEqual(nativeDateComponents(date), {
    year: 2026, month: 10, day: 31, hour: 23, minute: 1, second: 2,
    timeZoneOffsetInSeconds: -date.getTimezoneOffset() * 60,
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
    // Spring-forward makes a 23:00–06:00 window 6 elapsed hours (normally 7).
    assert.equal((spring.end - spring.start) / 3_600_000, 6);

    const fall = currentBedtimeWindow(at("2026-11-01T01:30:00"), "23:00", "06:00");
    assert.equal(fall?.start.getDate(), 31);
    assert.equal(fall?.end.getDate(), 1);
    // Fall-back makes a 23:00–06:00 window 8 elapsed hours (normally 7).
    assert.equal((fall.end - fall.start) / 3_600_000, 8);

    // At fall-back, 01:55 PDT + 15 minutes becomes 01:10 PST.
    // Per-endpoint offsets distinguish the repeated 01:xx clock hour.
    const repeatedHourStart = new Date("2026-11-01T01:55:00-07:00");
    const repeatedHourEnd = new Date(repeatedHourStart.getTime() + 15 * 60_000);
    const startComponents = nativeDateComponents(repeatedHourStart);
    const endComponents = nativeDateComponents(repeatedHourEnd);
    assert.equal(startComponents.hour, 1);
    assert.equal(startComponents.minute, 55);
    assert.equal(startComponents.timeZoneOffsetInSeconds, -7 * 3600);
    assert.equal(endComponents.hour, 1);
    assert.equal(endComponents.minute, 10);
    assert.equal(endComponents.timeZoneOffsetInSeconds, -8 * 3600);
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
