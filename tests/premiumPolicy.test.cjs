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
const { CURFY_PREMIUM_PRODUCT_ID, selectionIssueForEntitlement } = mod.exports;

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
