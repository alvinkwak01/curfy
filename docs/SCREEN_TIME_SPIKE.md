# Screen Time spike — milestone 1

Scope: one explicitly selected application, native authorization, native FamilyActivityPicker, immediate ManagedSettings shield, manual removal. This is **not** a completed bedtime scheduler or production integration.

## Build/device gate
- Set the final `ios.bundleIdentifier` in `app.json` before signing (owner confirmation required).
- Enable Family Controls on the main app identifier in Apple Developer and ensure the development profile includes `com.apple.developer.family-controls`.
- On a Mac with Xcode and a physical iPhone: `npm ci`, `npx expo prebuild --platform ios`, then `npx expo run:ios --device` (or signed EAS development build). Do not use Expo Go.
- Open `curfy://screen-time-spike` in the installed development client. Authorize; select exactly one installed app; press Protect. Switch away from Curfy and attempt to open that app. Return to Curfy and clear the shield.
- Confirm the iPhone model, iOS version, Xcode/SDK, bundle ID, build SHA and observed outcome. Repeat after force quit and with authorization denied/revoked.
- If prebuild or Swift compilation fails, record the exact error; native compilation has **not** been run by this PR.

## Deliberately not yet implemented
- DeviceActivityMonitor, shared App Group token persistence, reliable nightly scheduling and restart recovery.
- ShieldConfiguration and ShieldAction extensions, iOS 26.5 handoff, native exception and automatic re-shield.
- Premium multi-app selections, subscription gating, production entry into onboarding.

## Compatibility
- Single-app selection and individual authorization target iOS 16+.
- Apple documents `ShieldActionResponse.openParentalControlsApp`; developer examples report availability beginning iOS 26.5. Exact symbol introduction must be confirmed against the selected Xcode SDK. The future action extension must check `#available(iOS 26.5, *)` (subject to SDK confirmation), and show a manual-open-Curfy instruction on older systems rather than call private APIs.
- Never treat entitlement configuration as provisioning approval.

## Checks
- GitHub branch-only writes: yes.
- Native compilation, TypeScript typecheck, prebuild, EAS build, iPhone testing: **not run** in this environment.
- Rollback: close PR/delete spike branch; main unchanged.
