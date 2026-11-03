const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const ts = require("typescript");

function compileTSX(path, deps) {
  const source = readFileSync(join(__dirname, "..", path), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", output)(deps, module, module.exports);
  return module.exports;
}

const revision = "a".repeat(64);
function fixture({ os = "ios", response = { count: 3, revision } } = {}) {
  const calls = [];
  const api = compileTSX("modules/curfy-protected-apps/index.tsx", (name) => {
    if (name === "react-native") return { Platform: { OS: os } };
    if (name === "expo-modules-core") return {
      requireNativeModule: (id) => {
        calls.push(["module", id]);
        return {
          getProtectedApps: (selectionId) => {
            calls.push(["read", selectionId]);
            return response;
          },
          prepareProtectedApp: (selectionId, choiceRevision, index) => {
            calls.push(["prepare", selectionId, choiceRevision, index]);
            return "curfy-single-app-2B5CE120-66A6-4E53-A6BB-661E51A9AD01";
          },
          validatePreparedApp: (ticketId) => {
            calls.push(["validate", ticketId]);
            return true;
          },
        };
      },
      requireNativeViewManager: (id) => {
        calls.push(["view", id]);
        return () => null;
      },
    };
    if (name === "react/jsx-runtime") return { jsx: () => ({}) };
    throw Error("Unexpected import: " + name);
  });
  return { api, calls };
}

test("return only count and revision from a valid native app selection", () => {
  const f = fixture({ response: { count: 3, revision, token: "NEVER_EXPOSE", names: ["private"] } });
  assert.deepEqual(f.api.readProtectedAppChoices("curfy-block-custom"), { count: 3, revision });
  assert.deepEqual(f.calls, [["module", "CurfyProtectedApps"], ["read", "curfy-block-custom"]]);
});

test("only committed Curfy selection IDs are allowed; no draft or arbitrary token reads", () => {
  const f = fixture();
  for (const id of ["", "curfy-draft-custom", "curfy-block-invalid", "../secret"]) {
    assert.throws(() => f.api.readProtectedAppChoices(id), /active Curfy/);
  }
  assert.equal(f.calls.length, 0);
});

test("reject malformed or empty native snapshots", () => {
  for (const response of [
    null, {}, { count: 0, revision }, { count: 1.5, revision },
    { count: NaN, revision }, { count: -1, revision },
    { count: 2, revision: "not-a-digest" },
  ]) {
    const f = fixture({ response });
    assert.throws(() => f.api.readProtectedAppChoices("curfy-block-social"),
      /valid protected-app selection/);
  }
});

test("no native module lookup outside an iPhone", () => {
  const f = fixture({ os: "android" });
  assert.throws(() => f.api.readProtectedAppChoices("curfy-block-custom"), /only available on iPhone/);
  assert.equal(f.calls.length, 0);
});

test("native labels validate identity by selection revision and row number", () => {
  const f = fixture();
  assert.throws(() => f.api.CurfyAppLabel({
    selectionId: "curfy-draft-custom", revision, index: 0,
  }), /active Curfy/);
  assert.throws(() => f.api.CurfyAppLabel({
    selectionId: "curfy-block-custom", revision: "wrong", index: 0,
  }), /Invalid native/);
  assert.throws(() => f.api.CurfyAppLabel({
    selectionId: "curfy-block-custom", revision, index: -1,
  }), /Invalid native/);
  assert.equal(f.calls.length, 0);
});

test("Swift only returns a whole-selection revision and count, never app names or raw tokens", () => {
  const swift = readFileSync(join(__dirname,
    "../modules/curfy-protected-apps/ios/CurfyProtectedAppsModule.swift"), "utf8");
  assert.match(swift, /familyActivitySelectionIds/);
  assert.match(swift, /JSONDecoder\(\)\.decode\(FamilyActivitySelection\.self/);
  assert.match(swift, /Label\(token\)/);
  assert.match(swift, /snapshot\.revision == revision/);
  assert.match(swift, /"count": snapshot\.applications\.count, "revision": snapshot\.revision/);
  assert.doesNotMatch(swift, /return \[.*token.*\]/);
  assert.doesNotMatch(swift, /store\.shield\.applications\s*=/);
});

test("Home may display one private native app label but cannot activate Premium or grant access", () => {
  const home = readFileSync(join(__dirname, "../app/(tabs)/index.tsx"), "utf8");
  const main = readFileSync(join(__dirname, "../lib/screenTime.ts"), "utf8");
  assert.match(home, /readProtectedAppChoices\(selectionIdForMode\(blockMode\)\)/);
  assert.match(home, /snapshot\.count === 1 \? snapshot : null/);
  assert.match(home, /<CurfyAppLabel/);
  assert.doesNotMatch(home, /prepareProtectedAppChoice\(|grantPremiumAppException\(|refreshPremiumEntitlement\(/);
  assert.doesNotMatch(home, /purchasePremium\(|multiAppUnlock\(|applicationTokens\s*=/);
  assert.match(main, /assertOneFreeAppSelected/);
});


test("scoped app choice preparation returns only a random ticket, not Apple tokens", () => {
  const f = fixture();
  const ticket = f.api.prepareProtectedAppChoice("curfy-block-custom", revision, 2);
  assert.equal(ticket, "curfy-single-app-2B5CE120-66A6-4E53-A6BB-661E51A9AD01");
  assert.deepEqual(f.calls, [
    ["module", "CurfyProtectedApps"],
    ["prepare", "curfy-block-custom", revision, 2],
  ]);
  assert.equal(f.api.validateProtectedAppChoice(ticket), true);
  assert.deepEqual(f.calls.slice(-2), [
    ["module", "CurfyProtectedApps"],
    ["validate", ticket],
  ]);
});

test("native bridge refuses drafts, invalid hashes, and invalid app indices before calling iOS", () => {
  const f = fixture();
  assert.throws(() => f.api.prepareProtectedAppChoice("curfy-draft-custom", revision, 0), /active Curfy/);
  assert.throws(() => f.api.prepareProtectedAppChoice("curfy-block-custom", "wrong", 0), /Invalid protected-app choice/);
  for (const value of [-1, NaN, 2.4, Infinity]) {
    assert.throws(() => f.api.prepareProtectedAppChoice("curfy-block-custom", revision, value), /Invalid protected-app choice/);
  }
  assert.throws(() => f.api.validateProtectedAppChoice("../unsaved"), /Invalid prepared/);
  assert.equal(f.calls.length, 0);
});

test("scoped app choices cannot silently run on Android", () => {
  const f = fixture({ os: "android" });
  assert.throws(
    () => f.api.prepareProtectedAppChoice("curfy-block-custom", revision, 0),
    /only available on iPhone/
  );
  assert.throws(
    () => f.api.validateProtectedAppChoice("curfy-single-app-2B5CE120-66A6-4E53-A6BB-661E51A9AD01"),
    /only available on iPhone/
  );
  assert.equal(f.calls.length, 0);
});

test("Swift prepared choice cannot unblock without a later 120-second hold coordinator", () => {
  const swift = readFileSync(join(__dirname,
    "../modules/curfy-protected-apps/ios/CurfyProtectedAppsModule.swift"), "utf8");
  assert.match(swift, /selection\.applicationTokens/);
  assert.match(swift, /single\.applicationTokens = Set\(\[token\]\)/);
  assert.match(swift, /canonicalEncoder\.outputFormatting = \[\.sortedKeys\]/);
  assert.match(swift, /snapshot\.revision == revision/);
  assert.match(swift, /current\.revision == ticket\.revision/);
  assert.match(swift, /scoped\.applicationTokens == Set\(\[current\.applications\[ticket\.index\]\]\)/);
  assert.match(swift, /curfyTicketValidity: TimeInterval = 10 \* 60/);
  assert.doesNotMatch(swift, /ManagedSettingsStore\(\)/);
  assert.doesNotMatch(swift, /unblockSelection\(/);
  assert.doesNotMatch(swift, /store\.shield\./);
});


test("native Screen Time chooser compiles against iOS 15.1 API availability boundaries", () => {
  const native = readFileSync(join(__dirname,
    "../modules/curfy-protected-apps/ios/CurfyProtectedAppsModule.swift"), "utf8");
  const monitor = readFileSync(join(__dirname,
    "../targets/ActivityMonitorExtension/DeviceActivityMonitorExtension.swift"), "utf8");
  const pod = readFileSync(join(__dirname,
    "../modules/curfy-protected-apps/ios/CurfyProtectedApps.podspec"), "utf8");
  assert.match(native, /import ManagedSettings/);
  assert.match(pod, /s\.frameworks\s*=.*ManagedSettings/);
  for (const source of [native, monitor]) {
    assert.match(source, /if #available\(iOS 15\.2, \*\)/);
    assert.match(source, /return selection\.includeEntireCategory/);
    assert.match(source, /!curfyIncludesEntireCategory\(/);
    assert.equal((source.match(/return selection\.includeEntireCategory/g) || []).length, 1,
      "Only the availability-guarded read may access the iOS 15.2 API");
  }
});


test("iOS deployment target and local pods match the 15.2 native FamilyControls Label requirement", () => {
  const app = JSON.parse(readFileSync(join(__dirname, "../app.json"), "utf8"));
  const plugin = app.expo.plugins.find(p => Array.isArray(p) && p[0] === "expo-build-properties");
  assert.equal(plugin?.[1]?.ios?.deploymentTarget, "15.2");
  for (const file of [
    "../modules/curfy-protected-apps/ios/CurfyProtectedApps.podspec",
    "../modules/curfy-storekit/ios/CurfyStoreKit.podspec",
  ]) {
    assert.match(readFileSync(join(__dirname, file), "utf8"), /:ios,\s*'15\.2'/);
  }
  const swift = readFileSync(join(__dirname,
    "../modules/curfy-protected-apps/ios/CurfyProtectedAppsModule.swift"), "utf8");
  assert.match(swift, /Label\(token\)/);
});
