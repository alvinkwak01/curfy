const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const ts = require("typescript");

const policyFile = "lib/premiumExceptionPolicy.ts";
function load(path, customRequire) {
  const text = readFileSync(join(__dirname, "..", path), "utf8");
  const js = ts.transpileModule(text, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", js)(
    customRequire, module, module.exports
  );
  return module.exports;
}
const policy = load(policyFile, require);
const premiumPolicy = load("lib/premiumPolicy.ts", require);
const base = new Date("2026-11-02T23:00:00-08:00");
const ms = base.getTime();
const after20 = new Date(ms + 20 * 60_000);
const t1 = "curfy-single-app-2B5CE120-66A6-4E53-A6BB-661E51A9AD01";
const t2 = "curfy-single-app-2B5CE120-66A6-4E53-A6BB-661E51A9AD02";
const group = "curfy-block-custom";
const entry = (ticket, startedAt, expiresAt, bedtimeEndAt = ms+7*60*60_000) => ({
  activityName: "curfy-premium-exception-" + ticket.slice("curfy-single-app-".length).toLowerCase(),
  selectionId: ticket,
  committedSelectionId: group,
  startedAt, expiresAt, bedtimeEndAt,
});
const A = entry(t1, ms, ms+15*60_000);
const B = entry(t2, ms+9*60_000, ms+24*60_000);

function fixture({
  ledger, blocked = ["C"], authorization = true,
  ignoreBlock = false, overblock = false,
  ignoreStop = false, clockValid = true, scheduledId = group,
  targetInParent = true, targetCategoryCount = 0,
} = {}) {
  const apps = new Set(blocked);
  const storage = new Map();
  if (ledger !== undefined) storage.set(policy.PREMIUM_EXCEPTIONS_KEY, ledger);
  storage.set("curfy-scheduled-selection-id", scheduledId);
  if (clockValid) storage.set("curfy-bedtime-clock-window",
    { startMinute: 22*60, endMinute: 6*60 });
  const monitors = new Set(ledger && typeof ledger === "object" && !Array.isArray(ledger)
    ? Object.keys(ledger) : []);
  const calls = [];
  const tokens = id => id === group ? ["A", "B", "C"] :
    id === t1 ? ["A"] : id === t2 ? ["B"] : [];
  const native = {
    AuthorizationStatus: { approved: 2 },
    getAuthorizationStatus: () => authorization ? 2 : 1,
    userDefaultsGet: key => storage.get(key),
    userDefaultsSet: (key, value) => { calls.push(["persist", key]); storage.set(key, value); },
    activitySelectionMetadata: ({ activitySelectionId }) => ({
      applicationCount: tokens(activitySelectionId).length,
      categoryCount: targetCategoryCount, webdomainCount: 0,
      includeEntireCategory: false,
    }),
    intersection: ({ activitySelectionId }, second) => ({
      applicationCount: tokens(activitySelectionId).filter(token =>
        second.currentBlocklist ? apps.has(token) :
          tokens(second.activitySelectionId).includes(token) && targetInParent
      ).length,
      categoryCount: 0, webdomainCount: 0,
    }),
    blockSelection: ({ activitySelectionId }) => {
      calls.push(["block", activitySelectionId]);
      if (!ignoreBlock) {
        tokens(activitySelectionId).forEach(t => apps.add(t));
        if (overblock) apps.add("B");
      }
    },
    configureActions: c => calls.push(["actions", c]),
    getActivities: () => [...monitors],
    stopMonitoring: ids => {
      calls.push(["stop", ids]);
      if (!ignoreStop) ids.forEach(x=>monitors.delete(x));
    },
  };
  const mod = load("lib/premiumExceptionRecovery.ts", name => {
    if (name === "react-native-device-activity") return native;
    if (name === "@/lib/premiumExceptionPolicy") return policy;
    if (name === "@/lib/premiumPolicy") return premiumPolicy;
    throw Error("Unexpected import " + name);
  });
  return { mod, apps, calls, storage, monitors };
}

test("free tier with no Premium ledger never calls native mutation", () => {
  const f = fixture();
  assert.equal(f.mod.reconcilePremiumAppExceptions(after20), 0);
  assert.equal(f.calls.length, 0);
});

test("active Premium exception remains untouched until its own expiration", () => {
  const f = fixture({ ledger: { [B.activityName]: B }, blocked: ["A", "C"] });
  assert.equal(f.mod.reconcilePremiumAppExceptions(after20), 0);
  assert.equal(f.calls.length, 0);
  assert.equal(f.monitors.size, 1);
});

