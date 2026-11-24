# Privacy manifest source review — 2026-11-11

Scope: focused source/config review at live branch 71e58f19e87b2e38cca334b3ba3d6a1f32d81d05; not an archive or App Store validation.

## Findings
- app.json has no ios.privacyManifests configuration.
- No PrivacyInfo.xcprivacy was found in the current generated ios directory or checked-in extension targets.
- CurfyProtectedAppsModule.swift uses UserDefaults(suiteName:) for the app group. All three extension Shared.swift files also use app-group UserDefaults.
- Installed Expo config plugin supports ios.privacyManifests and writes the main app resource. This alone does not demonstrate extension resource inclusion.
- Apple documents required reason 1C8F.1 for defaults shared only within the same App Group. Declaration must match actual access. Do not add SDK wrapper reason C56D.1 to first-party code.

## Follow-up required
Add accurate required-reason declarations through persistent source/config, verify extension resource packaging, and inspect the eventual archive. Audit all SDK manifests and data-collection declarations before treating privacy metadata as complete. Do not declare that the entire app collects no data: the optional public leaderboard uploads profile data.

No screen, hold, entitlement, dependency, or runtime behavior changed by this review. No build, publication, or paid action occurred.

## Primary sources checked
- https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacyaccessedapitypes/nsprivacyaccessedapitype
- https://developer.apple.com/documentation/bundleresources/adding-a-privacy-manifest-to-your-app-or-third-party-sdk
- Local installed Expo implementation: node_modules/@expo/config-plugins/build/ios/PrivacyInfo.js

## Implemented follow-up
Added 1C8F.1 app-group defaults declarations in app.json and each extension root manifest. Installed plugin uses Xcode synchronized groups; generated membership verified, and actual unsigned Release simulator builds put PrivacyInfo.xcprivacy at each of the three .appex roots. Main app resource membership verified after prebuild (not a rebuilt app/archive).

Added scripts/verify-ios-privacy.cjs to standard CI. Local positive and wrong-reason negative checks PASS. Four-target native configuration, 374 tests and TypeScript PASS. No runtime/screen changes. Full SDK reason aggregation and collected-data entries remain pending; Expo's generated empty collection array is not a final declaration for the leaderboard app.

Local logs: /tmp/curfy-privacy-prebuild.log, /tmp/curfy-privacy-xcode.log, /tmp/curfy-privacy-tests.log, /tmp/curfy-privacy-types.log. These are transient evidence, not signed-device proof.
