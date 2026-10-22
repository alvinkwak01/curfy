const {
  createConfig,
} = require("react-native-device-activity/config-plugin/createExpoTargetConfig");

// The folder name here ("ActivityMonitorExtension") is what the
// underlying @kingstinct/expo-apple-targets plugin uses to derive the
// bundle identifier by default — which produced
// com.alvinkwak.curfy.ActivityMonitorExtension, a bundle ID that was
// never registered on the Apple Developer portal and doesn't carry the
// Family Controls entitlement. Overriding it here to match the App ID
// that actually has Family Controls + App Groups configured:
// com.alvinkwak.curfy.ActivityMonitor.
module.exports = (config) => ({
  ...createConfig("device-activity-monitor")(config),
  bundleIdentifier: ".ActivityMonitor",
});
