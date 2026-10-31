/* global browser, ChromeUtils, WebExtensionPolicy, chrome */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Builder, By, until } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';
import { installTemporaryExtension } from './firefox-install.mjs';
import { sha256 } from './check-package.mjs';
import {
  installChromeExtension,
  extractChromePackage,
  launchChrome,
} from './chrome-session.mjs';

const target = process.argv[2];
assert(
  target === 'firefox' || target === 'chrome',
  'Usage: bun scripts/saved-restart-checks.mjs firefox|chrome',
);
const requestedVersion =
  target === 'firefox' ? (process.env.FIREFOX_VERSION ?? '158.0.1') : null;
if (requestedVersion)
  assert.match(requestedVersion, /^\d+\.\d+(?:\.\d+)?(?:esr)?$/);

process.env.SE_AVOID_STATS = 'true';
process.env.SE_SKIP_DRIVER_IN_PATH = 'true';
process.env.SE_SKIP_BROWSER_IN_PATH = 'true';
if (target === 'firefox') process.env.SE_DRIVER_VERSION = '0.37.1';

const beforeSelector = '[data-testid="before-snapshot"]';
const afterSelector = '[data-testid="after-snapshot"]';
const assessmentSelector = 'input[name="page-assessment"]:checked';
const saveSection = 'section[aria-labelledby="save-heading"]';
const databaseName = 'addonray-saved-investigations';
const productId = 'addonray@ranokay.dev';
const fixtureId = 'saved-restart-fixture@addonray.test';
const productUuid = '4f0d9a9e-6b6e-4b7e-8f3b-0f1f8a2c7d11';
const fixtureUuid = '7a2c4e8f-1b3d-4c5e-9f6a-2d8b0e4c1a22';
const work = resolve('.scratch/saved-restart');
await mkdir(work, { recursive: true });

const firefoxProduct = resolve('.output/firefox-mv3');
const firefoxFixture = join(work, 'firefox-fixture');
const firefoxLiveProfile = join(work, 'firefox-live-profile');
const firefoxRetained1 = join(work, 'firefox-retained-1');
const firefoxRetained2 = join(work, 'firefox-retained-2');

async function hashDirectory(root) {
  const files = [];
  async function walk(directory, prefix = '') {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(join(directory, entry.name), name);
      else if (entry.isFile())
        files.push({
          path: name,
          bytes: await readFile(join(directory, entry.name)),
        });
    }
  }
  await walk(root);
  const digest = createHash('sha256');
  for (const file of files) {
    digest.update(file.path);
    digest.update('\0');
    digest.update(file.bytes);
    digest.update('\0');
  }
  return { sha256: digest.digest('hex'), files: files.length };
}

function sourceIdentity() {
  return {
    commit: execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim(),
    dirty: Boolean(
      execFileSync('git', ['status', '--porcelain'], {
        encoding: 'utf8',
      }).trim(),
    ),
  };
}

const report = {
  timestamp: new Date().toISOString(),
  target,
  distribution: target === 'firefox' ? 'Firefox' : 'Chrome for Testing',
  requestedVersion: requestedVersion ?? null,
  source: sourceIdentity(),
  browserVersion: null,
  driverVersion: null,
  artifact: null,
  checks: [],
  gaps: [
    'One OS/architecture and exact local pins only; other platforms and retail installs remain unqualified.',
    'The retained profile is a disposable test profile. The Firefox product is temporarily installed and reinstalled with a fixed test UUID mapping.',
    'Chrome uses the named pre-granted UI fixture with unchanged production assets.',
    'This probe observes list/open/delete persistence and live-state loss, not natural eviction, quota behavior or native UI usability.',
  ],
};

function passed(name, details = {}) {
  report.checks.push({ name, status: 'passed', ...details });
  console.log(`Passed: ${name}`);
}

async function waitForElement(driver, selector, timeout = 10000) {
  return driver.wait(until.elementLocated(By.css(selector)), timeout);
}

