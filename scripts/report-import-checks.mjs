import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { By, until } from 'selenium-webdriver';
import {
  observeExactJsonDownload,
  snapshotJsonDownloads,
} from './json-export-checks.mjs';
import { deleteShownRecord, storedRecords } from './saved-ui-helpers.mjs';

const limitBytes = 1024 * 1024;

const validReport = {
  before: {
    extensions: [
      {
        name: '<img src=x onerror=alert(1)>',
        version: '<script>alert(2)</script>',
        enabled: true,
      },
    ],
  },
  after: {
    extensions: [
      {
        name: '<img src=x onerror=alert(1)>',
        version: '<script>alert(2)</script>',
        enabled: false,
      },
    ],
  },
  changes: [
    {
      kind: 'disabled',
      name: '<script>alert(3)</script>',
      version: '1.0',
      enabled: false,
    },
  ],
  assessment: 'worse',
  timing: {
    before: null,
    after: {
      domContentLoaded: { status: 'measured', milliseconds: 12.5 },
      loadEvent: { status: 'unrecorded' },
      firstContentfulPaint: { status: 'unavailable' },
    },
  },
  pageErrors: {
    before: null,
    after: {
      scriptErrors: 1,
      unhandledRejections: 0,
      total: 1,
      finish: 'stop',
      observedMs: 1200,
    },
  },
  observationLimits: {
    pageErrorWindowMs: 30000,
    pageErrorEvents: 200,
    pageErrorSummaryBytes: 1024,
  },
};

const validDocument = {
  schemaVersion: 1,
  provenance: 'captured',
  report: validReport,
};

function boundaryDocument() {
  const emptyReport = {
    before: { extensions: [] },
    after: { extensions: [] },
    changes: [],
    assessment: 'worse',
    timing: { before: null, after: null },
    pageErrors: { before: null, after: null },
    observationLimits: validReport.observationLimits,
  };
  for (let count = 180; count <= 260; count += 1) {
    const base = Array.from({ length: count }, () => ({
      name: '',
      version: '1',
      enabled: true,
    }));
    const candidate = {
      ...emptyReport,
      before: { extensions: base },
    };
    const baseBytes = Buffer.byteLength(
      JSON.stringify({
        schemaVersion: 1,
        provenance: 'captured',
        report: candidate,
      }),
    );
    const target = limitBytes - 60;
    const needed = target - baseBytes;
    if (needed <= 0 || needed > count * 4096) continue;
    const per = Math.floor(needed / count);
    const remainder = needed % count;
    for (let index = 0; index < count; index += 1) {
      const length = per + (index < remainder ? 1 : 0);
      base[index] = { name: 'x'.repeat(length), version: '1', enabled: true };
    }
    const document = {
      schemaVersion: 1,
      provenance: 'captured',
      report: candidate,
    };
    return { document, bytes: Buffer.byteLength(JSON.stringify(document)) };
  }
  throw new Error('Could not construct a near-limit valid import document');
}

async function chooseFile(driver, path) {
  const input = await driver.findElement(By.id('import-report-file'));
  await driver.executeScript((element) => {
    element.value = '';
  }, input);
  await input.sendKeys(path);
}

async function waitForStatus(driver, text) {
  const status = await driver.wait(
    until.elementLocated(By.id('import-status')),
    10000,
  );
  await driver.wait(
    async () => (await status.getText()).includes(text),
    10000,
    `Import status did not include: ${text}`,
  );
}

async function waitForImportedReport(driver) {
  return driver.wait(
    until.elementLocated(By.id('imported-report-heading')),
    10000,
  );
}

