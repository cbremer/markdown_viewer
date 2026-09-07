// Backport https://github.com/electron-userland/electron-builder/pull/10172.
// Remove when upgrading to a release containing the upstream correction.
const fs = require('node:fs');
const path = require('node:path');

const replacements = [
  [
    'importCerts(keychainFile, certPaths, cscPasswords)',
    'importCerts(keychainFile, certPaths, cscPasswords, keychainPassword)',
  ],
  [
    'async function importCerts(keychainFile, paths, keyPasswords)',
    'async function importCerts(keychainFile, paths, keyPasswords, keychainPassword)',
  ],
  [
    '["set-key-partition-list", "-S", "apple-tool:,apple:", "-s", "-k", password, keychainFile]',
    '["set-key-partition-list", "-S", "apple-tool:,apple:", "-s", "-k", keychainPassword, keychainFile]',
  ],
];

function patchSource(source, version) {
  if (version !== '26.15.3') {
    throw new Error(
      `Review macOS keychain backport for app-builder-lib ${version}`
    );
  }
  if (
    replacements.every(
      ([before, after]) =>
        !source.includes(before) && source.split(after).length === 2
    )
  )
    return source;
  if (
    !replacements.every(
      ([before, after]) =>
        source.split(before).length === 2 && !source.includes(after)
    )
  ) {
    throw new Error(
      'Unexpected app-builder-lib signing source; review macOS keychain backport'
    );
  }
  return replacements.reduce(
    (result, [before, after]) => result.replace(before, after),
    source
  );
}

if (require.main === module) {
  const manifest = require.resolve('app-builder-lib/package.json');
  const { version } = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  const filename = path.join(
    path.dirname(manifest),
    'out/codeSign/macCodeSign.js'
  );
  const source = fs.readFileSync(filename, 'utf8');
  const patched = patchSource(source, version);
  if (patched !== source) fs.writeFileSync(filename, patched);
  console.log('Verified electron-builder macOS keychain password backport');
}

module.exports = { patchSource };