async function elementText(driver, selector) {
  const elements = await driver.findElements(By.css(selector));
  return elements[0] ? elements[0].getText() : '';
}

async function waitForSaveEnabled(driver) {
  const section = await waitForElement(driver, saveSection);
  await driver.wait(
    async () => section.findElement(By.id('save-investigation')).isEnabled(),
    15000,
  );
  return section;
}

async function captureAndSave(driver, urls) {
  await driver.get(urls.investigation);
  await waitForElement(driver, '#capture-before');
  const label = await elementText(driver, '#investigation-label');
  await driver.findElement(By.id('capture-before')).click();
  await waitForElement(driver, beforeSelector);
  await driver.findElement(By.id('capture-after')).click();
  await waitForElement(driver, afterSelector);
  await driver
    .findElement(By.css('input[name="page-assessment"][value="uncertain"]'))
    .click();
  const section = await waitForSaveEnabled(driver);
  const disclosure = await section.getText();
  assert(disclosure.includes('Saved records persist on this device'));
  await section.findElement(By.id('save-investigation')).click();
  await driver.wait(
    async () => (await section.getText()).includes('Saved locally.'),
    15000,
  );
  const live = {
    before: (await driver.findElements(By.css(beforeSelector))).length,
    after: (await driver.findElements(By.css(afterSelector))).length,
    assessment: await driver
      .findElement(By.css(assessmentSelector))
      .getAttribute('value'),
    label,
  };
  assert.equal(live.before, 1);
  assert.equal(live.after, 1);
  assert.equal(live.assessment, 'uncertain');
  const saveMessage = await section.getText();
  return { live, saveMessage };
}

async function openLibrary(driver, urls, { expectRows = 1 } = {}) {
  const investigationWindow = await driver.getWindowHandle();
  await driver.switchTo().newWindow('tab');
  await driver.get(urls.library);
  await driver.wait(async () => {
    const rows = await driver.findElements(By.css('.library-entry'));
    if (expectRows === 0)
      return (await elementText(driver, 'body')).includes(
        'No saved investigations.',
      );
    return rows.length === expectRows;
  }, 15000);
  const rowText =
    expectRows > 0 ? await elementText(driver, '.library-entry') : null;
  let archiveText = null;
  let archiveHtml = null;
  if (expectRows > 0) {
    await driver.findElement(By.id('open-saved-record')).click();
    await waitForElement(driver, '#archive-heading');
    archiveText = await elementText(driver, 'article.archive');
    archiveHtml = await driver.executeScript(
      () => document.documentElement.outerHTML,
    );
    assert(archiveText.includes('Read-only saved investigation'));
    assert(archiveText.includes('Controlled restart fixture'));
    assert(archiveText.includes('never recomputed from archived names'));
    assert(!archiveText.includes(fixtureId));
    assert.equal(
      (await driver.findElements(By.id('capture-before'))).length,
      0,
      'The archive must not expose live collection controls',
    );
  }
  return {
    investigationWindow,
    rowText,
    archiveText,
    archiveHtml,
  };
}

async function deleteLibraryRecord(driver, urls) {
  await driver.get(urls.library);
  await driver.wait(
    async () =>
      (await driver.findElements(By.css('.library-entry'))).length === 1,
    15000,
  );
  await driver.findElement(By.id('open-saved-record')).click();
  await waitForElement(driver, '#archive-heading');
  await driver
    .findElement(By.xpath('//button[normalize-space(.)="Delete"]'))
    .click();
  await driver
    .findElement(By.xpath('//button[normalize-space(.)="Delete saved record"]'))
    .click();
  await driver.wait(
    async () =>
      (await driver.findElements(By.css('.library-entry'))).length === 0,
    15000,
  );
  const text = await elementText(driver, 'body');
  assert(text.includes('No saved investigations.'));
  return text;
}

