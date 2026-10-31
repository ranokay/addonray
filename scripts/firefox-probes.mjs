/* global browser, ChromeUtils, WebExtensionPolicy */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { platform, arch } from 'node:os';
import { Builder, By, until } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';
import { installTemporaryExtension } from './firefox-install.mjs';
import { extensionArchive } from './package-paths.mjs';
import { sha256 } from './check-package.mjs';
import { checkInvestigation } from './investigation-checks.mjs';
import { checkTimingHandoff } from './timing-handoff-checks.mjs';
import { prepareHandoffFixture } from './timing-handoff-fixture.mjs';
import { checkFirefoxPrivateHandoff } from './timing-private-checks.mjs';
import {
  preparePageErrorFixture,
  pageErrorFixtureHandler,
} from './page-error-fixture.mjs';
import { checkPageErrors } from './page-error-checks.mjs';
import { pageErrorDriverControls } from './page-error-driver-controls.mjs';
import { preparePageErrorComparisonFixture } from './page-error-comparison-fixture.mjs';
import { checkPageErrorComparisons } from './page-error-comparison-checks.mjs';
import {
  checkTimings,
  prepareTimingModule,
  timingFixtures,
} from './timing-checks.mjs';

// Selenium Manager's download telemetry is independent of the product. Disable it here too.
process.env.SE_AVOID_STATS = 'true';
process.env.SE_DRIVER_VERSION = '0.37.1';
process.env.SE_SKIP_DRIVER_IN_PATH = 'true';
process.env.SE_SKIP_BROWSER_IN_PATH = 'true';
const usePackage = process.argv.includes('--package');
const productArtifact = usePackage
  ? extensionArchive
  : resolve('.output/firefox-mv3');
