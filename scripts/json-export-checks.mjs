import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const jsonNamePattern = /^addonray-investigation(?: ?\(\d+\))?\.json$/;

async function entries(directory) {
  return (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
}

async function fileTimes(directory) {
  const snapshot = new Map();
  for (const name of await entries(directory)) {
    const details = await stat(join(directory, name), { bigint: true });
    snapshot.set(name, details.mtimeNs);
  }
  return snapshot;
}

export async function snapshotJsonDownloads(directory) {
  return fileTimes(directory);
}

// A completed file must be new or have a newer modification time than any
// pre-existing same-name artifact. Snapshot the directory before dispatching
// the download: a fast completion can otherwise look pre-existing. Partial
// downloads never satisfy the exact byte comparison because only the requested
// extension is considered.
export async function observeExactJsonDownload({
  driver,
  directory,
  expected,
  before,
  timeout = 15000,
}) {
  const bytes = Buffer.from(expected, 'utf8');
  const observed = [];
  let changedNames = [];
  try {
    return await driver.wait(
      async () => {
        observed.splice(0, observed.length, ...(await entries(directory)));
        const changed = [];
        for (const name of observed) {
          if (!jsonNamePattern.test(name)) continue;
          const path = join(directory, name);
          let details;
          try {
            details = await stat(path, { bigint: true });
          } catch (error) {
            if (error.code === 'ENOENT') continue;
            throw error;
          }
          const previous = before.get(name);
          if (previous !== undefined && details.mtimeNs <= previous) continue;
          changed.push({ name, path, details, previous });
        }
        changedNames = changed.map((entry) => entry.name);
        // One action must create or update exactly one generic JSON file.
        // Numbered variants cover browsers that avoid overwriting a file.
        if (changed.length !== 1) return false;
        const [candidate] = changed;
        let content;
        try {
          content = await readFile(candidate.path);
        } catch (error) {
          if (error.code === 'ENOENT') return false;
          throw error;
        }
        if (!content.equals(bytes)) return false;
        return {
          filename: candidate.name,
          path: candidate.path,
          bytes: content.length,
          observedEntries: observed.slice(),
          changedEntries: changedNames.slice(),
          newlyObserved: candidate.previous === undefined,
          modifiedAtNs: candidate.details.mtimeNs.toString(),
          previousModifiedAtNs: candidate.previous?.toString() ?? null,
        };
      },
      timeout,
      'The browser did not create exactly one complete generic JSON file with the reviewed UTF-8 bytes',
    );
  } catch (error) {
    error.message += ` Observed entries: ${JSON.stringify(observed)}; changed JSON files: ${JSON.stringify(changedNames)}`;
    throw error;
  }
}

export function assertExchangeJson(
  text,
  { fixtureName, fixtureId, investigationLabel, assessment, changeKind } = {},
) {
  const document = JSON.parse(text);
  assert.deepEqual(Object.keys(document), [
    'schemaVersion',
    'provenance',
    'report',
  ]);
  assert.equal(document.schemaVersion, 1);
  assert.equal(document.provenance, 'captured');
  const report = document.report;
  assert.deepEqual(Object.keys(report), [
    'before',
    'after',
    'changes',
    'assessment',
    'timing',
    'pageErrors',
    'observationLimits',
  ]);
  for (const side of ['before', 'after'])
    assert(Array.isArray(report[side].extensions));
  if (fixtureName) {
    assert(
      report.before.extensions.some((entry) => entry.name === fixtureName),
      'JSON Before inventory must preserve the exact fixture name',
    );
    assert(
      report.after.extensions.some((entry) => entry.name === fixtureName),
      'JSON After inventory must preserve the exact fixture name',
    );
  }
  for (const side of ['before', 'after']) {
    for (const entry of report[side].extensions) {
      assert.deepEqual(Object.keys(entry), ['name', 'version', 'enabled']);
      assert.equal(typeof entry.name, 'string');
      assert.equal(typeof entry.version, 'string');
      assert.equal(typeof entry.enabled, 'boolean');
    }
  }
  if (changeKind) {
    assert.equal(report.changes.length, 1);
    assert.equal(report.changes[0].kind, changeKind);
    assert.deepEqual(Object.keys(report.changes[0]), [
      'kind',
      'name',
      'version',
      'enabled',
    ]);
  }
  assert.equal(report.assessment, assessment ?? null);
  assert.deepEqual(report.timing, { before: null, after: null });
  assert.deepEqual(report.pageErrors, { before: null, after: null });
  assert.deepEqual(report.observationLimits, {
    pageErrorWindowMs: 30000,
    pageErrorEvents: 200,
    pageErrorSummaryBytes: 1024,
  });
  for (const forbidden of [
    'recordId',
    'savedAt',
    'expiresAt',
    '"origin"',
    'sourceTabId',
    'documentId',
    'attemptId',
    'transferId',
    'incognito',
  ])
    assert(!text.includes(forbidden), `JSON must omit ${forbidden}`);
  if (fixtureId)
    assert(!text.includes(fixtureId), 'JSON must omit the fixture ID');
  if (investigationLabel)
    assert(
      !text.includes(investigationLabel),
      'JSON must omit the live investigation label',
    );
  return document;
}
