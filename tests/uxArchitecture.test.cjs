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

test("nine-screen onboarding keeps the branded welcome without the redundant wake-up call", () => {
  const onboarding = source("app/onboarding.tsx");
  const settings = source("app/settings.tsx");
  const context = source("context/SleepContext.tsx");
  assert.match(onboarding, /STEP_COUNT = 8/);
  assert.match(onboarding, /const \[showWelcome, setShowWelcome\] = useState\(true\)/);
  assert.match(onboarding, /<StepWelcome onStart=/);
  assert.match(onboarding, /<Btn label="Get Started"/);
  assert.match(onboarding, /step === 0 && <StepWhyStayUp/);
  assert.match(onboarding, /What keeps you/);
  assert.match(onboarding, /up at night\\?/);
  assert.match(onboarding, /things you find yourself doing on your phone/);
  assert.doesNotMatch(onboarding, /What pulls/);
  assert.match(onboarding, /step === 1 && <StepSetBedtime/);
  assert.match(onboarding, /step === 2 && <StepWakeTime/);
  assert.match(onboarding, /step === 3 && <StepReveal/);
  assert.match(onboarding, /step === 4 && <StepWhyCurfy/);
  assert.match(onboarding, /step === 5 && <StepScreenTimeAccess/);
  assert.match(onboarding, /step === 6 && [\s\S]*<StepChooseApps/);
  assert.match(onboarding, /step === 7 && [\s\S]*<StepFinish/);
  assert.doesNotMatch(onboarding, /StepWakeUpCall|One more tap/);
  assert.match(onboarding, /if \(step === 0 && reasons\.length === 0\)/);
  assert.match(onboarding, /setStep\(6\);/);
  assert.doesNotMatch(onboarding, /<StepRoutine|<StepCurrentBedtime|<StepName/);
  assert.doesNotMatch(settings, /PROTECTION_ROUTINES\.map/);
  assert.match(settings, /APPS AVAILABLE AGAIN/);
  assert.match(context, /PROTECTION_ROUTINE_KEY/);
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


test("fresh and deleted-account onboarding returns to original Curfy welcome first", () => {
  const onboarding = source("app/onboarding.tsx");
  const layout = source("app/_layout.tsx");
  const sleep = source("context/SleepContext.tsx");
  assert.match(layout, /!isOnboardingComplete[\s\S]*<Onboarding \/>/);
  assert.match(sleep, /const deleteAccount = async \(\) => \{/);
  assert.match(sleep, /setIsOnboardingComplete\(false\)/);
  assert.match(onboarding, /if \(showWelcome\) \{[\s\S]*<StepWelcome onStart=/);
  assert.match(onboarding, /if \(step === 0\) setShowWelcome\(true\)/);
  assert.match(onboarding, /<MoonGlyph size=\{86\}/);
  assert.match(onboarding, /Bedtime\. For real\./);
});

test("all eight setup screens preserve header, back action and scroll-safe fixed CTA", () => {
  const src = source("app/onboarding.tsx");
  assert.match(src, /<View style=\{styles\.header\}>/);
  assert.match(src, /<ScrollView[\s\S]*style=\{styles\.stepScroll\}/);
  assert.match(src, /stepScrollContent: \{ flexGrow: 1, paddingTop: 30, paddingBottom: 32 \}/);
  assert.match(src, /btnWrap: \{ paddingTop: 12, paddingBottom: 20 \}/);
  assert.doesNotMatch(src, /SlideOutLeft/);
});

test("onboarding validates native permission, one app and final native schedule before completion", () => {
  const src = source("app/onboarding.tsx");
  assert.match(src, /getScreenTimeAccessStatus\(\)/);
  assert.match(src, /if \(step !== 5\) return/);
  assert.match(src, /if \(step === 6\)/);
  assert.match(src, /activitySelectionMetadata\(\{/);
  assert.match(src, /freeSelectionIssueForMetadata\(metadata\)/);
  assert.match(src, /await configureBedtimeBlocking\(\{/);
  assert.match(src, /await completeOnboarding\(\)/);
  assert.ok(src.indexOf("await configureBedtimeBlocking") < src.indexOf("await completeOnboarding"));
  assert.match(src, /headerText="Choose exactly one app to protect"/);
  assert.match(src, /includeEntireCategory=\{false\}/);
  assert.match(src, /beginFreshOnboardingAppSelection\(mode\)/);
  assert.match(src, /finally \{\s*setIsRequesting\(false\)/);
});

test("time wheel pages never share a parent scrolling container", () => {
  const src = source("app/onboarding.tsx");
  assert.match(src, /\[1, 2\]\.includes\(step\)/);
  assert.match(src, /<View key=\{step\} style=\{styles\.timeStepContent\}>/);
  assert.match(src, /<ScrollView[\s\S]*style=\{styles\.stepScroll\}/);
  assert.match(src, /Starts at \{clockLabel\(bedtime\)\}/);
  assert.match(src, /Available at \{clockLabel\(wakeTime\)\}/);
});

test("personal reveal uses the person's distraction reasons and not sleep estimates", () => {
  const src = source("app/onboarding.tsx");
  assert.match(src, /reasonSummary\(reasons\)/);
  assert.match(src, /initialClockWindow\(\)/);
  assert.match(src, /protectionWindowLabel\(bedtime, wakeTime\)/);
  assert.doesNotMatch(src, /lost sleep a year|getting roughly|extra full nights of sleep/);
  assert.doesNotMatch(src, /PROTECTION_ROUTINES\.map/);
  assert.doesNotMatch(src, /suggested/);
});

test("final preview includes optional name, and never pretends the hold lives on the Apple shield", () => {
  const src = source("app/onboarding.tsx");
  assert.match(src, /function StepFinish/);
  assert.match(src, /if \(name\.trim\(\)\) await setUserName\(name\.trim\(\)\)/);
  assert.doesNotMatch(src, /isLastStep && !name\.trim\(\)/);
  assert.match(src, /<Text style=\{styles\.phoneHoldBtnText\}>Not now<\/Text>/);
  assert.match(src, /open Curfy separately and complete the continuous hold/);
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

test("changing start time in Settings updates reminder behavior without a routine selector", () => {
  const src = source("app/settings.tsx");
  assert.match(src, /setLocalRoutine\(inferRoutineFromStart\(value\)\)/);
  assert.doesNotMatch(src, /<Text style=\{styles\.label\}>WHEN DO YOU WANT FEWER DISTRACTIONS/);
});

test("clock wheel has no momentum jump after the user's finger releases", () => {
  const wheel = source("components/TimePicker.tsx");
  assert.match(wheel, /onPanResponderRelease/);
  assert.doesNotMatch(wheel, /flingSteps\(gesture\.vy\)/);
});

test("a native picker read failure shows an actionable error instead of trapping onboarding", () => {
  const src = source("app/onboarding.tsx");
  assert.match(src, /Can't verify your app yet/);
  assert.match(src, /Native picker read failed/);
  assert.match(src, /Native picker save\/metadata unavailable/);
  assert.match(src, /finally \{[\s\S]*setPickerMode\(null\)/);
});
