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
  failStart = false, failUnblock = false, overlapReportsZero = false,
  overlapUnavailable = false, authorization = 2, selectionCount = 1, categoryCount = 0,
  webDomainCount = 0, includeEntireCategory = false, initiallyBlocked = true,
  silentMonitorFailure = false,
  failOnStartCalls = [], failAfterOverwriteStartCalls = [],
  ignoreBlockOnCalls = [], ignoreResetOnCalls = [],
  ignoreStopOnCalls = [], failOnActionCalls = [],
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
      applicationCount: selectionCount, categoryCount, webDomainCount, includeEntireCategory,
    }),
    intersection: () => overlapUnavailable ? undefined : ({
      applicationCount: blocked && !overlapReportsZero ? 1 : 0, categoryCount: 0, webDomainCount: 0,
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

test("account/reset stop refuses to discard metadata when managed app shield remains", async () => {
  const f = fixture({ ignoreResetOnCalls: [2] });
  await f.screenTime.configureBedtimeBlocking({
    bedtime: "22:00", wakeTime: "06:00", mode: "custom",
    now: new Date("2026-11-02T23:00:00"),
  });
  assert.throws(() => f.screenTime.stopBedtimeBlocking(), /still reports protected apps/);
  assert.equal(f.storage.get("curfy-scheduled-selection-id"), "curfy-block-custom");
  assert.equal(f.isBlocked(), true);
  assert.doesNotThrow(() => f.screenTime.stopBedtimeBlocking());
  assert.equal(f.storage.has("curfy-scheduled-selection-id"), false);
  assert.equal(f.isBlocked(), false);
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

test("a failed Stop Protection keeps the live exception monitor and 15-minute expiry", async () => {
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
  assert.throws(() => f.screenTime.stopBedtimeBlocking(), /still has Curfy's protection schedule/);
  assert.deepEqual(f.storage.get("curfy-active-exception"), stateBefore);
  assert.equal(f.screenTime.activeExceptionExpiresAt(now.getTime()), expiresAt);
  assert.ok(f.monitorSchedules.has(stateBefore.activityName));
  assert.equal(f.calls.filter(x => x[0] === "stop").length, 1);
  assert.deepEqual(f.calls.filter(x => x[0] === "stop")[0][1], ["curfy-bedtime"]);

  f.screenTime.stopBedtimeBlocking();
  assert.equal(f.monitorSchedules.has("curfy-bedtime"), false);
  assert.equal(f.monitorSchedules.has(stateBefore.activityName), false);
  assert.equal(f.storage.has("curfy-active-exception"), false);
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
