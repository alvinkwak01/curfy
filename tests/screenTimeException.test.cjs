const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const ts = require("typescript");

function loadTS(path, customRequire = require) {
  const source = readFileSync(join(__dirname, "..", path), "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", js)(customRequire, mod, mod.exports);
  return mod.exports;
}
const time = loadTS("lib/bedtimeWindow.ts");
const premiumPolicy = loadTS("lib/premiumPolicy.ts");

function fixture({
  failStart = false, failUnblock = false, failUnblockAfterClear = false, overlapReportsZero = false,
  overlapUnavailable = false, authorization = 2, selectionCount = 1, categoryCount = 0,
  webDomainCount = 0, includeEntireCategory = false, initiallyBlocked = true,
  silentMonitorFailure = false,
  failOnStartCalls = [], failAfterOverwriteStartCalls = [],
  ignoreBlockOnCalls = [], ignoreResetOnCalls = [],
  ignoreStopOnCalls = [], failOnActionCalls = [],
  waitForStart = null,
} = {}) {
  const storage = new Map();
  const selections = new Map();
  const calls = [];
  const monitoredActivities = new Set();
  const monitorSchedules = new Map();
  let blocked = initiallyBlocked;
  const native = {
    AuthorizationStatus: { notDetermined: 0, denied: 1, approved: 2 },
    getAuthorizationStatus: () => authorization,
    activitySelectionMetadata: () => ({
      // Exact Swift ActivitySelectionMetadata record in RNDA 0.6.1: lower-case d.
      applicationCount: selectionCount, categoryCount, webdomainCount: webDomainCount, includeEntireCategory,
    }),
    intersection: () => overlapUnavailable ? undefined : ({
      // Swift ActivitySelectionWithMetadata uses the SAME lower-case d.
      applicationCount: blocked && !overlapReportsZero ? 1 : 0, categoryCount: 0, webdomainCount: 0,
    }),
    getFamilyActivitySelectionId: id => selections.get(id),
    setFamilyActivitySelectionId: ({ id, familyActivitySelection }) => {
      selections.set(id, familyActivitySelection);
    },
    userDefaultsGet: key => storage.get(key),
    userDefaultsSet: (key, value) => { storage.set(key, value); },
    userDefaultsRemove: key => { storage.delete(key); },
    configureActions: config => {
      calls.push(["action", config]);
      if (failOnActionCalls.includes(calls.filter(x => x[0] === "action").length)) {
        throw Error("Native callback metadata write failed");
      }
    },
    startMonitoring: async (name, schedule) => {
      calls.push(["start", name, schedule]);
      const count = calls.filter(call => call[0] === "start").length;
      if (failAfterOverwriteStartCalls.includes(count)) {
        monitoredActivities.add(name);
        monitorSchedules.set(name, schedule);
        throw Error("Native scheduling failed after overwriting previous monitor");
      }
      if (failStart || failOnStartCalls.includes(count)) {
        throw Error("Native scheduling failed");
      }
      if (waitForStart) await waitForStart;
      if (!silentMonitorFailure) {
        monitoredActivities.add(name);
        monitorSchedules.set(name, schedule);
      }
    },
    getActivities: () => [...monitoredActivities],
    stopMonitoring: names => {
      calls.push(["stop", names]);
      if (ignoreStopOnCalls.includes(calls.filter(x => x[0] === "stop").length)) return;
      if (names) names.forEach(name => {
        monitoredActivities.delete(name);
        monitorSchedules.delete(name);
      });
      else {
        monitoredActivities.clear();
        monitorSchedules.clear();
      }
    },
    updateShield: (config, actions) => { calls.push(["shield", config, actions]); },
    isShieldActive: () => blocked,
    blockSelection: input => {
      calls.push(["block", input]);
      if (!ignoreBlockOnCalls.includes(calls.filter(x => x[0] === "block").length)) blocked = true;
    },
    unblockSelection: () => {
      calls.push(["unblock"]);
      if (failUnblockAfterClear) {
        blocked = false;
        throw Error("Native unshield failed after clearing the ManagedSettings shield");
      }
      if (!failUnblock) blocked = false;
    },
    resetBlocks: () => {
      calls.push(["reset"]);
      if (!ignoreResetOnCalls.includes(calls.filter(x => x[0] === "reset").length)) {
        blocked = false;
      }
    },
  };
  const screenTime = loadTS("lib/screenTime.ts", moduleName => {
    if (moduleName === "react-native-device-activity") return native;
    if (moduleName === "@/lib/bedtimeWindow") return time;
    if (moduleName === "@/lib/premiumPolicy") return premiumPolicy;
    throw Error("Unexpected import " + moduleName);
  });
  return {
    native, screenTime, storage, selections, calls, monitorSchedules,
    isBlocked: () => blocked,
  };
}

async function registerRecurringProtectionMonitor(f, startHour = 22, endHour = 6) {
  await f.native.startMonitoring("curfy-bedtime", {
    intervalStart: { hour: startHour, minute: 0 },
    intervalEnd: { hour: endHour, minute: 0 },
    repeats: true,
  });
}

test("completing the hold schedules native reblock before unshielding", async () => {
  const f = fixture();
  const now = new Date("2026-10-31T23:00:00");
  const expiresAt = await f.screenTime.grantBedtimeException({
    bedtime: "22:00", wakeTime: "06:00", mode: "custom", now,
  });
  assert.equal(expiresAt, now.getTime() + 15 * 60_000);
  // The native callback interval is >=15m despite second-precision dates.
  // It is separate from the user-facing logical expiry.
  const monitor = f.calls.find(call => call[0] === "start");
  assert.equal(monitor[2].intervalStart.second, 0);
  assert.equal(monitor[2].intervalEnd.second, 1);
  assert.equal(f.isBlocked(), false);
  const start = f.calls.findIndex(call => call[0] === "start");
  const unblock = f.calls.findIndex(call => call[0] === "unblock");
  const endAction = f.calls.findIndex(call => call[0] === "action" &&
    call[1].callbackName === "intervalDidEnd" && call[1].actions.length > 0);
  assert.ok(endAction >= 0 && endAction < start && start < unblock);
});

test("a fractional-second hold never promises access longer than 15 minutes", async () => {
  const f = fixture();
  const now = new Date("2026-10-31T23:00:00.875");
  const expiresAt = await f.screenTime.grantBedtimeException({
    bedtime: "22:00", wakeTime: "06:00", mode: "custom", now,
  });
  assert.equal(expiresAt, now.getTime() + 15 * 60_000);
  const state = f.storage.get("curfy-active-exception");
  assert.equal(state.expiresAt, expiresAt);
  // The OS's whole-second minimum-duration monitor is deliberately distinct.
  const nativeSchedule = f.calls.find(x => x[0] === "start")[2];
  assert.equal(nativeSchedule.intervalStart.second, 0);
  assert.equal(nativeSchedule.intervalEnd.second, 1);
});

test("a second concurrent hold cannot overwrite the in-flight native reblock", async () => {
  let releaseMonitor;
  const waitForStart = new Promise(resolve => { releaseMonitor = resolve; });
  const f = fixture({ waitForStart });
  const now = new Date("2026-10-31T23:00:00");
  const input = { bedtime: "22:00", wakeTime: "06:00", mode: "custom", now };
  const first = f.screenTime.grantBedtimeException(input);
  // First registration is suspended inside startMonitoring.
  await assert.rejects(f.screenTime.grantBedtimeException(input),
    /Another Curfy app unlock is already being prepared/);
  assert.equal(f.calls.filter(x => x[0] === "start").length, 1);
  releaseMonitor();
  const expiry = await first;
  assert.equal(expiry, now.getTime() + 15 * 60_000);
  assert.equal(f.calls.filter(x => x[0] === "unblock").length, 1);
  await assert.rejects(f.screenTime.grantBedtimeException(input),
    /already active/);
});

test("native stop and schedule edit cannot race an unfinished Free exception registration", async () => {
  let releaseMonitor;
  const waitForStart = new Promise(resolve => { releaseMonitor = resolve; });
  const f = fixture({ waitForStart });
  const now = new Date("2026-10-31T23:00:00");
  // Simulate an already configured daily monitor without awaiting another
  // registration behind the same artificial native promise.
  f.native.userDefaultsSet("curfy-scheduled-selection-id", "curfy-block-custom");
  f.native.userDefaultsSet("curfy-bedtime-clock-window", { startMinute: 1320, endMinute: 360 });
  const grant = f.screenTime.grantBedtimeException({
    bedtime: "22:00", wakeTime: "06:00", mode: "custom", now,
  });
  assert.equal(f.calls.filter(x => x[0] === "start").length, 1);
  const before = f.calls.length;
  assert.throws(() => f.screenTime.stopBedtimeBlocking(now),
    /still preparing a temporary app unlock/);
  await assert.rejects(f.screenTime.configureBedtimeBlocking({
    bedtime: "23:00", wakeTime: "06:00", mode: "custom", now,
  }), /still preparing a temporary app unlock/);
  assert.equal(f.calls.length, before, "Neither request may mutate native actions or monitors");
  releaseMonitor();
  await grant;
  assert.equal(f.isBlocked(), false);
  // Native monitor callbacks remain connected until the deliberately
  // completed exception can be canceled on a subsequent stop.
  assert.equal(f.storage.has("curfy-active-exception"), true);
  f.screenTime.stopBedtimeBlocking(now);
  assert.equal(f.storage.has("curfy-active-exception"), false);
  assert.equal(f.isBlocked(), false);
});

