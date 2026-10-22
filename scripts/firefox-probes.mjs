/* global browser, ChromeUtils, WebExtensionPolicy */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { platform, arch } from 'node:os';
import { Builder, By, until } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';

// Selenium Manager's download telemetry is independent of the product. Disable it here too.
process.env.SE_AVOID_STATS = 'true';
await mkdir('.scratch', { recursive: true });
const work = await mkdtemp(resolve('.scratch/firefox-'));
const fixtureId = 'controlled-fixture@addonray.test';
const harnessId = 'api-harness@addonray.test';
const productId = 'addonray@ranokay.dev';
const report = {
  timestamp: new Date().toISOString(),
  os: `${platform()} ${arch()}`,
  sourceCommit: null,
  sourceDirty: true,
  browserVersion: null,
  checks: [],
  gaps: [
    'Toolbar-popup consent/lifetime and selected-page interaction need a manual check. Consent tests below open the actual popup document in a browser tab.',
    'The local-page isolation probe uses a test-only harness with host access. The product activeTab grant is checked separately; interactive popup adapter/lifetime behavior is still unqualified.',
    'Minimum Firefox 140, ESR, Linux, Windows, and enterprise policy behavior are not qualified by this run.',
  ],
};
try {
  report.sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  report.sourceDirty = Boolean(
    execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
  );
} catch {
  /* An initial unborn repository has no commit identity. */
}

async function fixture(name, id, extra = {}) {
  const directory = join(work, name);
  await mkdir(directory);
  await writeFile(
    join(directory, 'manifest.json'),
    JSON.stringify({
      manifest_version: 3,
      name,
      version: '1.0',
      browser_specific_settings: {
        gecko: { id, data_collection_permissions: { required: ['none'] } },
      },
      ...extra,
    }),
  );
  await writeFile(
    join(directory, 'probe.html'),
    '<!doctype html><html><head><title>AddonRay test fixture</title></head><body><h1>Controlled API fixture</h1></body></html>',
  );
  return directory;
}

const ordinary = await fixture('Controlled ordinary extension', fixtureId, {
  permissions: ['storage'],
  host_permissions: ['https://example.invalid/*'],
});
const harness = await fixture('AddonRay API harness', harnessId, {
  // Test-only authority must never be copied into the product manifest.
  permissions: ['management', 'scripting', 'tabs'],
  host_permissions: ['<all_urls>'],
});
const server = createServer((_request, response) => {
  response.setHeader('Content-Type', 'text/html');
  response.end(
    '<!doctype html><html><head><title>Local fixture</title></head><body><h1>Controlled local page</h1><script>window.addonrayPageMarker = true</script></body></html>',
  );
});
await new Promise((accept) => server.listen(0, '127.0.0.1', accept));
const localUrl = `http://127.0.0.1:${server.address().port}/`;
let driver;

function passed(name, details = {}) {
  report.checks.push({ name, status: 'passed', ...details });
  console.log(`Passed: ${name}`);
}