async function seedUnsupportedAndDeleteAll(driver, urls) {
  if ((await driver.getCurrentUrl()) !== urls.library) {
    await driver.get(urls.library);
  }
  await driver.wait(
    async () =>
      (await driver.findElements(By.css('.library-entry'))).length === 0,
    15000,
  );
  const seeded = await driver.executeAsyncScript((name, done) => {
    const request = indexedDB.open(name, 1);
    request.onerror = () => done({ error: String(request.error) });
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction('records', 'readwrite');
      transaction.objectStore('records').put({
        schemaVersion: 2,
        recordId: '88888888-8888-8888-8888-888888888888',
      });
      transaction.oncomplete = () => {
        database.close();
        done({ ok: true });
      };
      transaction.onerror = () => done({ error: String(transaction.error) });
    };
  }, databaseName);
  assert.equal(seeded.ok, true, JSON.stringify(seeded));
  await driver
    .findElement(By.xpath('//button[normalize-space(.)="Refresh"]'))
    .click();
  await driver.wait(
    async () =>
      (await driver.findElements(By.css('.library-entry'))).length === 1 &&
      (await elementText(driver, 'body')).includes('Unsupported saved record'),
    15000,
  );
  await driver
    .findElement(
      By.xpath('//button[normalize-space(.)="Delete all saved records"]'),
    )
    .click();
  await driver.wait(
    async () =>
      (await driver.findElements(By.css('[aria-label="Confirm delete all"]')))
        .length === 1,
    15000,
  );
  await driver
    .findElement(
      By.xpath(
        '//div[@aria-label="Confirm delete all"]//button[normalize-space(.)="Delete all saved records"]',
      ),
    )
    .click();
  await driver.wait(
    async () =>
      (await driver.findElements(By.css('.library-entry'))).length === 0 &&
      (await elementText(driver, 'body')).includes('No saved investigations.'),
    15000,
  );
  return { unsupportedBeforeDeleteAll: true, rowsAfter: 0 };
}

async function assertFreshInvestigation(driver, urls) {
  await driver.get(urls.investigation);
  await waitForElement(driver, '#capture-before');
  const state = {
    before: (await driver.findElements(By.css(beforeSelector))).length,
    after: (await driver.findElements(By.css(afterSelector))).length,
    assessment: (await driver.findElements(By.css(assessmentSelector))).length,
    captureAfterEnabled: await driver
      .findElement(By.id('capture-after'))
      .isEnabled(),
  };
  assert.equal(state.before, 0);
  assert.equal(state.after, 0);
  assert.equal(state.assessment, 0);
  assert.equal(state.captureAfterEnabled, false);
  return state;
}

async function firefoxInfo(driver, id, path) {
  await driver.setContext('chrome');
  try {
    return await driver.executeScript(
      (extensionId, resource) => {
        const policy = WebExtensionPolicy.getByID(extensionId);
        if (!policy) return null;
        return {
          url: policy.getURL(resource),
          origin: policy.principal?.origin ?? policy.getURL('') ?? null,
          uuid: policy.mozExtensionHostname ?? null,
        };
      },
      id,
      path,
    );
  } finally {
    await driver.setContext('content');
  }
}

async function firefoxPromptVisible(driver) {
  await driver.setContext('chrome');
  try {
    const elements = await driver.findElements(
      By.css('#addon-webext-permissions-notification'),
    );
    for (const element of elements) {
      if (await element.isDisplayed()) return true;
    }
    return false;
  } finally {
    await driver.setContext('content');
  }
}

async function launchFirefox(profile) {
  const options = new firefox.Options().addArguments('-headless');
  if (profile) options.setProfile(profile);
  if (requestedVersion) options.setBrowserVersion(requestedVersion);
  options.setPreference('xpinstall.signatures.required', false);
  options.setPreference(
    'extensions.webextensions.uuids',
    JSON.stringify({ [productId]: productUuid, [fixtureId]: fixtureUuid }),
  );
  const service = new firefox.ServiceBuilder().addArguments(
    '--allow-system-access',
  );
  const driver = await new Builder()
    .forBrowser('firefox')
    .setFirefoxService(service)
    .setFirefoxOptions(options)
    .build();
  await driver.manage().setTimeouts({ script: 30000, pageLoad: 30000 });
  return driver;
}

