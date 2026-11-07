const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const ts = require("typescript");

function loadTS(path, deps) {
  const source = readFileSync(join(__dirname, "..", path), "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", js)(deps, mod, mod.exports);
  return mod.exports;
}
const policy = loadTS("lib/premiumExceptionPolicy.ts", require);
const premiumPolicy = loadTS("lib/premiumPolicy.ts", require);
const now = new Date("2026-11-02T23:00:00-08:00");
const t1 = "curfy-single-app-2B5CE120-66A6-4E53-A6BB-661E51A9AD01";
const t2 = "curfy-single-app-2B5CE120-66A6-4E53-A6BB-661E51A9AD02";
const t3 = "curfy-single-app-2B5CE120-66A6-4E53-A6BB-661E51A9AD03";
const group = "curfy-block-custom";

function fixture({
  entitlement = "owned", authorized = true, failStart = false,
  silentlyFailUnblock = false, extraUnblock = false,
  validateFails = false, cutoffMinutes = 240,
  scope = { [t1]: "A", [t2]: "B", [t3]: "C" },
} = {}) {
  const storage = new Map();
  const blocked = new Set(["A", "B", "C"]);
  const activities = new Set(["curfy-bedtime"]);
  const calls = [];
  const tokensFor = (sel) => sel === group ? ["A","B","C"] :
    scope[sel] ? [scope[sel]] : [];
  storage.set("curfy-scheduled-selection-id", group);
  storage.set("curfy-bedtime-clock-window", {startMinute:22*60, endMinute:6*60});
  const native = {
    AuthorizationStatus: {approved:2},
    getAuthorizationStatus: () => authorized ? 2 : 1,
    userDefaultsGet: key => storage.get(key),
    userDefaultsSet: (key, value) => { calls.push(["persist", key]); storage.set(key, value); },
    activitySelectionMetadata: ({ activitySelectionId: id }) => ({
      applicationCount: tokensFor(id).length, categoryCount: 0,
      webdomainCount: 0, includeEntireCategory: false,
    }),
    intersection: ({ activitySelectionId: id }, second) => ({
      applicationCount: tokensFor(id).filter(token =>
        second.currentBlocklist ? blocked.has(token) :
          tokensFor(second.activitySelectionId).includes(token)
      ).length,
      categoryCount: 0, webdomainCount: 0,
    }),
    configureActions: action => calls.push(["action", action]),
    startMonitoring: async name => {
      calls.push(["start", name]);
      if (failStart) throw Error("native failed to start monitor");
      activities.add(name);
    },
    getActivities: () => [...activities],
    stopMonitoring: names => { calls.push(["stop", names]); names.forEach(x => activities.delete(x)); },
    unblockSelection: ({ activitySelectionId: id }) => {
      calls.push(["unblock", id]);
      if (silentlyFailUnblock) return;
      tokensFor(id).forEach(v => blocked.delete(v));
      if (extraUnblock) blocked.delete("B");
    },
    blockSelection: ({ activitySelectionId: id }) => {
      calls.push(["block", id]);
      tokensFor(id).forEach(v => blocked.add(v));
    },
  };
  const mod = loadTS("lib/premiumAppException.ts", name => {
    if (name === "react-native-device-activity") return native;
    if (name === "@/modules/curfy-protected-apps") return {
      validateProtectedAppChoice: () => {
        calls.push(["validate"]);
        if (validateFails) throw Error("saved app choice changed");
        return true;
      },
    };
    if (name === "@/lib/premiumStore") return {
      refreshPremiumEntitlement: async () => { calls.push(["storekit"]); return entitlement; },
    };
    if (name === "@/lib/premiumPolicy") return premiumPolicy;
    if (name === "@/lib/bedtimeWindow") return {
      currentBedtimeWindow: (d) => ({ end: new Date(d.getTime() + cutoffMinutes * 60_000) }),
      nativeDateComponents: () => ({ hour: 23, minute: 0 }),
    };
    if (name === "@/lib/screenTime") return {
      getScreenTimeAccessStatus: () => authorized ? "authorized" : "denied",
      selectionIdForMode: mode => "curfy-block-" + mode,
    };
    if (name === "@/lib/premiumExceptionRecovery") {
      const recover = loadTS("lib/premiumExceptionRecovery.ts", recoverName => {
        if (recoverName === "react-native-device-activity") return native;
        if (recoverName === "@/lib/premiumExceptionPolicy") return policy;
        if (recoverName === "@/lib/premiumPolicy") return premiumPolicy;
        throw Error("Unexpected recovery import " + recoverName);
      });
      return recover;
    }
    if (name === "@/lib/premiumExceptionPolicy") return policy;
    throw Error("Unexpected dependency " + name);
  });
  const grant = (ticketId=t1, at=now) => mod.grantPremiumAppException({
    bedtime: "22:00", wakeTime: "06:00", mode: "custom", ticketId, now: at,
  });
  return { mod, native, calls, storage, activities, blocked, grant };
}

