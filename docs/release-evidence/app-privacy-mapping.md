# App Privacy mapping — 2026-11-11

Source-backed draft for final archive/owner review; not submitted to Apple. No new collection was added.

| Source/data | Manifest category | Linked / purpose | Basis |
|---|---|---|---|
| Optional leaderboard display name | Name; User ID for screen names/handles | Yes / app functionality | AuthContext creates and updates a named public profile; a free-form name can identify a person |
| Anonymous Auth UUID and public profile ID | User ID | Yes / app functionality | Identity persists across sessions; “anonymous authentication” does not mean data is unlinked |
| User-selected protection start time | Other User Content | Yes / app functionality | User-supplied setting uploaded with consent; not measured sleep/health data |
| Current/longest protection streak and update timestamp | Product Interaction | Yes / app functionality | Derived app-protection activity, tied to the profile |
| Service request/IP metadata | Other Data Types | Conservatively linked / app functionality | Cloud request processing and operational/security logs; project-specific retention still needs confirmation |

Tracking is false; no advertising destinations, cross-app tracking SDK, remote analytics/crash SDK or remote push-token upload was found in the focused source/dependency review. This does not assert all SDK behavior is proven by static search. Full archive report and runtime confirmation remain required.

App selections/tokens, journal entries, detailed local history, preferences and StoreKit entitlement checks stay on device in reviewed source. Apple handles payments; no card details or purchase history are uploaded to Curfy's backend. StoreKit entitlement alone is not developer collection. Local data may be included in OS backups; do not promise no backups. Supabase project region verified us-west-2 (US).

## Required-reason aggregation
`app.json` explicitly includes the union of reviewed installed native SDK reasons plus Curfy's app-group UserDefaults reason. `sdk-privacy-inventory.json` records ten installed manifests. The verifier compares each file's reasons and requires the app to include them, detecting drift in these reviewed SDKs. New dependencies still require human inventory review. Extension manifests include only their app-group defaults reason, not unrelated main-app SDK reasons.

Do not classify Curfy as measuring sleep/health, collecting selected app identities on its server, or collecting payment-card data. Do not use Apple's optional-disclosure exception for automatic leaderboard syncing after one initial consent.

## Remaining external details
- Actual public operator/contact and final public policy/support URLs.
- Project-specific log/backup retention and support-correspondence policy. Do not invent fixed periods.
- Final archive privacy report, SDK signature/manifest validation and App Store Connect questionnaire.

## Primary references
- https://developer.apple.com/app-store/app-privacy-details/
- https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacycollecteddatatypes/nsprivacycollecteddatatype
- https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacycollecteddatatypes/nsprivacycollecteddatatypepurposes
- https://docs.expo.dev/guides/apple-privacy/