test("a failed Free grant clears its concurrency guard for a new attempt", async () => {
  const f = fixture({ failStart: true });
  const input = {
    bedtime: "22:00", wakeTime: "06:00", mode: "custom",
    now: new Date("2026-10-31T23:00:00"),
  };
  await assert.rejects(f.screenTime.grantBedtimeException(input), /Native scheduling failed/);
  await assert.rejects(f.screenTime.grantBedtimeException(input), /Native scheduling failed/);
  assert.equal(f.isBlocked(), true);
});

test("a forged native exception activity cannot erase the recurring bedtime cutoff", async () => {
  const f = fixture();
  const now = new Date("2026-10-31T23:00:00");
  f.storage.set("curfy-active-exception", {
    selectionId: "curfy-block-custom",
    // This is NOT a Curfy exception monitor. If accepted, stopExceptionMonitor
    // could clear the daily monitor's intervalDidEnd UNBLOCK action.
    activityName: "curfy-bedtime",
    expiresAt: now.getTime() - 1,
    bedtimeEndAt: now.getTime() + 2 * 60 * 60_000,
  });
  await assert.rejects(
    f.screenTime.grantBedtimeException({
      bedtime: "22:00", wakeTime: "06:00", mode: "custom", now,
    }),
    /couldn't verify a previous app-access record/
  );
  assert.equal(f.calls.some(x => x[0] === "stop" || x[0] === "unblock"), false);
  assert.equal(f.calls.some(x => x[0] === "action" &&
    x[1].activityName === "curfy-bedtime"), false);
  assert.equal(f.isBlocked(), true);
});

