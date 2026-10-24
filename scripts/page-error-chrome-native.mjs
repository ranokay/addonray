/* global chrome */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir, platform, arch } from 'node:os';
import { createInterface } from 'node:readline/promises';
import { By, until } from 'selenium-webdriver';
import {
  launchChrome,
  extractChromePackage,
  installChromeExtension,
} from './chrome-session.mjs';
import { pageErrorFixtureHandler } from './page-error-fixture.mjs';

await mkdir('.scratch', { recursive: true });
const work = await mkdtemp(join(tmpdir(), 'addonray-error-native-'));
const product = join(work, 'product');
const extension = await extractChromePackage(product);
const server = createServer((request, response) => {
  if (!pageErrorFixtureHandler(request, response)) {
    response.writeHead(404);
    response.end();
  }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const sourceUrl = `http://127.0.0.1:${server.address().port}/page-errors/source`;
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
  installation: {
    mode: 'unmodified-unpacked-from-validated-zip',
    artifactSha256: extension.sha256,
  },
  checks: [],
  gaps: [
    'This helper records setup and post-native API assertions, not a human usability verdict. Native observations are recorded separately. Direct physical callback instrumentation is absent from the unmodified product.',
  ],
};
let session, input;
const passed = (name) => report.checks.push({ name, status: 'passed' });
try {
  session = await launchChrome({ headless: false });
  report.browserVersion = session.version;
  report.driverVersion = session.driverVersion;
  const id = await installChromeExtension(session.cdp, product);
  const { driver } = session;
  await driver.get(sourceUrl);
  const sourceHandle = await driver.getWindowHandle();
  console.log(
    `Unmodified Chrome ${session.version} ready. Through its actual popup, approve inventory, open a page-error check, Start, reproduce one page-owned pair, then Stop. Leave the populated check open and both optional grants approved.`,
  );
  input = createInterface({ input: process.stdin, output: process.stdout });
  await input.question(
    'Press Enter after recording native observations for actual permission-revocation checks and cleanup. ',
  );
  const handles = await driver.getAllWindowHandles();
  let owner;
  for (const handle of handles) {
    await driver.switchTo().window(handle);
    if (
      (await driver.getCurrentUrl()) ===
      `chrome-extension://${id}/page-error.html`
    ) {
      if (
        (await driver.findElements(By.id('page-error-summary'))).length === 1
      ) {
        owner = handle;
        break;
      }
    }
  }
  assert(owner, 'Leave one native check with a confirmed summary open');
  async function summary() {
    return driver.executeScript(() =>
      document.querySelector('#page-error-summary')
        ? {
            scriptErrors: document.querySelector('#page-error-script-errors')
              ?.textContent,
            unhandledRejections: document.querySelector(
              '#page-error-rejections',
            )?.textContent,
            total: document.querySelector('#page-error-total')?.textContent,
          }
        : null,
    );
  }
  const expected = { scriptErrors: '1', unhandledRejections: '1', total: '2' };
  assert.deepEqual(await summary(), expected);
  report.nativeRetainedCounts = await summary();
  assert.equal(
    await driver.executeAsyncScript((done) =>
      chrome.permissions
        .contains({ permissions: ['management', 'scripting'] })
        .then(done),
    ),
    true,
  );
  passed(
    'Unmodified check retains the confirmed native error/rejection pair and actual optional grants',
  );
  async function revoke(name) {
    assert.equal(
      await driver.executeAsyncScript(
        (name, done) =>
          chrome.permissions.remove({ permissions: [name] }).then(done),
        name,
      ),
      true,
    );
    await driver.wait(
      async () =>
        (await driver
          .findElement(By.id('page-error-status'))
          .getAttribute('data-phase')) === 'ready',
      10000,
    );
    assert.equal(
      (await driver.findElements(By.id('page-error-summary'))).length,
      0,
    );
    assert.equal(await summary(), null);
  }
  await revoke('management');
  passed(
    'Actual optional management revocation clears a populated unmodified page-error check',
  );
  await driver.findElement(By.id('page-error-start')).click();
  await driver.wait(
    async () =>
      (await driver
        .findElement(By.id('page-error-status'))
        .getAttribute('data-phase')) === 'observing',
    10000,
  );
  await driver.switchTo().window(sourceHandle);
  const before = await driver.executeScript(() => ({
    errors: globalThis.errorPositive.errors,
    rejections: globalThis.errorPositive.rejections,
  }));
  await driver.findElement(By.id('error-emit')).click();
  await driver.wait(
    () =>
      driver.executeScript(
        (previous) =>
          globalThis.errorPositive.errors >= previous.errors + 1 &&
          globalThis.errorPositive.rejections >= previous.rejections + 1,
        before,
      ),
    10000,
  );
  await driver.switchTo().window(owner);
  await driver.findElement(By.id('page-error-stop')).click();
  await driver.wait(until.elementLocated(By.id('page-error-summary')), 10000);
  assert.deepEqual(await summary(), expected);
  await revoke('scripting');
  passed(
    'After a fresh explicit check, actual optional scripting revocation clears its confirmed counts',
  );
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
      report.browserClosed = true;
    } catch (error) {
      report.cleanupFailure = String(error);
      process.exitCode = 1;
    }
  }
  await new Promise((done) => {
    server.closeAllConnections();
    server.close(done);
  });
  report.serverClosed = true;
  await writeFile(
    resolve('.scratch/page-error-chrome-native-api.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
}
