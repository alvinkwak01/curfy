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

function fixture({
  failStart = false, failUnblock = false, overlapReportsZero = false,
  authorization = 2, selectionCount = 1, initiallyBlocked = true,
  silentMonitorFailure = false,
} = {}) {
  const storage = new Map();
  const calls = [];
  const monitoredActivities = new Set();
  let blocked = initiallyBlocked;
  const native = {
    AuthorizationStatus: { notDetermined: 0, denied: 1, approved: 2 },
    getAuthorizationStatus: () => authorization,
    activitySelectionMetadata: () => ({
      applicationCount: selectionCount, categoryCount: 0, webDomainCount: 0,
    }),
    intersection: () => ({
      applicationCount: blocked && !overlapReportsZero ? 1 : 0, categoryCount: 0, webDomainCount: 0,
    }),
    userDefaultsGet: key => storage.get(key),
    userDefaultsSet: (key, value) => { storage.set(key, value); },
    userDefaultsRemove: key => { storage.delete(key); },
    configureActions: config => { calls.push(["action", config]); },
    startMonitoring: async (name, schedule) => {
      calls.push(["start", name, schedule]);
      if (failStart) throw Error("Native scheduling failed");
      if (!silentMonitorFailure) monitoredActivities.add(name);
    },
    activities: () => [...monitoredActivities],
    stopMonitoring: names => {
      calls.push(["stop", names]);
      if (names) names.forEach(name => monitoredActivities.delete(name));
      else monitoredActivities.clear();
    },
    updateShield: (config, actions) => { calls.push(["shield", config, actions]); },
    isShieldActive: () => blocked,
    blockSelection: input => { calls.push(["block", input]); blocked = true; },
    unblockSelection: () => {
      calls.push(["unblock"]);
      if (!failUnblock) blocked = false;
    },
    resetBlocks: () => { calls.push(["reset"]); blocked = false; },
  };
  const screenTime = loadTS("lib/screenTime.ts", moduleName => {
    if (moduleName === "react-native-device-activity") return native;
    if (moduleName === "@/lib/bedtimeWindow") return time;
    throw Error("Unexpected import " + moduleName);
  });
  return { native, screenTime, storage, calls, isBlocked: () => blocked };
}

test("completing the hold schedules native reblock before unshielding", async () => {
  const f = fixture();
  const now = new Date("2026-10-31T23:00:00");
  const expiresAt = await f.screenTime.grantBedtimeException({
    bedtime: "22:00", wakeTime: "06:00", mode: "custom", now,
  });
  assert.equal(expiresAt, now.getTime() + 15 * 60_000 + 1_000);
  assert.equal(f.isBlocked(), false);
  const start = f.calls.findIndex(call => call[0] === "start");
  const unblock = f.calls.findIndex(call => call[0] === "unblock");
  const endAction = f.calls.findIndex(call => call[0] === "action" &&
    call[1].callbackName === "intervalDidEnd" && call[1].actions.length > 0);
  assert.ok(endAction >= 0 && endAction < start && start < unblock);
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

test("foreground recovery re-shields expired exceptions inside bedtime", async () => {
  const f = fixture();
  const now = new Date("2026-10-31T23:00:00");
  const expiry = await f.screenTime.grantBedtimeException({
    bedtime: "22:00", wakeTime: "06:00", mode: "custom", now,
  });
  f.screenTime.reconcileBedtimeException("22:00", "06:00", new Date(expiry + 2_000));
  assert.equal(f.isBlocked(), true);
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
