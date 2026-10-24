/* global chrome */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir, platform, arch } from 'node:os';
import { createInterface } from 'node:readline/promises';
import { By, until } from 'selenium-webdriver';
import { checkTimingHandoff } from './timing-handoff-checks.mjs';
import { pageErrorFixtureHandler } from './page-error-fixture.mjs';
import {
  launchChrome,
  extractChromePackage,
  installChromeExtension,
} from './chrome-session.mjs';

await mkdir('.scratch', { recursive: true });
const work = await mkdtemp(join(tmpdir(), 'addonray-chrome-native-'));
const product = join(work, 'product');
const extension = await extractChromePackage(product);
const fixture = join(work, 'fixture');
await mkdir(fixture);
await writeFile(
  join(fixture, 'manifest.json'),
  JSON.stringify({
    manifest_version: 3,
    name: 'Controlled popup fixture',
    version: '1.0',
    permissions: ['storage'],
  }),
);
const server = createServer((request, response) => {
  if (pageErrorFixtureHandler(request, response)) return;
  response.setHeader('Content-Type', 'text/html');
  response.end(
    '<!doctype html><title>AddonRay disposable Chrome check</title><h1>Controlled local page</h1>',
  );
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const report = {
  timestamp: new Date().toISOString(),
  distribution: 'Chrome for Testing',
  os: `${platform()} ${arch()}`,
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim(),
  sourceDirty: Boolean(
    execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
  ),
  browserVersion: null,
  driverVersion: null,
  installation: {
    mode: 'unpacked-from-validated-zip',
    artifactSha256: extension.sha256,
  },
  checks: [],
  gaps: [
    'Actual native consent and keyboard/lifetime observations require a separate human/computer-use evidence record. This helper does not issue a native UI verdict.',
  ],
};
let session, input;
try {
  session = await launchChrome({ headless: false });
  report.browserVersion = session.version;
  report.driverVersion = session.driverVersion;
  await installChromeExtension(session.cdp, fixture);
  const productId = await installChromeExtension(session.cdp, product);
  await session.driver.get(
    `http://127.0.0.1:${server.address().port}/page-errors/source`,
  );
  console.log(
    `Disposable Chrome for Testing ${session.version}, driver ${session.driverVersion}, is ready.`,
  );
  console.log(
    'Record native page-error launch, Start consent, page-owned reproduction, Stop, reset and cleanup, plus the existing inventory/timing flow. Retain both optional grants for the post-consent checks.',
  );
  input = createInterface({ input: process.stdin, output: process.stdout });
  await input.question(
    'Press Enter after observations to verify retained access, timing handoff and optional-permission revocation, then close the test browser. ',
  );
  const { driver } = session;
  await driver.get(`chrome-extension://${productId}/popup.html`);
  await driver.wait(until.elementLocated(By.css('h1')), 10000);
  assert.equal(
    (await driver.findElements(By.css('.inventory > li'))).length,
    0,
  );
  assert.equal(
    await driver.executeAsyncScript((done) =>
      chrome.permissions.contains({ permissions: ['management'] }).then(done),
    ),
    true,
    'Complete native inventory approval before continuing.',
  );
  await driver
    .findElement(By.xpath('//button[contains(.,"Allow inventory")]'))
    .click();
  await driver.wait(until.elementLocated(By.id('inventory-search')), 10000);
  assert(
    (await driver.findElement(By.css('.inventory')).getText()).includes(
      'Controlled popup fixture',
    ),
  );
  report.checks.push({
    name: 'Unmodified production document starts empty and reads controlled inventory only after an action with a retained native grant',
    status: 'passed',
  });
  const popupHandle = await driver.getWindowHandle();
  await driver.switchTo().newWindow('tab');
  await driver.get(`chrome-extension://${productId}/investigation.html`);
  await driver.wait(until.elementLocated(By.id('capture-before')), 10000);
  assert.equal(
    (await driver.findElements(By.css('[data-testid="before-snapshot"]')))
      .length,
    0,
  );
  await driver.findElement(By.id('capture-before')).click();
  await driver.wait(
    until.elementLocated(By.css('[data-testid="before-snapshot"]')),
    10000,
  );
  await driver.findElement(By.id('capture-after')).click();
  await driver.wait(
    until.elementLocated(By.css('[data-testid="after-snapshot"]')),
    10000,
  );
  await driver
    .findElement(By.css('input[name="page-assessment"][value="uncertain"]'))
    .click();
  report.checks.push({
    name: 'Unmodified investigation starts empty and captures a fixed pair and explicit assessment after native optional approval',
    status: 'passed',
  });
  const comparisonHandle = await driver.getWindowHandle();
  const popupUrl = `chrome-extension://${productId}/popup.html`;
  await checkTimingHandoff({
    driver,
    cdp: session.cdp,
    browser: 'chrome',
    productId,
    popupUrl,
    investigationUrl: `chrome-extension://${productId}/investigation.html`,
    localUrl: `http://127.0.0.1:${server.address().port}/`,
    grantPermissions: async () => {
      assert.equal(
        await driver.executeAsyncScript((done) =>
          chrome.permissions
            .contains({ permissions: ['management', 'scripting'] })
            .then(done),
        ),
        true,
        'Complete native page and inventory approval before continuing.',
      );
    },
    revokeScripting: () =>
      driver.executeAsyncScript((done) =>
        chrome.permissions.remove({ permissions: ['scripting'] }).then(done),
      ),
    authority:
      'Unmodified Chrome product with retained native optional management/scripting approval',
    report,
    passed: (name) => report.checks.push({ name, status: 'passed' }),
  });
  // Refill the existing views after scripting revocation so management revocation
  // independently proves clearing populated inventories and assessment as well.
  await driver.switchTo().window(popupHandle);
  await driver
    .findElement(By.xpath('//button[contains(.,"Allow inventory")]'))
    .click();
  await driver.wait(until.elementLocated(By.id('inventory-search')), 10000);
  await driver.switchTo().window(comparisonHandle);
  await driver.findElement(By.id('capture-before')).click();
  await driver.wait(
    until.elementLocated(By.css('[data-testid="before-snapshot"]')),
    10000,
  );
  await driver.findElement(By.id('capture-after')).click();
  await driver.wait(
    until.elementLocated(By.css('[data-testid="after-snapshot"]')),
    10000,
  );
  await driver
    .findElement(By.css('input[name="page-assessment"][value="uncertain"]'))
    .click();
  assert.equal(
    await driver.executeAsyncScript((done) =>
      chrome.permissions.remove({ permissions: ['management'] }).then(done),
    ),
    true,
  );
  await driver.wait(
    async () =>
      (
        await driver.findElements(
          By.css(
            '[data-testid="before-snapshot"], [data-testid="after-snapshot"], input[name="page-assessment"]',
          ),
        )
      ).length === 0,
    10000,
  );
  report.checks.push({
    name: 'Actual optional management revocation clears both investigation snapshots and the assessment',
    status: 'passed',
  });
  await driver.switchTo().window(popupHandle);
  await driver.wait(
    async () =>
      (await driver.findElements(By.id('inventory-search'))).length === 0,
    10000,
  );
  report.checks.push({
    name: 'The same actual optional revocation also clears the independently loaded production popup document',
    status: 'passed',
  });
  report.result = 'passed-with-qualification-gaps';
} catch (error) {
  report.result = 'failed';
  report.failure = String(error);
  process.exitCode = 1;
  console.error(error);
} finally {
  input?.close();
  process.stdin.pause();
  if (session) {
    session.cdp.close();
    try {
      await session.driver.quit();
    } catch (error) {
      report.cleanupFailure = String(error);
      process.exitCode = 1;
    }
  }
  await new Promise((done) => {
    server.closeAllConnections();
    server.close(done);
  });
  await writeFile(
    '.scratch/chrome-native-api-evidence.json',
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(
    `Post-consent API result: ${report.result}; this is not an automatic native UI verdict.`,
  );
}