test("expired app A is re-shielded while active app B remains unshielded", () => {
  const f = fixture({ ledger: {
    [A.activityName]: A, [B.activityName]: B
  }});
  assert.equal(f.mod.reconcilePremiumAppExceptions(after20), 1);
  assert.deepEqual([...f.apps].sort(), ["A", "C"]);
  assert.equal(f.monitors.has(A.activityName), false);
  assert.equal(f.monitors.has(B.activityName), true);
  assert.deepEqual(Object.keys(f.storage.get(policy.PREMIUM_EXCEPTIONS_KEY)), [B.activityName]);
  assert.deepEqual(f.calls.filter(x=>x[0]==="block"), [["block", t1]]);
  assert.equal(f.mod.reconcilePremiumAppExceptions(after20), 0);
});

test("already reblocked by a native callback is cleared without reblocking twice", () => {
  const f = fixture({ ledger: {[A.activityName]:A}, blocked:["A","B","C"] });
  assert.equal(f.mod.reconcilePremiumAppExceptions(after20), 1);
  assert.equal(f.calls.some(x=>x[0]==="block"), false);
  assert.deepEqual(f.storage.get(policy.PREMIUM_EXCEPTIONS_KEY), {});
});

test("after original 6am cutoff the recovery never shields an old app", () => {
  const at7am = new Date(ms+8*60*60_000);
  const f = fixture({ ledger:{[A.activityName]:A}, blocked:[] });
  assert.equal(f.mod.reconcilePremiumAppExceptions(at7am), 1);
  assert.deepEqual([...f.apps], []);
  assert.equal(f.calls.some(x=>x[0]==="block"), false);
});

test("after selection was replaced recovery cannot re-shield a formerly chosen app", () => {
  const f = fixture({ ledger: {[A.activityName]:A}, scheduledId:"curfy-block-social" });
  assert.equal(f.mod.reconcilePremiumAppExceptions(after20), 1);
  assert.equal(f.apps.has("A"), false);
});

test("revoked Screen Time permission preserves ledger and monitor for later recovery", () => {
  const f = fixture({ ledger: {[A.activityName]:A}, authorization:false });
  assert.equal(f.mod.reconcilePremiumAppExceptions(after20), 0);
  assert.equal(f.monitors.size, 1);
  assert.equal(f.calls.length, 0);
});

test("corrupted native ledger is rejected without cleaning any monitor", () => {
  const f = fixture({ ledger: "invalid" });
  assert.throws(() => f.mod.reconcilePremiumAppExceptions(after20), /exception records/);
  assert.equal(f.calls.length, 0);
});

test("unreliable native re-shield fails closed and retains recovery metadata", () => {
  const f = fixture({ ledger:{[A.activityName]:A}, ignoreBlock:true });
  assert.throws(()=>f.mod.reconcilePremiumAppExceptions(after20), /did not confirm/);
  assert.equal(f.monitors.size, 1);
  assert.ok(f.storage.get(policy.PREMIUM_EXCEPTIONS_KEY)[A.activityName]);
});

test("native stop failure restores the reblock action and preserves the ledger", () => {
  const f = fixture({ ledger:{[A.activityName]:A}, ignoreStop:true });
  assert.throws(()=>f.mod.reconcilePremiumAppExceptions(after20), /could not stop/);
  assert.ok(f.calls.some(x=>x[0]==="actions" && x[1].actions.length === 1));
  assert.equal(f.monitors.size, 1);
  assert.ok(f.storage.get(policy.PREMIUM_EXCEPTIONS_KEY)[A.activityName]);
});

test("unexpected re-shield of active app B is detected, with its record preserved", () => {
  const f = fixture({ ledger:{
    [A.activityName]: A, [B.activityName]: B,
  }, overblock: true });
  assert.throws(()=>f.mod.reconcilePremiumAppExceptions(after20), /single-app re-shielding|still-active exception/);
  assert.equal(f.monitors.size, 2);
  assert.equal(Object.keys(f.storage.get(policy.PREMIUM_EXCEPTIONS_KEY)).length, 2);
});

test("a changed native singleton refuses to re-shield and preserves its record", () => {
  const f = fixture({ ledger:{[A.activityName]:A}, targetCategoryCount:1 });
  assert.throws(()=>f.mod.reconcilePremiumAppExceptions(after20), /no longer has one valid app token/);
  assert.equal(f.monitors.size, 1);
});

test("a token no longer in the committed parent requires recovery guidance", () => {
  const f = fixture({ ledger:{[A.activityName]:A}, targetInParent:false });
  assert.throws(()=>f.mod.reconcilePremiumAppExceptions(after20), /selection changed/);
  assert.equal(f.monitors.size, 1);
});

test("no old-window app shield is applied when saved clock is invalid", () => {
  const f = fixture({ ledger:{[A.activityName]:A}, clockValid:false });
  assert.equal(f.mod.reconcilePremiumAppExceptions(after20), 1);
  assert.equal(f.calls.some(x=>x[0]==="block"), false);
});

test("Recovery never modifies a free-tier exception or unshields an app", () => {
  const text = readFileSync(join(__dirname, "../lib/premiumExceptionRecovery.ts"), "utf8");
  assert.doesNotMatch(text, /unblockSelection\(/);
  assert.doesNotMatch(text, /curfy-active-exception/);
});
