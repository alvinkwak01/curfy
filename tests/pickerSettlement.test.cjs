const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const ts = require("typescript");

function load() {
  const src = readFileSync(join(__dirname, "../lib/pickerSettlement.ts"), "utf8");
  const js = ts.transpileModule(src, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const mod = { exports: {} };
  new Function("module", "exports", js)(mod, mod.exports);
  return mod.exports;
}
const { waitForPersistedPickerCommit } = load();

test("native picker remains mounted past the third-party library's 100ms save debounce", async () => {
  const delays = [];
  await waitForPersistedPickerCommit(() => true, async ms => { delays.push(ms); });
  assert.deepEqual(delays, [250]);
});
test("picker stays mounted longer if final native selection event is delayed", async () => {
  let count = 0;
  const delays = [];
  await waitForPersistedPickerCommit(
    () => ++count >= 2, async ms => { delays.push(ms); }
  );
  assert.deepEqual(delays, [250, 250]);
});
test("missing native change event still releases picker and never validates an app itself", async () => {
  const delays = [];
  await waitForPersistedPickerCommit(
    () => false, async ms => { delays.push(ms); }
  );
  assert.deepEqual(delays, [250, 250, 250]);
});
test("picker removal awaits saved token metadata and Continue awaits same native commit", () => {
  const src = readFileSync(join(__dirname, "../app/onboarding.tsx"), "utf8");
  assert.match(src, /onDismissRequest=\{\(\) => \{/);
  assert.match(src, /await waitForPersistedPickerCommit\(/);
  assert.match(src, /onPickerCommit\(commit\)/);
  assert.match(src, /await pendingPickerCommit\.current/);
  assert.match(src, /activitySelectionMetadata\(\{/);
  assert.match(src, /freeSelectionIssueForMetadata\(metadata\)/);
  assert.match(src, /setPickerMode\(null\)/);
});