async function installFirefox(driver) {
  for (const directory of [firefoxProduct, firefoxFixture]) {
    try {
      await installTemporaryExtension(driver, directory);
    } catch (error) {
      const info = await firefoxInfo(
        driver,
        directory === firefoxProduct ? productId : fixtureId,
        'investigation.html',
      ).catch(() => null);
      if (!info) throw error;
    }
  }
  return firefoxInfo(driver, productId, 'investigation.html');
}

async function grantFirefoxManagement(driver) {
  await driver.setContext('chrome');
  const granted = await driver.executeAsyncScript(async (id, done) => {
    try {
      const { ExtensionPermissions } = ChromeUtils.importESModule(
        'resource://gre/modules/ExtensionPermissions.sys.mjs',
      );
      const { AddonManager } = ChromeUtils.importESModule(
        'resource://gre/modules/AddonManager.sys.mjs',
      );
      const extension = WebExtensionPolicy.getByID(id).extension;
      await ExtensionPermissions.add(
        id,
        { permissions: ['management'], origins: [] },
        extension,
      );
      await (await AddonManager.getAddonByID(id)).reload();
      done({
        granted: (await ExtensionPermissions.get(id)).permissions.includes(
          'management',
        ),
      });
    } catch (error) {
      done({ granted: false, error: String(error) });
    }
  }, productId);
  await driver.setContext('content');
  assert.equal(granted.granted, true, JSON.stringify(granted));
  return granted;
}

async function firefoxSessionProfile(driver) {
  const profile = (await driver.getCapabilities()).get('moz:profile');
  assert(profile, 'Firefox session profile is unavailable');
  return profile;
}

async function copyProfile(source, destination) {
  assert(source, 'Firefox profile path is unavailable');
  await rm(destination, { recursive: true, force: true });
  await cp(source, destination, { recursive: true });
  return { live: source, retained: destination };
}