test("invalid native expiry records cannot be overwritten by a new unlock", async () => {
  const invalidStates = [
    { activityName: "curfy-exception-1793497200000", expiresAt: Infinity },
    { activityName: "curfy-exception-1793497200000", expiresAt: Number.NaN },
    { activityName: "curfy-exception-1793497200000", expiresAt: -1 },
    { activityName: "curfy-exception-1793497200000", expiresAt: 1793497200000 + 99_000_000 },
    { activityName: "../../curfy-bedtime", expiresAt: 1793497200000 },
  ];
  for (const altered of invalidStates) {
    const f = fixture();
    f.storage.set("curfy-active-exception", {
      selectionId: "curfy-block-custom",
      activityName: altered.activityName,
      expiresAt: altered.expiresAt,
      bedtimeEndAt: 1793497200000 + 16 * 60_000,
    });
    assert.equal(f.screenTime.activeExceptionExpiresAt(), null);
    await assert.rejects(f.screenTime.grantBedtimeException({
      bedtime: "22:00", wakeTime: "06:00", mode: "custom",
      now: new Date("2026-10-31T23:00:00"),
    }), /couldn't verify a previous app-access record/);
    assert.equal(f.isBlocked(), true);
    assert.equal(f.calls.some(call => call[0] === "unblock" || call[0] === "start"), false);
  }
});

test("the wake-time boundary never re-shields apps just after morning", async () => {
  const f = fixture();
  const now = new Date("2026-11-01T05:50:00");
  const expiresAt = await f.screenTime.grantBedtimeException({
    bedtime: "22:00", wakeTime: "06:00", mode: "custom", now,
  });
  assert.equal(expiresAt, new Date("2026-11-01T06:00:00").getTime());
  assert.equal(f.calls.filter(call => call[0] === "start").length, 0);
  assert.equal(f.isBlocked(), false);
});

test("a lost recurring monitor cannot start a new 15-minute exception after an earlier schedule was saved", async () => {
  const f = fixture();
  f.storage.set("curfy-scheduled-selection-id", "curfy-block-custom");
  f.storage.set("curfy-bedtime-clock-window", { startMinute: 1320, endMinute: 360 });
  // The visible shield is orphaned: today's recurring cutoff no longer exists.
  await assert.rejects(
    f.screenTime.grantBedtimeException({
      bedtime: "22:00", wakeTime: "06:00", mode: "custom",
      now: new Date("2026-10-31T23:00:00"),
    }),
    /recurring iOS protection schedule is missing or changed/
  );
  assert.equal(f.isBlocked(), true);
  assert.equal(f.storage.has("curfy-active-exception"), false);
  assert.equal(f.calls.some(call => call[0] === "start"), false);
  assert.equal(f.calls.some(call => call[0] === "unblock"), false);
});

test("a stale committed app selection cannot receive a temporary exception", async () => {
  const f = fixture();
  f.storage.set("curfy-scheduled-selection-id", "curfy-block-social");
  f.storage.set("curfy-bedtime-clock-window", { startMinute: 1320, endMinute: 360 });
  await registerRecurringProtectionMonitor(f);
  await assert.rejects(
    f.screenTime.grantBedtimeException({
      bedtime: "22:00", wakeTime: "06:00", mode: "custom",
      now: new Date("2026-10-31T23:00:00"),
    }),
    /recurring iOS protection schedule is missing or changed/
  );
  assert.equal(f.isBlocked(), true);
  assert.equal(f.storage.has("curfy-active-exception"), false);
});

test("failed native monitor prevents unlocking and retains shields", async () => {
  const f = fixture({ failStart: true });
  await assert.rejects(
    f.screenTime.grantBedtimeException({
      bedtime: "22:00", wakeTime: "06:00", mode: "custom",
      now: new Date("2026-10-31T23:00:00"),
    }),
    /Native scheduling failed/
  );
  assert.equal(f.isBlocked(), true);
  assert.equal(f.storage.has("curfy-active-exception"), false);
});

test("a native unshield failure rolls back the exception and stays protected", async () => {
  const f = fixture({ failUnblock: true });
  await assert.rejects(
    f.screenTime.grantBedtimeException({
      bedtime: "22:00", wakeTime: "06:00", mode: "custom",
      now: new Date("2026-10-31T23:00:00"),
    }),
    /did not release/
  );
  assert.equal(f.isBlocked(), true);
  assert.equal(f.storage.has("curfy-active-exception"), false);
});

test("Free rollback preserves App Group recovery when iOS refuses to re-shield", async () => {
  const f = fixture({ failUnblockAfterClear: true, ignoreBlockOnCalls: [1] });
  const now = new Date("2026-10-31T23:00:00");
  await assert.rejects(f.screenTime.grantBedtimeException({
    bedtime: "22:00", wakeTime: "06:00", mode: "custom", now,
  }), /couldn't confirm recovery of the selected app restriction/);
  assert.equal(f.isBlocked(), false);
  assert.equal(f.storage.has("curfy-active-exception"), true,
    "Do not erase the recovery record while the app remains unshielded");
  const activityName = f.storage.get("curfy-active-exception").activityName;
  assert.equal(f.monitorSchedules.has(activityName), true,
    "Keep the reblock monitor alive if physical restoration failed");
});

test("silent native stop failure retains reblock action and recovery record", async () => {
  const f = fixture({ failUnblockAfterClear: true, ignoreStopOnCalls: [1] });
  const now = new Date("2026-10-31T23:00:00");
  await assert.rejects(f.screenTime.grantBedtimeException({
    bedtime: "22:00", wakeTime: "06:00", mode: "custom", now,
  }), /couldn't confirm recovery of the selected app restriction/);
  assert.equal(f.isBlocked(), true);
  const state = f.storage.get("curfy-active-exception");
  assert.ok(state);
  assert.equal(f.monitorSchedules.has(state.activityName), true);
  const actions = f.calls.filter(x => x[0] === "action" &&
    x[1].activityName === state.activityName && x[1].callbackName === "intervalDidEnd");
  assert.equal(actions.at(-1)[1].actions[0].familyActivitySelectionId, "curfy-block-custom",
    "The still-active monitor must retain a reblock callback");
});

test("verified Free rollback clears the failed record but still reports native failure", async () => {
  const f = fixture({ failUnblockAfterClear: true });
  const now = new Date("2026-10-31T23:00:00");
  await assert.rejects(f.screenTime.grantBedtimeException({
    bedtime: "22:00", wakeTime: "06:00", mode: "custom", now,
  }), /Native unshield failed after clearing/);
  assert.equal(f.isBlocked(), true);
  assert.equal(f.storage.has("curfy-active-exception"), false);
  assert.equal(f.monitorSchedules.size, 0);
});

test("foreground recovery re-shields expired exceptions inside bedtime", async () => {
  const f = fixture();
  await registerRecurringProtectionMonitor(f);
  const now = new Date("2026-10-31T23:00:00");
  const expiry = await f.screenTime.grantBedtimeException({
    bedtime: "22:00", wakeTime: "06:00", mode: "custom", now,
  });
  f.screenTime.reconcileBedtimeException("22:00", "06:00", new Date(expiry + 2_000));
  assert.equal(f.isBlocked(), true);
  assert.equal(f.storage.has("curfy-active-exception"), false);
});

test("failed Free exception monitor stop retains its reblock callback and recovery record", async () => {
  const f = fixture({ ignoreStopOnCalls: [1] });
  await registerRecurringProtectionMonitor(f);
  const now = new Date("2026-10-31T23:00:00");
  const expiry = await f.screenTime.grantBedtimeException({
    bedtime: "22:00", wakeTime: "06:00", mode: "custom", now,
  });
  const state = f.storage.get("curfy-active-exception");
  assert.equal(f.isBlocked(), false);
  assert.throws(() =>
    f.screenTime.reconcileBedtimeException("22:00", "06:00", new Date(expiry + 2000)),
    /didn't stop Curfy's temporary app-access monitor/
  );
  assert.equal(f.isBlocked(), true);
  assert.ok(f.monitorSchedules.has(state.activityName));
  assert.deepEqual(f.storage.get("curfy-active-exception"), state);
  const actions = f.calls.filter(c => c[0] === "action" &&
    c[1].activityName === state.activityName && c[1].callbackName === "intervalDidEnd");
  assert.deepEqual(actions.at(-1)[1].actions, [{
    type: "blockSelection", familyActivitySelectionId: "curfy-block-custom",
  }]);
  // Next attempt may finish safely; do not permanently strand recovery.
  f.screenTime.reconcileBedtimeException("22:00", "06:00", new Date(expiry + 3000));
  assert.equal(f.storage.has("curfy-active-exception"), false);
  assert.equal(f.monitorSchedules.has(state.activityName), false);
});

test("failed Free monitor stop after morning cutoff never drops an active monitor's callback", async () => {
  const f = fixture({ ignoreStopOnCalls: [1] });
  const now = new Date("2026-10-31T23:00:00");
  await f.screenTime.grantBedtimeException({
    bedtime: "22:00", wakeTime: "06:00", mode: "custom", now,
  });
  const state = f.storage.get("curfy-active-exception");
  // The monitor scheduled at 23:00 must not block after the 06:00 cutoff.
  assert.ok(state.activityName);
  const afterCutoff = new Date("2026-11-01T06:00:02");
  assert.throws(() => f.screenTime.reconcileBedtimeException(
    "22:00", "06:00", afterCutoff
  ), /didn't stop Curfy's temporary app-access monitor/);
  assert.deepEqual(f.storage.get("curfy-active-exception"), state);
  assert.equal(f.isBlocked(), false);
  const actions = f.calls.filter(c => c[0] === "action" && c[1].activityName === state.activityName);
  assert.equal(actions.at(-1)[1].actions[0].type, "blockSelection");
  f.screenTime.reconcileBedtimeException("22:00", "06:00", afterCutoff);
  assert.equal(f.storage.has("curfy-active-exception"), false);
});

test("recovery never re-shields apps when the bedtime window has ended", async () => {
  const f = fixture();
  const now = new Date("2026-11-01T05:50:00");
  const expiry = await f.screenTime.grantBedtimeException({
    bedtime: "22:00", wakeTime: "06:00", mode: "custom", now,
  });
  f.screenTime.reconcileBedtimeException("22:00", "06:00", new Date(expiry + 2_000));
  assert.equal(f.isBlocked(), false);
  assert.equal(f.storage.has("curfy-active-exception"), false);
});

test("dashboard recognizes native category shielding despite zero token overlap", () => {
  const f = fixture({ overlapReportsZero: true });
  assert.equal(f.screenTime.getBedtimeProtectionStatus("custom"), "shield-active");
});

test("dashboard only reports a missing setup when iOS actually says it is missing", () => {
  assert.equal(fixture({ authorization: 1 }).screenTime.getBedtimeProtectionStatus("custom"), "permission-required");
  assert.equal(fixture({ selectionCount: 0 }).screenTime.getBedtimeProtectionStatus("custom"), "selection-required");
  assert.equal(fixture({ initiallyBlocked: false }).screenTime.getBedtimeProtectionStatus("custom"), "unconfirmed");
});

test("category-shield false negative still permits a verified native exception", async () => {
  const f = fixture({ overlapReportsZero: true });
  await f.screenTime.grantBedtimeException({
    bedtime: "22:00", wakeTime: "06:00", mode: "custom",
    now: new Date("2026-10-31T23:00:00"),
  });
  assert.equal(f.isBlocked(), false);
});

test("category-shield false negative never counts an unlock when native shield persists", async () => {
  const f = fixture({ overlapReportsZero: true, failUnblock: true });
  await assert.rejects(
    f.screenTime.grantBedtimeException({
      bedtime: "22:00", wakeTime: "06:00", mode: "custom",
      now: new Date("2026-10-31T23:00:00"),
    }),
    /did not release/
  );
  assert.equal(f.isBlocked(), true);
});

test("the installed shield no longer offers a broken Open Curfy button", async () => {
  const f = fixture();
  await f.screenTime.configureBedtimeBlocking({
    bedtime: "22:00", wakeTime: "06:00", mode: "custom",
  });
  const updated = f.calls.find(x => x[0] === "shield");
  assert.ok(updated);
  assert.equal(updated[1].primaryButtonLabel, "Not now");
  assert.equal(updated[2].primary.behavior, "close");
  assert.equal(updated[2].primary.actions, undefined);
  assert.match(updated[1].subtitle, /open Curfy from your Home Screen/);
});

test("native category re-shield clears the exception despite missing token overlap", async () => {
  const f = fixture({ overlapReportsZero: true });
  await registerRecurringProtectionMonitor(f);
  const now = new Date("2026-10-31T23:00:00");
  const expiry = await f.screenTime.grantBedtimeException({
    bedtime: "22:00", wakeTime: "06:00", mode: "custom", now,
  });
  f.screenTime.reconcileBedtimeException("22:00", "06:00", new Date(expiry + 2_000));
  assert.equal(f.isBlocked(), true);
  assert.equal(f.storage.has("curfy-active-exception"), false);
});

test("existing installs can update the native shield copy without rescheduling", () => {
  const f = fixture();
  f.screenTime.refreshBedtimeShieldAppearance();
  assert.equal(f.calls.some(x => x[0] === "start"), false);
  const action = f.calls.find(x => x[0] === "shield");
  assert.ok(action);
  assert.equal(action[1].primaryButtonLabel, "Not now");
  assert.deepEqual(action[2], { primary: { behavior: "close" } });
});

test("new bedtime schedule rebuilds app-owned blocks after native monitoring succeeds", async () => {
  const f = fixture();
  await f.screenTime.configureBedtimeBlocking({
    bedtime: "22:00", wakeTime: "06:00", mode: "social",
    now: new Date("2026-10-31T23:00:00"),
  });
  const firstSave = f.storage.get("curfy-scheduled-selection-id");
  assert.equal(firstSave, "curfy-block-social");
  const before = f.calls.length;
  await f.screenTime.configureBedtimeBlocking({
    bedtime: "22:00", wakeTime: "06:00", mode: "custom",
    now: new Date("2026-10-31T23:01:00"),
  });
  assert.equal(f.storage.get("curfy-scheduled-selection-id"), "curfy-block-custom");
  const second = f.calls.slice(before);
  const startIndex = second.findIndex(x => x[0] === "start");
  const resetIndex = second.findIndex(x => x[0] === "reset");
  const blockIndex = second.findIndex(x => x[0] === "block" && x[1].activitySelectionId === "curfy-block-custom");
  assert.ok(startIndex >= 0 && resetIndex > startIndex);
  // During bedtime, the newly selected apps must be reapplied after clearing
  // old selections rather than unioned with them.
  assert.ok(blockIndex > resetIndex);
  assert.equal(f.isBlocked(), true);
});

test("failed schedule replacement never clears existing managed restrictions", async () => {
  const f = fixture({ failStart: true });
  f.storage.set("curfy-scheduled-selection-id", "curfy-block-social");
  await assert.rejects(
    f.screenTime.configureBedtimeBlocking({
      bedtime: "22:00", wakeTime: "06:00", mode: "custom",
    }),
    /Native scheduling failed/
  );
  assert.equal(f.isBlocked(), true);
  assert.equal(f.calls.filter(x => x[0] === "reset").length, 0);
  assert.equal(f.storage.get("curfy-scheduled-selection-id"), "curfy-block-social");
  const restored = f.calls.filter(x => x[0] === "action" && x[1].callbackName === "intervalDidStart").at(-1);
  assert.equal(restored[1].actions[0].familyActivitySelectionId, "curfy-block-social");
});

test("stopping protection clears stored active selection as well as shields", async () => {
  const f = fixture();
  await f.screenTime.configureBedtimeBlocking({
    bedtime: "22:00", wakeTime: "06:00", mode: "custom",
  });
  f.screenTime.stopBedtimeBlocking();
  assert.equal(f.storage.get("curfy-scheduled-selection-id"), undefined);
  assert.equal(f.isBlocked(), false);
});

test("saving a schedule outside bedtime clears yesterday's stale shields", async () => {
  const f = fixture();
  await f.screenTime.configureBedtimeBlocking({
    bedtime: "22:00", wakeTime: "06:00", mode: "custom",
    now: new Date("2026-10-31T12:00:00"),
  });
  assert.equal(f.isBlocked(), false);
  assert.equal(f.calls.filter(x => x[0] === "block").length, 0);
  assert.equal(f.storage.get("curfy-scheduled-selection-id"), "curfy-block-custom");
});

test("silent native monitor registration failure prevents a 15-minute exception", async () => {
  const f = fixture({ silentMonitorFailure: true });
  await assert.rejects(
    f.screenTime.grantBedtimeException({
      bedtime: "22:00", wakeTime: "06:00", mode: "custom",
      now: new Date("2026-10-31T23:00:00"),
    }),
    /automatic reblocking monitor/
  );
  assert.equal(f.isBlocked(), true);
  assert.equal(f.storage.has("curfy-active-exception"), false);
  assert.equal(f.calls.filter(x => x[0] === "unblock").length, 0);
});

test("silent native bedtime monitor registration failure never clears existing shields", async () => {
  const f = fixture({ silentMonitorFailure: true });
  await assert.rejects(
    f.screenTime.configureBedtimeBlocking({
      bedtime: "22:00", wakeTime: "06:00", mode: "custom",
      now: new Date("2026-10-31T23:00:00"),
    }),
    /did not register bedtime monitoring/
  );
  assert.equal(f.isBlocked(), true);
  assert.equal(f.calls.filter(x => x[0] === "reset").length, 0);
});

test("real iOS 0.6.1 saved-selection metadata admits one app without undefined website count", async () => {
  const f = fixture({ selectionCount: 1 });
  assert.equal(f.screenTime.freeSelectionIssue("custom"), null);
  assert.equal(f.screenTime.getSelectionCount("custom"), 1);
  await f.screenTime.configureBedtimeBlocking({
    bedtime: "22:00", wakeTime: "06:00", mode: "custom",
    now: new Date("2026-10-31T23:00:00"),
  });
  assert.equal(f.monitorSchedules.has("curfy-bedtime"), true);
  assert.equal(f.storage.get("curfy-scheduled-selection-id"), "curfy-block-custom");
});

test("real iOS 0.6.1 saved-selection metadata still rejects two Free apps before monitoring", async () => {
  const f = fixture({ selectionCount: 2 });
  assert.equal(f.screenTime.freeSelectionIssue("custom"), "too-many-apps-or-categories");
  assert.equal(f.screenTime.getSelectionCount("custom"), 2);
  await assert.rejects(
    f.screenTime.configureBedtimeBlocking({
      bedtime: "22:00", wakeTime: "06:00", mode: "custom",
      now: new Date("2026-10-31T23:00:00"),
    }), /one individual app/
  );
  assert.equal(f.monitorSchedules.has("curfy-bedtime"), false);
});

test("MVP free tier requires exactly one individually selected app", async () => {
  const at = new Date("2026-10-31T23:00:00");
  for (const [opts, expected] of [
    [{ selectionCount: 0 }, /Select one app/],
    [{ selectionCount: 2 }, /one individual app/],
    [{ selectionCount: 0, categoryCount: 1 }, /one individual app/],
    [{ selectionCount: 1, webDomainCount: 1 }, /one individual app/],
    [{ selectionCount: 1, includeEntireCategory: true }, /one individual app/],
  ]) {
    const f = fixture(opts);
    await assert.rejects(
      f.screenTime.configureBedtimeBlocking({
        bedtime: "22:00", wakeTime: "06:00", mode: "custom", now: at,
      }),
      expected
    );
    assert.equal(f.calls.filter(x => x[0] === "start").length, 0);
    assert.equal(f.isBlocked(), true);
  }
});

test("invalid multi-app selection also cannot gain a temporary exception", async () => {
  const f = fixture({ selectionCount: 3 });
  await assert.rejects(
    f.screenTime.grantBedtimeException({
      bedtime: "22:00", wakeTime: "06:00", mode: "custom",
      now: new Date("2026-10-31T23:00:00"),
    }),
    /one individual app/
  );
  assert.equal(f.calls.filter(x => x[0] === "unblock").length, 0);
  assert.equal(f.isBlocked(), true);
});

test("only single-app selection receives the positive dashboard shield status", () => {
  assert.equal(fixture({ selectionCount: 1 }).screenTime.getBedtimeProtectionStatus("custom"), "shield-active");
  assert.equal(fixture({ selectionCount: 2 }).screenTime.getBedtimeProtectionStatus("custom"), "selection-required");
  assert.equal(fixture({ selectionCount: 0, categoryCount: 1 }).screenTime.getBedtimeProtectionStatus("custom"), "selection-required");
});

test("opening Settings' draft picker does not mutate live app tokens", () => {
  const f = fixture();
  f.selections.set("curfy-block-custom", "previous-opaque-token");
  const id = f.screenTime.prepareSelectionDraft("custom");
  assert.equal(id, "curfy-draft-custom");
  assert.equal(f.selections.get(id), "previous-opaque-token");
  f.selections.set(id, "edited-opaque-token");
  assert.equal(f.selections.get("curfy-block-custom"), "previous-opaque-token");
});

test("saving staged selection commits opaque tokens only after preflight", async () => {
  const f = fixture();
  f.selections.set("curfy-block-custom", "old-token");
  f.selections.set("curfy-draft-custom", "new-token");
  await f.screenTime.configureBedtimeBlocking({
    bedtime: "22:00", wakeTime: "06:00", mode: "custom",
    draftSelectionId: "curfy-draft-custom",
    now: new Date("2026-10-31T23:00:00"),
  });
  assert.equal(f.selections.get("curfy-block-custom"), "new-token");
  assert.equal(f.isBlocked(), true);
});

test("native scheduling failure restores committed selection after editing draft", async () => {
  const f = fixture({ failStart: true });
  f.selections.set("curfy-block-custom", "old-token");
  f.selections.set("curfy-draft-custom", "new-token");
  await assert.rejects(
    f.screenTime.configureBedtimeBlocking({
      bedtime: "22:00", wakeTime: "06:00", mode: "custom",
      draftSelectionId: "curfy-draft-custom",
      now: new Date("2026-10-31T23:00:00"),
    }),
    /Native scheduling failed/
  );
  assert.equal(f.selections.get("curfy-block-custom"), "old-token");
  assert.equal(f.isBlocked(), true);
});

test("picker shows the free-tier limit immediately from Apple's token counts", () => {
  const f = fixture();
  const check = f.screenTime.freeSelectionIssueForMetadata;
  assert.equal(check({ applicationCount: 1, categoryCount: 0, webDomainCount: 0, includeEntireCategory: false }), null);
  assert.equal(check({ applicationCount: 0, categoryCount: 0, webDomainCount: 0, includeEntireCategory: false }), "choose-one-app");
  assert.equal(check({ applicationCount: 2, categoryCount: 0, webDomainCount: 0, includeEntireCategory: false }), "too-many-apps-or-categories");
  assert.equal(check({ applicationCount: 1, categoryCount: 1, webDomainCount: 0, includeEntireCategory: false }), "too-many-apps-or-categories");
  assert.equal(check({ applicationCount: 1, categoryCount: 0, webDomainCount: 1, includeEntireCategory: false }), "too-many-apps-or-categories");
  assert.equal(check({ applicationCount: 1, categoryCount: 0, webDomainCount: 0, includeEntireCategory: true }), "too-many-apps-or-categories");
});

test("fresh app-selection draft discards abandoned previously unsaved token", () => {
  const f = fixture();
  f.storage.set("familyActivitySelectionIds", {
    "curfy-block-social": "a-previously-committed-mode",
    "curfy-draft-custom": "stale-cancelled-selection",
  });
  const draftId = f.screenTime.prepareSelectionDraft("custom");
  assert.equal(draftId, "curfy-draft-custom");
  assert.equal(
    f.storage.get("familyActivitySelectionIds")["curfy-draft-custom"], undefined
  );
  assert.equal(
    f.storage.get("familyActivitySelectionIds")["curfy-block-social"],
    "a-previously-committed-mode"
  );
});

test("selected website count is included in picker metadata (never misreported zero)", () => {
  const f = fixture({ selectionCount: 0, categoryCount: 0, webDomainCount: 2 });
  assert.equal(f.screenTime.getSelectionCount("custom"), 2);
  assert.equal(f.screenTime.freeSelectionIssue("custom"), "too-many-apps-or-categories");
});

test("opening an unchanged native picker is not a protection change", () => {
  const f = fixture();
  f.selections.set("curfy-block-custom", "same-opaque-selection");
  f.screenTime.prepareSelectionDraft("custom");
  assert.equal(f.screenTime.selectionDraftChanged("custom"), false);
  f.selections.set("curfy-draft-custom", "another-opaque-selection");
  assert.equal(f.screenTime.selectionDraftChanged("custom"), true);
});

test("short recurring windows are rejected before modifying native protection", async () => {
  const f = fixture();
  await assert.rejects(
    f.screenTime.configureBedtimeBlocking({
      bedtime: "05:50", wakeTime: "06:00", mode: "custom",
      now: new Date("2026-10-31T05:55:00"),
    }), /at least 15 minutes/
  );
  assert.equal(f.calls.filter(x => ["start", "reset", "block"].includes(x[0])).length, 0);
  assert.equal(f.isBlocked(), true);
});

test("native monitor persists local clock boundaries for delayed Swift callback filtering", async () => {
  const f = fixture();
  await f.screenTime.configureBedtimeBlocking({
    bedtime: "22:45", wakeTime: "06:00", mode: "custom",
    now: new Date("2026-11-01T23:00:00"),
  });
  assert.deepEqual(
    f.storage.get("curfy-bedtime-clock-window"),
    { startMinute: 22 * 60 + 45, endMinute: 6 * 60 }
  );
});

test("failed monitor replacement restores previous clock boundaries and protection", async () => {
  const f = fixture({ failStart: true });
  const before = { startMinute: 22 * 60, endMinute: 6 * 60 };
  f.storage.set("curfy-bedtime-clock-window", before);
  await assert.rejects(
    f.screenTime.configureBedtimeBlocking({
      bedtime: "21:30", wakeTime: "06:00", mode: "custom",
      now: new Date("2026-11-01T22:00:00"),
    }), /Native scheduling failed/
  );
  assert.deepEqual(f.storage.get("curfy-bedtime-clock-window"), before);
  assert.equal(f.isBlocked(), true);
});

test("stopping protection also clears stale clock metadata used by native callbacks", async () => {
  const f = fixture();
  await f.screenTime.configureBedtimeBlocking({
    bedtime: "23:00", wakeTime: "06:00", mode: "custom",
    now: new Date("2026-11-01T23:30:00"),
  });
  f.screenTime.stopBedtimeBlocking();
  assert.equal(f.storage.has("curfy-bedtime-clock-window"), false);
});

test("clock guard is present on BOTH native interval callbacks", () => {
  const fs = require("node:fs");
  const swift = fs.readFileSync(join(__dirname, "../targets/ActivityMonitorExtension/DeviceActivityMonitorExtension.swift"), "utf8");
  assert.match(swift, /isWithinConfiguredCurfyWindow\(\) == false/);
  assert.match(swift, /isWithinConfiguredCurfyWindow\(\) == true/);
  assert.match(swift, /Calendar\.current\.dateComponents/);
});

test("visible native shield allows an exception even if token intersection is unavailable", async () => {
  const f = fixture({ overlapUnavailable: true, initiallyBlocked: true });
  const expiresAt = await f.screenTime.grantBedtimeException({
    bedtime: "22:00", wakeTime: "06:00", mode: "custom",
    now: new Date("2026-11-01T23:00:00"),
  });
  assert.equal(f.isBlocked(), false);
  assert.ok(expiresAt > new Date("2026-11-01T23:00:00").getTime());
  assert.equal(f.calls.filter(x => x[0] === "unblock").length, 1);
});

test("unavailable token intersection never permits a false successful unshield", async () => {
  const f = fixture({ overlapUnavailable: true, initiallyBlocked: true, failUnblock: true });
  await assert.rejects(
    f.screenTime.grantBedtimeException({
      bedtime: "22:00", wakeTime: "06:00", mode: "custom",
      now: new Date("2026-11-01T23:00:00"),
    }),
    /did not release/
  );
  assert.equal(f.isBlocked(), true);
  assert.equal(f.storage.has("curfy-active-exception"), false);
});

test("no token overlap and no native ManagedSettings shield always rejects an unlock", async () => {
  const f = fixture({ overlapUnavailable: true, initiallyBlocked: false });
  await assert.rejects(
    f.screenTime.grantBedtimeException({
      bedtime: "22:00", wakeTime: "06:00", mode: "custom",
      now: new Date("2026-11-01T23:00:00"),
    }),
    /not reporting any active/
  );
  assert.equal(f.calls.some(x => x[0] === "unblock"), false);
});

test("an Evening shield that lingers after the 6 AM cutoff clears when Curfy reopens", () => {
  const f = fixture({ initiallyBlocked: true });
  f.screenTime.reconcileProtectionWindow(
    "23:00", "06:00", "custom", new Date("2026-11-02T06:01:00")
  );
  assert.equal(f.isBlocked(), false);
  assert.equal(f.calls.filter(x => x[0] === "reset").length, 1);
});

test("a missed Morning start restores the selected-app shield on foreground only if native schedule exists", async () => {
  const f = fixture({ initiallyBlocked: false });
  await f.native.startMonitoring("curfy-bedtime", {
    intervalStart: { hour: 6, minute: 0 },
    intervalEnd: { hour: 9, minute: 0 },
    repeats: true,
  });
  f.screenTime.reconcileProtectionWindow(
    "06:00", "09:00", "custom", new Date("2026-11-02T07:00:00")
  );
  assert.equal(f.isBlocked(), true);
  assert.equal(f.calls.filter(x => x[0] === "block").length, 1);
});

test("foreground reconciliation never cancels an active 15-minute exception", async () => {
  const f = fixture({ initiallyBlocked: true });
  await f.screenTime.grantBedtimeException({
    bedtime: "23:00", wakeTime: "09:00", mode: "custom",
    now: new Date("2026-11-01T23:00:00"),
  });
  assert.equal(f.isBlocked(), false);
  f.screenTime.reconcileProtectionWindow(
    "23:00", "09:00", "custom", new Date("2026-11-01T23:05:00")
  );
  assert.equal(f.isBlocked(), false);
  assert.equal(f.calls.filter(x => x[0] === "block").length, 0);
});

test("a failed second Settings schedule restores previous native hours, not only UI metadata", async () => {
  const f = fixture({ failAfterOverwriteStartCalls: [2] });
  const now = new Date("2026-11-02T23:00:00");
  await f.screenTime.configureBedtimeBlocking({
    bedtime: "22:00", wakeTime: "06:00", mode: "custom", now,
  });
  const previousSchedule = f.monitorSchedules.get("curfy-bedtime");
  const previousClock = f.storage.get("curfy-bedtime-clock-window");
  await assert.rejects(
    f.screenTime.configureBedtimeBlocking({
      bedtime: "21:00", wakeTime: "09:00", mode: "custom", now,
    }), /Native scheduling failed after overwriting/
  );
  assert.deepEqual(f.monitorSchedules.get("curfy-bedtime"), previousSchedule);
  assert.deepEqual(f.storage.get("curfy-bedtime-clock-window"), previousClock);
  assert.equal(f.storage.get("curfy-scheduled-selection-id"), "curfy-block-custom");
  assert.equal(f.isBlocked(), true);
  assert.equal(f.calls.filter(x => x[0] === "reset").length, 1); // first setup only
});

test("failure after native schedule succeeds restores old hours and old shield", async () => {
  const f = fixture({ ignoreBlockOnCalls: [2] });
  const now = new Date("2026-11-02T23:00:00");
  await f.screenTime.configureBedtimeBlocking({
    bedtime: "22:00", wakeTime: "06:00", mode: "social", now,
  });
  const initialSchedule = f.monitorSchedules.get("curfy-bedtime");
  await assert.rejects(f.screenTime.configureBedtimeBlocking({
    bedtime: "21:00", wakeTime: "08:00", mode: "custom", now,
  }), /did not apply the selected app restrictions/);
  assert.deepEqual(f.monitorSchedules.get("curfy-bedtime"), initialSchedule);
  assert.equal(f.storage.get("curfy-scheduled-selection-id"), "curfy-block-social");
  assert.deepEqual(f.storage.get("curfy-bedtime-clock-window"), {
    startMinute: 22 * 60, endMinute: 6 * 60,
  });
  const lastBlock = f.calls.filter(x => x[0] === "block").at(-1);
  assert.equal(lastBlock[1].activitySelectionId, "curfy-block-social");
  assert.equal(f.isBlocked(), true);
});

test("if native schedule rollback fails, Settings gets an explicit danger message", async () => {
  const f = fixture({ failAfterOverwriteStartCalls: [2], failOnStartCalls: [3] });
  await f.screenTime.configureBedtimeBlocking({
    bedtime: "22:00", wakeTime: "06:00", mode: "custom",
    now: new Date("2026-11-02T23:00:00"),
  });
  await assert.rejects(f.screenTime.configureBedtimeBlocking({
    bedtime: "21:00", wakeTime: "09:00", mode: "custom",
    now: new Date("2026-11-02T23:00:00"),
  }), /couldn't confirm the previous native protection was restored/);
});

test("a first-run native monitor failure never leaves an orphan recurring schedule", async () => {
  const f = fixture({ failAfterOverwriteStartCalls: [1] });
  await assert.rejects(f.screenTime.configureBedtimeBlocking({
    bedtime: "23:00", wakeTime: "06:00", mode: "custom",
    now: new Date("2026-11-02T23:00:00"),
  }), /Native scheduling failed/);
  assert.equal(f.monitorSchedules.has("curfy-bedtime"), false);
  assert.equal(f.storage.has("curfy-bedtime-clock-window"), false);
  assert.equal(f.storage.has("curfy-scheduled-selection-id"), false);
});

test("a swallowed native reset error cannot leave the old app shielded alongside a new selection", async () => {
  const f = fixture({ ignoreResetOnCalls: [2] });
  const now = new Date("2026-11-02T23:00:00");
  await f.screenTime.configureBedtimeBlocking({
    bedtime: "22:00", wakeTime: "06:00", mode: "social", now,
  });
  const previousSchedule = f.monitorSchedules.get("curfy-bedtime");
  await assert.rejects(
    f.screenTime.configureBedtimeBlocking({
      bedtime: "22:00", wakeTime: "09:00", mode: "custom", now,
    }), /did not clear the old app restrictions/
  );
  assert.deepEqual(f.monitorSchedules.get("curfy-bedtime"), previousSchedule);
  assert.equal(f.storage.get("curfy-scheduled-selection-id"), "curfy-block-social");
  assert.equal(f.isBlocked(), true);
  assert.equal(
    f.calls.filter(x => x[0] === "block" && x[1].activitySelectionId === "curfy-block-custom").length,
    0
  );
});

test("Stop Protection leaves the recurring schedule untouched if its Free exception record is corrupt", async () => {
  const f = fixture();
  const now = new Date("2026-11-02T23:00:00");
  await f.screenTime.configureBedtimeBlocking({
    bedtime: "22:00", wakeTime: "06:00", mode: "custom", now,
  });
  f.storage.set("curfy-active-exception", {
    selectionId: "curfy-block-custom",
    activityName: "curfy-bedtime", // NOT an exception activity
    expiresAt: now.getTime() + 900_000,
    bedtimeEndAt: new Date("2026-11-03T06:00:00").getTime(),
  });
  const callCount = f.calls.length;
  assert.throws(() => f.screenTime.stopBedtimeBlocking(),
    /couldn't verify a previous app-access record/);
  assert.equal(f.calls.length, callCount);
  assert.equal(f.monitorSchedules.has("curfy-bedtime"), true);
  assert.equal(f.isBlocked(), true);
  assert.equal(f.storage.get("curfy-scheduled-selection-id"), "curfy-block-custom");
});

test("Free cancellation never reports success if iOS refuses to erase its recovered exception state", async () => {
  const f = fixture();
  const now = new Date("2026-11-02T23:00:00");
  await f.screenTime.configureBedtimeBlocking({
    bedtime: "22:00", wakeTime: "06:00", mode: "custom", now,
  });
  await f.screenTime.grantBedtimeException({
    bedtime: "22:00", wakeTime: "06:00", mode: "custom",
    now: new Date("2026-11-02T23:01:00"),
  });
  const previous = f.storage.get("curfy-active-exception");
  const remove = f.native.userDefaultsRemove;
  f.native.userDefaultsRemove = key => {
    if (key !== "curfy-active-exception") remove(key);
  };
  assert.throws(() => f.screenTime.stopBedtimeBlocking(),
    /didn't confirm removal of the old Curfy app-access record/);
  assert.deepEqual(f.storage.get("curfy-active-exception"), previous);
  // Delete Account cannot proceed if stop did not finish, and foreground
  // recovery still retains the saved exception identity for a later retry.
  assert.equal(f.storage.get("curfy-scheduled-selection-id"), "curfy-block-custom");
});

test("account/reset stop refuses to erase recovery metadata if native monitor refuses to stop", async () => {
  const f = fixture({ ignoreStopOnCalls: [1] });
  const now = new Date("2026-11-02T23:00:00");
  await f.screenTime.configureBedtimeBlocking({
    bedtime: "22:00", wakeTime: "06:00", mode: "custom", now,
  });
  assert.throws(() => f.screenTime.stopBedtimeBlocking(), /still has Curfy's protection schedule/);
  assert.equal(f.monitorSchedules.has("curfy-bedtime"), true);
  assert.equal(f.storage.get("curfy-scheduled-selection-id"), "curfy-block-custom");
  assert.deepEqual(f.storage.get("curfy-bedtime-clock-window"), {
    startMinute: 1320, endMinute: 360,
  });
  // Retry can still stop the schedule; the app was not wiped.
  assert.doesNotThrow(() => f.screenTime.stopBedtimeBlocking());
  assert.equal(f.monitorSchedules.has("curfy-bedtime"), false);
});

test("a swallowed native reset failure uses the exact old app token to release an orphaned shield", async () => {
  const f = fixture({ ignoreResetOnCalls: [2] });
  await f.screenTime.configureBedtimeBlocking({
    bedtime: "22:00", wakeTime: "06:00", mode: "custom",
    now: new Date("2026-11-02T23:00:00"),
  });
  f.screenTime.stopBedtimeBlocking();
  assert.equal(f.isBlocked(), false);
  assert.equal(f.storage.has("curfy-scheduled-selection-id"), false);
  const recovery = f.calls.find(c => c[0] === "unblock");
  assert.ok(recovery, "Targeted unblock must run when the full reset was ignored");
});

test("if both native shield-removal paths fail, Stop Protection retains local recovery metadata", async () => {
  const f = fixture({ ignoreResetOnCalls: [2], failUnblock: true });
  await f.screenTime.configureBedtimeBlocking({
    bedtime: "22:00", wakeTime: "06:00", mode: "custom",
    now: new Date("2026-11-02T23:00:00"),
  });
  assert.throws(() => f.screenTime.stopBedtimeBlocking(),
    /still reports protected apps/);
  assert.equal(f.storage.get("curfy-scheduled-selection-id"), "curfy-block-custom");
  assert.equal(f.isBlocked(), true);
  // Even after the daily monitor was removed, the original opaque app ID and
  // clock are kept so Settings can offer another native repair attempt.
  assert.deepEqual(f.storage.get("curfy-bedtime-clock-window"), {
    startMinute: 1320, endMinute: 360,
  });
});

test("failed native stop restores bedtime start AND end callbacks for the existing app", async () => {
  const f = fixture({ ignoreStopOnCalls: [1] });
  await f.screenTime.configureBedtimeBlocking({
    bedtime: "23:00", wakeTime: "06:00", mode: "custom",
    now: new Date("2026-11-02T23:30:00"),
  });
  assert.throws(() => f.screenTime.stopBedtimeBlocking(), /still has Curfy's protection schedule/);
  const callbacks = f.calls.filter(x => x[0] === "action" &&
    x[1].activityName === "curfy-bedtime");
  for (const callbackName of ["intervalDidStart", "intervalDidEnd"]) {
    const action = callbacks.filter(x => x[1].callbackName === callbackName).at(-1);
    assert.equal(action[1].actions.length, 1,
      "A failed stop must not leave the surviving monitor without " + callbackName);
    assert.equal(action[1].actions[0].familyActivitySelectionId, "curfy-block-custom");
  }
  assert.equal(f.storage.get("curfy-scheduled-selection-id"), "curfy-block-custom");
});

test("successful native stop keeps recurring callback actions cleared", async () => {
  const f = fixture();
  await f.screenTime.configureBedtimeBlocking({
    bedtime: "23:00", wakeTime: "06:00", mode: "custom",
    now: new Date("2026-11-02T23:30:00"),
  });
  f.screenTime.stopBedtimeBlocking();
  const callbacks = f.calls.filter(x => x[0] === "action" &&
    x[1].activityName === "curfy-bedtime");
  for (const callbackName of ["intervalDidStart", "intervalDidEnd"]) {
    assert.equal(callbacks.filter(x => x[1].callbackName === callbackName).at(-1)[1].actions.length, 0);
  }
  assert.equal(f.storage.has("curfy-scheduled-selection-id"), false);
});

test("a refused Free exception stop keeps the daily cutoff monitor and 15-minute recovery", async () => {
  const f = fixture({ ignoreStopOnCalls: [1] });
  const now = new Date("2026-11-02T23:00:00");
  await f.screenTime.configureBedtimeBlocking({
    bedtime: "22:00", wakeTime: "06:00", mode: "custom", now,
  });
  const expiresAt = await f.screenTime.grantBedtimeException({
    bedtime: "22:00", wakeTime: "06:00", mode: "custom",
    now: new Date("2026-11-02T23:05:00"),
  });
  assert.equal(f.isBlocked(), false);
  const stateBefore = f.storage.get("curfy-active-exception");
  assert.ok(stateBefore.activityName.startsWith("curfy-exception-"));
  assert.ok(f.monitorSchedules.has(stateBefore.activityName));
  const stopAt = new Date("2026-11-02T23:06:00");
  assert.throws(() => f.screenTime.stopBedtimeBlocking(stopAt),
    /didn't stop Curfy's temporary app-access monitor/);
  assert.deepEqual(f.storage.get("curfy-active-exception"), stateBefore);
  assert.equal(f.screenTime.activeExceptionExpiresAt(now.getTime()), expiresAt);
  assert.ok(f.monitorSchedules.has(stateBefore.activityName));
  assert.ok(f.monitorSchedules.has("curfy-bedtime"), "Never lose the daily cutoff on failure");
  assert.equal(f.calls.filter(x => x[0] === "stop").length, 1);
  assert.deepEqual(f.calls.filter(x => x[0] === "stop")[0][1], [stateBefore.activityName]);
  assert.equal(f.isBlocked(), true, "Explicit Stop Protection restores the selected shield first");
  const callbacks = f.calls.filter(x => x[0] === "action" &&
    x[1].activityName === "curfy-bedtime" && x[1].callbackName === "intervalDidEnd");
  assert.equal(callbacks.at(-1)[1].actions[0].type, "unblockSelection");

  f.screenTime.stopBedtimeBlocking(stopAt);
  assert.equal(f.monitorSchedules.has("curfy-bedtime"), false);
  assert.equal(f.monitorSchedules.has(stateBefore.activityName), false);
  assert.equal(f.isBlocked(), false);
  assert.equal(f.storage.has("curfy-active-exception"), false);
});

test("if daily stop refuses AFTER a successful exception stop, the remaining daily monitor protects the app", async () => {
  const f = fixture({ ignoreStopOnCalls: [2] });
  const now = new Date("2026-11-02T23:00:00");
  await f.screenTime.configureBedtimeBlocking({
    bedtime: "22:00", wakeTime: "06:00", mode: "custom", now,
  });
  await f.screenTime.grantBedtimeException({
    bedtime: "22:00", wakeTime: "06:00", mode: "custom",
    now: new Date("2026-11-02T23:01:00"),
  });
  const state = f.storage.get("curfy-active-exception");
  assert.equal(f.isBlocked(), false);
  assert.throws(() => f.screenTime.stopBedtimeBlocking(
    new Date("2026-11-02T23:02:00")),
    /still has Curfy's protection schedule/
  );
  assert.equal(f.monitorSchedules.has(state.activityName), false,
    "The temporary monitor must be fully removed before daily stop is attempted");
  assert.equal(f.storage.has("curfy-active-exception"), false);
  assert.equal(f.monitorSchedules.has("curfy-bedtime"), true);
  assert.equal(f.isBlocked(), true, "Do not leave the app exposed with its one-shot callback gone");
  assert.equal(f.storage.get("curfy-scheduled-selection-id"), "curfy-block-custom");
  const cutoff = f.calls.filter(x => x[0] === "action" && x[1].activityName === "curfy-bedtime" &&
    x[1].callbackName === "intervalDidEnd").at(-1)[1];
  assert.equal(cutoff.actions[0].type, "unblockSelection");
  assert.equal(cutoff.actions[0].familyActivitySelectionId, "curfy-block-custom");
  f.screenTime.stopBedtimeBlocking(new Date("2026-11-02T23:02:01"));
  assert.equal(f.monitorSchedules.has("curfy-bedtime"), false);
  assert.equal(f.isBlocked(), false);
});

test("failure to restore the selected shield before cancelling an exception leaves both monitors intact", async () => {
  const f = fixture({ ignoreBlockOnCalls: [2] });
  const now = new Date("2026-11-02T23:00:00");
  await f.screenTime.configureBedtimeBlocking({
    bedtime: "22:00", wakeTime: "06:00", mode: "custom", now,
  });
  await f.screenTime.grantBedtimeException({
    bedtime: "22:00", wakeTime: "06:00", mode: "custom",
    now: new Date("2026-11-02T23:01:00"),
  });
  const state = f.storage.get("curfy-active-exception");
  assert.throws(() => f.screenTime.stopBedtimeBlocking(
    new Date("2026-11-02T23:02:00")),
    /did not confirm Curfy's app was re-shielded/
  );
  assert.equal(f.monitorSchedules.has(state.activityName), true);
  assert.equal(f.monitorSchedules.has("curfy-bedtime"), true);
  assert.equal(f.isBlocked(), false);
  assert.deepEqual(f.storage.get("curfy-active-exception"), state);
  assert.equal(f.calls.filter(x => x[0] === "stop").length, 0);
});

test("failure while clearing native callbacks restores both actions instead of orphaning a live monitor", async () => {
  const f = fixture({ failOnActionCalls: [3] });
  await f.screenTime.configureBedtimeBlocking({
    bedtime: "22:00", wakeTime: "06:00", mode: "custom",
    now: new Date("2026-11-02T23:00:00"),
  });
  assert.throws(() => f.screenTime.stopBedtimeBlocking(), /Native callback metadata write failed/);
  assert.equal(f.monitorSchedules.has("curfy-bedtime"), true);
  for (const name of ["intervalDidStart", "intervalDidEnd"]) {
    const actions = f.calls.filter(x => x[0] === "action" && x[1].callbackName === name);
    assert.equal(actions.at(-1)[1].actions[0].familyActivitySelectionId, "curfy-block-custom");
  }
  assert.equal(f.storage.get("curfy-scheduled-selection-id"), "curfy-block-custom");
});

test("account deletion clears Curfy picker tokens but preserves unrelated shared selections", () => {
  const f = fixture();
  f.storage.set("familyActivitySelectionIds", {
    "curfy-block-custom": "old-private-app",
    "curfy-block-social": "old-social",
    "curfy-draft-custom": "old-unsaved-choice",
    "unrelated-app-choice": "keep-this",
  });
  f.screenTime.clearCurfyOnboardingSelectionsAfterAccountDeletion();
  assert.deepEqual(f.storage.get("familyActivitySelectionIds"), {
    "unrelated-app-choice": "keep-this",
  });
});

test("Delete Account erases prepared native app tickets and recovery keys, not unrelated apps", () => {
  const f = fixture();
  const ticket = "curfy-single-app-2B5CE120-66A6-4E53-A6BB-661E51A9AD01";
  f.storage.set("familyActivitySelectionIds", {
    [ticket]: "private-single-app-token",
    "curfy-block-custom": "private-committed-selection",
    "unrelated-app-choice": "preserve-me",
  });
  f.storage.set("curfy-prepared-app-choice-tickets", {
    [ticket]: "private-ticket-metadata",
  });
  f.storage.set("curfy-premium-active-exceptions", {
    "old-recovery": "not-currently-monitored",
  });
  f.storage.set("curfy-active-exception", {
    activityName: "", selectionId: "curfy-block-custom", expiresAt: 1000, bedtimeEndAt: 2000,
  });
  f.screenTime.clearCurfyOnboardingSelectionsAfterAccountDeletion();
  assert.deepEqual(f.storage.get("familyActivitySelectionIds"), {
    "unrelated-app-choice": "preserve-me",
  });
  for (const key of ["curfy-prepared-app-choice-tickets",
    "curfy-premium-active-exceptions", "curfy-active-exception"]) {
    assert.equal(f.storage.has(key), false);
  }
});

test("Delete Account never erases a token while its native reblock monitor still exists", async () => {
  const f = fixture({ initiallyBlocked: false });
  const ticket = "curfy-single-app-2B5CE120-66A6-4E53-A6BB-661E51A9AD01";
  const monitor = "curfy-premium-exception-2b5ce120-66a6-4e53-a6bb-661e51a9ad01";
  f.storage.set("familyActivitySelectionIds", { [ticket]: "private-token" });
  f.storage.set("curfy-prepared-app-choice-tickets", { [ticket]: "private-ticket" });
  await f.native.startMonitoring(monitor, {
    intervalStart: { hour: 22, minute: 0 },
    intervalEnd: { hour: 22, minute: 15 },
  });
  assert.throws(() =>
    f.screenTime.clearCurfyOnboardingSelectionsAfterAccountDeletion(),
    /native protection or exception monitor/);
  assert.equal(f.storage.get("familyActivitySelectionIds")[ticket], "private-token");
  assert.equal(f.storage.get("curfy-prepared-app-choice-tickets")[ticket], "private-ticket");
});

test("Delete Account refuses to declare private ticket deletion if App Group refuses it", () => {
  const f = fixture();
  f.storage.set("curfy-prepared-app-choice-tickets", { old: "private-data" });
  const remove = f.native.userDefaultsRemove;
  f.native.userDefaultsRemove = key => {
    if (key !== "curfy-prepared-app-choice-tickets") remove(key);
  };
  assert.throws(() =>
    f.screenTime.clearCurfyOnboardingSelectionsAfterAccountDeletion(),
    /did not confirm removal/);
  assert.equal(f.storage.has("curfy-prepared-app-choice-tickets"), true);
});

test("account deletion refuses to claim a wiped native picker if iOS ignores the write", () => {
  const f = fixture();
  f.storage.set("familyActivitySelectionIds", {
    "curfy-block-custom": "old-private-app",
  });
  f.native.userDefaultsSet = () => {};
  assert.throws(() =>
    f.screenTime.clearCurfyOnboardingSelectionsAfterAccountDeletion(),
    /did not confirm/
  );
});

test("a deleted Curfy account with no saved native picker selections is safe to reset", () => {
  const f = fixture();
  assert.doesNotThrow(() =>
    f.screenTime.clearCurfyOnboardingSelectionsAfterAccountDeletion()
  );
});

test("new onboarding picker starts empty instead of inheriting previously checked apps", () => {
  const f = fixture();
  f.storage.set("familyActivitySelectionIds", {
    "curfy-block-custom": "old-app-that-was-still-checked",
    "curfy-block-social": "keep-different-mode",
  });
  f.screenTime.beginFreshOnboardingAppSelection("custom");
  assert.deepEqual(f.storage.get("familyActivitySelectionIds"), {
    "curfy-block-social": "keep-different-mode",
  });
});
test("fresh onboarding picker must fail loudly if native shared storage refuses to clear old checkmarks", () => {
  const f = fixture();
  f.storage.set("familyActivitySelectionIds", {
    "curfy-block-custom": "old-choice",
  });
  f.native.userDefaultsSet = () => {};
  assert.throws(() => f.screenTime.beginFreshOnboardingAppSelection("custom"),
    /didn't clear/);
});
test("a fresh onboarding picker with no stale selection preserves other native data", () => {
  const f = fixture();
  f.storage.set("familyActivitySelectionIds", {
    "unrelated": "keep",
  });
  f.screenTime.beginFreshOnboardingAppSelection("custom");
  assert.deepEqual(f.storage.get("familyActivitySelectionIds"), {
    unrelated: "keep",
  });
});

test("fresh onboarding cannot erase tokens while a native bedtime monitor is still active", async () => {
  const f = fixture({ initiallyBlocked: false });
  f.storage.set("familyActivitySelectionIds", {
    "curfy-block-custom": "existing-protected-app",
  });
  await f.native.startMonitoring("curfy-bedtime", {
    intervalStart: { hour: 23, minute: 0 },
    intervalEnd: { hour: 6, minute: 0 },
    repeats: true,
  });
  assert.throws(() => f.screenTime.beginFreshOnboardingAppSelection("custom"),
    /still active/);
  assert.equal(f.storage.get("familyActivitySelectionIds")["curfy-block-custom"],
    "existing-protected-app");
});

test("iOS permission request tolerates brief notDetermined status propagation after approval", async () => {
  const f = fixture({ authorization: 0 });
  f.native.requestAuthorization = async () => {};
  let reads = 0;
  f.native.getAuthorizationStatus = () => (++reads < 3 ? 0 : 2);
  assert.equal(await f.screenTime.requestScreenTimeAccess(), "authorized");
  assert.equal(reads, 3);
});
test("denied iOS Screen Time request reports denial without blind retries", async () => {
  const f = fixture({ authorization: 1 });
  f.native.requestAuthorization = async () => { throw Error("user denied"); };
  let reads = 0;
  f.native.getAuthorizationStatus = () => { reads++; return 1; };
  assert.equal(await f.screenTime.requestScreenTimeAccess(), "denied");
  assert.equal(reads, 1);
});

test("expired exception re-shields even when token-overlap introspection is unavailable", async () => {
  const f = fixture({ overlapUnavailable: true });
  await registerRecurringProtectionMonitor(f);
  const now = new Date("2026-11-01T23:00:00");
  const expiry = await f.screenTime.grantBedtimeException({
    bedtime: "22:00", wakeTime: "06:00", mode: "custom", now,
  });
  assert.equal(f.isBlocked(), false);
  assert.doesNotThrow(() =>
    f.screenTime.reconcileBedtimeException("22:00", "06:00", new Date(expiry + 2_000))
  );
  assert.equal(f.isBlocked(), true);
  assert.equal(f.storage.has("curfy-active-exception"), false);
});

test("expired exception keeps retry state if native shield cannot be restored and overlap unavailable", async () => {
  const f = fixture({ overlapUnavailable: true, ignoreBlockOnCalls: [1] });
  await registerRecurringProtectionMonitor(f);
  const now = new Date("2026-11-01T23:00:00");
  const expiry = await f.screenTime.grantBedtimeException({
    bedtime: "22:00", wakeTime: "06:00", mode: "custom", now,
  });
  f.screenTime.reconcileBedtimeException("22:00", "06:00", new Date(expiry + 2_000));
  assert.equal(f.isBlocked(), false);
  assert.equal(f.storage.has("curfy-active-exception"), true);
});

test("expired exception at cutoff clears only after native shield is absent without token introspection", async () => {
  const f = fixture({ overlapUnavailable: true });
  const now = new Date("2026-11-02T05:50:00");
  const expiry = await f.screenTime.grantBedtimeException({
    bedtime: "22:00", wakeTime: "06:00", mode: "custom", now,
  });
  f.screenTime.reconcileBedtimeException("22:00", "06:00", new Date(expiry + 2_000));
  assert.equal(f.isBlocked(), false);
  assert.equal(f.storage.has("curfy-active-exception"), false);
});

test("stale shield after cutoff preserves recovery state if unshield fails without token introspection", async () => {
  const f = fixture({ overlapUnavailable: true, initiallyBlocked: true });
  const now = new Date("2026-11-02T05:50:00");
  const expiry = await f.screenTime.grantBedtimeException({
    bedtime: "22:00", wakeTime: "06:00", mode: "custom", now,
  });
  f.native.blockSelection({ activitySelectionId: "curfy-block-custom" });
  f.native.unblockSelection = () => {};
  f.screenTime.reconcileBedtimeException("22:00", "06:00", new Date(expiry + 2_000));
  assert.equal(f.isBlocked(), true);
  assert.equal(f.storage.has("curfy-active-exception"), true);
});

test("missing recurring iOS monitor never re-shields an app on foreground", () => {
  const f = fixture({ initiallyBlocked: false });
  f.screenTime.reconcileProtectionWindow(
    "06:00", "09:00", "custom", new Date("2026-11-02T07:00:00")
  );
  assert.equal(f.isBlocked(), false);
  assert.equal(f.calls.some(x => x[0] === "block"), false);
});

test("missing recurring iOS monitor releases an orphaned shield, even within chosen hours", () => {
  const f = fixture({ initiallyBlocked: true });
  f.screenTime.reconcileProtectionWindow(
    "23:00", "06:00", "custom", new Date("2026-11-02T23:30:00")
  );
  assert.equal(f.isBlocked(), false);
  assert.equal(f.calls.filter(x => x[0] === "reset").length, 1);
  assert.equal(f.calls.some(x => x[0] === "block"), false);
});

test("missing recurring monitor with unremovable shield reports an explicit failure", () => {
  const f = fixture({ initiallyBlocked: true, ignoreResetOnCalls: [1] });
  assert.throws(
    () => f.screenTime.reconcileProtectionWindow(
      "23:00", "06:00", "custom", new Date("2026-11-02T23:30:00")
    ), /recurring iOS protection schedule is missing/
  );
  assert.equal(f.isBlocked(), true);
  assert.equal(f.calls.some(x => x[0] === "block"), false);
});

test("registered iOS monitor retains existing shield during the chosen window", async () => {
  const f = fixture({ initiallyBlocked: true });
  await f.native.startMonitoring("curfy-bedtime", {
    intervalStart: { hour: 23, minute: 0 },
    intervalEnd: { hour: 6, minute: 0 },
    repeats: true,
  });
  f.screenTime.reconcileProtectionWindow(
    "23:00", "06:00", "custom", new Date("2026-11-02T23:30:00")
  );
  assert.equal(f.isBlocked(), true);
  assert.equal(f.calls.filter(x => x[0] === "reset").length, 0);
});

test("expired exception cannot create an orphaned shield after recurring monitor disappears", async () => {
  const f = fixture({ initiallyBlocked: true });
  const now = new Date("2026-11-01T23:00:00");
  const expiry = await f.screenTime.grantBedtimeException({
    bedtime: "22:00", wakeTime: "06:00", mode: "custom", now,
  });
  assert.equal(f.isBlocked(), false);
  f.screenTime.reconcileBedtimeException("22:00", "06:00", new Date(expiry + 2000));
  assert.equal(f.isBlocked(), false);
  assert.equal(f.storage.has("curfy-active-exception"), false);
  assert.equal(f.calls.some(x => x[0] === "block"), false);
});

test("orphan shield left by exception callback is released when recurring monitor is gone", async () => {
  const f = fixture();
  const now = new Date("2026-11-01T23:00:00");
  const expiry = await f.screenTime.grantBedtimeException({
    bedtime: "22:00", wakeTime: "06:00", mode: "custom", now,
  });
  f.native.blockSelection({ activitySelectionId: "curfy-block-custom" });
  f.screenTime.reconcileBedtimeException("22:00", "06:00", new Date(expiry + 2000));
  assert.equal(f.isBlocked(), false);
  assert.equal(f.storage.has("curfy-active-exception"), false);
});

test("unremovable orphan exception shield preserves recovery state for retry", async () => {
  const f = fixture({ ignoreResetOnCalls: [1] });
  const now = new Date("2026-11-01T23:00:00");
  const expiry = await f.screenTime.grantBedtimeException({
    bedtime: "22:00", wakeTime: "06:00", mode: "custom", now,
  });
  f.native.blockSelection({ activitySelectionId: "curfy-block-custom" });
  assert.throws(() =>
    f.screenTime.reconcileBedtimeException("22:00", "06:00", new Date(expiry + 2000)),
    /could not clear an orphaned app shield/
  );
  assert.equal(f.isBlocked(), true);
  assert.equal(f.storage.has("curfy-active-exception"), true);
});
