#!/usr/bin/env node
"use strict";
// Run AFTER "npx expo prebuild --platform ios --no-install".
// Config check only: Apple distribution entitlement approval, signing and
// real-device operation CANNOT be verified by this script.
const fs = require("node:fs");
const path = require("node:path");
const APP_ID = "com.alvinkwak.curfy";
const APP_GROUP = "group.com.alvinkwak.curfy";
const TEAM = "H735Q3WW8K";
const EXTENSIONS = [
  ["ShieldConfiguration", APP_ID + ".ShieldConfiguration"],
  ["ShieldAction", APP_ID + ".ShieldAction"],
  ["ActivityMonitorExtension", APP_ID + ".ActivityMonitor"],
];
function assert(ok, message) { if (!ok) throw new Error(message); }
function findEntitlements(dir) {
  if (!fs.existsSync(dir)) return [];
  const result = [];
  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory() && !["Pods","build","DerivedData",".git"].includes(entry.name)) {
        visit(path.join(current,entry.name));
      } else if (entry.isFile() && entry.name.endsWith(".entitlements")) {
        result.push(path.join(current,entry.name));
      }
    }
  }
  visit(dir);
  return result;
}
function assertEntitlements(file, role) {
  const xml = fs.readFileSync(file,"utf8");
  assert(/<key>\s*com\.apple\.developer\.family-controls\s*<\/key>\s*<true\s*\/>/.test(xml),
    role + ": missing or false Family Controls entitlement in " + file);
  assert(/<key>\s*com\.apple\.security\.application-groups\s*<\/key>[\s\S]*?<array>[\s\S]*?<string>\s*group\.com\.alvinkwak\.curfy\s*<\/string>[\s\S]*?<\/array>/.test(xml),
    role + ": missing Curfy App Group in " + file);
}
function verifyAppJson(root) {
  const app = JSON.parse(fs.readFileSync(path.join(root,"app.json"),"utf8")).expo;
  assert(app.ios && app.ios.bundleIdentifier === APP_ID,"Wrong app bundle ID");
  assert(app.ios.appleTeamId === TEAM,"Wrong Apple team ID");
  const plugin = app.plugins.find(p => Array.isArray(p) && p[0] === "react-native-device-activity");
  assert(plugin && plugin[1].appGroup === APP_GROUP && plugin[1].appleTeamId === TEAM,
    "Screen Time plugin/App Group/team configuration missing");
  const extensions = app.extra && app.extra.eas && app.extra.eas.build &&
    app.extra.eas.build.experimental && app.extra.eas.build.experimental.ios &&
    app.extra.eas.build.experimental.ios.appExtensions;
  assert(Array.isArray(extensions) && extensions.length === 3,
    "Expected exactly three EAS Screen Time app extensions");
  for (const [name,bundleId] of EXTENSIONS) {
    const ext = extensions.find(e => e.targetName === name);
    assert(ext && ext.bundleIdentifier === bundleId, name + ": wrong EAS target/bundle ID");
    assert(ext.entitlements["com.apple.developer.family-controls"] === true,
      name + ": missing Family Controls entitlement");
    assert(Array.isArray(ext.entitlements["com.apple.security.application-groups"]) &&
      ext.entitlements["com.apple.security.application-groups"].includes(APP_GROUP),
      name + ": missing App Group entitlement");
  }
  const eas = JSON.parse(fs.readFileSync(path.join(root,"eas.json"),"utf8"));
  assert(eas.build && eas.build.preview && eas.build.preview.distribution === "internal",
    "Missing internal preview profile");
  assert(eas.build.production && eas.build.production.distribution !== "internal",
    "Production distribution must not be internal");
}
function verifyGeneratedIOS(root) {
  const ios = path.join(root,"ios");
  assert(fs.existsSync(ios),"Missing ios/ project. Run Expo prebuild first.");
  // @kingstinct/expo-apple-targets keeps extension entitlements in
  // targets/<extension>/generated.entitlements, outside the generated ios/.
  // The app's own entitlement plist lives under ios/Curfy/.
  const generated = findEntitlements(ios);
  const main = generated.filter(f => path.basename(f) === "Curfy.entitlements");
  assert(main.length === 1,
    "Expected the app's ios/Curfy/Curfy.entitlements, got " + generated.join(", "));
  const files = [main[0]];
  const pbx = path.join(ios,"Curfy.xcodeproj","project.pbxproj");
  assert(fs.existsSync(pbx),"Missing generated Xcode project");
  const xcode = fs.readFileSync(pbx,"utf8");
  assert(xcode.includes("Curfy"),"Missing main app Xcode target");
  assertEntitlements(main[0],"Curfy");
  for (const [target] of EXTENSIONS) {
    const file = path.join(root,"targets",target,"generated.entitlements");
    assert(fs.existsSync(file),target + ": missing source extension entitlement plist");
    assert(xcode.includes(target),target + ": missing Xcode target");
    assertEntitlements(file,target);
    files.push(file);
  }
  for (const [name,bundleId] of EXTENSIONS) {
    assert(xcode.includes(bundleId),name + ": Xcode project missing bundle ID "+ bundleId);
  }
  assert(xcode.includes(APP_ID),"Xcode project missing Curfy app ID");
  return files;
}
function verify(root = process.cwd()) {
  verifyAppJson(root);
  return verifyGeneratedIOS(root);
}
if (require.main === module) {
  try {
    const files = verify();
    console.log("PASS: " + files.length + " native entitlements, 1 app + 3 Screen Time extensions");
    console.log("NOT tested: Apple distribution entitlement approval, signing and iPhone behavior.");
  } catch (error) {
    console.error("FAIL: " + error.message);
    process.exitCode = 1;
  }
}
module.exports = { verify, verifyAppJson, verifyGeneratedIOS, findEntitlements, assertEntitlements };