test("verified Premium installs one native reblock before releasing only the intended app", async () => {
  const f = fixture();
  const end = await f.grant();
  // The separate native monitor ends at 15m+1s so Apple's second-precision
  // DeviceActivity accepts its minimum interval. Access itself is <=15m.
  assert.equal(end, now.getTime() + 900000);
  assert.deepEqual([...f.blocked].sort(), ["B","C"]);
  assert.equal(f.activities.size, 2);
  const start = f.calls.findIndex(x => x[0] === "start");
  const unshield = f.calls.findIndex(x => x[0] === "unblock");
  const action = f.calls.findIndex(x => x[0] === "action" && x[1].actions.length);
  const ledger = f.storage.get(policy.PREMIUM_EXCEPTIONS_KEY);
  assert.equal(Object.keys(ledger).length, 1);
  assert.ok(action >= 0 && action < start && start < unshield);
  assert.equal(ledger[Object.keys(ledger)[0]].selectionId, t1);
});

test("two different protected apps receive two independent monitors and keep the third shielded", async () => {
  const f = fixture();
  await f.grant(t1);
  await f.grant(t2);
  assert.deepEqual([...f.blocked], ["C"]);
  assert.equal(f.activities.size, 3);
  assert.equal(Object.keys(f.storage.get(policy.PREMIUM_EXCEPTIONS_KEY)).length, 2);
  assert.equal(f.calls.filter(x => x[0] === "unblock").length, 2);
});

test("a second ticket for an already unlocked app never installs another monitor", async () => {
  const duplicate = "curfy-single-app-2B5CE120-66A6-4E53-A6BB-661E51A9AD04";
  const f = fixture({ scope: { [t1]: "A", [duplicate]: "A" } });
  await f.grant(t1);
  await assert.rejects(() => f.grant(duplicate), /already temporarily unlocked/);
  assert.equal(f.activities.size, 2);
});

test("premium purchase is checked by StoreKit before touching native blocking", async () => {
  const f = fixture({ entitlement: "unknown" });
  await assert.rejects(() => f.grant(), /ownership has not been verified/);
  assert.deepEqual([...f.blocked].sort(), ["A","B","C"]);
  assert.equal(f.storage.has(policy.PREMIUM_EXCEPTIONS_KEY), false);
  assert.equal(f.calls.filter(x => x[0] === "start").length, 0);
});

test("revoked Screen Time permission cannot start an exception", async () => {
  const f = fixture({ authorized: false });
  await assert.rejects(() => f.grant(), /Screen Time access is required/);
  assert.equal(f.calls.length, 0);
});

test("changed native app ticket refuses to unshield or schedule", async () => {
  const f = fixture({ validateFails: true });
  await assert.rejects(() => f.grant(), /saved app choice changed/);
  assert.equal(f.activities.size, 1);
  assert.equal(f.storage.has(policy.PREMIUM_EXCEPTIONS_KEY), false);
});

test("monitor setup failure never releases an app; native ledger rolls back", async () => {
  const f = fixture({ failStart: true });
  await assert.rejects(() => f.grant(), /native failed to start monitor/);
  assert.deepEqual([...f.blocked].sort(), ["A","B","C"]);
  assert.deepEqual(f.storage.get(policy.PREMIUM_EXCEPTIONS_KEY), {});
  assert.equal(f.activities.size, 1);
  assert.equal(f.calls.some(x => x[0] === "unblock"), false);
});

test("native unshield refusal restores the previous ledger and protection", async () => {
  const f = fixture({ silentlyFailUnblock: true });
  await assert.rejects(() => f.grant(), /release exactly the chosen app/);
  assert.deepEqual([...f.blocked].sort(), ["A","B","C"]);
  assert.deepEqual(f.storage.get(policy.PREMIUM_EXCEPTIONS_KEY), {});
  assert.equal(f.activities.size, 1);
});

