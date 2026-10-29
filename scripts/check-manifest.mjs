import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { packagePaths } from './package-paths.mjs';

const { browser, outputDirectory: root } = packagePaths(process.argv[2]);
const manifest = JSON.parse(
  await readFile(join(root, 'manifest.json'), 'utf8'),
);
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.name, 'AddonRay');
assert.deepEqual(manifest.permissions, ['activeTab']);
assert.deepEqual([...manifest.optional_permissions].sort(), [
  'management',
  'scripting',
]);
assert.equal(manifest.host_permissions?.length ?? 0, 0);
assert.equal(manifest.optional_host_permissions?.length ?? 0, 0);
assert.equal(manifest.content_scripts?.length ?? 0, 0);
assert.equal(manifest.web_accessible_resources?.length ?? 0, 0);
assert.equal(manifest.background, undefined);
const expectedIcons = {
  16: 'icon-16.png',
  32: 'icon-32.png',
  48: 'icon-48.png',
  96: 'icon-96.png',
  128: 'icon-128.png',
};
assert.deepEqual(manifest.icons, expectedIcons);
assert.deepEqual(manifest.action?.default_icon, expectedIcons);
for (const [size, file] of Object.entries(expectedIcons)) {
  const bytes = await readFile(join(root, file));
  assert.equal(bytes.subarray(1, 4).toString('ascii'), 'PNG');
  assert.equal(bytes.readUInt32BE(16), Number(size));
  assert.equal(bytes.readUInt32BE(20), Number(size));
}
if (browser === 'firefox') {
  assert.equal(
    manifest.browser_specific_settings.gecko.strict_min_version,
    '140.0',
  );
  assert.deepEqual(
    manifest.browser_specific_settings.gecko.data_collection_permissions,
    {
      required: ['none'],
    },
  );
  assert.equal(manifest.minimum_chrome_version, undefined);
} else {
  assert.equal(manifest.browser_specific_settings, undefined);
  assert.equal(manifest.minimum_chrome_version, '156');
}

async function inspectFiles(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await inspectFiles(path);
    else if (/\.(js|html)$/.test(entry.name)) {
      const text = await readFile(path, 'utf8');
      assert.doesNotMatch(
        text,
        /<script[^>]+src=["']https?:/i,
        `Remote script in ${path}`,
      );
    }
  }
}
await inspectFiles(root);
console.log(`${browser} MV3 manifest and permission budget passed.`);
