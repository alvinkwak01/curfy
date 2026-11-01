const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");

// Source-level architecture guards, NOT iPhone interaction tests. These catch
// specific bugs previously shipped despite clean TypeScript and unit checks.
function source(path) {
  return readFileSync(join(__dirname, "..", path), "utf8");
}

test("Curfy no longer traps its own interface with a legacy in-app lock modal", () => {
  const root = source("app/_layout.tsx");
  assert.doesNotMatch(root, /<Modal\s+visible=\{isLocked\}/);
  assert.match(root, /name="escape"/);
});
test("120-second escape remains a native continuous long-press, not JS timer unlock", () => {
  const hold = source("components/HoldButton.tsx");
  assert.match(hold, /HOLD_DURATION_MS\s*=\s*120000/);
  assert.match(hold, /Gesture\.LongPress\(\)/);
  assert.match(hold, /\.minDuration\(HOLD_DURATION_MS\)/);
  assert.match(hold, /\.onStart\(\(\)\s*=>\s*handleNativeHoldComplete\(\)\)/);
  assert.doesNotMatch(hold, /if\s*\(elapsed\s*>=\s*HOLD_DURATION_MS\)/);
});
test("TimePicker uses gestures, never a vertically nested FlatList with hidden warning", () => {
  const wheel = source("components/TimePicker.tsx");
  assert.match(wheel, /PanResponder\.create/);
  assert.match(wheel, /accessibilityRole="adjustable"/);
  assert.doesNotMatch(wheel, /\bFlatList\b/);
  assert.doesNotMatch(wheel, /LogBox\.ignoreLogs/);
});
test("Settings only reschedules native protection when its protected fields change", () => {
  const settings = source("app/settings.tsx");
  assert.match(settings, /if\s*\(protectionChanged\)\s*\{\s*await configureBedtimeBlocking/);
  assert.match(settings, /allowProtectionReconfiguration/);
});
test("The Apple shield never promises an unsupported automatic Curfy launch", () => {
  const screenTime = source("lib/screenTime.ts");
  assert.match(screenTime, /primaryButtonLabel:\s*"Not now"/);
  assert.match(screenTime, /behavior:\s*"close"/);
  assert.doesNotMatch(screenTime, /behavior:\s*"openApp"/);
});
