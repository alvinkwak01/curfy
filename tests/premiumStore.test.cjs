const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const ts = require("typescript");
function loadTS(path, customRequire) {
  const source = readFileSync(join(__dirname, "..", path), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const m = { exports: {} };
  new Function("require", "module", "exports", output)(customRequire, m, m.exports);
  return m.exports;
}
const policy = loadTS("lib/premiumPolicy.ts", require);
function fixture({
  nativeEntitlement = "free",
  nativeRestore = "free",
  purchase = "purchased",
  failEntitlement = false,
  productPrice = "$5.99",
  supportedPlatform = "ios",
} = {}) {
  const calls = [];
  let eventHandler = null;
  const native = {
    addListener: (name, callback) => {
      calls.push(["listen", name]);
      eventHandler = callback;
      return { remove: () => { calls.push(["remove-listener"]); eventHandler = null; } };
    },
    getEntitlement: async id => {
      calls.push(["entitlement", id]);
      if (failEntitlement) throw new Error("StoreKit unavailable");
      return nativeEntitlement;
    },
    restore: async id => { calls.push(["restore", id]); return nativeRestore; },
    purchase: async id => { calls.push(["purchase", id]); return purchase; },
    getProduct: async id => {
      calls.push(["product", id]);
      return { productId: id, displayName: "Curfy Premium", displayPrice: productPrice, available: true };
    },
  };
  const module = loadTS("modules/curfy-storekit/index.ts", name => {
    if (name === "react-native") return { Platform: { OS: supportedPlatform } };
    if (name === "expo-modules-core") return { requireNativeModule: id => {
      assert.equal(id, "CurfyStoreKit");
      return native;
    } };
    throw new Error("Unexpected module " + name);
  });
  const store = loadTS("lib/premiumStore.ts", name => {
    if (name === "@/modules/curfy-storekit") return module;
    if (name === "@/lib/premiumPolicy") return policy;
    throw new Error("Unexpected import " + name);
  });
  return {
    store, calls, native,
    emit: (productId) => eventHandler?.({ productId }),
  };
}

test("StoreKit returns native verified ownership and never reads a local premium flag", async () => {
  const f = fixture({ nativeEntitlement: "owned" });
  assert.equal(await f.store.refreshPremiumEntitlement(), "owned");
  assert.deepEqual(f.calls, [["entitlement", policy.CURFY_PREMIUM_PRODUCT_ID]]);
});

test("an App Store failure becomes unknown, not a free downgrade", async () => {
  const f = fixture({ failEntitlement: true });
  const originalWarn = console.warn;
  console.warn = () => {};
  try { assert.equal(await f.store.loadPremiumEntitlement(), "unknown"); }
  finally { console.warn = originalWarn; }
});

test("unknown native entitlement values never grant ownership", async () => {
  const f = fixture({ nativeEntitlement: "premium" });
  await assert.rejects(() => f.store.refreshPremiumEntitlement(), /unrecognized entitlement/);
});

test("display prices are supplied by Apple, not assumed to be US dollars", async () => {
  const f = fixture({ productPrice: "5,99 €" });
  const product = await f.store.fetchPremiumProduct();
  assert.equal(product.displayPrice, "5,99 €");
});

test("purchase cancellation does not call an entitlement check or grant premium", async () => {
  const f = fixture({ purchase: "cancelled" });
  assert.equal(await f.store.purchasePremium(), "cancelled");
  assert.equal(f.calls.filter(([name]) => name === "entitlement").length, 0);
});

test("pending Ask to Buy does not grant Premium", async () => {
  const f = fixture({ purchase: "pending" });
  assert.equal(await f.store.purchasePremium(), "pending");
});

test("purchase completed event is not enough: only a current verified entitlement grants owned", async () => {
  const unverified = fixture({ purchase: "purchased", nativeEntitlement: "free" });
  await assert.rejects(() => unverified.store.purchasePremium(), /not confirmed/);
  const verified = fixture({ purchase: "purchased", nativeEntitlement: "owned" });
  assert.equal(await verified.store.purchasePremium(), "owned");
});

test("restore requires fresh verified StoreKit entitlement, not sync result alone", async () => {
  const f = fixture({ nativeRestore: "owned", nativeEntitlement: "free" });
  assert.equal(await f.store.restorePremium(), "free");
  assert.deepEqual(f.calls.map(([name]) => name), ["restore", "entitlement"]);
});

test("unexpected restore result fails closed even when current entitlement says owned", async () => {
  const f = fixture({ nativeRestore: "unsupported", nativeEntitlement: "owned" });
  await assert.rejects(() => f.store.restorePremium(), /unrecognized entitlement/);
});

test("the native StoreKit bridge is unavailable outside iOS", async () => {
  const f = fixture({ supportedPlatform: "android" });
  await assert.rejects(() => f.store.refreshPremiumEntitlement(), /only supported on iPhone/);
});

test("no purchase or entitlement can be inferred from an invalid product listing", async () => {
  const f = fixture({ productPrice: " " });
  await assert.rejects(() => f.store.fetchPremiumProduct(), /pricing is not available/);
});

test("StoreKit updates never directly grant entitlement; only trigger refresh", () => {
  const f = fixture({ nativeEntitlement: "free" });
  let changes = 0;
  const stop = f.store.subscribePremiumTransactions(() => { changes++; });
  f.emit("other.product");
  assert.equal(changes, 0);
  f.emit(policy.CURFY_PREMIUM_PRODUCT_ID);
  assert.equal(changes, 1);
  assert.equal(f.calls.filter(([name]) => name === "entitlement").length, 0);
  stop();
  f.emit(policy.CURFY_PREMIUM_PRODUCT_ID);
  assert.equal(changes, 1);
  assert.equal(f.calls.at(-1)[0], "remove-listener");
});

test("native purchase and restore remain gated off from user-facing screens", () => {
  const { readFileSync } = require("node:fs");
  const { join } = require("node:path");
  const home = readFileSync(join(__dirname, "../app/(tabs)/index.tsx"), "utf8");
  const settings = readFileSync(join(__dirname, "../app/settings.tsx"), "utf8");
  const onboarding = readFileSync(join(__dirname, "../app/onboarding.tsx"), "utf8");
  for (const screen of [home, settings, onboarding]) {
    assert.doesNotMatch(screen, /purchasePremium\s*\(/);
    assert.doesNotMatch(screen, /buyPremium\s*\(/);
  }
});
