import { expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromeExtensionId } from '../scripts/chrome-session.mjs';
import {
  fixtureManifest,
  writeDispatchFixture,
} from '../scripts/request-grant-dispatch-fixtures.mjs';

async function writeFixture() {
  await mkdir('.scratch', { recursive: true });
  const directory = await mkdtemp('.scratch/request-grant-dispatch-fixture-');
  return { directory, fixture: await writeDispatchFixture(directory) };
}

it('writes the approved test-only manifest without required access', async () => {
  const { directory, fixture } = await writeFixture();
  const manifest = await fixture.verify();
  expect(manifest).toEqual(fixtureManifest);
  expect(manifest.permissions).toBeUndefined();
  expect(manifest.host_permissions).toBeUndefined();
  expect(manifest.optional_permissions).toEqual(['webRequest']);
  expect(manifest.optional_host_permissions).toEqual(['*://*/*']);
  expect(manifest.background).toEqual({ service_worker: 'bg.js' });
  expect(chromeExtensionId(directory)).toMatch(/^[a-p]{32}$/);
});

it('binds each digest to the fixture bytes it describes', async () => {
  const { fixture } = await writeFixture();
  const entries = [
    ['manifest.json', fixture.hashes.manifestSha256],
    ['bg.js', fixture.hashes.backgroundSha256],
    ['owner.js', fixture.hashes.ownerScriptSha256],
  ];
  for (const [name, expected] of entries) {
    const bytes = await readFile(join(fixture.directory, name));
    const digest = createHash('sha256').update(bytes).digest('hex');
    expect(digest).toBe(expected);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
  }
  await expect(fixture.verify()).resolves.toEqual(fixtureManifest);
});

it('refuses a changed fixture file', async () => {
  const { fixture } = await writeFixture();
  await writeFile(join(fixture.directory, 'owner.js'), 'mutated');
  await expect(fixture.verify()).rejects.toThrow('fixture owner.js changed');
});