export async function checkReportImport({
  driver,
  reportDirectory,
  authority,
  passed,
}) {
  const work = await mkdtemp(join(tmpdir(), 'addonray-import-'));
  const validPath = join(work, 'valid-report.json');
  const replacementPath = join(work, 'replacement-report.json');
  const duplicatePath = join(work, 'hostile-duplicate.json');
  const escapedPath = join(work, 'hostile-escaped-key.json');
  const unknownPath = join(work, 'hostile-unknown-field.json');
  const invalidUtf8Path = join(work, 'hostile-invalid-utf8.json');
  const oversizedPath = join(work, 'hostile-oversized.json');
  const boundaryPath = join(work, 'view-only-boundary.json');

  const replacementDocument = JSON.parse(JSON.stringify(validDocument));
  replacementDocument.report.assessment = 'better';
  replacementDocument.report.after.extensions[0].enabled = true;
  const boundary = boundaryDocument();
  const escaped = `{"schemaVersion":1,"provenance":"captured","__pro\\u0074o__":{},"report":${JSON.stringify(validReport)}}`;
  const duplicate = `{"schemaVersion":1,"schemaVersion":1,"provenance":"captured","report":${JSON.stringify(validReport)}}`;
  const unknown = JSON.stringify({
    ...validDocument,
    report: { ...validReport, extra: true },
  });

  await writeFile(validPath, JSON.stringify(validDocument));
  await writeFile(replacementPath, JSON.stringify(replacementDocument));
  await writeFile(duplicatePath, duplicate);
  await writeFile(escapedPath, escaped);
  await writeFile(unknownPath, unknown);
  await writeFile(invalidUtf8Path, Buffer.from([0x7b, 0x22, 0xff, 0x7d]));
  await writeFile(oversizedPath, Buffer.alloc(limitBytes + 1, 0x20));
  await writeFile(boundaryPath, JSON.stringify(boundary.document));

  const beforeImport = await storedRecords(driver);
  assert.equal(beforeImport.records.length, 0, JSON.stringify(beforeImport));
  assert.equal(
    (await driver.findElements(By.id('imported-report-heading'))).length,
    0,
  );
  assert.equal(
    (await driver.findElements(By.id('save-imported-report'))).length,
    0,
    'A report cannot be saved before an explicit file selection',
  );

  await chooseFile(driver, validPath);
  await waitForImportedReport(driver);
  const importedText = await driver.findElement(By.css('body')).getText();
  for (const phrase of [
    'Imported report',
    'read-only and untrusted file content',
    'cannot be attached to a live investigation',
    'The file claims provenance captured',
  ])
    assert(
      importedText.includes(phrase),
      `Imported view must include: ${phrase}`,
    );
  assert(!importedText.includes('valid-report.json'));
  assert.equal(
    await driver.executeScript(
      () =>
        document.querySelectorAll(
          '.imported-report img, .imported-report script',
        ).length,
    ),
    0,
    'Imported markup-like strings must remain text',
  );
  const afterImport = await storedRecords(driver);
  assert.equal(afterImport.records.length, 0, JSON.stringify(afterImport));
  passed(
    `${authority}: explicit production file selection labels and renders an untrusted report without persisting it`,
    {
      reportImport: {
        stage: 'import-only',
        provenanceClaim: 'captured',
        storedRecords: afterImport.records.length,
        filenameStored: false,
        executableMarkup: false,
      },
    },
  );

  // Lifecycle suspension must clear imported content; a restored page must not
  // bring it back from memory.
  await driver.executeScript(() => {
    const event =
      typeof PageTransitionEvent === 'function'
        ? new PageTransitionEvent('pagehide')
        : new Event('pagehide');
    Object.defineProperty(event, 'persisted', { value: true });
    window.dispatchEvent(event);
  });
  await driver.wait(
    async () =>
      (await driver.findElements(By.id('imported-report-heading'))).length ===
      0,
    10000,
  );
  await driver.executeScript(() => {
    const event =
      typeof PageTransitionEvent === 'function'
        ? new PageTransitionEvent('pageshow')
        : new Event('pageshow');
    Object.defineProperty(event, 'persisted', { value: true });
    window.dispatchEvent(event);
  });
  await driver.wait(
    async () =>
      (await driver.findElements(By.id('imported-report-heading'))).length ===
      0,
    10000,
  );
  passed(
    `${authority}: a suspended or restored page cannot keep imported content visible`,
    { reportImport: { lifecycle: 'pagehide/pageshow cleared imported view' } },
  );

  await chooseFile(driver, validPath);
  await waitForImportedReport(driver);

  const hostileCases = [
    { path: duplicatePath, expected: 'duplicate property name' },
    { path: escapedPath, expected: 'forbidden property name' },
    { path: unknownPath, expected: 'schema version 1 report fields' },
    { path: invalidUtf8Path, expected: 'not complete UTF-8' },
    { path: oversizedPath, expected: '1 MiB' },
  ];
  for (const hostile of hostileCases) {
    await chooseFile(driver, hostile.path);
    await waitForStatus(driver, hostile.expected);
    assert.equal(
      (await driver.findElements(By.id('imported-report-heading'))).length,
      1,
      `A rejected file must preserve the previous imported view: ${hostile.path}`,
    );
    assert.equal(
      (await storedRecords(driver)).records.length,
      0,
      `A rejected file must not persist: ${hostile.path}`,
    );
  }
  passed(
    `${authority}: duplicate keys, escaped forbidden keys, unknown fields, invalid UTF-8 and oversized files fail through the production file input without replacing or persisting the view`,
    {
      reportImport: {
        stage: 'hostile-files',
        cases: hostileCases.length,
        previousViewPreserved: true,
        storedRecords: 0,
      },
    },
  );

  await chooseFile(driver, replacementPath);
  await waitForImportedReport(driver);
  assert(
    (await driver.findElement(By.css('.imported-report')).getText()).includes(
      'Better',
    ),
    'A successful replacement selection must replace the imported view',
  );
  assert.equal((await storedRecords(driver)).records.length, 0);

  await driver.executeScript(() => {
    const select = document.getElementById('import-retention');
    if (!select) throw new Error('Missing import retention select');
    select.value = '7';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await driver.wait(
    async () =>
      (await driver.executeScript(
        () => document.getElementById('import-retention')?.value,
      )) === '7',
    10000,
  );
  await driver.findElement(By.id('save-imported-report')).click();
  await waitForStatus(driver, 'Saved imported report locally.');
  const afterSave = await storedRecords(driver);
  assert.equal(afterSave.records.length, 1, JSON.stringify(afterSave));
  const savedRecord = afterSave.records[0];
  assert.equal(savedRecord.origin, 'imported');
  assert.equal(savedRecord.schemaVersion, 1);
  assert.equal(Number.isSafeInteger(savedRecord.importedAt), true);
  assert.equal(
    savedRecord.expiresAt - savedRecord.savedAt,
    7 * 24 * 60 * 60 * 1000,
  );
  assert.deepEqual(savedRecord.report, replacementDocument.report);
  assert(!JSON.stringify(savedRecord).includes('replacement-report.json'));
  const row = await driver.wait(
    until.elementLocated(By.css('.library-entry')),
    10000,
  );
  assert((await row.getText()).includes('Imported'), await row.getText());
  await driver.findElement(By.id('open-saved-record')).click();
  await driver.wait(until.elementLocated(By.id('archive-heading')), 10000);
  const archiveText = await driver
    .findElement(By.css('article.archive:not(.imported-report)'))
    .getText();
  assert(archiveText.includes('Imported report content.'));
  assert(archiveText.includes('Read-only saved investigation'));

  await driver.findElement(By.id('saved-json-prepare')).click();
  const preview = await driver.wait(
    until.elementLocated(By.id('saved-json-text')),
    10000,
  );
  const reviewedJson = await preview.getProperty('value');
  const reviewed = JSON.parse(reviewedJson);
  assert.equal(reviewed.schemaVersion, 1);
  assert.equal(reviewed.provenance, 'imported');
  assert.deepEqual(reviewed.report, replacementDocument.report);
  assert(!reviewedJson.includes('importedAt'));
  assert(!reviewedJson.includes('savedAt'));
  assert(!reviewedJson.includes('replacement-report.json'));
  const reviewedBytes = Buffer.from(reviewedJson, 'utf8');
  assert(reviewedBytes.length <= limitBytes);
  const beforeDownload = await snapshotJsonDownloads(reportDirectory);
  await driver.findElement(By.id('saved-json-download')).click();
  const downloaded = await observeExactJsonDownload({
    driver,
    directory: reportDirectory,
    expected: reviewedJson,
    before: beforeDownload,
  });
  const downloadedBytes = await readFile(downloaded.path);
  assert.deepEqual(downloadedBytes, reviewedBytes);
  passed(
    `${authority}: Save imported report stores local imported origin/importedAt and re-exports exact imported-provenance JSON`,
    {
      reportImport: {
        stage: 'save-and-reexport',
        origin: savedRecord.origin,
        importedAt: savedRecord.importedAt,
        retentionDays: 7,
        reviewedBytes: reviewedBytes.length,
        reviewedSha256: createHash('sha256')
          .update(reviewedBytes)
          .digest('hex'),
        downloadedBytes: downloadedBytes.length,
        downloadedSha256: createHash('sha256')
          .update(downloadedBytes)
          .digest('hex'),
        provenance: reviewed.provenance,
        filenameStored: false,
      },
    },
  );
  await driver.findElement(By.id('saved-json-cancel')).click();
  await deleteShownRecord(driver);

  await chooseFile(driver, boundaryPath);
  await waitForImportedReport(driver);
  const viewOnly = await driver.wait(
    until.elementLocated(By.id('import-view-only')),
    10000,
  );
  assert((await viewOnly.getText()).includes('1 MiB'));
  assert.equal(
    await driver.findElement(By.id('save-imported-report')).isEnabled(),
    false,
  );
  assert.equal((await storedRecords(driver)).records.length, 0);
  await driver.findElement(By.id('clear-imported-report')).click();
  await driver.wait(
    async () =>
      (await driver.findElements(By.id('imported-report-heading'))).length ===
      0,
    10000,
  );
  passed(
    `${authority}: a near-limit valid import is inspectable but view-only when its stored envelope would exceed 1 MiB`,
    {
      reportImport: {
        stage: 'view-only',
        importBytes: boundary.bytes,
        saveDisabled: true,
        storedRecords: 0,
      },
    },
  );
  assert.equal((await storedRecords(driver)).records.length, 0);
  return { work, boundaryBytes: boundary.bytes };
}
