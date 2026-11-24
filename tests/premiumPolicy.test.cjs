const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const ts = require("typescript");

const source = readFileSync(join(__dirname, "../lib/premiumPolicy.ts"), "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;
const mod = { exports: {} };
new Function("module", "exports", js)(mod, mod.exports);
const {
  CURFY_PREMIUM_PRODUCT_ID, selectionIssueForEntitlement,
  normalizeActivitySelectionMetadata,
} = mod.exports;

const selection = (applicationCount, overrides = {}) => ({
  applicationCount, categoryCount: 0, webDomainCount: 0,
  includeEntireCategory: false, ...overrides,
});

test("premium is one fixed non-consumable product identifier", () => {
  assert.equal(CURFY_PREMIUM_PRODUCT_ID, "com.alvinkwak.curfy.premium");
});

test("one explicitly selected application stays available on the free tier", () => {
  for (const entitlement of ["unknown", "free", "owned"]) {
    assert.equal(selectionIssueForEntitlement(selection(1), entitlement), null);
  }
});

test("empty and missing selections cannot be protected", () => {
  assert.equal(selectionIssueForEntitlement(null, "owned"), "choose-one-app");
  assert.equal(selectionIssueForEntitlement(selection(0), "free"), "choose-one-app");
});

test("the free tier cannot protect multiple individual apps", () => {
  assert.equal(selectionIssueForEntitlement(selection(2), "free"), "premium-required");
  assert.equal(selectionIssueForEntitlement(selection(7), "free"), "premium-required");
});

test("an unverified, unavailable or offline purchase status cannot authorize NEW multi-app protection", () => {
  assert.equal(selectionIssueForEntitlement(selection(2), "unknown"), "purchase-status-unavailable");
});

test("verified ownership authorizes multi-app drafts without granting categories or websites", () => {
  assert.equal(selectionIssueForEntitlement(selection(2), "owned"), null);
  assert.equal(selectionIssueForEntitlement(selection(12), "owned"), null);
});

test("even purchased Premium excludes category and website tokens", () => {
  for (const overrides of [
    { categoryCount: 1 },
    { webDomainCount: 1 },
    { includeEntireCategory: true },
    { applicationCount: 0, categoryCount: 1 },
  ]) {
    assert.equal(
      selectionIssueForEntitlement(selection(2, overrides), "owned"),
      "categories-and-websites-not-supported"
    );
  }
});

test("native picker category promotion never masquerades as an individual app", () => {
  assert.equal(
    selectionIssueForEntitlement(selection(0, { categoryCount: 1 }), "owned"),
    "categories-and-websites-not-supported"
  );
});

test("corrupt native selection metadata is denied before scheduling", () => {
  for (const invalid of [-1, 0.5, NaN, Infinity]) {
    assert.equal(
      selectionIssueForEntitlement(selection(invalid), "owned"),
      "categories-and-websites-not-supported"
    );
  }
});

test("iOS 0.6.1 event and readback website count spellings normalize to exactly the same one-app selection", () => {
  // Actual package source: ReactNativeDeviceActivityViewPersisted.swift emits
  // webDomainCount, but ActivitySelectionMetadata's Swift @Field record emits
  // webdomainCount (lower-case d) despite the TypeScript declaration.
  const eventPayload = { applicationCount: 1, categoryCount: 0,
    webDomainCount: 0, includeEntireCategory: false };
  const savedPayload = { applicationCount: 1, categoryCount: 0,
    webdomainCount: 0, includeEntireCategory: false };
  assert.deepEqual(normalizeActivitySelectionMetadata(eventPayload),
    normalizeActivitySelectionMetadata(savedPayload));
  assert.equal(selectionIssueForEntitlement(eventPayload, "free"), null);
  assert.equal(selectionIssueForEntitlement(savedPayload, "free"), null);
  assert.deepEqual(normalizeActivitySelectionMetadata(savedPayload),
    { ...eventPayload });
});

test("native Swift readback rejects extra apps and categories instead of silently allowing Premium", () => {
  for (const raw of [
    { applicationCount: 2, categoryCount: 0, webdomainCount: 0 },
    { applicationCount: 0, categoryCount: 1, webdomainCount: 0 },
    { applicationCount: 1, categoryCount: 0, webdomainCount: 1 },
  ]) {
    assert.notEqual(selectionIssueForEntitlement(raw, "free"), null);
  }
});

test("missing, contradictory or corrupt native website count fails safely, never assumed zero", () => {
  const valid = { applicationCount: 1, categoryCount: 0, includeEntireCategory: false };
  for (const raw of [
    valid,
    { ...valid, webDomainCount: 0, webdomainCount: 1 },
    { ...valid, webdomainCount: "0" },
    { ...valid, webdomainCount: NaN },
    { ...valid, categoryCount: -1, webdomainCount: 0 },
  ]) {
    assert.equal(normalizeActivitySelectionMetadata(raw), null);
    assert.notEqual(selectionIssueForEntitlement(raw, "free"), null);
  }
});
