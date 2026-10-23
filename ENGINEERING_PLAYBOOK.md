# Curfy Engineering Playbook
**Status:** Working engineering process. **Updated:** 2026-10-23. **Owner:** Solo builder, supported by AI coding agents.

> Read this before directing agents. This file is about **how we engineer and verify Curfy**, not a claim that missing features are implemented. The observed source on main at commit \`9414394bbde2baf514a9882e35d1ccd865fd6687\` remains the technical baseline until newer commits are inspected.

## 0. Mission and engineering stance

Build a trustworthy, maintainable bedtime app while learning how to operate like an engineer. The objective is **working, verified user outcomes** rather than PR count, copied AI responses, or passing tests that don't exercise the relevant feature. Keep changes small, explicit, reversible, and economical.

- **Product owner (human):** Sets product intent, accepts trade-offs, authorizes costs, tests key on-device behavior, and approves releases.
- **AI implementer:** Inspects the actual repo before acting; proposes a plan; edits only the scoped feature; runs required checks; supplies evidence and limitations.
- **AI reviewer (when valuable):** Independently looks for missed failure modes and regressions; does not count as independent proof of correctness without runnable tests.
- **GitHub:** Stores history, changes, PR discussions, and CI evidence.
- **Simulator/physical device:** Verifies UI and native behavior. A language model's assurance is not a substitute.

## 1. What is actually known, versus what is not

Observed on GitHub as of 2026-10-23:
- Public repository: \`alvinkwak01/curfy\`, default branch \`main\`.
- Expo SDK 54, React Native 0.81.5, React 19.1, TypeScript (strict), Expo Router and Supabase dependency.
- Root navigator: \`app/_layout.tsx\`; bedtime state: \`context/SleepContext.tsx\`; long-press escape: \`components/HoldButton.tsx\`; in-app modal: \`components/LockScreen.tsx\`.
- Existing \`package.json\` has no \`test\`, \`lint\`, or \`typecheck\` script; no \`.github/workflows\` was present on main.
- Current lock uses React state, an in-app \`Modal\`, and a 30-second interval/foreground check; that **cannot shield another selected app at the OS level**.
- A \`react-test-renderer\` dependency exists, but its presence does not mean functional test coverage exists.

**Not verified:** clean TypeScript baseline, successful npm install, actual physical-iPhone behavior, Apple Family Controls entitlement/distribution permissions, functioning native selected-app shielding, EAS configuration for this repository, production security, current App Store approval, or a green CI run. Do not describe any of those as proven until evidence exists.

**Product requirements decided after the older CONTEXT.md:** User wants OS-supported *individual-app* bedtime blocking; one app free and multiple for a prospective premium tier; a deliberate 120-second continuous hold to request a temporary escape; and an approximately 15-minute respite before re-shielding. Do not promise a capability Apple does not expose. Exact unlock flow on the system shield is **unproven** and needs a native feasibility spike on a real device. Authorization can be revoked by the device owner. The older \`CONTEXT.md\` statement accepting an in-app-only soft lock is **historical, superseded product intent**; do not silently implement it as the final solution. Update the older spec in a dedicated reviewable task once feasibility is established. Keep existing UX until a replacement is verified.

No scheduled native enforcement should rely only on a React timer. Apple-approved frameworks/entitlements and App Store distribution limitations are gating constraints. **No private APIs, URL hacks, unsupported auto-opening of a shielded app, or claims that iOS restrictions are unbreakable.**

## 2. Beginner glossary in practical terms

| Term | Plain meaning in Curfy |
|---|---|
| Repo | Project's code and history on GitHub |
| Branch | Safe workspace for a proposed change, without touching main |
| Commit | Saved, named checkpoint of changed files |
| PR / pull request | Proposed changes for review and checks before merging |
| Merge | Accept PR changes into main |
| CI | Automatic checks on a PR or commit; a gate, not proof every user feature works |
| Typecheck | TypeScript checks type compatibility; not functional behavior |
| Linter | Flags code patterns/style problems |
| Unit test | Exercises one unit of behavior, including edge cases |
| Integration test | Verifies cooperating components/modules |
| E2E/device test | Exercises a real user journey on an actual app/device |
| Regression | An old working feature broken by a new change |
| Eval | A repeatable benchmark of agent performance on representative tasks |
| Feature map | File explaining what screens/features exist, where their code lives, and how a tester reaches them |
| Entitlement | Apple-controlled permission/capability the app must legitimately have to use some native APIs |
| Token | Unit of model input/output cost; monitor actual invoices, not only prompts |

## 3. Feature map (source-derived draft; navigation paths require verification)

| User feature | Implementation evidence | How to verify / current status |
|---|---|---|
| Onboarding | \`app/onboarding.tsx\`, \`app/_layout.tsx\` | Fresh app state, finish onboarding; **not run in this audit** |
| Home/bedtime | \`app/(tabs)/index.tsx\`, \`context/SleepContext.tsx\` | Set bedtime, background/reopen app, check schedule; **not run** |
| Sleep history / streaks | \`app/(tabs)/leaderboard.tsx\`, \`context/SleepContext.tsx\` | Test cross-midnight, duplicate date, streak boundaries; **not run** |
| Settings | \`app/settings.tsx\` | Change bedtime, sign out, test data deletion; **not run** |
| Lock preview | \`app/preview-lock.tsx\` | Inspect preview UI; **not run** |
| Current in-app lock | \`app/_layout.tsx\`, \`components/LockScreen.tsx\` | Starts an in-app modal; cannot block other apps; **code inspected** |
| 120-second hold | \`components/HoldButton.tsx\` | Verify uninterrupted hold, early release resets, background/interruption behavior; **code inspected, device behavior not run** |
| Remote auth/profile | \`context/AuthContext.tsx\`, \`lib/supabase.ts\`, \`supabase/schema.sql\` | Assess data access, authentication, RLS, signout/delete; **not audited** |
| OS-level selected-app shielding | **No native module/extension presently in repo** | **Missing**; requires device-tested feasibility before product claims |

Maintain this map whenever a new feature or navigation route changes. Add screen reachability, test IDs where appropriate, expected state, and device-specific caveats after hands-on tests.

## 4. One repeatable work loop for *every* change

**A. Scope.** Write: user problem, proposed behavior, exclusions, acceptance criteria, and risk level. No vague "improve the app" changes.

**B. Inspect.** Read \`CONTEXT.md\`, relevant \`MEMORY.md\` sections, this playbook, \`AGENTS.md\`, and relevant source/tests. Cite exact files. Explicitly flag documentation contradicting more recent confirmed product decisions.

**C. Plan.** State touched files, edge cases, verification commands, device tests, dependencies, money/time costs, and rollback. Prefer a tiny first PR. Do not automatically refactor unrelated code.

**D. Implement.** Work on a named feature branch. Keep secrets out of prompts, code, logs, and PRs. Respect module boundaries and existing APIs. Do not create arbitrary package upgrades or persistent agents without a need.

**E. Verify.** Run \`npm ci\`, \`npx tsc --noEmit\`, and any existing tests. Once a test suite is installed, run it. Where native behavior is involved, record device model/iOS/build version plus steps/outcome. Report pass/fail/not-run explicitly; never fabricate passing results. Tests must be allowed to fail—don't disable them to get green status.

**F. Review.** Ask: did it implement the requirement, affect security/privacy, break onboarding, confuse time zones or midnight, create expensive network usage, or change 120-second/15-minute logic? Check the diff for accidental generated changes or secrets.

**G. Deliver.** Open a PR with summary, files, checks, evidence, risks, unresolved questions, and exact rollback path. Don't merge without human approval. Don't enable auto-merge or App Store auto-publish.

**H. Learn.** User should be able to explain the PR in 3 sentences: what changed, how it was tested, and what might still fail. Add meaningful lessons to the decision log, not endless session transcripts.

## 5. Minimum quality gates, in cost order

**Gate 0 — repo hygiene (starting now):** a clean branch, narrowly scoped diff, no secrets, documented outcome.

**Gate 1 — static check (starting now):** run \`npm ci\` then \`npx tsc --noEmit\` via GitHub Actions on PRs. This is **not a test suite**. If red because of existing errors, document and fix the baseline in a separate small PR. Never suppress failures just to merge.

**Gate 2 — unit tests (next):** adopt Expo-supported \`jest-expo\` + Jest and \`@testing-library/react-native\` at versions compatible with **SDK 54**, using \`npx expo install ... --dev\`; replace \`react-test-renderer\` when validated. Start with 3–5 business-critical tests:
- 120-second hold: incomplete release resets; completion happens only once.
- Bedtime window: before bedtime, after bedtime, crossing midnight, before/at 06:00.
- Re-lock policy: respite duration / subsequent shielding state, once native logic exists.
- Streak math: duplicate entries and daylight-saving/date boundaries.
- Signed-in / signed-out settings behavior, after data-handling design review.

Prefer extracting pure functions to make these cheap to test, **without changing behavior**. Keep tests deterministic with controlled time.

**Gate 3 — integration/device:** run onboarding → configure → lock → escape → re-lock → morning. Test foreground/background, app force-quit, reboot, denied/revoked permission, daylight-saving, time change, and notification behavior. Verify native selected-app shielding **on a physical iPhone** once implemented. A passing Jest mock is insufficient for Screen Time API correctness.

**Gate 4 — release:** validated production build, correct entitlements, privacy/data deletion, relevant App Store requirements, a rollback plan, and manual signoff.

### Review checklist for native feasibility PR
- User selects an app with Apple's supported picker and explicitly authorizes access.
- Shield is actually shown on selected third-party app during restriction window.
- Apple frameworks, extensions, App Group state and entitlements work on **device**.
- The proposed 120-second challenge + 15-minute respite is feasible within system UI constraints, including force-quit.
- Denied or revoked authorization degrades honestly.
- No claim a forbidden API is possible merely because an agent generated Swift code.
- Build/distribution entitlement requirements confirmed **independently**.

## 6. Token and subscription cost policy

**Default: one working agent; no swarm.** Pay for a second review agent only for risky architecture/native/security PRs. Human approval required before any paid tool, model subscription, cloud build, massive refactor, or bulk agent job.

1. Set a personal monthly budget before using metered tools; begin with a small experiment, measure actual cost, then decide whether to increase. Track **tool, model, task, calls, cost, and value**.
2. Read the necessary files once and give the agent small, concrete, verifiable tasks. Avoid repeatedly feeding whole repositories and \`MEMORY.md\` histories into every prompt.
3. Use deterministic checks (typecheck, tests, lints) first; they're cheaper and more trustworthy than asking four models whether code works.
4. Run local verification first; EAS device builds only when native behavior changes or milestone requires one. Avoid nightly build automation until there's a reason.
5. Stop loops after a bounded number of attempts (for example 2–3). If still broken, request a focused diagnosis and evidence rather than escalating blind "try again" prompts.
6. Never measure productivity by number of PRs, tokens burned, or a model's subjective 10/10 self-score.

### Working cost log
| Date | Task | Tool/model | Measured spend | Outcome / avoided rework |
|---|---|---|---|---|
| 2026-10-23 | Engineering foundation | GitHub connector | Not metered here | Static check + process proposed; runtime unverified |

## 7. A reusable prompt for your coding agent

> You are the implementer for Curfy. Read AGENTS.md, ENGINEERING_PLAYBOOK.md, CONTEXT.md and the relevant source. Objective: [one narrow task]. Write a short plan with exact files, major edge cases, risk, and verification before editing. Work on a branch, do not merge or publish. Preserve the 120-second hold and current UI unless the task explicitly changes them. Do not claim real iOS app blocking works until a supported native implementation passes tests on a physical device. Make the smallest change. Run available deterministic checks; report PASS/FAIL/NOT RUN truthfully with command output. Create a PR summary with limitations and rollback. Stop instead of guessing at undocumented Apple capabilities or spending money.

## 8. Learning path: turn building into real engineering competence

The goal is not to memorize syntax. For each stage, **explain**, **demonstrate**, and **debug** it personally.

| Stage | Learn | Proof you should personally produce |
|---|---|---|
| 1: Git and command line | Branch, diff, commit, PR, merge, rollback | Explain and review this foundation PR |
| 2: TypeScript/React | Variables, functions, types, state, effects, async, props | Trace bedtime from settings to saved state to lock UI |
| 3: Tests and debugging | Arrange/Act/Assert, unit vs. device, logs, reproducing failures | Write or amend one test; intentionally make it fail then fix |
| 4: Native iOS concepts | Permission, extension, entitlement, OS lifecycle, EAS vs Expo Go | Explain why Screen Time can't be proven in JS-only Expo Go |
| 5: Backend/security | Auth, data storage, least privilege, SQL RLS, migrations | Explain what lives on device versus Supabase and how to revoke/delete |
| 6: AI engineering (separate skill) | LLM API calls, tool calls, structured output, evaluation sets, cost/latency, prompt injection, observability | Ship one **small** separate agent/evaluation project with reproducible tests and a cost report |

A genuine AI-engineering position often requires coding fluency, algorithms/data structures, Python, deployment, and practical ML/LLM systems—not simply using AI to ship apps. Curfy is excellent evidence of **AI-assisted application engineering and product ownership**; the last stage is what starts demonstrating **AI system engineering**. Don't exaggerate your role in a job application.

## 9. Portfolio evidence worth publishing

Keep every public claim grounded in a demonstrable artifact:
- Architecture diagram showing TS UI, state, auth/backend, native module and iOS extensions **as implemented**, not imagined.
- Two or three well-scoped PRs that show a failing test, a fix, an independent review, and a clear description of trade-offs.
- Green CI checks, unit test results, and a reproducible bug report (device/version/steps/expected/observed).
- ADR (architecture decision record): alternatives, chosen path, limitations, security and operating cost.
- Real launch metrics or user feedback **only with substantiated numbers**.
- Short demo and README that state exactly what the app can and cannot do.

Suggested truthful resume framing after evidence exists: **"Built and maintained a React Native/TypeScript app with AI-assisted development; implemented CI quality gates, automated tests, documented architecture decisions, and validated critical behavior on iOS devices."** Adjust only to verified accomplishments.

## 10. Immediate sequence (do not skip ahead)

1. **Foundation PR:** add playbook + AGENTS.md + TypeScript CI on a branch; inspect resulting CI output. *No product code modified.*
2. **Fix baseline:** if typecheck fails, identify existing errors, write a short prioritized list, fix in isolated PR(s).
3. **Testing harness:** add Expo-compatible test dependencies through \`expo install\` and update lockfile together; land 2 meaningful tests. No placeholder "test passes" tasks.
4. **Native feasibility:** on separate \`spike/ios-screen-time-shield\` branch, demonstrate Apple-supported authorization + selected-app shielding + re-shield flow on a physical iPhone, noting entitlement constraints. **This is the launch-critical unknown.**
5. **Feature-by-feature:** only after native feasibility evidence, implement a supported 120s challenge + respite that actually works with Apple's shield lifecycle.
6. **Polish / security / release:** review Supabase data rules, login/deletion, store policy, performance, release distribution.
7. **Showcase:** publish a concise technical case study from actual PRs and validations.

### Human action required
- Review/open the draft PR and see its CI check result; do not merge yet if red.
- For native milestones, provide access to a Mac/Xcode and physical iPhone via local development/testing; do not put Apple credentials into agent chats.
- Keep the existing Curfy ChatGPT Project; no need to recreate it. Add this playbook to the project sources or link this repository file as its working authority.

## 11. Working decision log

| Date | Decision | Why |
|---|---|---|
| 2026-10-23 | One agent + deterministic checks first, no auto-merge | Reliable results at controlled expense |
| 2026-10-23 | Native app-blocking feasibility before promising implementation | Apple's Screen Time lifecycle and entitlements are not solved by the current JS modal |
| 2026-10-23 | Distinguish historical in-app soft-lock spec from newest OS-level blocking intent | Avoid AI following outdated instructions |
| 2026-10-23 | Protect main; create draft PR for infrastructure | Reversible, reviewable |
| Pending | Select compatible Jest/library versions | Depends on SDK 54 + successful install |
| Pending | Confirm native shield UI and distribution | Requires physical device + Apple entitlement path |

## 12. Official references

- Expo [Unit testing with Jest](https://docs.expo.dev/develop/unit-testing/) — install an SDK-compatible test stack.
- Expo [CI/CD](https://docs.expo.dev/tutorial/cicd/introduction/) — later EAS automation, only when appropriate.
- Expo [CI EAS builds](https://docs.expo.dev/build/building-on-ci/) — native builds cost resources and need working credentials.
- Apple's [FamilyControls](https://developer.apple.com/documentation/familycontrols), [ManagedSettings](https://developer.apple.com/documentation/managedsettings), and [DeviceActivity](https://developer.apple.com/documentation/deviceactivity) — native framework requirements and feasibility.
- Inspiration: [AI coding agents talk](https://www.youtube.com/watch?v=I_oMJk6barY). Adopt the underlying **verification → constraints → careful scaling** principle, not a high-PR-volume target.