async function firefoxMain() {
  await mkdir(firefoxFixture, { recursive: true });
  await writeFile(
    join(firefoxFixture, 'manifest.json'),
    JSON.stringify({
      manifest_version: 3,
      name: 'Controlled restart fixture',
      version: '1.0',
      browser_specific_settings: {
        gecko: {
          id: fixtureId,
          data_collection_permissions: { required: ['none'] },
        },
      },
    }),
  );
  await writeFile(
    join(firefoxFixture, 'probe.html'),
    '<!doctype html><title>Controlled restart fixture</title><h1>Controlled restart fixture</h1>',
  );
  report.artifact = await hashDirectory(firefoxProduct);
  await rm(firefoxLiveProfile, { recursive: true, force: true });
  await mkdir(firefoxLiveProfile, { recursive: true });

  let driver = await launchFirefox(firefoxLiveProfile);
  let liveProfile;
  try {
    report.browserVersion = (await driver.getCapabilities()).get(
      'browserVersion',
    );
    report.driverVersion = (await driver.getCapabilities()).get(
      'moz:geckodriverVersion',
    );
    if (requestedVersion)
      assert.equal(report.browserVersion, requestedVersion.replace(/esr$/, ''));
    const product = await installFirefox(driver);
    assert(product?.url);
    await grantFirefoxManagement(driver);
    const urls = {
      investigation: product.url,
      library: product.url.replace('investigation.html', 'library.html'),
    };
    const saved = await captureAndSave(driver, urls);
    const first = await openLibrary(driver, urls);
    assert.equal(first.rowText?.includes('Uncertain'), true);
    assert(first.archiveText?.includes('Controlled restart fixture'));
    passed('explicit product save and read-only library open', {
      live: saved.live,
      origin: product,
      rowText: first.rowText,
    });
    report.firstArchive = first.archiveText;
    report.originBefore = product.origin;
    report.originUuidBefore = product.uuid;
    report.liveBeforeRestart = saved.live;
    await driver.close();
    await driver.switchTo().window(first.investigationWindow);
    liveProfile = await firefoxSessionProfile(driver);
    report.profile1 = await copyProfile(liveProfile, firefoxRetained1);
    await driver.quit();
    driver = null;
  } finally {
    if (driver) {
      liveProfile = await firefoxSessionProfile(driver).catch(
        () => liveProfile,
      );
      await driver.quit().catch(() => {});
    }
  }

  driver = await launchFirefox(firefoxRetained1);
  try {
    const product = await installFirefox(driver);
    assert(product?.url);
    assert.equal(
      product.origin,
      report.originBefore,
      'Origin changed on restart',
    );
    assert.equal(product.uuid, report.originUuidBefore);
    const urls = {
      investigation: product.url,
      library: product.url.replace('investigation.html', 'library.html'),
    };
    const fresh = await assertFreshInvestigation(driver, urls);
    passed('restart discards the unsaved live investigation', {
      origin: product.origin,
      fresh,
    });
    const library = await openLibrary(driver, urls);
    assert.equal(library.rowText?.includes('Uncertain'), true);
    assert.equal(library.archiveText, report.firstArchive);
    assert.equal(await firefoxPromptVisible(driver), false);
    const management = await driver.executeAsyncScript((done) =>
      browser.permissions.contains({ permissions: ['management'] }).then(done),
    );
    passed(
      'restart lists and reopens the archived observations without a new prompt',
      {
        archiveExactMatch: true,
        managementGrantPresent: management,
        permissionPromptVisible: false,
        origin: product.origin,
      },
    );
    await deleteLibraryRecord(driver, urls);
    passed('single-record delete is explicit after restart', {
      origin: product.origin,
      deleted: true,
    });
    const deleteAll = await seedUnsupportedAndDeleteAll(driver, urls);
    passed('confirmed delete-all clears a seeded unsupported record', {
      origin: product.origin,
      ...deleteAll,
    });
    await driver.close();
    await driver.switchTo().window(library.investigationWindow);
    liveProfile = await firefoxSessionProfile(driver);
    report.profile2 = await copyProfile(liveProfile, firefoxRetained2);
    await driver.quit();
    driver = null;
  } finally {
    if (driver) {
      liveProfile = await firefoxSessionProfile(driver).catch(
        () => liveProfile,
      );
      await driver.quit().catch(() => {});
    }
  }

  driver = await launchFirefox(firefoxRetained2);
  try {
    const product = await installFirefox(driver);
    const urls = {
      investigation: product.url,
      library: product.url.replace('investigation.html', 'library.html'),
    };
    await openLibrary(driver, urls, { expectRows: 0 });
    const fresh = await assertFreshInvestigation(driver, urls);
    passed('deleted archive stays deleted after another restart', {
      origin: product.origin,
      fresh,
    });
    await driver.quit();
    driver = null;
  } finally {
    if (driver) await driver.quit().catch(() => {});
  }
}

