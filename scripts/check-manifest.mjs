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
assert.equal(manifest.background, undefined);
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
