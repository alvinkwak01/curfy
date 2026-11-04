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
test("escape screen uses only a single X, the real app name, and one concise hold cue", () => {
  const lock = source("components/LockScreen.tsx");
  const hold = source("components/HoldButton.tsx");
  const escape = source("app/escape.tsx");

  assert.match(lock, /accessibilityLabel="Close unlock screen without unlocking"/);
  assert.match(lock, /<Ionicons name="close"/);
  assert.match(lock, /onPress=\{onExit \?\? devDismissLock\}/);
  assert.match(escape, /onExit=\{\(\) => router\.replace\("\/\(tabs\)"\)\}/);
  assert.doesNotMatch(lock, /Back to Curfy Home|Still want|No hold, no unlock|homeButton|styles\.footer/);
  assert.doesNotMatch(lock, /Hold the circle for two uninterrupted minutes/);
  assert.match(lock, /Unlocking/);
  assert.match(lock, /<CurfyAppLabel/);
  assert.match(lock, /snapshot\.count === 1 \? snapshot : null/);
  assert.match(lock, /selectionId=\{selectionIdForMode\(selectedMode\)\}/);
  assert.match(lock, /revision=\{protectedApp\.revision\}/);
  assert.match(lock, /<Text style=\{styles\.appFallback\}>your app<\/Text>/);
  assert.match(lock, /Hold 120s · up to 15 min access/);
  assert.match(lock, /showIdleMessage=\{false\}/);
  assert.match(lock, /showUnlockCount=\{false\}/);
  assert.match(hold, /Gesture\.LongPress\(\)/);
  assert.match(hold, /\.minDuration\(HOLD_DURATION_MS\)/);
  assert.match(hold, /onUnlockRef\.current\(\)/);
  assert.match(lock, /await unlockScreen\(\)/);
});

