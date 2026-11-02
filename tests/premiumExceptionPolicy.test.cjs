const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const ts = require("typescript");
const source = readFileSync(join(__dirname, "../lib/premiumExceptionPolicy.ts"), "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;
const m = { exports: {} };
new Function("module", "exports", js)(m, m.exports);
const policy = m.exports;
const t = "curfy-single-app-2B5CE120-66A6-4E53-A6BB-661E51A9AD01";
const t2 = "curfy-single-app-2B5CE120-66A6-4E53-A6BB-661E51A9AD02";
const now = new Date("2026-11-02T23:00:00-08:00").getTime();
const end = now + 7 * 60 * 60_000;
function plan(ticketId = t, ledger = {}, cutoff = end) {
  return policy.planPremiumAppException({
    ticketId, committedSelectionId: "curfy-block-custom",
    nowMs: now, bedtimeEndAt: cutoff, currentLedger: ledger,
  });
}
function stored(entry) {
  const { needsMonitor, ...persisted } = entry;
  return persisted;
}

test("one app uses its own opaque UUID monitor and 15-minute native end", () => {
  const a = plan();
  assert.equal(a.activityName, "curfy-premium-exception-2b5ce120-66a6-4e53-a6bb-661e51a9ad01");
  assert.equal(a.selectionId, t);
  assert.equal(a.expiresAt, now + 15 * 60_000 + 1_000);
  assert.equal(a.needsMonitor, true);
  assert.equal(policy.parsePremiumExceptionLedger({[a.activityName]: stored(a)})[a.activityName].selectionId, t);
});

test("two distinct app exceptions retain independent names and expirations", () => {
  const a = plan();
  const b = plan(t2, { [a.activityName]: stored(a) });
  assert.notEqual(a.activityName, b.activityName);
  assert.equal(policy.activePremiumExceptions({
    [a.activityName]: stored(a), [b.activityName]: stored(b),
  }, now + 60_000).length, 2);
});

test("the same ticket cannot be used to overwrite an existing native monitor", () => {
  const a = plan();
  assert.throws(() => plan(t, { [a.activityName]: stored(a) }), /already has an exception/);
});

test("expired monitors require native recovery before starting another exception", () => {
  const a = plan();
  const expired = { ...stored(a), startedAt: now - 20 * 60_000,
    expiresAt: now - 5 * 60_000, bedtimeEndAt: end };
  assert.throws(() => plan(t2, { [a.activityName]: expired }), /native recovery/);
});

test("close-to-cutoff exceptions never register a too-short native monitor", () => {
  const a = plan(t, {}, now + 9 * 60_000);
  assert.equal(a.needsMonitor, false);
  assert.equal(a.expiresAt, now + 9 * 60_000);
});

test("a callback never reblocks early, late, outside the window, or for another app", () => {
  const a = stored(plan());
  const l = { [a.activityName]: a };
  assert.equal(policy.premiumReblockIsDue(l, a.activityName, a.expiresAt - 1, true), false);
  assert.equal(policy.premiumReblockIsDue(l, a.activityName, a.expiresAt, true), true);
  assert.equal(policy.premiumReblockIsDue(l, a.activityName, end, true), false);
  assert.equal(policy.premiumReblockIsDue(l, a.activityName, a.expiresAt, false), false);
  assert.equal(policy.premiumReblockIsDue(l, "curfy-premium-exception-unknown", a.expiresAt, true), false);
});

test("corrupt shared app data must not silently replace existing exceptions", () => {
  for (const val of [false, [], "garbage", { malicious: {} },
    { ["curfy-premium-exception-unknown"]: {} }]) {
    assert.throws(() => policy.parsePremiumExceptionLedger(val), /exception/);
    assert.throws(() => plan(t2, val), /exception/);
  }
});

test("only authentic-looking native scoped tickets can be planned", () => {
  for (const ticketId of ["curfy-block-custom", "../", "curfy-single-app-xyz", t + "-extra"]) {
    assert.throws(() => plan(ticketId), /valid protected app/);
  }
});

test("the Free exception architecture is not replaced or enabled for Premium", () => {
  const screenTime = readFileSync(join(__dirname, "../lib/screenTime.ts"), "utf8");
  assert.match(screenTime, /assertOneFreeAppSelected\(selectionId\)/);
  assert.doesNotMatch(screenTime, /grantPremiumAppException\s*\(/);
});

test("native monitor extension accepts only exact current one-token premium callbacks", () => {
  const swift = readFileSync(join(__dirname,
    "../targets/ActivityMonitorExtension/DeviceActivityMonitorExtension.swift"), "utf8");
  assert.match(swift, /premiumExceptionLedgerKey = "curfy-premium-active-exceptions"/);
  assert.match(swift, /premiumReblockIsDue\(activityName: activity\.rawValue, nowMs: nowMs\)/);
  assert.match(swift, /guard isWithinConfiguredCurfyWindow\(\) == true/);
  assert.match(swift, /nowMs >= expiresMs, nowMs < windowEndMs/);
  assert.match(swift, /single\.applicationTokens\.count == 1/);
  assert.match(swift, /single\.applicationTokens\.isSubset\(of: committed\.applicationTokens\)/);
  assert.match(swift, /recordedActivity == activityName/);
});

test("late daily start re-unshields ONLY active validated one-app exceptions", () => {
  const swift = readFileSync(join(__dirname,
    "../targets/ActivityMonitorExtension/DeviceActivityMonitorExtension.swift"), "utf8");
  assert.match(swift, /for selection in activePremiumScopedSelections\(at: nowMs\)/);
  assert.match(swift, /unblockSelection\(\s*removeSelection: selection/);
  assert.match(swift, /startMs <= nowMs, nowMs < expiresMs, nowMs < windowEndMs/);
  assert.match(swift, /if activity\.rawValue == "curfy-bedtime"/);
});

test("multi-exception callback code does not replace the original Free hold record", () => {
  const swift = readFileSync(join(__dirname,
    "../targets/ActivityMonitorExtension/DeviceActivityMonitorExtension.swift"), "utf8");
  assert.match(swift, /dictionary\(forKey: "curfy-active-exception"\)/);
  assert.match(swift, /activity\.rawValue\.hasPrefix\("curfy-exception-"\)/);
  assert.match(swift, /activity\.rawValue\.hasPrefix\(premiumActivityPrefix\)/);
});
