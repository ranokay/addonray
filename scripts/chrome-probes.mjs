/* global chrome */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir, platform, arch } from 'node:os';
import { By, until } from 'selenium-webdriver';
import {
  launchChrome,
  extractChromePackage,
  installChromeExtension,
} from './chrome-session.mjs';
import { checkInvestigation } from './investigation-checks.mjs';
import { checkTimingHandoff } from './timing-handoff-checks.mjs';
import {
  checkTimings,
  prepareTimingModule,
  timingFixtures,
} from './timing-checks.mjs';

await mkdir('.scratch', { recursive: true });
// Chrome reads only controlled files in the system temp directory, not the user's Documents folder.
const work = await mkdtemp(join(tmpdir(), 'addonray-chrome-'));
const productDirectory = join(work, 'product');
const extension = await extractChromePackage(productDirectory);
const productManifest = JSON.parse(
  extension.files.get('manifest.json').toString(),
);
const uiDirectory = join(work, 'pre-granted-ui-fixture');
await extractChromePackage(uiDirectory);
const requiredFixturePermissions = ['activeTab', 'management', 'scripting'];
await writeFile(
  join(uiDirectory, 'manifest.json'),
  JSON.stringify({
    ...productManifest,
    name: 'AddonRay pre-granted UI fixture',
    permissions: requiredFixturePermissions,
    optional_permissions: [],
  }),
);
async function fixture(name, manifest) {
  const directory = join(work, name);
  await mkdir(directory);
  await writeFile(
    join(directory, 'manifest.json'),
    JSON.stringify({ manifest_version: 3, name, version: '1.0', ...manifest }),
  );
  await writeFile(
    join(directory, 'probe.html'),
    '<!doctype html><title>Controlled fixture</title><h1>Controlled fixture</h1>',
  );
  return directory;
}
const ordinary = await fixture('Controlled ordinary fixture', {
  permissions: ['storage'],
  host_permissions: ['https://example.invalid/*'],
});
const controller = await fixture('Controlled API fixture', {
  permissions: ['management', 'scripting', 'tabs'],
  host_permissions: ['<all_urls>'],
});
await prepareTimingModule(controller);
const timing = timingFixtures();
const server = createServer((request, response) => {
  if (timing.handle(request, response)) return;
  response.setHeader('Content-Type', 'text/html');
  response.end(
    '<!doctype html><title>Controlled AddonRay page</title><h1>Controlled local page</h1><script>window.addonrayPageMarker=true</script>',
  );
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const localUrl = `http://127.0.0.1:${server.address().port}/`;
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
  uiFixture: {
    productAssetsUnchanged: true,
    requiredPermissions: requiredFixturePermissions,
    optionalPermissions: [],
    nativeConsentExercised: false,
  },
  checks: [],
  gaps: [
    'Inventory interface checks use a separately named fixture with management/scripting pre-granted as required permissions. They do not exercise production optional-management consent.',
    'Comparison capture checks use that same explicitly named pre-granted UI fixture and unchanged production investigation assets. Its required management permission cannot be revoked; actual optional-management revocation with populated comparisons requires separate unmodified-product native evidence.',
    'Headless action/keyboard automation does not establish native desktop popup usability. Native denial/approval is recorded separately.',
    'This exact Chrome for Testing build is not retail Chrome installation, Chrome Web Store publication, or qualification of other releases or operating systems.',
    'This headless run does not exercise private-source attachment exclusion. Local private-context setup routes were unqualified; actual unmodified native private-source exclusion is recorded separately.',
  ],
};
const passed = (name, detail) => {
  report.checks.push({ name, status: 'passed', ...(detail ? { detail } : {}) });
  console.log(`Passed: ${name}`);
};
let session;
try {
  session = await launchChrome();
  const { driver, cdp } = session;
  report.browserVersion = session.version;
  report.driverVersion = session.driverVersion;
  const productId = await installChromeExtension(cdp, productDirectory);
  const fixtureId = await installChromeExtension(cdp, ordinary);
  const controllerId = await installChromeExtension(cdp, controller);
  const uiId = await installChromeExtension(cdp, uiDirectory);
  const productUrl = `chrome-extension://${productId}/popup.html`;
  const uiUrl = `chrome-extension://${uiId}/popup.html`;
  const productInvestigationUrl = `chrome-extension://${productId}/investigation.html`;
  const uiInvestigationUrl = `chrome-extension://${uiId}/investigation.html`;
  const controllerUrl = `chrome-extension://${controllerId}/probe.html`;
  await driver.get(productUrl);
  await driver.wait(until.elementLocated(By.css('h1')), 10000);
  assert.equal(await driver.findElement(By.css('h1')).getText(), 'AddonRay');
  assert.equal(
    await driver.findElement(By.css('.eyebrow')).getText(),
    'Chrome extension inspector',
  );
  assert.equal(
    (await driver.findElements(By.css('.inventory > li'))).length,
    0,
  );
  const initialGrants = await driver.executeAsyncScript((done) =>
    chrome.permissions.getAll().then(done),
  );
  assert(!initialGrants.permissions.includes('management'));
  assert(!initialGrants.permissions.includes('scripting'));
  passed('Unmodified product starts empty without optional API grants');

  await driver.get(uiUrl);
  await driver.wait(until.elementLocated(By.css('h1')), 10000);
  assert.equal(
    (await driver.findElements(By.css('.inventory > li'))).length,
    0,
  );
  await driver
    .findElement(By.xpath('//button[contains(.,"Allow inventory")]'))
    .click();
  await driver.wait(until.elementLocated(By.id('inventory-search')), 10000);
  const search = () => driver.findElement(By.id('inventory-search'));
  const rows = () => driver.findElements(By.css('.inventory > li'));
  async function query(text) {
    await (await search()).clear();
    if (text) await (await search()).sendKeys(text);
  }
  async function state(value) {
    await driver
      .findElement(By.css(`#inventory-state option[value="${value}"]`))
      .click();
  }
  await query(fixtureId);
  assert.equal((await rows()).length, 1);
  await driver.findElement(By.css('.inventory summary')).click();
  const metadata = await driver
    .findElement(By.css('.permission-details'))
    .getText();
  assert(metadata.includes('storage'));
  assert(metadata.includes('Use Chrome extension storage'));
  assert(metadata.includes('https://example.invalid/*'));
  assert.equal(
    (await driver.findElements(By.css('.permission-details a'))).length,
    0,
  );
  assert.equal(
    await driver.executeScript(
      () => getComputedStyle(document.documentElement).colorScheme,
    ),
    'dark',
  );
  await state('disabled');
  assert.equal(
    await driver.findElement(By.css('.empty h3')).getText(),
    'No matching extensions',
  );
  await driver.findElement(By.xpath('//button[.="Reset filters"]')).click();
  assert.equal(await (await search()).getAttribute('value'), '');
  await query('  STORAGE  ');
  await state('enabled');
  assert.equal((await rows()).length, 1);
  passed(
    'Pre-granted UI fixture filters and explains Chrome metadata in the dark interface',
  );
  await driver
    .findElement(By.xpath('//button[contains(.,"Allow inventory")]'))
    .click();
  await driver.wait(until.elementLocated(By.id('inventory-search')), 10000);
  assert.equal(await (await search()).getAttribute('value'), '');
  assert.equal(
    await driver.findElement(By.id('inventory-state')).getAttribute('value'),
    'all',
  );
  assert.equal(
    (await driver.findElements(By.css('.inventory details[open]'))).length,
    0,
  );
  await driver.findElement(By.css('header button')).click();
  assert.equal(
    (await driver.findElements(By.id('inventory-search'))).length,
    0,
  );
  await driver
    .findElement(By.xpath('//button[contains(.,"Allow inventory")]'))
    .click();
  await driver.wait(until.elementLocated(By.id('inventory-search')), 10000);
  await driver.navigate().refresh();
  await driver.wait(until.elementLocated(By.css('h1')), 10000);
  assert.equal(
    (await driver.findElements(By.id('inventory-search'))).length,
    0,
  );
  passed(
    'Pre-granted UI fixture refresh, Clear and document reopen discard display state',
  );

  await driver.get(controllerUrl);
  const readFixture = () =>
    driver.executeAsyncScript(
      (id, done) =>
        chrome.management.get(id).then((entry) =>
          done({
            enabled: entry.enabled,
            permissions: entry.permissions ?? null,
            hostPermissions: entry.hostPermissions ?? null,
          }),
        ),
      fixtureId,
    );
  const enabled = await readFixture();
  assert.equal(enabled.enabled, true);
  assert(enabled.permissions.includes('storage'));
  passed(
    'Controlled enabled extension exposes declared inventory metadata',
    enabled,
  );
  // Only this separate disposable controller changes the controlled fixture. Product code has no mutation path.
  await driver.executeAsyncScript(
    (id, done) =>
      chrome.management.setEnabled(id, false).then(() => done(true)),
    fixtureId,
  );
  const disabled = await readFixture();
  assert.equal(disabled.enabled, false);
  passed(
    'Separate controller can change its disposable fixture; this is not an AddonRay feature',
    disabled,
  );
  await driver.get(uiUrl);
  await driver
    .findElement(By.xpath('//button[contains(.,"Allow inventory")]'))
    .click();
  await driver.wait(until.elementLocated(By.id('inventory-search')), 10000);
  await query(fixtureId);
  await state('disabled');
  assert.equal((await rows()).length, 1);
  await driver.findElement(By.css('.inventory summary')).click();
  const disabledText = await driver
    .findElement(By.css('.permission-details'))
    .getText();
  assert(
    disabledText.includes(
      disabled.permissions === null
        ? 'Unknown. Chrome did not supply API permission metadata.'
        : 'storage',
    ),
  );
  passed(
    'Pre-granted UI fixture preserves Chrome disabled metadata without assuming Firefox omissions',
  );
  await checkInvestigation({
    driver,
    popupUrl: uiUrl,
    investigationUrl: uiInvestigationUrl,
    localUrl,
    settingsUrl: 'chrome://extensions/',
    fixtureId,
    fixtureName: 'Controlled ordinary fixture',
    fixtureInitiallyEnabled: false,
    setFixtureEnabled: async (enabled) => {
      const investigationWindow = await driver.getWindowHandle();
      await driver.switchTo().newWindow('tab');
      await driver.get(controllerUrl);
      const changed = await driver.executeAsyncScript(
        async (id, target, done) => {
          try {
            await chrome.management.setEnabled(id, target);
            const entry = await chrome.management.get(id);
            done(entry.enabled === target);
          } catch {
            done(false);
          }
        },
        fixtureId,
        enabled,
      );
      await driver.close();
      await driver.switchTo().window(investigationWindow);
      assert.equal(
        changed,
        true,
        'Only the separate disposable controller changes its fixture',
      );
    },
    authority: 'Chrome pre-granted UI fixture with unchanged production assets',
    passed,
  });

  await driver.get(localUrl);
  const tabs = await cdp.send('Target.getTargets', {
    filter: [{ type: 'tab' }, { exclude: true }],
  });
  const tab = tabs.targetInfos.find((target) => target.url === localUrl);
  assert(tab, 'Controlled local tab target not found');
  await cdp.send('Extensions.triggerAction', {
    id: productId,
    targetId: tab.targetId,
  });
  const popup = await driver.wait(async () => {
    const targets = await cdp.send('Target.getTargets');
    return targets.targetInfos.find((target) => target.url === productUrl);
  }, 10000);
  const { sessionId } = await cdp.send('Target.attachToTarget', {
    targetId: popup.targetId,
    flatten: true,
  });
  async function popupValue(expression, userGesture = false) {
    const result = await cdp.send(
      'Runtime.evaluate',
      { expression, returnByValue: true, awaitPromise: true, userGesture },
      sessionId,
    );
    assert.equal(
      result.exceptionDetails,
      undefined,
      JSON.stringify(result.exceptionDetails),
    );
    return result.result.value;
  }
  await driver.wait(
    async () =>
      (await popupValue('document.body?.innerText ?? ""')).includes(
        'Allow page access and inspect',
      ),
    10000,
  );
  await popupValue(
    '[...document.querySelectorAll("button")].find(button=>button.textContent.includes("Allow page access")).click()',
    true,
  );
  await driver.wait(
    async () =>
      (await popupValue('document.body.innerText')).includes(
        'Document: complete',
      ),
    10000,
  );
  assert.deepEqual(
    await popupValue('chrome.permissions.getAll()').then(
      (grants) => grants.origins ?? [],
    ),
    [],
  );
  passed(
    'Unmodified product obtains activeTab through its action and performs the minimal page probe without host grants',
  );
  const timingRows = await popupValue(
    '[...document.querySelectorAll("[data-testid^=timing-]")].map(row => row.textContent)',
  );
  assert.equal(timingRows.length, 3);
  assert(timingRows.every((value) => / ms$/.test(value)));
  passed(
    'Unmodified production popup displays all three recorded loading milestones on the controlled page',
  );
  assert.equal(
    await popupValue('chrome.permissions.remove({permissions:["scripting"]})'),
    true,
  );
  await driver.wait(
    async () =>
      !(await popupValue('document.body.innerText')).includes(
        'Document: complete',
      ),
    10000,
  );
  passed(
    'Unmodified production popup clears its result on actual optional scripting revocation',
  );
  const beforeLaunchTargets = new Set(
    (await cdp.send('Target.getTargets')).targetInfos.map(
      (target) => target.targetId,
    ),
  );
  try {
    await popupValue(
      'document.querySelector("#new-investigation").click()',
      true,
    );
  } catch {
    // Opening the new foreground tab can destroy the popup before CDP returns its result.
    // The independently observed target and its state below establish whether launch succeeded.
  }
  const investigation = await driver.wait(async () => {
    const targets = await cdp.send('Target.getTargets');
    return targets.targetInfos.find(
      (target) =>
        !beforeLaunchTargets.has(target.targetId) &&
        target.type === 'page' &&
        target.url === productInvestigationUrl,
    );
  }, 10000);
  const investigationSession = await cdp.send('Target.attachToTarget', {
    targetId: investigation.targetId,
    flatten: true,
  });
  await driver.wait(async () => {
    const result = await cdp.send(
      'Runtime.evaluate',
      {
        expression:
          'document.readyState === "complete" && Boolean(document.querySelector("#capture-before"))',
        returnByValue: true,
      },
      investigationSession.sessionId,
    );
    return result.result.value === true;
  }, 10000);
  const launchedState = await cdp.send(
    'Runtime.evaluate',
    {
      expression: `(async () => ({
        snapshots: document.querySelectorAll('[data-testid="before-snapshot"], [data-testid="after-snapshot"]').length,
        afterDisabled: document.querySelector('#capture-after').disabled,
        grants: await chrome.permissions.getAll(),
      }))()`,
      returnByValue: true,
      awaitPromise: true,
    },
    investigationSession.sessionId,
  );
  assert.equal(launchedState.exceptionDetails, undefined);
  assert.equal(launchedState.result.value.snapshots, 0);
  assert.equal(launchedState.result.value.afterDisabled, true);
  assert(!launchedState.result.value.grants.permissions.includes('management'));
  assert.deepEqual(launchedState.result.value.grants.origins ?? [], []);
  passed(
    'Unmodified product toolbar action launches a fresh investigation without optional management or host access',
  );
  await cdp.send('Target.closeTarget', { targetId: investigation.targetId });
  if (
    (await cdp.send('Target.getTargets')).targetInfos.some(
      (target) => target.targetId === popup.targetId,
    )
  ) {
    await cdp.send('Target.closeTarget', { targetId: popup.targetId });
  }
  await driver.get(productUrl);
  await driver.wait(until.elementLocated(By.css('h1')), 10000);
  assert(
    !(await driver.findElement(By.css('body')).getText()).includes(
      'Document: complete',
    ),
  );
  assert.equal(
    await driver.executeAsyncScript((done) =>
      chrome.permissions.contains({ permissions: ['scripting'] }).then(done),
    ),
    false,
  );
  passed(
    'Unmodified product reopen starts empty after optional scripting revocation',
  );

  await driver.get(controllerUrl);
  const local = await driver.executeAsyncScript(
    (url, done) =>
      chrome.tabs.create({ url, active: false }).then((tab) => done(tab.id)),
    localUrl,
  );
  await driver.wait(
    async () =>
      driver.executeAsyncScript(
        (id, url, done) =>
          chrome.tabs
            .get(id)
            .then((tab) => done(tab.status === 'complete' && tab.url === url)),
        local,
        localUrl,
      ),
    10000,
  );
  const mainMarker = await driver.executeAsyncScript(
    (tabId, done) =>
      chrome.scripting
        .executeScript({
          target: { tabId, frameIds: [0] },
          world: 'MAIN',
          func: () => window.addonrayPageMarker,
        })
        .then((results) => done(results[0].result)),
    local,
  );
  assert.equal(mainMarker, true, 'Prove the loaded page defines the marker');
  const isolated = await driver.executeAsyncScript(
    (tabId, done) =>
      chrome.scripting
        .executeScript({
          target: { tabId, frameIds: [0] },
          func: () => ({
            readyState: document.readyState,
            pageMarker: typeof window.addonrayPageMarker,
          }),
        })
        .then((results) => done(results[0].result)),
    local,
  );
  assert.equal(isolated.readyState, 'complete');
  assert.equal(isolated.pageMarker, 'undefined');
  passed(
    'Separate host-granted controller observes the local page in an isolated world',
  );
  const restrictedTab = await driver.executeAsyncScript((done) =>
    chrome.tabs
      .create({ url: 'chrome://extensions/', active: false })
      .then((tab) => done(tab.id)),
  );
  await driver.wait(
    async () =>
      driver.executeAsyncScript(
        (id, done) =>
          chrome.tabs
            .get(id)
            .then((tab) =>
              done(
                tab.url === 'chrome://extensions/' && tab.status === 'complete',
              ),
            ),
        restrictedTab,
      ),
    10000,
  );
  const restricted = await driver.executeAsyncScript(async (tabId, done) => {
    try {
      await chrome.scripting.executeScript({
        target: { tabId, frameIds: [0] },
        func: () => {
          document.documentElement.setAttribute('data-addonray-probe', 'true');
        },
      });
      done({ rejected: false });
    } catch {
      done({ rejected: true });
    }
  }, restrictedTab);
  assert.equal(restricted.rejected, true);
  const protectedTarget = (
    await cdp.send('Target.getTargets')
  ).targetInfos.find(
    (target) => target.type === 'page' && target.url === 'chrome://extensions/',
  );
  assert(protectedTarget, 'The protected document remains loaded');
  const protectedSession = await cdp.send('Target.attachToTarget', {
    targetId: protectedTarget.targetId,
    flatten: true,
  });
  const marker = await cdp.send(
    'Runtime.evaluate',
    {
      expression:
        'document.documentElement.hasAttribute("data-addonray-probe")',
      returnByValue: true,
    },
    protectedSession.sessionId,
  );
  assert.equal(marker.result.value, false);
  passed(
    'Protected Chrome context rejects injection from the separate host-granted controller',
  );
  await checkTimings({
    driver,
    harnessUrl: controllerUrl,
    localUrl,
    settingsUrl: 'chrome://extensions/',
    fixtures: timing,
    report,
    passed,
  });
  await checkTimingHandoff({
    driver,
    cdp,
    browser: 'chrome',
    productId: uiId,
    popupUrl: uiUrl,
    investigationUrl: uiInvestigationUrl,
    localUrl,
    grantPermissions: async () => {
      const grants = await driver.executeAsyncScript((done) =>
        chrome.permissions.getAll().then(done),
      );
      assert(grants.permissions.includes('management'));
      assert(grants.permissions.includes('scripting'));
      assert.deepEqual(grants.origins ?? [], []);
    },
    authority: 'Chrome pre-granted UI fixture with unchanged production assets',
    report,
    checkPrivate: async () => ({
      status: 'not-exercised-in-this-run',
      source:
        'No private-source observation in this run. Local development setup attempts timed out or disconnected before a usable observation; actual unmodified native private-source exclusion remains required.',
      receiver:
        'Private/unknown receiver guards have deterministic tests. Chrome spanning mode cannot load packaged main-frame pages in incognito; this is a documented boundary, not an observed receiver guard verdict.',
      attempts:
        'Local development attempts are retained in ignored timing-comparison-chrome-private-failed.json and timing-comparison-private-attempt.mjs; they are not part of this run.',
    }),
    passed,
  });
  report.result = 'passed-with-qualification-gaps';
} catch (error) {
  report.result = 'failed';
  report.failure = String(error);
  process.exitCode = 1;
  console.error(error);
  if (session) {
    try {
      await writeFile(
        resolve('.scratch/chrome-failure.png'),
        Buffer.from(await session.driver.takeScreenshot(), 'base64'),
      );
    } catch {
      /* The original failure remains authoritative. */
    }
  }
} finally {
  timing.release();
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
    '.scratch/chrome-evidence.json',
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(
    `Result: ${report.result}; ${report.checks.length} observed checks. Report: .scratch/chrome-evidence.json`,
  );
}
