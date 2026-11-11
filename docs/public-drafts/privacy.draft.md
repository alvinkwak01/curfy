# Curfy Privacy Policy — working draft

**Editorial notice — do not publish:** operator identity, contact address, effective date, provider/log retention and deployed behavior still require verification. The draft below describes the intended release behavior reflected in current source. No public policy URL exists yet.

## About Curfy
Curfy helps you set a boundary with selected distracting iPhone apps. It uses Apple's Screen Time controls to protect your chosen apps during your configured hours. Curfy does not measure sleep or lock your whole phone.

## Information on your device
Curfy stores your protection hours, preferences, app-protection activity history, journal entries and recovery information locally. Apple represents your selected apps using private selection tokens. Curfy uses those tokens on your device to apply and recover protection; it does not send your app selections or journal entries to the leaderboard service.

Curfy's local history records app-protection activity. It is not a measurement of sleep. Device or operating-system backup behavior must be described in the final policy after it is verified.

## Optional public leaderboard
You can use app protection and Curfy Premium without joining the leaderboard. Before joining, Curfy explains the information that becomes public and asks for your choice.

The current service is hosted in the United States (Supabase project region us-west-2). Service providers process request metadata, such as IP addresses, for operation and security; final log and backup retention details still require confirmation.

If you join, Curfy creates a cloud identity and sends your display name, protection start time and streak information to Supabase. Participation then updates automatically. The deployed public profile also exposes a profile identifier and update timestamp. Do not put private information in your display name.

You can leave from Settings. Leaving pauses new uploads and requests removal of your cloud identity and public profile. It preserves your on-device history, journal, app protection and Premium. If removal cannot be confirmed, Curfy keeps a retry path rather than reporting completion.

## Purchases
Apple processes Curfy Premium purchases and restoration. Curfy checks Apple's purchase-entitlement information to determine whether Premium is available. Curfy does not receive your payment-card details through its purchase flow.

## Notifications
If you allow notifications, Curfy can schedule local reminders related to your protection routine. You can manage notification permission in your iPhone settings.

## Support and service providers
If you contact support, the information you choose to send is used to respond to your request. Please do not send passwords, Apple Account credentials, payment-card details or private journal entries.

Supabase provides the optional cloud identity and leaderboard service. Apple provides platform controls and purchase processing. The final policy must identify any additional shipped service providers and explain applicable service/log data, processing locations and retention; those details are not yet verified.

If these pages are hosted on GitHub Pages, GitHub logs visitors' IP addresses for website security. The website-host disclosure must match the hosting service actually used.

## Deletion and retention
Settings includes controls to leave the leaderboard or request Delete Everything. Delete Everything requests cloud-account removal, then stops Curfy protection and clears local history, journal entries and preferences. Failed steps remain retryable. Backend response-loss recovery has passed disposable-identity tests; the complete signed-app deletion flow and exceptional lost-session recovery must still be verified before publication.

Exact retention periods for support correspondence, service logs and backups must be confirmed and included in the final policy. Do not promise immediate erasure from all backups or providers without evidence.

## Contact and updates
The final published policy will identify Curfy's operator and provide the monitored support/privacy email address, effective date, and how material changes are communicated. These details have not yet been supplied.