test("a native bug that also removes another app shield cannot be counted as recovery", async () => {
  const f = fixture({ extraUnblock: true });
  await assert.rejects(() => f.grant(), /could not confirm recovery/);
  assert.equal(f.blocked.has("A"), true);
  assert.equal(f.blocked.has("B"), false);
  assert.equal(f.activities.size, 2);
  assert.equal(Object.keys(f.storage.get(policy.PREMIUM_EXCEPTIONS_KEY)).length, 1);
});

test("close to the cutoff delegates release to the existing recurring schedule", async () => {
  const f = fixture({ cutoffMinutes: 8 });
  const ends = await f.grant();
  assert.equal(ends, now.getTime() + 8*60_000);
  assert.equal(f.activities.size, 1);
  assert.equal(f.calls.filter(x => x[0] === "unblock").length, 1);
});

test("no actual purchased multi-app route or checkout is exposed by the coordinator", () => {
  const files = ["app/escape.tsx", "components/LockScreen.tsx", "app/(tabs)/index.tsx"];
  for (const path of files) {
    const source = readFileSync(join(__dirname, "..", path), "utf8");
    assert.doesNotMatch(source, /grantPremiumAppException/);
  }
});


test("next app hold first re-shields only the previous expired app and safely retires its monitor", async () => {
  const f = fixture();
  await f.grant(t1);
  assert.deepEqual([...f.blocked].sort(), ["B", "C"]);
  const later = new Date(now.getTime() + 20*60_000);
  await f.grant(t2, later);
  assert.deepEqual([...f.blocked].sort(), ["A", "C"]);
  const ledger = f.storage.get(policy.PREMIUM_EXCEPTIONS_KEY);
  assert.equal(Object.keys(ledger).length, 1);
  assert.equal(Object.values(ledger)[0].selectionId, t2);
  assert.equal(f.activities.size, 2);
  assert.equal(f.calls.filter(x=>x[0]==="block").length, 1);
});

test("foreground native recovery is included independently of the Free hold path", () => {
  const context = readFileSync(join(__dirname, "../context/SleepContext.tsx"), "utf8");
  assert.match(context, /reconcilePremiumAppExceptions\(\)/);
  assert.match(context, /reconcileBedtimeException\(bedtime, wakeTime\)/);
});

for (const failurePoint of ["stop", "readback", "clear"]) {
  test(`failed Premium rollback restores callback after ${failurePoint} throws`, async () => {
    const f = fixture({ silentlyFailUnblock: true });
    if (failurePoint === "stop") {
      f.native.stopMonitoring = () => { throw Error("stop unavailable"); };
    } else if (failurePoint === "readback") {
      f.native.stopMonitoring = names => {
        // iOS refuses removal, then readback also fails.
        f.native.getActivities = () => { throw Error("readback unavailable"); };
      };
    } else {
      const configure = f.native.configureActions;
      f.native.configureActions = action => {
        configure(action); // write can succeed before its bridge reports failure
        if (!action.actions.length) throw Error("clear failed after write");
      };
    }
    await assert.rejects(() => f.grant(), /could not confirm recovery/);
    assert.equal(f.activities.size, 2);
    assert.equal(Object.keys(f.storage.get(policy.PREMIUM_EXCEPTIONS_KEY)).length, 1);
    const actions = f.calls.filter(call => call[0] === "action");
    assert.deepEqual(actions.at(-1)[1].actions, [
      { type: "blockSelection", familyActivitySelectionId: t1 },
    ]);
  });
}

for (const changed of ["monitor", "selection", "clock"]) {
  for (const duringStart of [false, true]) {
    test(`Premium rejects changed ${changed} ${duringStart ? "during registration" : "before grant"}`, async () => {
      const f = fixture();
      const change = () => {
        if (changed === "monitor") f.activities.delete("curfy-bedtime");
        if (changed === "selection") f.storage.set("curfy-scheduled-selection-id", "curfy-block-social");
        if (changed === "clock") f.storage.set("curfy-bedtime-clock-window", { startMinute: 23*60, endMinute: 7*60 });
      };
      if (duringStart) {
        const start = f.native.startMonitoring;
        f.native.startMonitoring = async name => { await start(name); change(); };
      } else change();
      await assert.rejects(() => f.grant(), /schedule is missing or changed/);
      assert.equal(f.calls.some(call => call[0] === "unblock"), false);
      assert.equal([...f.activities].some(name => name.startsWith("curfy-premium-exception-")), false);
      assert.deepEqual([...f.blocked].sort(), ["A", "B", "C"]);
    });
  }
}