try {
  driver = await new Builder()
    .forBrowser('firefox')
    // Only this disposable profile permits browser-UI automation for prompt buttons/fixtures.
    .setFirefoxService(
      new firefox.ServiceBuilder().addArguments('--allow-system-access'),
    )
    .setFirefoxOptions(new firefox.Options().addArguments('-headless'))
    .build();
  await driver.manage().setTimeouts({ script: 15000, pageLoad: 30000 });
  report.browserVersion = (await driver.getCapabilities()).get(
    'browserVersion',
  );
  for (const extension of [ordinary, harness, resolve('.output/firefox-mv3')]) {
    await driver.installWebExtension(extension, { permanent: false });
  }

  async function extensionUrl(id, path) {
    await driver.setContext('chrome');
    const url = await driver.executeScript(
      (extensionId, resource) =>
        WebExtensionPolicy.getByID(extensionId).getURL(resource),
      id,
      path,
    );
    await driver.setContext('content');
    return url;
  }
  const productUrl = await extensionUrl(productId, 'popup.html');
  const harnessUrl = await extensionUrl(harnessId, 'probe.html');
  await driver.get(productUrl);
  await driver.wait(until.elementLocated(By.css('h1')), 10000);
  assert.equal(await driver.findElement(By.css('h1')).getText(), 'AddonRay');
  assert.equal((await driver.findElements(By.css('.inventory li'))).length, 0);
  passed('Actual production document starts without inventory');

  async function inventoryAction(allow) {
    await driver
      .findElement(By.xpath('//button[contains(.,"Allow inventory")]'))
      .click();
    await driver.setContext('chrome');
    const selector = `#addon-webext-permissions-notification .popup-notification-${allow ? 'primary' : 'secondary'}-button`;
    const button = await driver.wait(
      until.elementLocated(By.css(selector)),
      10000,
    );
    await driver.wait(until.elementIsVisible(button), 10000);
    // Firefox chrome does not expose WebDriver shadow-root commands.
    await driver.wait(
      () =>
        driver.executeScript(
          (element) => !element.shadowRoot.querySelector('button').disabled,
          button,
        ),
      10000,
    );
    await driver.executeScript(
      (element) => element.shadowRoot.querySelector('button').click(),
      button,
    );
    await driver.setContext('content');
  }
  await inventoryAction(false);
  await driver.wait(
    async () =>
      (await driver.findElement(By.css('body')).getText()).includes(
        'Inventory access was declined.',
      ),
    10000,
  );
  assert.equal((await driver.findElements(By.css('.inventory li'))).length, 0);
  passed('Actual optional management permission denial');
  await inventoryAction(true);
  await driver.wait(until.elementLocated(By.css('.inventory li')), 10000);
  assert(
    (await driver.findElement(By.css('.inventory')).getText()).includes(
      'Controlled ordinary extension',
    ),
  );
  passed(
    'Actual optional management permission approval and production inventory',
  );
  await writeFile(
    resolve('.scratch/phase0-ui.png'),
    Buffer.from(await driver.takeScreenshot(), 'base64'),
  );

  await driver.findElement(By.css('header button')).click();
  assert.equal((await driver.findElements(By.css('.inventory li'))).length, 0);
  await driver
    .findElement(By.xpath('//button[contains(.,"Allow inventory")]'))
    .click();
  await driver.wait(until.elementLocated(By.css('.inventory li')), 10000);
  await driver.navigate().refresh();
  await driver.wait(until.elementLocated(By.css('h1')), 10000);
  assert.equal((await driver.findElements(By.css('.inventory li'))).length, 0);
  passed('Clear and document reopen discard production inventory');

  await driver
    .findElement(By.xpath('//button[contains(.,"Allow inventory")]'))
    .click();
  await driver.wait(until.elementLocated(By.css('.inventory li')), 10000);
  const revoked = await driver.executeAsyncScript((done) =>
    browser.permissions.remove({ permissions: ['management'] }).then(done),
  );
  assert.equal(revoked, true);
  await driver.wait(
    async () =>
      (await driver.findElements(By.css('.inventory li'))).length === 0,
    10000,
  );
  passed('Real permission revocation clears the production inventory');

  await driver
    .findElement(By.xpath('//button[contains(.,"Allow page access")]'))
    .click();
  await driver.wait(
    () =>
      driver.executeAsyncScript((done) =>
        browser.permissions.contains({ permissions: ['scripting'] }).then(done),
      ),
    10000,
  );
  await driver.get(localUrl);
  const selectedWindow = await driver.getWindowHandle();
  await driver.setContext('chrome');
  await driver.findElement(By.id('unified-extensions-button')).click();
  await driver
    .findElement(
      By.css(
        '[data-extensionid="addonray@ranokay.dev"] .unified-extensions-item-action-button',
      ),
    )
    .click();
  await driver.wait(
    until.elementLocated(By.css('.webextension-popup-browser')),
    10000,
  );
  await driver.executeScript(() =>
    document
      .querySelector('.webextension-popup-browser')
      .closest('panel')
      .hidePopup(),
  );
  await driver.setContext('content');
  await driver.switchTo().newWindow('tab');
  const productWindow = await driver.getWindowHandle();
  await driver.get(productUrl);
  const activeTab = await driver.executeAsyncScript((url, done) => {
    browser.tabs
      .query({})
      .then(async (tabs) => {
        const target = tabs.find((tab) => tab.url === url);
        if (!target) return done({ succeeded: false, targetMissing: true });
        try {
          const result = await browser.scripting.executeScript({
            target: { tabId: target.id, frameIds: [0] },
            func: () => document.readyState,
          });
          done({ succeeded: result[0]?.result === 'complete' });
        } catch {
          done({ succeeded: false });
        }
      })
      .catch(() => done({ succeeded: false }));
  }, localUrl);
  assert.equal(activeTab.succeeded, true, JSON.stringify(activeTab));
  passed(
    'Production extension receives selected-tab access from its actual toolbar action without host permissions',
  );
  await driver.switchTo().window(selectedWindow);
  await driver.close();
  await driver.switchTo().window(productWindow);

  await driver.get(harnessUrl);
  const enabled = await driver.executeAsyncScript((id, done) => {
    browser.management
      .getAll()
      .then((entries) => {
        const entry = entries.find((item) => item.id === id);
        done({
          enabled: entry.enabled,
          permissions: entry.permissions ?? null,
          hostPermissions: entry.hostPermissions ?? null,
        });
      })
      .catch((error) => done({ error: String(error) }));
  }, fixtureId);
  assert.equal(enabled.enabled, true);
  assert(enabled.permissions.includes('storage'));
  passed('Enabled fixture inventory exposes declared API permissions', enabled);

  // Only the controlled fixture is changed, through the test driver's browser privilege.
  await driver.setContext('chrome');
  await driver.executeAsyncScript((id, done) => {
    const { AddonManager } = ChromeUtils.importESModule(
      'resource://gre/modules/AddonManager.sys.mjs',
    );
    AddonManager.getAddonByID(id)
      .then((addon) => addon.disable())
      .then(
        () => done(true),
        (error) => done(String(error)),
      );
  }, fixtureId);
  await driver.setContext('content');
  const disabled = await driver.executeAsyncScript((id, done) => {
    browser.management.getAll().then((entries) => {
      const entry = entries.find((item) => item.id === id);
      done({
        enabled: entry.enabled,
        permissions: entry.permissions ?? null,
        hostPermissions: entry.hostPermissions ?? null,
      });
    });
  }, fixtureId);
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.permissions, null);
  assert.equal(disabled.hostPermissions, null);
  passed('Disabled fixture omits permission metadata', disabled);

  const toggle = await driver.executeAsyncScript((id, done) => {
    browser.management.setEnabled(id, true).then(
      () => done({ rejected: false }),
      () => done({ rejected: true }),
    );
  }, fixtureId);
  assert.equal(toggle.rejected, true);
  const stillDisabled = await driver.executeAsyncScript(
    (id, done) =>
      browser.management.get(id).then((entry) => done(!entry.enabled)),
    fixtureId,
  );
  assert.equal(stillDisabled, true);
  passed('Ordinary extension toggling rejected and fixture state unchanged');

  const local = await driver.executeAsyncScript((url, done) => {
    browser.tabs.create({ url, active: false }).then(async (tab) => {
      for (let count = 0; count < 100; count += 1) {
        const current = await browser.tabs.get(tab.id);
        if (current.status === 'complete' && current.url === url)
          return done(tab.id);
        await new Promise((accept) => setTimeout(accept, 100));
      }
      done(null);
    });
  }, localUrl);
  assert.equal(typeof local, 'number');
  const pageMarker = await driver.executeAsyncScript((tabId, done) => {
    browser.scripting
      .executeScript({
        target: { tabId },
        world: 'MAIN',
        func: () => window.addonrayPageMarker === true,
      })
      .then((results) => done(results[0].result));
  }, local);
  assert.equal(pageMarker, true);
  const page = await driver.executeAsyncScript((tabId, done) => {
    browser.scripting
      .executeScript({
        target: { tabId, frameIds: [0] },
        func: () => ({
          readyState: document.readyState,
          types:
            typeof PerformanceObserver === 'undefined'
              ? null
              : [...PerformanceObserver.supportedEntryTypes],
          isolated: typeof window.addonrayPageMarker === 'undefined',
        }),
      })
      .then(
        (result) => done(result[0].result),
        (error) => done({ error: String(error) }),
      );
  }, local);
  assert(['loading', 'interactive', 'complete'].includes(page.readyState));
  assert.equal(page.isolated, true);
  passed(
    'Local-page injection and isolated world via test-only host grant',
    page,
  );

  const harnessWindow = await driver.getWindowHandle();
  for (const url of ['about:addons', 'https://addons.mozilla.org/']) {
    // Firefox can reject tabs.create for privileged URLs. Navigate through the test driver.
    await driver.switchTo().newWindow('tab');
    const protectedWindow = await driver.getWindowHandle();
    await driver.get(url);
    const reachedUrl = await driver.getCurrentUrl();
    if (url.startsWith('about:')) assert.equal(reachedUrl, url);
    else assert.equal(new URL(reachedUrl).origin, new URL(url).origin);
    await driver.switchTo().window(harnessWindow);
    const denied = await driver.executeAsyncScript((url, done) => {
      browser.tabs
        .query({})
        .then(async (tabs) => {
          const tab = tabs.find((item) => item.url === url);
          if (!tab) return done({ blocked: false, missingTarget: true });
          try {
            const results = await browser.scripting.executeScript({
              target: { tabId: tab.id },
              func: () => {
                document.documentElement.setAttribute(
                  'data-addonray-probe',
                  'ran',
                );
                return document.readyState;
              },
            });
            done({
              blocked: !results.some(
                (entry) => typeof entry?.result === 'string',
              ),
              mode: 'no-usable-frame-result',
            });
          } catch {
            done({ blocked: true, mode: 'promise-rejection' });
          }
        })
        .catch((error) => done({ blocked: false, error: String(error) }));
    }, reachedUrl);
    assert.equal(denied.blocked, true, JSON.stringify(denied));
    await driver.switchTo().window(protectedWindow);
    const marker = await driver.executeScript(() =>
      document.documentElement.hasAttribute('data-addonray-probe'),
    );
    assert.equal(marker, false);
    passed(
      `Protected context supplies no observation or injection marker: ${url}`,
      { mode: denied.mode },
    );
    await driver.close();
    await driver.switchTo().window(harnessWindow);
  }
  report.result = 'passed-with-qualification-gaps';
} catch (error) {
  report.result = 'failed';
  report.failure = String(error);
  if (driver) {
    try {
      await writeFile(
        resolve('.scratch/firefox-failure.png'),
        Buffer.from(await driver.takeScreenshot(), 'base64'),
      );
    } catch (screenshotError) {
      report.screenshotFailure = String(screenshotError);
    }
  }
  process.exitCode = 1;
  console.error(String(error));
} finally {
  if (driver) {
    try {
      await driver.quit();
    } catch (cleanupError) {
      report.cleanupFailure = String(cleanupError);
      process.exitCode = 1;
    }
  }
  await new Promise((accept) => {
    server.closeAllConnections();
    server.close(accept);
  });
  const destination = resolve('.scratch/firefox-evidence.json');
  await writeFile(destination, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    `Result: ${report.result}; ${report.checks.length} observed checks.`,
  );
  for (const gap of report.gaps) console.log(`Unqualified: ${gap}`);
  console.log(`Firefox evidence: ${destination}`);
}