async function chromeMain() {
  const extensionDirectory = join(work, 'chrome-extension');
  const profileDirectory = join(work, 'chrome-profile');
  const chromeFixture = join(work, 'chrome-fixture');
  await rm(extensionDirectory, { recursive: true, force: true });
  await rm(profileDirectory, { recursive: true, force: true });
  await rm(chromeFixture, { recursive: true, force: true });
  await mkdir(profileDirectory, { recursive: true });
  await mkdir(chromeFixture, { recursive: true });
  await writeFile(
    join(chromeFixture, 'manifest.json'),
    JSON.stringify({
      manifest_version: 3,
      name: 'Controlled restart fixture',
      version: '1.0',
    }),
  );
  await extractChromePackage(extensionDirectory);
  const manifestPath = join(extensionDirectory, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  await writeFile(
    manifestPath,
    JSON.stringify({
      ...manifest,
      name: 'AddonRay saved-restart fixture',
      permissions: ['activeTab', 'management', 'scripting'],
      optional_permissions: [],
    }),
  );
  report.artifact = {
    packageSha256: sha256(
      await readFile(resolve('.output/addonray-0.0.1-chrome.zip')),
    ),
    fixture: await hashDirectory(extensionDirectory),
  };
  let id = null;
  const urls = { investigation: '', library: '' };
  let session;

  async function launch() {
    session = await launchChrome({
      userDataDir: profileDirectory,
      loadExtensions: [extensionDirectory, chromeFixture],
    });
    const loadedId = await installChromeExtension(
      session.cdp,
      extensionDirectory,
    );
    if (id !== null)
      assert.equal(
        loadedId,
        id,
        'The saved archive origin changed across restart.',
      );
    id = loadedId;
    urls.investigation = `chrome-extension://${id}/investigation.html`;
    urls.library = `chrome-extension://${id}/library.html`;
    report.browserVersion = session.version;
    report.driverVersion = session.driverVersion;
    report.browserBinary = session.browserBinary;
    return session.driver;
  }
  async function quit() {
    session?.cdp.close();
    await session?.driver.quit();
    session = null;
  }

  try {
    const driver = await launch();
    const saved = await captureAndSave(driver, urls);
    const first = await openLibrary(driver, urls);
    assert.equal(first.rowText?.includes('Uncertain'), true);
    assert(first.archiveText?.includes('Controlled restart fixture'));
    report.firstArchive = first.archiveText;
    report.liveBeforeRestart = saved.live;
    passed('explicit product save and read-only library open', {
      live: saved.live,
      rowText: first.rowText,
    });
    await driver.close();
    await driver.switchTo().window(first.investigationWindow);
    await quit();
  } catch (error) {
    await quit();
    throw error;
  }

  try {
    const driver = await launch();
    const fresh = await assertFreshInvestigation(driver, urls);
    passed('restart discards the unsaved live investigation', { fresh });
    const library = await openLibrary(driver, urls);
    assert.equal(library.archiveText, report.firstArchive);
    const management = await driver.executeAsyncScript((done) =>
      chrome.permissions.contains({ permissions: ['management'] }).then(done),
    );
    passed('restart lists and reopens the archived observations', {
      archiveExactMatch: true,
      managementGrantPresent: management,
      origin: `chrome-extension://${id}`,
    });
    await driver.close();
    await driver.switchTo().window(library.investigationWindow);
    await deleteLibraryRecord(driver, urls);
    passed('single-record delete is explicit after restart', { deleted: true });
    const deleteAll = await seedUnsupportedAndDeleteAll(driver, urls);
    passed(
      'confirmed delete-all clears a seeded unsupported record',
      deleteAll,
    );
    await quit();
  } catch (error) {
    await quit();
    throw error;
  }

  try {
    const driver = await launch();
    await openLibrary(driver, urls, { expectRows: 0 });
    const fresh = await assertFreshInvestigation(driver, urls);
    passed('deleted archive stays deleted after another restart', { fresh });
    await quit();
  } catch (error) {
    await quit();
    throw error;
  }
}

try {
  if (target === 'firefox') await firefoxMain();
  else await chromeMain();
  report.result = 'passed';
} catch (error) {
  report.result = 'failed';
  report.failure = String(error);
  process.exitCode = 1;
  console.error(error);
} finally {
  const destination = resolve(
    `.scratch/saved-restart-${target}${requestedVersion ? `-${requestedVersion}` : ''}.json`,
  );
  report.sourceAfter = sourceIdentity();
  await writeFile(destination, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    `Saved restart result: ${report.result}; ${report.checks.length} checks.`,
  );
  console.log(`Report: ${destination}`);
}
