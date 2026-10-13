// Expo SDK 52's CLI assumes tar has a default export. Patched tar 7 exposes
// named CommonJS exports with __esModule=true, so SWC's interop loses extract.
// Keep the secured tar release and adapt only the two locked SDK 52 callers.
const fs = require('node:fs');
const path = require('node:path');
const cliManifest = require.resolve('@expo/cli/package.json');
const cli = require(cliManifest);
if (!cli.version.startsWith('0.22.')) {
  throw new Error('Recheck SDK tar compatibility when upgrading Expo CLI');
}
const original = '_interopRequireDefault(require("tar"))';
const replacement = '{ default: require("tar") }';
for (const file of ['utils/tar.js', 'utils/npm.js']) {
  const target = path.join(path.dirname(cliManifest), 'build/src', file);
  const source = fs.readFileSync(target, 'utf8');
  if (source.includes(original)) {
    fs.writeFileSync(target, source.replace(original, replacement));
  } else if (!source.includes(replacement)) {
    throw new Error(`Expo CLI tar import changed: ${file}`);
  }
}
console.log('SDK 52 CLI: secured tar interoperability verified');
