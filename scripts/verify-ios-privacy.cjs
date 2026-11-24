#!/usr/bin/env node
// Run after Expo prebuild. This checks resource wiring, not App Store approval
// or the completeness of SDK/data-collection disclosures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const plist = require('@expo/plist').default;
const root = path.resolve(__dirname, '..');
const project = require('xcode').project(path.join(root, 'ios/Curfy.xcodeproj/project.pbxproj'));
project.parseSync();
const objects = project.hash.project.objects;
const clean = value => String(value).replace(/^"|"$/g, '');
const entries = section => Object.entries(objects[section] || {}).filter(([id]) => !id.endsWith('_comment'));
function verifyManifest(file) {
  const manifest = plist.parse(fs.readFileSync(file, 'utf8'));
  const defaults = manifest.NSPrivacyAccessedAPITypes?.find(x => x.NSPrivacyAccessedAPIType === 'NSPrivacyAccessedAPICategoryUserDefaults');
  assert(defaults?.NSPrivacyAccessedAPITypeReasons?.includes('1C8F.1'), `${file}: missing app-group defaults reason`);
  return manifest;
}
const main = entries('PBXNativeTarget').find(([,t]) => clean(t.name) === 'Curfy');
assert(main, 'Missing main target');
const generatedManifest = verifyManifest(path.join(root, 'ios/Curfy/PrivacyInfo.xcprivacy'));
const resourceIDs = main[1].buildPhases.flatMap(p => objects.PBXResourcesBuildPhase?.[p.value]?.files || []).map(f => f.value);
assert(resourceIDs.some(id => {
  const ref = objects.PBXFileReference[objects.PBXBuildFile[id]?.fileRef];
  return ref && clean(ref.path) === 'Curfy/PrivacyInfo.xcprivacy';
}), 'Main privacy manifest is not in its Resources build phase');
for (const name of ['ShieldAction', 'ShieldConfiguration', 'ActivityMonitorExtension']) {
  verifyManifest(path.join(root, 'targets', name, 'PrivacyInfo.xcprivacy'));
  const target = entries('PBXNativeTarget').find(([,t]) => clean(t.name) === name);
  assert(target, `Missing ${name} target`);
  const group = target[1].fileSystemSynchronizedGroups?.map(g => objects.PBXFileSystemSynchronizedRootGroup[g.value]).find(g => clean(g?.path) === name);
  assert(group, `${name}: missing synchronized source/resource group`);
  for (const ref of group.exceptions || []) {
    const exception = objects.PBXFileSystemSynchronizedBuildFileExceptionSet[ref.value];
    if (exception?.target === target[0]) {
      assert(!exception.membershipExceptions?.some(p => clean(p) === 'PrivacyInfo.xcprivacy'), `${name}: manifest excluded from target`);
    }
  }
}
console.log('App-group required-reason manifests and generated resource membership verified for all four targets. Archive and full privacy audit remain required.');
const appManifest = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo.ios.privacyManifests;
const inventory = JSON.parse(fs.readFileSync(path.join(root, 'docs/release-evidence/sdk-privacy-inventory.json'), 'utf8'));
for (const entry of inventory.manifests) {
  const current = plist.parse(fs.readFileSync(path.join(root, 'node_modules', entry.path), 'utf8'));
  assert.deepEqual(JSON.parse(JSON.stringify(current.NSPrivacyAccessedAPITypes || [])), entry.requiredReasons, `${entry.path}: SDK reasons changed; review inventory`);
  for (const api of entry.requiredReasons) {
    const declared = appManifest.NSPrivacyAccessedAPITypes.find(x => x.NSPrivacyAccessedAPIType === api.NSPrivacyAccessedAPIType);
    for (const reason of api.NSPrivacyAccessedAPITypeReasons) {
      assert(declared?.NSPrivacyAccessedAPITypeReasons.includes(reason), `${entry.path}: app manifest missing ${reason}`);
    }
  }
}
for (const kind of ['Name', 'UserID', 'OtherUserContent', 'ProductInteraction', 'OtherDataTypes']) {
  const data = appManifest.NSPrivacyCollectedDataTypes?.find(x => x.NSPrivacyCollectedDataType === `NSPrivacyCollectedDataType${kind}`);
  assert(data?.NSPrivacyCollectedDataTypeLinked === true && data.NSPrivacyCollectedDataTypeTracking === false && data.NSPrivacyCollectedDataTypePurposes.includes('NSPrivacyCollectedDataTypePurposeAppFunctionality'), `Missing linked, nontracking functionality disclosure: ${kind}`);
}
assert.equal(appManifest.NSPrivacyTracking, false);
console.log('Reviewed SDK reasons and leaderboard/service data declarations verified.');

for (const api of appManifest.NSPrivacyAccessedAPITypes) {
  const generated = generatedManifest.NSPrivacyAccessedAPITypes.find(x => x.NSPrivacyAccessedAPIType === api.NSPrivacyAccessedAPIType);
  for (const reason of api.NSPrivacyAccessedAPITypeReasons) assert(generated?.NSPrivacyAccessedAPITypeReasons.includes(reason), `Generated main manifest missing ${reason}`);
}
assert.deepEqual(JSON.parse(JSON.stringify(generatedManifest.NSPrivacyCollectedDataTypes)), appManifest.NSPrivacyCollectedDataTypes, 'Generated main data disclosures differ from reviewed config');
