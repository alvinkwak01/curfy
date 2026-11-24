#!/usr/bin/env node
// Read-only preflight. Never installs Xcode, builds, signs, or starts EAS.
const { execFileSync } = require('node:child_process');
const sdk = process.argv[2] ?? 'iphoneos';
if (!['iphoneos', 'iphonesimulator'].includes(sdk)) {
  console.error('Usage: node scripts/verify-ios-sdk.cjs [iphoneos|iphonesimulator]');
  process.exit(1);
}
try {
  const version = execFileSync('xcrun', ['--sdk', sdk, '--show-sdk-version'], { encoding: 'utf8' }).trim();
  const match = /^(\d+)\.(\d+)(?:\.\d+)?$/.exec(version);
  if (!match || Number(match[1]) < 26 || (Number(match[1]) === 26 && Number(match[2]) < 5)) {
    throw new Error(`Selected ${sdk} SDK is ${version}; Curfy requires SDK 26.5 or later for the supported shield-to-app action.`);
  }
  console.log(`PASS: ${sdk} SDK ${version} supports the guarded shield-to-Curfy API.`);
  console.log('NOT verified: signing profiles, distribution approval, or actual iPhone handoff.');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error('Select a compatible Xcode installation before building. This check does not authorize an EAS or paid build.');
  process.exit(1);
}
