import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import JSZip from 'jszip';
import { packagePaths } from './package-paths.mjs';

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function directoryFiles(root, prefix = '') {
  const files = new Map();
  for (const entry of await readdir(join(root, prefix), {
    withFileTypes: true,
  })) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      for (const [path, bytes] of await directoryFiles(root, name)) {
        files.set(path, bytes);
      }
    } else {
      assert(entry.isFile(), `Unexpected non-file: ${name}`);
      files.set(name, await readFile(join(root, name)));
    }
  }
  return files;
}

async function archiveFiles(path) {
  const bytes = await readFile(path);
  const archive = await JSZip.loadAsync(bytes, { checkCRC32: true });
  const files = new Map();
  for (const entry of Object.values(archive.files)) {
    if (entry.dir) continue;
    assert.equal(entry.unsafeOriginalName, entry.name);
    assert.doesNotMatch(
      entry.name,
      /^(?:\/|[A-Za-z]:)|\\|(?:^|\/)\.{1,2}(?:\/|$)/,
      `Unsafe archive path: ${entry.name}`,
    );
    files.set(entry.name, await entry.async('nodebuffer'));
  }
  return { files, sha256: sha256(bytes) };
}

export function compareFiles(actual, expected) {
  assert.deepEqual([...actual.keys()].sort(), [...expected.keys()].sort());
  for (const [path, bytes] of expected) {
    assert.equal(sha256(actual.get(path)), sha256(bytes), `Mismatch: ${path}`);
  }
}

export async function checkPackage(browser = 'firefox') {
  const { extensionArchive, sourceArchive, outputDirectory } =
    packagePaths(browser);
  const extension = await archiveFiles(extensionArchive);
  compareFiles(extension.files, await directoryFiles(outputDirectory));
  assert(
    extension.files.has('manifest.json'),
    'Manifest must be at archive root',
  );

  const sources = await archiveFiles(sourceArchive);
  const expectedSources = new Map();
  for (const directory of ['entrypoints', 'lib']) {
    for (const [path, bytes] of await directoryFiles(directory)) {
      expectedSources.set(`${directory}/${path}`, bytes);
    }
  }
  for (const path of [
    'wxt.config.ts',
    'tsconfig.json',
    'bunfig.toml',
    'mise.toml',
    'package.json',
    'bun.lock',
    'SOURCE_CODE_REVIEW.md',
  ]) {
    expectedSources.set(path, await readFile(path));
  }
  compareFiles(sources.files, expectedSources);
  return { extension, sources };
}

if (import.meta.main) {
  const paths = packagePaths(process.argv[2]);
  const { extensionArchive } = paths;
  const { extension, sources } = await checkPackage(paths.browser);
  console.log(
    `Package verified: ${relative('.', extensionArchive)}; SHA-256 ${extension.sha256}`,
  );
  console.log(
    `Source allowlist verified: ${sources.files.size} files; SHA-256 ${sources.sha256}`,
  );
}
