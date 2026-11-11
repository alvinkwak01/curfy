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
}
const main = entries('PBXNativeTarget').find(([,t]) => clean(t.name) === 'Curfy');
assert(main, 'Missing main target');
verifyManifest(path.join(root, 'ios/Curfy/PrivacyInfo.xcprivacy'));
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
