import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { By, until } from 'selenium-webdriver';
import {
  assertExchangeJson,
  observeExactJsonDownload,
  snapshotJsonDownloads,
} from './json-export-checks.mjs';

const filename = 'addonray-investigation.md';
const beforeSelector = '[data-testid="before-snapshot"]';
const afterSelector = '[data-testid="after-snapshot"]';
const assessmentSelector = 'input[name="page-assessment"]:checked';
const quietObservationMs = 350;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

// The caller supplies a disposable profile and an empty automatic-download
// directory. Driver file observation is separate from product download status.
export async function checkReportExport({
  driver,
  directory,
  fixtureId,
  fixtureName,
  fixtureInitiallyEnabled,
  authority,
  passed,
}) {
  assert.deepEqual(
    await readdir(directory),
    [],
    'Report checks require an empty caller-owned download directory',
  );
  const originalBefore = await driver
    .findElement(By.css(beforeSelector))
    .getText();
  const originalAfter = await driver
    .findElement(By.css(afterSelector))
    .getText();
  const investigationLabel = await driver
    .findElement(By.id('investigation-label'))
    .getText();
  const authorityDetail = {
    ui: authority,
    controls:
      'Selenium clicks the packaged investigation React controls and reads the readonly textarea value. Existing runner authority supplies retained or pre-granted inventory access; this helper does not observe a fresh consent prompt.',
    downloads:
      'The caller configures a default download destination in its disposable profile. The external test process observes the resulting local file; product UI reports only that a download was requested.',
    gaps: [
      'This is automated packaged-UI evidence, not native human interaction, Save As handling, user cancellation or retail installation qualification.',
      'Automatic-download test settings choose file destination and MIME handling. Ordinary browser settings can prompt, save automatically or open the file.',
      'The loaded owning tab is a normal-window test route. This helper does not qualify authentic private or unknown-context guards.',
      'The owner remains open until file completion. This helper makes no reset, reload, immediate-close or post-close download-survival claim.',
    ],
  };

  async function pairRemains(assessment = 'uncertain') {
    assert.equal((await driver.findElements(By.css(beforeSelector))).length, 1);
    assert.equal((await driver.findElements(By.css(afterSelector))).length, 1);
    assert.equal(
      await driver.findElement(By.css(beforeSelector)).getText(),
      originalBefore,
    );
    assert.equal(
      await driver.findElement(By.css(afterSelector)).getText(),
      originalAfter,
    );
    assert.equal(
      await driver
        .findElement(By.css(assessmentSelector))
        .getAttribute('value'),
      assessment,
    );
  }

  async function noPreview() {
    assert.equal((await driver.findElements(By.id('report-text'))).length, 0);
    assert.equal(
      (await driver.findElements(By.id('report-download'))).length,
      0,
    );
  }

  async function noDownload() {
    const deadline = Date.now() + quietObservationMs;
    do {
      assert.deepEqual(
        await readdir(directory),
        [],
        'Preparing, cancelling or invalidating a preview must not create download files',
      );
      await new Promise((resolve) => setTimeout(resolve, 50));
    } while (Date.now() < deadline);
  }

  async function prepare(assessment) {
    const button = await driver.findElement(By.id('report-prepare'));
    assert.equal(await button.isEnabled(), true);
    await button.click();
    const preview = await driver.wait(
      until.elementLocated(By.id('report-text')),
      10000,
    );
    assert.equal(await preview.getProperty('readOnly'), true);
    const text = await preview.getProperty('value');
    assert.equal(typeof text, 'string');
    assert(text.startsWith('# AddonRay investigation report\n\n'));
    assert(text.endsWith('\n'));
    assert(!text.includes('\r'));
    // Markdown escapes quotes and backslashes in code spans by design.
    const markdownMarker = '🧪 <b>fixture</b>';
    assert(
      text.includes(markdownMarker),
      'Report must include the fixture name',
    );
    assert(!text.includes(fixtureId), 'Report must omit the fixture ID');
    assert(
      !text.includes(investigationLabel),
      'Report must omit the internal investigation label',
    );
    assert(text.includes('## Before inventory\n'));
    assert(text.includes('## After inventory\n'));
    assert(text.includes('## Reported inventory changes\n'));
    const beforeInventory = text
      .split('## Before inventory\n\n')[1]
      ?.split('\n## After inventory')[0];
    const afterInventory = text
      .split('## After inventory\n\n')[1]
      ?.split('\n## Reported inventory changes')[0];
    assert(beforeInventory?.includes(markdownMarker));
    assert(afterInventory?.includes(markdownMarker));
    assert(text.includes(`## Your page assessment\n\n${assessment}.`));
    for (const milestone of [
      'DOM content loaded',
      'Load event completed',
      'First content displayed',
    ])
      assert(
        text.includes(
          `| ${milestone} | Not attached | Not attached | Needs two measured values |`,
        ),
      );
    for (const observation of [
      'Uncaught JavaScript error events',
      'Unhandled promise-rejection events',
      'Total observed events',
      'Observation duration',
      'Completion reason',
    ])
      assert(text.includes(`| ${observation} | Not attached | Not attached |`));
    assert(
      text.includes(
        'Missing or interrupted observations are not zero-error results.',
      ),
    );
    assert.equal(
      await driver.findElement(By.id('report-download')).isEnabled(),
      true,
    );
    return text;
  }

  async function setAssessment(value) {
    await driver
      .findElement(By.css(`input[name="page-assessment"][value="${value}"]`))
      .click();
    await driver.wait(
      async () =>
        (await driver.findElements(By.id('report-text'))).length === 0,
      10000,
    );
    await noPreview();
    await pairRemains(value);
  }

  await pairRemains();
  await noPreview();
  await noDownload();
  const initialMarkdown = await prepare('Uncertain');
  await noDownload();
  // Keep later raw file observations reachable in the runner's report even if
  // an exact-byte assertion fails. Only the final check asserts download success.
  const evidence = {
    authority: authorityDetail,
    quietObservationMs,
    stage: 'previewed',
    reviewedMarkdown: initialMarkdown,
    reviewedBytes: Buffer.byteLength(initialMarkdown, 'utf8'),
    reviewedSha256: sha256(Buffer.from(initialMarkdown, 'utf8')),
  };
  passed(
    `${authority}: report preparation is explicit and shows a readonly literal Markdown preview without downloading`,
    { reportExport: evidence },
  );

  await driver.findElement(By.id('report-cancel')).click();
  await driver.wait(
    async () => (await driver.findElements(By.id('report-text'))).length === 0,
    10000,
  );
  await noPreview();
  await pairRemains();
  await noDownload();
  passed(
    `${authority}: Cancel discards only the unsaved report preview and preserves the fixed investigation`,
    { reportExport: { quietObservationMs } },
  );

  assert.equal(await prepare('Uncertain'), initialMarkdown);
  await setAssessment('worse');
  const worseMarkdown = await prepare('Worse');
  assert.notEqual(worseMarkdown, initialMarkdown);
  await setAssessment('uncertain');
  await noDownload();
  passed(
    `${authority}: assessment edits invalidate the old report and fresh preparation reflects the current assessment`,
    { reportExport: { quietObservationMs, restoredAssessment: 'uncertain' } },
  );

  const reviewedMarkdown = await prepare('Uncertain');
  assert.equal(reviewedMarkdown, initialMarkdown);
  const reviewedBytes = Buffer.from(reviewedMarkdown, 'utf8');
  assert(reviewedBytes.length <= 1_048_576);
  evidence.stage = 'download-requested';
  await driver.findElement(By.id('report-download')).click();
  const downloaded = await driver.wait(
    async () => {
      const entries = await readdir(directory, { withFileTypes: true });
      evidence.observedDownloadEntries = entries.map((entry) => entry.name);
      assert(entries.every((entry) => entry.isFile()));
      const complete = entries.filter((entry) => entry.name.endsWith('.md'));
      assert(
        complete.length <= 1,
        'One Download report action must not create multiple Markdown files',
      );
      if (complete.length !== 1 || entries.length !== 1) return false;
      const downloadedPath = join(directory, complete[0].name);
      let bytes;
      try {
        bytes = await readFile(downloadedPath);
      } catch (error) {
        if (error.code === 'ENOENT') return false;
        throw error;
      }
      Object.assign(evidence, {
        stage: 'download-file-observed',
        filename: complete[0].name,
        downloadedPath,
        downloadedMarkdown: bytes.toString('utf8'),
        downloadedBytes: bytes.length,
        downloadedSha256: sha256(bytes),
        exactUtf8Match: bytes.equals(reviewedBytes),
      });
      if (bytes.length !== reviewedBytes.length) return false;
      return { filename: complete[0].name, downloadedPath, bytes };
    },
    15000,
    'The browser did not create one complete Markdown file of the reviewed UTF-8 size',
  );
  assert.equal(downloaded.filename, filename);
  assert.deepEqual(downloaded.bytes, reviewedBytes);
  const downloadedMarkdown = downloaded.bytes.toString('utf8');
  assert(!downloadedMarkdown.includes(fixtureId));
  assert(!downloadedMarkdown.includes(investigationLabel));
  await pairRemains();
  assert.equal(
    await driver.findElement(By.id('report-text')).getProperty('value'),
    reviewedMarkdown,
  );
  await driver.wait(
    async () =>
      (
        await driver
          .findElement(By.css('[aria-labelledby="report-heading"]'))
          .getText()
      ).includes(
        'Download requested. Check your browser downloads for its outcome.',
      ),
    10000,
  );
  Object.assign(evidence, {
    reviewedMarkdown,
    downloadedMarkdown,
    reviewedBytes: reviewedBytes.length,
    downloadedBytes: downloaded.bytes.length,
    reviewedSha256: sha256(reviewedBytes),
    downloadedSha256: sha256(downloaded.bytes),
    filename: downloaded.filename,
    downloadedPath: downloaded.downloadedPath,
    exactUtf8Match: true,
    fixtureIdExcluded: true,
    investigationLabelExcluded: true,
    ownerStayedOpenUntilFileCompletion: true,
    originalPairPreserved: true,
    assessment: 'uncertain',
  });
  // Preserve the browser-created file at its original path for caller-owned
  // lifetime checks and cleanup; never remove unrelated download files here.
  await driver.findElement(By.id('report-cancel')).click();
  await driver.wait(
    async () => (await driver.findElements(By.id('report-text'))).length === 0,
    10000,
  );
  await noPreview();
  await pairRemains();
  const deadline = Date.now() + quietObservationMs;
  do {
    assert.deepEqual(await readdir(directory), [filename]);
    assert.deepEqual(await readFile(downloaded.downloadedPath), reviewedBytes);
    await new Promise((resolve) => setTimeout(resolve, 50));
  } while (Date.now() < deadline);
  evidence.stage = 'verified';
  passed(
    `${authority}: Download report creates exactly the reviewed UTF-8 Markdown under the generic filename`,
    { reportExport: evidence },
  );

  await driver.findElement(By.id('report-format-json')).click();
  assert.equal(
    await driver.findElement(By.id('report-format-json')).isSelected(),
    true,
    'The JSON format control must be selected before preparation',
  );
  await driver.findElement(By.id('report-prepare')).click();
  const jsonPreview = await driver.wait(
    until.elementLocated(By.id('report-text')),
    10000,
  );
  assert.equal(
    await jsonPreview.getAttribute('aria-describedby'),
    'report-disclosure report-download-help',
  );
  const reviewedJson = await jsonPreview.getProperty('value');
  assert.equal(typeof reviewedJson, 'string');
  const parsedJson = assertExchangeJson(reviewedJson, {
    fixtureName,
    fixtureId,
    investigationLabel,
    assessment: 'uncertain',
    changeKind: fixtureInitiallyEnabled ? 'disabled' : 'enabled',
  });
  const reviewedJsonBytes = Buffer.from(reviewedJson, 'utf8');
  assert(reviewedJsonBytes.length <= 1_048_576);
  assert.equal(
    await driver.findElement(By.id('report-download')).isEnabled(),
    true,
  );
  const jsonState = {
    stage: 'previewed',
    reviewedJson,
    reviewedBytes: reviewedJsonBytes.length,
    reviewedSha256: sha256(reviewedJsonBytes),
    schemaKeys: Object.keys(parsedJson),
    reportKeys: Object.keys(parsedJson.report),
  };
  const jsonBefore = await snapshotJsonDownloads(directory);
  await driver.findElement(By.id('report-download')).click();
  const downloadedJson = await observeExactJsonDownload({
    driver,
    directory,
    expected: reviewedJson,
    before: jsonBefore,
  });
  assert(downloadedJson.filename.endsWith('.json'));
  assert.deepEqual(
    await readFile(downloadedJson.path),
    reviewedJsonBytes,
    'Downloaded JSON must equal the reviewed UTF-8 preview byte for byte',
  );
  assert.equal(
    await driver.findElement(By.id('report-text')).getProperty('value'),
    reviewedJson,
  );
  await driver.wait(
    async () =>
      (
        await driver
          .findElement(By.css('[aria-labelledby="report-heading"]'))
          .getText()
      ).includes(
        'Download requested. Check your browser downloads for its outcome.',
      ),
    10000,
  );
  await pairRemains();
  Object.assign(jsonState, {
    stage: 'verified',
    filename: downloadedJson.filename,
    downloadedPath: downloadedJson.path,
    downloadedBytes: downloadedJson.bytes,
    downloadedSha256: sha256(await readFile(downloadedJson.path)),
    exactUtf8Match: true,
    newlyObserved: downloadedJson.newlyObserved,
    observedEntries: downloadedJson.observedEntries,
    fixtureIdExcluded: true,
    investigationLabelExcluded: true,
    ownerStayedOpenUntilFileCompletion: true,
    originalPairPreserved: true,
    assessment: 'uncertain',
  });
  await driver.findElement(By.id('report-cancel')).click();
  await driver.wait(
    async () => (await driver.findElements(By.id('report-text'))).length === 0,
    10000,
  );
  await noPreview();
  await pairRemains();
  passed(
    `${authority}: live JSON report preview and download preserve the exact reviewed UTF-8 schema version 1 bytes`,
    { reportExport: { ...evidence, json: jsonState } },
  );
  return { ...evidence, json: jsonState };
}
