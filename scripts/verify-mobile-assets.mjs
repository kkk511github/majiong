import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, relative, join } from 'node:path';

const [apkInput, ipaInput, reportInput] = process.argv.slice(2);
if (!apkInput || !ipaInput || !reportInput) throw Error('Usage: verify-mobile-assets.mjs app.apk app.ipa report.json');
const apk = resolve(apkInput), ipa = resolve(ipaInput), root = resolve('dist');
const sha = data => createHash('sha256').update(data).digest('hex');
const readEntry = (archive, entry) => execFileSync('unzip', ['-p', archive, entry], { maxBuffer: 96 * 1024 * 1024 });
const entries = archive => execFileSync('unzip', ['-Z1', archive], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim().split('\n');
const apkEntries = entries(apk), ipaEntries = entries(ipa);
const ipaInfo = ipaEntries.filter(name => /^Payload\/[^/]+\.app\/Info\.plist$/.test(name));
if (ipaInfo.length !== 1) throw Error('IPA must contain exactly one application bundle');
const ipaRoot = ipaInfo[0].slice(0, -'Info.plist'.length);
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
  ? walk(join(dir, entry.name)) : [join(dir, entry.name)]);
const files = walk(root).sort();
const resources = [];
for (const path of files) {
  const name = relative(root, path).split('\\').join('/');
  const original = readFileSync(path);
  const android = readEntry(apk, `assets/public/${name}`);
  const ios = readEntry(ipa, `${ipaRoot}public/${name}`);
  if (!original.equals(android) || !original.equals(ios)) throw Error(`Packaged asset differs: ${name}`);
  resources.push({ path: name, bytes: original.length, sha256: sha(original) });
}
const nativeConfigs = [
  JSON.parse(readEntry(apk, 'assets/capacitor.config.json')),
  JSON.parse(readEntry(ipa, `${ipaRoot}capacitor.config.json`)),
];
for (const config of nativeConfigs) {
  if (config.appId !== 'com.jinling.mahjong' || config.server)
    throw Error('Release contains a simulator application ID or live-server URL');
  if (config.ios?.webContentsDebuggingEnabled || config.android?.webContentsDebuggingEnabled)
    throw Error('Release has web debugging enabled');
}
for (const name of [...apkEntries, ...ipaEntries]) {
  if (/(^|\/)(\.env(?:\.[^/]*)?|[^/]+\.(?:map|p12|pfx|keystore|jks|key))$/.test(name))
    throw Error(`Unexpected sensitive/debug asset: ${name}`);
}
if (ipaEntries.some(name => /\/_CodeSignature\/|\/embedded\.mobileprovision$/.test(name)))
  throw Error('The explicitly unsigned IPA unexpectedly contains signing material');
const plist = JSON.parse(execFileSync('plutil', ['-convert', 'json', '-o', '-', '--', '-'], {
  input: readEntry(ipa, ipaInfo[0]), maxBuffer: 4 * 1024 * 1024,
}));
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
if (plist.CFBundleIdentifier !== 'com.jinling.mahjong' || plist.CFBundleShortVersionString !== version ||
    !plist.CFBundleSupportedPlatforms?.includes('iPhoneOS')) throw Error('IPA identity, version or platform mismatch');
const report = {
  at: new Date().toISOString(), version, build: plist.CFBundleVersion,
  packageId: plist.CFBundleIdentifier, webAssetsMatched: resources.length,
  productionNativeConfiguration: true, iosSignature: 'unsigned; requires external signing before installation',
  artifacts: [apk, ipa].map(path => ({ path, bytes: statSync(path).size, sha256: sha(readFileSync(path)) })),
  resources,
};
writeFileSync(resolve(reportInput), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ version, build: report.build, webAssetsMatched: resources.length, artifacts: report.artifacts }, null, 2));
