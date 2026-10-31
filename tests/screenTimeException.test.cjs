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

function fixture({ failStart = false, failUnblock = false } = {}) {
  const storage = new Map();
  const calls = [];
  let blocked = true;
  const native = {
    AuthorizationStatus: { notDetermined: 0, denied: 1, approved: 2 },
    getAuthorizationStatus: () => 2,
    activitySelectionMetadata: () => ({
      applicationCount: 1, categoryCount: 0, webDomainCount: 0,
    }),
    intersection: () => ({
      applicationCount: blocked ? 1 : 0, categoryCount: 0, webDomainCount: 0,
    }),
    userDefaultsGet: key => storage.get(key),
    userDefaultsSet: (key, value) => { storage.set(key, value); },
    userDefaultsRemove: key => { storage.delete(key); },
    configureActions: config => { calls.push(["action", config]); },
    startMonitoring: async (name, schedule) => {
      calls.push(["start", name, schedule]);
      if (failStart) throw Error("Native scheduling failed");
    },
    stopMonitoring: names => { calls.push(["stop", names]); },
    updateShield: () => {},
    blockSelection: () => { calls.push(["block"]); blocked = true; },
    unblockSelection: () => {
      calls.push(["unblock"]);
      if (!failUnblock) blocked = false;
    },
    resetBlocks: () => { blocked = false; },
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