test("optional leaderboard sync repairs missing profiles and never caches an unconfirmed write", () => {
  const auth = source("context/AuthContext.tsx");
  const root = source("app/_layout.tsx");
  const section = auth.slice(
    auth.indexOf("const syncProfile = async ("),
    auth.indexOf("const fetchLeaderboard = async (")
  );
  const writeIndex = section.indexOf(".upsert({");
  const cacheIndex = section.indexOf("lastSynced.current = {");
  assert.ok(writeIndex >= 0 && cacheIndex > writeIndex,
    "Do not cache a write before the Supabase upsert succeeds");
  assert.match(section, /id: userId/);
  assert.match(section, /onConflict: "id"/);
  assert.match(section, /if \(error\) \{/);
  assert.match(section, /lastSynced\.current\?\.userId === userId/);
  assert.doesNotMatch(section, /\.update\(\{/);
  assert.match(root, /void syncProfile\([\s\S]*?\)\.catch/);
  assert.match(root, /void ensureAnonymousProfile\(userName\)\.catch/);
  assert.match(auth, /Could not restore leaderboard session/);
  assert.match(auth, /\.finally\(\(\) => \{\s*if \(active\) setIsAuthLoading\(false\)/);
});

test("local storage read failures never silently restart onboarding or discard native shields", () => {
  const sleep = source("context/SleepContext.tsx");
  const root = source("app/_layout.tsx");
  assert.match(sleep, /const \[storageError, setStorageError\] = useState<string \| null>\(null\)/);
  assert.match(sleep, /const retryLoadSavedSettings = useCallback\(async \(\) => \{/);
  assert.match(sleep, /await Promise\.all\(\[/);
  assert.match(sleep, /Could not read saved local configuration/);
  assert.match(sleep, /setStorageError\("Curfy couldn't read your saved settings\. Nothing was erased\."\)/);
  assert.match(sleep, /\} finally \{\s*setIsLoading\(false\)/);
  assert.match(root, /if \(storageError\) \{/);
  assert.match(root, /Retry loading saved Curfy settings/);
  assert.match(root, /void retryLoadSavedSettings\(\)/);
  assert.ok(root.indexOf("if (storageError) {") < root.indexOf("if (!isOnboardingComplete) {"),
    "Storage recovery must appear before onboarding can replace an existing setup");
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

test("ten-screen onboarding keeps Welcome, step 8 hold and step 9 optional name", () => {
  const onboarding = source("app/onboarding.tsx");
  const settings = source("app/settings.tsx");
  const context = source("context/SleepContext.tsx");
  assert.match(onboarding, /STEP_COUNT = 9/);
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
  assert.match(onboarding, /step === 7 && <StepHoldPreview/);
  assert.match(onboarding, /step === 8 && [\s\S]*<StepName/);
  assert.doesNotMatch(onboarding, /StepWakeUpCall|One more tap/);
  assert.match(onboarding, /if \(step === 0 && reasons\.length === 0\)/);
  assert.match(onboarding, /setStep\(6\);/);
  assert.doesNotMatch(onboarding, /<StepRoutine|<StepCurrentBedtime|<StepFinish/);
  assert.doesNotMatch(settings, /PROTECTION_ROUTINES\.map/);
  assert.match(settings, /APPS AVAILABLE AGAIN/);
  assert.match(context, /PROTECTION_ROUTINE_KEY/);
});
test("onboarding copy accurately describes a single selected app, not broad phone locking", () => {
  const src = source("app/onboarding.tsx");
  assert.match(src, /The app you select will be shielded/);
  assert.match(src, /Shields the one app you choose through iOS/);
  assert.doesNotMatch(src, /lock the apps|lock to apps you pick/);
});

test("Home always tells users when a current protection window ends", () => {
  const home = source("app/(tabs)/index.tsx");
  assert.match(home, /Protection scheduled until/);
  assert.match(home, /clockLabel\(wakeTime\)/);
  assert.doesNotMatch(home, /It's bedtime — protect your evening/);
});
test("Home unlock action shows the real selected iOS app label, not a fake app name", () => {
  const home = source("app/(tabs)/index.tsx");
  const nativeUI = source("modules/curfy-protected-apps/index.tsx");
  const swift = source("modules/curfy-protected-apps/ios/CurfyProtectedAppsModule.swift");

  assert.doesNotMatch(home, /Start (your timer|120-second hold)/);
  assert.match(home, /<Text style=\{styles\.unlockVerb\}>Unlock<\/Text>/);
  assert.match(home, /<CurfyAppLabel/);
  assert.match(home, /selectionId=\{selectionIdForMode\(selectedMode\)\}/);
  assert.match(home, /revision=\{protectedApp\.revision\}/);
  assert.match(home, /snapshot\.count === 1 \? snapshot : null/);
  assert.match(home, /readProtectedAppChoices\(selectionIdForMode\(selectedMode\)\)/);
  assert.match(home, /<Text style=\{styles\.unlockFallback\}>your app<\/Text>/);
  assert.match(home, /router\.push\("\/escape"\)/);
  // The hold details live on the actual escape screen, not in this card.
  assert.doesNotMatch(home, /120-second hold · up to 15 minutes of access/);
  assert.doesNotMatch(home, /unlockSeparator|unlockBottomRow|unlockDetail/);
  assert.doesNotMatch(home, /finger-print-outline/);
  assert.match(home, /<Text style=\{styles\.unlockEyebrow\}>PROTECTED<\/Text>/);
  assert.match(home, /<View style=\{styles\.unlockMain\}>/);
  assert.match(home, /<View style=\{styles\.unlockArrow\}>/);
  assert.match(home, /minHeight: 91/);
  assert.match(home, /protectionStatus !== "shield-active"/);
  assert.match(swift, /\.font\(\.system\(size: 14\)\)/);
  assert.match(swift, /\.imageScale\(\.small\)/);
  assert.match(swift, /\.lineLimit\(1\)/);

  // A real app icon/title is rendered by Apple's SwiftUI on the iPhone,
  // never copied as an identifier string into JS or persisted remotely.
  assert.match(nativeUI, /getProtectedApps\(selectionId\)/);
  assert.match(nativeUI, /requireNativeViewManager\("CurfyProtectedApps"\)/);
  assert.match(swift, /Label\(token\)/);
  assert.match(swift, /"count": snapshot\.applications\.count, "revision": snapshot\.revision/);
  assert.doesNotMatch(swift, /"appName":|"bundleId":|"localizedDisplayName":/);
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

test("all nine setup screens preserve header, back action and scroll-safe fixed CTA", () => {
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

test("the personalized plan reflects all three chosen phone habits", () => {
  const src = source("app/onboarding.tsx");
  const start = src.indexOf("function reasonSummary(");
  const end = src.indexOf("function selectionCountsText(", start);
  const summary = src.slice(start, end);
  assert.match(summary, /slice\(0, 3\)/);
  assert.ok(summary.includes('${labels[0]}, ${labels[1]}, and ${labels[2]}'));
  assert.doesNotMatch(summary, /slice\(0, 2\)/);
});

test("reason choices expose checked state and prevent selecting a fourth option", () => {
  const src = source("app/onboarding.tsx");
  assert.match(src, /accessibilityRole="checkbox"/);
  assert.match(src, /accessibilityState=\{\{ checked: isSelected, disabled: isMaxed \}\}/);
  assert.match(src, /if \(reasons\.length >= 3\) return/);
  assert.match(src, /disabled=\{isMaxed\}/);
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
  assert.match(src, /protectionWindowLabel\(start, end\)/);
  assert.doesNotMatch(src, /lost sleep a year|getting roughly|extra full nights of sleep/);
  assert.doesNotMatch(src, /PROTECTION_ROUTINES\.map/);
  assert.doesNotMatch(src, /suggested/);
});

test("Step 8/9 is the exact approved Curfy hold preview, not Apple's shield", () => {
  const src = source("app/onboarding.tsx");
  const hold = source("components/HoldButton.tsx");
  const section = src.slice(src.indexOf("function StepHoldPreview("),
    src.indexOf("function StepName(", src.indexOf("function StepHoldPreview(")));
  assert.match(section, /Don't be pathetic\./);
  assert.match(section, /Go to sleep\./);
  assert.match(section, /<HoldRingPreview \/>/);
  assert.match(section, /120 uninterrupted seconds/);
  assert.match(section, /timer resets/);
  assert.doesNotMatch(section, /Blocked by Curfy|phoneFrame|phoneShield|StepName|TextInput/);
  assert.match(hold, /export function HoldRingPreview\(/);
  assert.match(hold, /function RingTrack\(/);
  assert.match(hold, /function IdleCenter\(/);
  assert.match(hold, /const RADIUS = 80/);
  assert.match(hold, /const STROKE_WIDTH = 6/);
  assert.doesNotMatch(hold, /styles\.halo|hand-left-outline|styles\.centerLabel/);
  assert.match(hold, /Gesture\.LongPress\(\)/);
});

test("Step 9/9 is a separate optional-name final page with real skip behavior", () => {
  const src = source("app/onboarding.tsx");
  const section = src.slice(src.indexOf("function StepName("),
    src.indexOf("function StepScreenTimeAccess(", src.indexOf("function StepName(")));
  assert.match(section, /What should we/);
  assert.match(section, /call you\?/);
  assert.match(section, /<TextInput/);
  assert.match(section, /Skip for now/);
  assert.match(section, /onPress=\{onSkip\}/);
  assert.doesNotMatch(section, /HoldRingPreview|phoneFrame|phoneShield|Blocked by Curfy/);
  assert.match(src, /onSkip=\{\(\) => \{ void next\(true\); \}\}/);
  assert.match(src, /if \(!skipName && name\.trim\(\)\) await setUserName\(name\.trim\(\)\)/);
  assert.match(src, /isLastStep \? \(finishing \? "Setting up\.\.\." : "Finish setup"\)/);
  assert.match(src, /await configureBedtimeBlocking\(\{/);
  assert.match(src, /await completeOnboarding\(\)/);
  assert.doesNotMatch(src, /function StepFinish\(/);
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

test("saved Screen Time metadata is normalized in onboarding, Settings and native restriction checks", () => {
  const policy = source("lib/premiumPolicy.ts");
  const onboarding = source("app/onboarding.tsx");
  const settings = source("app/settings.tsx");
  const screenTime = source("lib/screenTime.ts");
  assert.ok(policy.includes("raw.webDomainCount ?? raw.webdomainCount"));
  assert.ok(onboarding.includes("normalizeActivitySelectionMetadata(metadata)"));
  assert.ok(onboarding.includes("selectionCountsText(counts)"));
  assert.ok(settings.includes("normalizeActivitySelectionMetadata(metadata)"));
  assert.ok(screenTime.includes("normalizeActivitySelectionMetadata(selectionMetadata(mode))"));
  assert.ok(screenTime.includes("normalizeActivitySelectionMetadata(overlap)"));
  assert.equal(onboarding.includes("metadata.webDomainCount"), false);
  assert.equal(settings.includes("metadata.webDomainCount"), false);
});

test("Settings and onboarding wait for native picker persistence and validate Free app limits", () => {
  const onboarding = source("app/onboarding.tsx");
  const settings = source("app/settings.tsx");
  assert.ok(onboarding.includes("waitForPersistedPickerCommit"));
  assert.ok(onboarding.includes("freeSelectionIssueForMetadata(metadata)"));
  assert.ok(onboarding.includes("Free protects one app"));
  assert.ok(settings.includes("waitForPersistedPickerCommit"));
  assert.ok(settings.includes("pendingPickerCommit.current"));
  assert.ok(settings.includes("freeSelectionIssue(draftSelectionIdForMode(localBlockMode))"));
  assert.ok(settings.includes("includeEntireCategory={false}"));
});