const requestedVersion = process.env.FIREFOX_VERSION;
if (requestedVersion) {
  assert.match(requestedVersion, /^\d+\.\d+(?:\.\d+)?(?:esr)?$/);
}
await mkdir('.scratch', { recursive: true });
const work = await mkdtemp(resolve('.scratch/firefox-'));
const reportDirectory = join(work, 'report-downloads');
await mkdir(reportDirectory);
const fixtureId = 'controlled-fixture@addonray.test';
const harnessId = 'api-harness@addonray.test';
const productId = 'addonray@ranokay.dev';
const report = {
  timestamp: new Date().toISOString(),
  os: `${platform()} ${arch()}`,
  sourceCommit: null,
  sourceDirty: true,
  browserVersion: null,
  geckodriverVersion: null,
  requestedVersion: requestedVersion ?? null,
  installation: {
    mode: usePackage ? 'temporary-unsigned-xpi' : 'temporary-directory',
    artifactSha256: usePackage ? sha256(await readFile(productArtifact)) : null,
  },
  checks: [],
  gaps: [
    'This headless run does not exercise native-popup consent/lifetime. Consult the separate native-popup evidence.',
    'Investigation route checks use the unmodified product with an actually approved optional management grant. Their popup launcher is rendered in a browser tab; native toolbar-popup launch and full-tab consent/usability need separate evidence.',
    'The local-page isolation probe uses a test-only harness with host access. The product activeTab grant is checked separately; native popup interaction has separate evidence.',
    'This run covers only its recorded browser version and OS. Other versions, operating systems, and enterprise policy behavior remain outside its evidence.',
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
await prepareTimingModule(harness);
const handoffDirectory = join(work, 'timing-source-fixture');
report.timingHandoffFixture = await prepareHandoffFixture(handoffDirectory);
const pageErrorDirectory = join(work, 'page-error-source-fixture');
report.pageErrorFixture = await preparePageErrorFixture(
  pageErrorDirectory,
  'firefox',
);
const errorComparisonDirectory = join(work, 'page-error-comparison-fixture');
report.pageErrorComparisonFixture = await preparePageErrorComparisonFixture(
  errorComparisonDirectory,
  'firefox',
);
const timing = timingFixtures();
const server = createServer((request, response) => {
  if (pageErrorFixtureHandler(request, response)) return;
  if (timing.handle(request, response)) return;
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
  const options = new firefox.Options()
    .addArguments('-headless')
    // Fixture-only download settings; the product does not control save dialogs.
    .setPreference('browser.download.folderList', 2)
    .setPreference('browser.download.dir', reportDirectory)
    .setPreference('browser.download.useDownloadDir', true)
    .setPreference(
      'browser.download.always_ask_before_handling_new_types',
      false,
    )
    .setPreference(
      'browser.helperApps.neverAsk.saveToDisk',
      'text/markdown,text/plain',
    );
  if (requestedVersion) options.setBrowserVersion(requestedVersion);
  driver = await new Builder()
    .forBrowser('firefox')
    // Only this disposable profile permits browser-UI automation for prompt buttons/fixtures.
    .setFirefoxService(
      new firefox.ServiceBuilder().addArguments('--allow-system-access'),
    )
    .setFirefoxOptions(options)
    .build();
  await driver.manage().setTimeouts({ script: 15000, pageLoad: 30000 });
  report.browserVersion = (await driver.getCapabilities()).get(
    'browserVersion',
  );
  if (requestedVersion) {
    assert.equal(report.browserVersion, requestedVersion.replace(/esr$/, ''));
  }
  report.geckodriverVersion = (await driver.getCapabilities()).get(
    'moz:geckodriverVersion',
  );
  assert.equal(report.geckodriverVersion, '0.37.1');
  for (const extension of [
    ordinary,
    harness,
    productArtifact,
    handoffDirectory,
    pageErrorDirectory,
    errorComparisonDirectory,
  ]) {
    await installTemporaryExtension(driver, extension);
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
  const investigationUrl = await extensionUrl(productId, 'investigation.html');
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
          (element) =>
            !(element.shadowRoot?.querySelector('button') ?? element).disabled,
          button,
        ),
      10000,
    );
    await driver.executeScript(
      (element) =>
        (element.shadowRoot?.querySelector('button') ?? element).click(),
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

  const searchInput = () => driver.findElement(By.id('inventory-search'));
  const stateFilter = () => driver.findElement(By.id('inventory-state'));
  const inventoryRows = () => driver.findElements(By.css('.inventory > li'));
  async function searchInventory(value) {
    await (await searchInput()).clear();
    if (value) await (await searchInput()).sendKeys(value);
  }
  async function filterState(value) {
    await driver
      .findElement(By.css(`#inventory-state option[value="${value}"]`))
      .click();
  }
  assert.equal(
    await driver.executeScript(
      () => getComputedStyle(document.documentElement).colorScheme,
    ),
    'dark',
  );
  await searchInventory('  CONTROLLED ordinary  ');
  await driver.wait(async () => (await inventoryRows()).length === 1, 10000);
  await filterState('disabled');
  await driver.wait(until.elementLocated(By.css('.empty h3')), 10000);
  assert.equal(
    await driver.findElement(By.css('.empty h3')).getText(),
    'No matching extensions',
  );
  await driver.findElement(By.xpath('//button[.="Reset filters"]')).click();
  assert.equal(await (await searchInput()).getAttribute('value'), '');
  assert.equal(await (await stateFilter()).getAttribute('value'), 'all');
  await searchInventory(fixtureId);
  assert.equal((await inventoryRows()).length, 1);
  await driver.findElement(By.css('.inventory summary')).click();
  const permissionText = await driver
    .findElement(By.css('.permission-details'))
    .getText();
  assert(permissionText.includes('storage'));
  assert(permissionText.includes('save and retrieve data'));
  assert(permissionText.includes('https://example.invalid/*'));
  assert.equal(
    (await driver.findElements(By.css('.permission-details a'))).length,
    0,
  );
  await searchInventory('example.invalid');
  assert.equal((await inventoryRows()).length, 1);
  await searchInventory('storage');
  assert.equal((await inventoryRows()).length, 1);
  passed(
    'Production dark inventory search, state filtering and permission explanations',
  );

  await driver
    .findElement(By.xpath('//button[contains(.,"Allow inventory")]'))
    .click();
  await driver.wait(until.elementLocated(By.id('inventory-search')), 10000);
  assert.equal(await (await searchInput()).getAttribute('value'), '');
  assert.equal(await (await stateFilter()).getAttribute('value'), 'all');
  assert.equal(
    (await driver.findElements(By.css('.inventory details[open]'))).length,
    0,
  );
  passed('Inventory refresh discards search, filters and expanded details');
  await writeFile(
    resolve('.scratch/phase0-ui.png'),
    Buffer.from(await driver.takeScreenshot(), 'base64'),
  );

  await driver.findElement(By.css('header button')).click();
  assert.equal((await driver.findElements(By.css('.inventory li'))).length, 0);
  assert.equal(
    (await driver.findElements(By.id('inventory-search'))).length,
    0,
  );
  await driver
    .findElement(By.xpath('//button[contains(.,"Allow inventory")]'))
    .click();
  await driver.wait(until.elementLocated(By.css('.inventory li')), 10000);
  assert.equal(await (await searchInput()).getAttribute('value'), '');
  await searchInventory('Controlled');
  await driver.navigate().refresh();
  await driver.wait(until.elementLocated(By.css('h1')), 10000);
  assert.equal((await driver.findElements(By.css('.inventory li'))).length, 0);
  assert.equal(
    (await driver.findElements(By.id('inventory-search'))).length,
    0,
  );
  passed('Clear and document reopen discard production inventory');

  await driver
    .findElement(By.xpath('//button[contains(.,"Allow inventory")]'))
    .click();
  await driver.wait(until.elementLocated(By.css('.inventory li')), 10000);
  await searchInventory('Controlled');
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
  assert.equal(
    (await driver.findElements(By.id('inventory-search'))).length,
    0,
  );

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

  await driver.get(productUrl);
  await inventoryAction(true);
  await driver.wait(until.elementLocated(By.id('inventory-search')), 10000);
  await filterState('disabled');
  await searchInventory(fixtureId);
  assert.equal((await inventoryRows()).length, 1);
  await driver.findElement(By.css('.inventory summary')).click();
  const unavailable = await driver
    .findElement(By.css('.permission-details'))
    .getText();
  assert(
    unavailable.includes(
      'Unknown. Firefox did not supply API permission metadata.',
    ),
  );
  assert(
    unavailable.includes(
      'Unknown. Firefox did not supply host permission metadata.',
    ),
  );
  await searchInventory('storage');
  assert.equal((await inventoryRows()).length, 0);
  passed('Production disabled inventory preserves unavailable metadata');
  await checkInvestigation({
    driver,
    reportDirectory,
    popupUrl: productUrl,
    investigationUrl,
    localUrl,
    settingsUrl: 'about:addons',
    fixtureId,
    fixtureName: 'Controlled ordinary extension',
    fixtureInitiallyEnabled: false,
    setFixtureEnabled: async (enabled) => {
      await driver.setContext('chrome');
      const changed = await driver.executeAsyncScript(
        async (id, target, done) => {
          const { AddonManager } = ChromeUtils.importESModule(
            'resource://gre/modules/AddonManager.sys.mjs',
          );
          try {
            const addon = await AddonManager.getAddonByID(id);
            await (target ? addon.enable() : addon.disable());
            done(addon.userDisabled === !target);
          } catch {
            done(false);
          }
        },
        fixtureId,
        enabled,
      );
      await driver.setContext('content');
      assert.equal(
        changed,
        true,
        'Browser test authority must change only its controlled fixture',
      );
    },
    revokeManagement: () =>
      driver.executeAsyncScript((done) =>
        browser.permissions.remove({ permissions: ['management'] }).then(done),
      ),
    authority: 'Unmodified Firefox product with approved optional management',
    passed,
    privateSavedId: productId,
  });
  await driver.get(harnessUrl);

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
  await checkTimings({
    driver,
    harnessUrl,
    localUrl,
    settingsUrl: 'about:addons',
    fixtures: timing,
    report,
    passed,
  });
  const driverHandoffPopupUrl = await extensionUrl(
    report.timingHandoffFixture.id,
    'popup.html',
  );
  const driverHandoffInvestigationUrl = await extensionUrl(
    report.timingHandoffFixture.id,
    'investigation.html',
  );
  await checkTimingHandoff({
    driver,
    browser: 'firefox',
    productId: report.timingHandoffFixture.id,
    popupUrl: driverHandoffPopupUrl,
    investigationUrl: driverHandoffInvestigationUrl,
    localUrl,
    grantPermissions: async () => {
      await driver.findElement(By.id('grant-research')).click();
      await driver.setContext('chrome');
      const allow = await driver.wait(
        until.elementLocated(
          By.css(
            '#addon-webext-permissions-notification .popup-notification-primary-button',
          ),
        ),
        10000,
      );
      await driver.wait(until.elementIsVisible(allow), 10000);
      await driver.wait(
        () =>
          driver.executeScript(
            (element) =>
              !(element.shadowRoot?.querySelector('button') ?? element)
                .disabled,
            allow,
          ),
        10000,
      );
      await driver.executeScript(
        (element) =>
          (element.shadowRoot?.querySelector('button') ?? element).click(),
        allow,
      );
      await driver.setContext('content');
      const grants = await driver.executeAsyncScript((done) =>
        browser.permissions.getAll().then(done),
      );
      assert(grants.permissions.includes('management'));
      assert(grants.permissions.includes('scripting'));
      assert.deepEqual(grants.origins ?? [], []);
    },
    authority: report.timingHandoffFixture.authority,
    sourceFixture: true,
    checkPrivate: ({ returnWindow }) =>
      checkFirefoxPrivateHandoff({
        returnWindow,
        driver,
        id: report.timingHandoffFixture.id,
        popupUrl: driverHandoffPopupUrl,
        investigationUrl: driverHandoffInvestigationUrl,
        localUrl,
        report,
        passed,
      }),
    revokeScripting: () =>
      driver.executeAsyncScript((done) =>
        browser.permissions.remove({ permissions: ['scripting'] }).then(done),
      ),
    report,
    passed,
  });
  report.gaps.push(
    'Timing attachments use a named source-popup fixture with compiled production core, a contains-only source consent seam after a separate approved optional-permission action, and unchanged packaged investigation assets. This does not qualify the actual React toolbar popup or human native consent; native unmodified-product evidence is separate.',
  );
  const pageErrorUrl = await extensionUrl(
    report.pageErrorFixture.id,
    'probe.html',
  );
  await driver.switchTo().newWindow('tab');
  const pageErrorControl = await driver.getWindowHandle();
  await driver.get(pageErrorUrl);
  await checkPageErrors({
    driver,
    fixtureUrl: pageErrorUrl,
    localUrl,
    report,
    passed,
    ...pageErrorDriverControls({
      driver,
      browser: 'firefox',
      fixtureUrl: pageErrorUrl,
      fixtureId: report.pageErrorFixture.id,
      controlHandle: pageErrorControl,
    }),
  });
  const comparisonUrl = await extensionUrl(
    report.pageErrorComparisonFixture.id,
    'comparison-probe.html',
  );
  const comparisonControls = pageErrorDriverControls({
    driver,
    browser: 'firefox',
    fixtureUrl: comparisonUrl,
    fixtureId: report.pageErrorComparisonFixture.id,
    controlHandle: pageErrorControl,
  });
  await checkPageErrorComparisons({
    driver,
    fixtureUrl: comparisonUrl,
    approveOptional: comparisonControls.approveOptional,
    report,
    passed,
  });
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
  timing.release();
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
  const destination = resolve(
    `.scratch/firefox-evidence${requestedVersion ? `-${requestedVersion}` : ''}${usePackage ? '-xpi' : ''}.json`,
  );
  await writeFile(destination, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    `Result: ${report.result}; ${report.checks.length} observed checks.`,
  );
  for (const gap of report.gaps) console.log(`Unqualified: ${gap}`);
  console.log(`Firefox evidence: ${destination}`);
}
