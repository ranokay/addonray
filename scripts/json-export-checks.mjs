import assert from 'node:assert/strict';
import {
  observeExactDownload,
  snapshotDownloads,
} from './download-observation.mjs';

const jsonNamePattern = /^addonray-investigation(?: ?\(\d+\))?\.json$/;

export const snapshotJsonDownloads = snapshotDownloads;

export function observeExactJsonDownload(options) {
  return observeExactDownload({
    ...options,
    pattern: jsonNamePattern,
    description: 'generic JSON',
  });
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
