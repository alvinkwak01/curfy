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
  // A comment explaining the removed FlatList is fine; an actual component
  // or import would reintroduce the broken nested-scroll behavior.
  assert.doesNotMatch(wheel, /<FlatList\b/);
  assert.doesNotMatch(wheel, /import\s*\{[^}]*\bFlatList\b/);
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

test("nightly records are described as Curfy logs, not proven sleep", () => {
  const home = source("app/(tabs)/index.tsx");
  const leaderboard = source("app/(tabs)/leaderboard.tsx");
  const journal = source("app/(tabs)/journal.tsx");
  assert.match(home, /Curfy windows logged/);
  assert.match(leaderboard, /not measured sleep/);
  assert.match(home, /No-exception windows/);
  assert.doesNotMatch(journal, /signals to your brain/);
  assert.doesNotMatch(journal, /let you actually fall asleep/);
});

test("onboarding lets users choose Morning, Evening or Both in only five steps", () => {
  const onboarding = source("app/onboarding.tsx");
  const settings = source("app/settings.tsx");
  const context = source("context/SleepContext.tsx");
  assert.match(onboarding, /STEP_COUNT = 5/);
  assert.match(onboarding, /const \[showWelcome, setShowWelcome\] = useState\(true\)/);
  assert.match(onboarding, /if \(showWelcome\)/);
  assert.match(onboarding, /<StepWelcome onStart=/);
  assert.match(onboarding, /<Btn label="Get Started"/);
  assert.match(onboarding, /PROTECTION_ROUTINES\.map/);
  assert.match(onboarding, /When should your app be available again\?/);
  assert.doesNotMatch(onboarding, /What time do.*you wake up/);
  assert.match(settings, /PROTECTION_ROUTINES\.map/);
  assert.match(settings, /APPS AVAILABLE AGAIN/);
  assert.match(context, /PROTECTION_ROUTINE_KEY/);
  assert.match(context, /routineIsEveningBased\(routine\)/);
});
test("Home always tells users when a current protection window ends", () => {
  const home = source("app/(tabs)/index.tsx");
  assert.match(home, /Protection scheduled until/);
  assert.match(home, /clockLabel\(wakeTime\)/);
  assert.doesNotMatch(home, /It's bedtime — protect your evening/);
});
test("community stats cannot falsely average mixed morning and bedtime clock starts", () => {
  const screen = source("app/(tabs)/leaderboard.tsx");
  assert.doesNotMatch(screen, /<CommunityStats\s*\/>/);
});

test("account deletion stops native protection before wiping local recovery data", () => {
  const ctx = source("context/SleepContext.tsx");
  const start = ctx.indexOf("const deleteAccount = async () => {");
  const end = ctx.indexOf("const streak = computeStreak", start);
  assert.ok(start >= 0 && end > start);
  const deletion = ctx.slice(start, end);
  const remote = deletion.indexOf("await deleteRemoteAccount()");
  const stop = deletion.indexOf("stopBedtimeBlocking()");
  const wipe = deletion.indexOf("AsyncStorage.multiRemove(ALL_STORAGE_KEYS)");
  assert.ok(remote >= 0 && stop > remote && wipe > stop,
    "Remote deletion must precede verified iOS stop, which must precede local wipe");
  assert.doesNotMatch(deletion, /try\s*\{\s*stopBedtimeBlocking\(\);\s*\}\s*catch/,
    "Stop failures must never be silently swallowed during deletion");
});

test("onboarding compensates for native schedule if local completion fails", () => {
  const onboarding = source("app/onboarding.tsx");
  const start = onboarding.indexOf("let nativeScheduleStarted = false;");
  const complete = onboarding.indexOf("await completeOnboarding();", start);
  const fail = onboarding.indexOf("} catch (error) {", complete);
  const stop = onboarding.indexOf("stopBedtimeBlocking();", fail);
  assert.ok(start >= 0 && complete > start && fail > complete && stop > fail);
  assert.match(onboarding.slice(fail, fail + 950), /nativeScheduleStarted/);
  assert.match(onboarding.slice(stop, stop + 600), /Screen Time access in iPhone Settings/);
});


test("fresh and deleted-account onboarding restores Curfy welcome before routine", () => {
  const onboarding = source("app/onboarding.tsx");
  const layout = source("app/_layout.tsx");
  const sleep = source("context/SleepContext.tsx");
  assert.match(layout, /!isOnboardingComplete[\s\S]*<Onboarding \/>/);
  assert.match(sleep, /const deleteAccount = async \(\) => \{/);
  assert.match(sleep, /setIsOnboardingComplete\(false\)/);
  const welcome = onboarding.indexOf("if (showWelcome)");
  const routine = onboarding.indexOf('step === 0 && <StepRoutine');
  assert.ok(welcome >= 0 && routine > welcome,
    "Welcome must render before the first actual setup question");
  assert.match(onboarding, /if \(step === 0\) setShowWelcome\(true\)/);
  assert.match(onboarding, /<MoonGlyph size=\{86\}/);
  assert.match(onboarding, /Bedtime\. For real\./);
});
test("routine content cannot overlap a fixed progress header or push CTA offscreen", () => {
  const src = source("app/onboarding.tsx");
  assert.match(src, /<View style=\{styles\.header\}>/);
  assert.match(src, /<ScrollView[\s\S]*style=\{styles\.stepScroll\}/);
  assert.match(src, /stepScrollContent: \{ flexGrow: 1, paddingTop: 30, paddingBottom: 32 \}/);
  assert.match(src, /btnWrap: \{ paddingTop: 12, paddingBottom: 20 \}/);
  assert.doesNotMatch(src, /SlideOutLeft/);
  assert.match(src, /styles\.routineHero/);
});

test("reviewed onboarding confirms a readable time and actual Screen Time permission", () => {
  const src = source("app/onboarding.tsx");
  assert.match(src, /Starts at \{clockLabel\(value\)\}/);
  assert.match(src, /Available again at \{clockLabel\(value\)\}/);
  assert.match(src, /cutoffDayLabel\(start, value\)/);
  assert.match(src, /getScreenTimeAccessStatus\(\)/);
  assert.match(src, /if \(step !== 3\) return/);
  assert.match(src, /finally \{\s*setIsRequesting\(false\)/);
  assert.match(src, /headerText="Choose exactly one app to protect"/);
  assert.match(src, /onPress=\{\(\) => handlePick\("custom"\)\}/);
  assert.match(src, /Finish setup/);
  assert.doesNotMatch(src, /BLOCK_MODE_PRESETS/);
});

test("Delete Everything erases the previous protected app picker after stopping native restrictions", () => {
  const ctx = source("context/SleepContext.tsx");
  const start = ctx.indexOf("const deleteAccount = async () => {");
  const fn = ctx.slice(start, ctx.indexOf("const streak = computeStreak", start));
  const stopped = fn.indexOf("stopBedtimeBlocking()");
  const erased = fn.indexOf("clearCurfyOnboardingSelectionsAfterAccountDeletion()");
  const wiped = fn.indexOf("AsyncStorage.multiRemove(ALL_STORAGE_KEYS)");
  assert.ok(stopped >= 0 && erased > stopped && wiped > erased);
});
