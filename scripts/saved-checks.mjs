/* global browser, ChromeUtils, WebExtensionPolicy, OpenBrowserWindow, gBrowser */
import assert from 'node:assert/strict';
import { By, until } from 'selenium-webdriver';

const beforeSelector = '[data-testid="before-snapshot"]';
const afterSelector = '[data-testid="after-snapshot"]';
const assessmentSelector = 'input[name="page-assessment"]:checked';
const saveSection = 'section[aria-labelledby="save-heading"]';
const libraryReady = '#library-list-heading';

const disclosures = [
  'persist on this device and browser profile',
  'Any AddonRay extension page in this profile can read them',
  'no sync, cloud, telemetry or companion transfer',
  'no encryption layer',
  'Deletion and expiry are product-level actions',
  'browser or OS backups',
  'Uninstall clearing is browser-controlled',
  'Exported files, prints and clipboard content leave',
  'omits extension IDs, source tab IDs and page URLs or titles',
];

async function sectionText(driver, selector) {
  const elements = await driver.findElements(By.css(selector));
  return elements[0] ? elements[0].getText() : '';
}

async function waitForNewWindow(driver, existing, timeout = 10000) {
  return driver.wait(async () => {
    const handles = await driver.getAllWindowHandles();
    return handles.find((handle) => !existing.has(handle)) ?? false;
  }, timeout);
}

async function waitForLibrary(driver, libraryUrl) {
  await driver.wait(
    async () => (await driver.getCurrentUrl()) === libraryUrl,
    10000,
  );
  await driver.wait(async () => {
    const ready = await driver.findElements(By.css(libraryReady));
    if (ready.length) return true;
    const denied = await driver.findElements(By.id('library-denied-heading'));
    if (denied.length) return true;
    const unavailable = await driver.findElements(
      By.id('library-unavailable-heading'),
    );
    return unavailable.length > 0;
  }, 10000);
}

async function assertPair(driver) {
  assert.equal(
    (await driver.findElements(By.css(beforeSelector))).length,
    1,
    'The live Before snapshot must remain after saving',
  );
  assert.equal(
    (await driver.findElements(By.css(afterSelector))).length,
    1,
    'The live After snapshot must remain after saving',
  );
  assert.equal(
    await driver.findElement(By.css(assessmentSelector)).getAttribute('value'),
    'uncertain',
  );
}

async function saveOnce(driver) {
  const section = await driver.findElement(By.css(saveSection));
  await driver.wait(async () => {
    const button = await section.findElement(By.id('save-investigation'));
    return button.isEnabled();
  }, 10000);
  const text = await section.getText();
  for (const phrase of disclosures)
    assert(text.includes(phrase), `Save section must disclose: ${phrase}`);
  assert(
    text.includes('Each explicit Save creates a separate archive'),
    'Repeated saves must be disclosed as separate archives',
  );
  await section.findElement(By.id('save-investigation')).click();
  await driver.wait(
    async () => (await section.getText()).includes('Saved locally.'),
    10000,
  );
  await assertPair(driver);
  return text;
}

async function openLibraryFromPopup({ driver, popupWindow, libraryUrl }) {
  await driver.switchTo().window(popupWindow);
  const button = await driver.wait(
    until.elementLocated(By.id('open-saved-investigations')),
    10000,
  );
  const existing = new Set(await driver.getAllWindowHandles());
  assert.equal(await button.isEnabled(), true);
  await button.click();
  const handle = await waitForNewWindow(driver, existing);
  await driver.switchTo().window(handle);
  await waitForLibrary(driver, libraryUrl);
  assert.equal(
    (await driver.findElements(By.id('library-denied-heading'))).length,
    0,
    'Normal popup launcher must not produce a denied library view',
  );
  return handle;
}

async function openDirectLibrary(driver, libraryUrl) {
  const existing = new Set(await driver.getAllWindowHandles());
  await driver.switchTo().newWindow('tab');
  const handle = await driver.getWindowHandle();
  await driver.get(libraryUrl);
  await waitForLibrary(driver, libraryUrl);
  const created = (await driver.getAllWindowHandles()).filter(
    (candidate) => !existing.has(candidate),
  );
  assert.equal(created.length, 1, 'Direct library route must use its new tab');
  return handle;
}

async function assertLibraryRecord({
  driver,
  fixtureId,
  fixtureName,
  investigationLabel,
  changeKind,
}) {
  const rows = await driver.findElements(By.css('.library-entry'));
  assert.equal(rows.length, 1, 'Exactly one saved record must be listed');
  const rowText = await rows[0].getText();
  assert(rowText.includes('Uncertain'), rowText);
  if (fixtureId) {
    assert(!rowText.includes(fixtureId), 'Library must omit the fixture ID');
  }
  const pageText = await driver.findElement(By.css('body')).getText();
  if (fixtureId) {
    assert(
      !pageText.includes(fixtureId),
      'Library page must omit the fixture ID',
    );
  }
  if (investigationLabel) {
    assert(
      !pageText.includes(investigationLabel),
      'Library page must omit the live investigation label',
    );
  }
  assert(!pageText.includes('sourceTabId'), 'Library must omit source tab IDs');
  const html = await driver.executeScript(
    () => document.documentElement.outerHTML,
  );
  if (fixtureId)
    assert(
      !html.includes(fixtureId),
      'Library markup must omit the fixture ID',
    );

  await driver.wait(
    async () =>
      (await driver.findElement(By.id('open-saved-record'))).isEnabled(),
    10000,
  );
  await driver.findElement(By.id('open-saved-record')).click();
  try {
    await driver.wait(until.elementLocated(By.id('archive-heading')), 10000);
  } catch (error) {
    console.error(
      'Saved library archive failed',
      await driver.findElement(By.css('body')).getText(),
    );
    throw error;
  }
  const archive = await driver.findElement(By.css('article.archive')).getText();
  for (const expected of [
    'Read-only saved investigation',
    fixtureName,
    'Uncertain',
    changeKind,
    'Expires',
    'never recomputed from archived names',
  ])
    assert(archive.includes(expected), `Archive must include: ${expected}`);
  if (fixtureId) {
    assert(!archive.includes(fixtureId), 'Archive must omit the fixture ID');
  }
  if (investigationLabel) {
    assert(
      !archive.includes(investigationLabel),
      'Archive must omit the live investigation label',
    );
  }
  return archive;
}

async function deleteShownRecord(driver) {
  const entry = await driver.findElement(By.css('.library-entry'));
  const deleteButton = await entry.findElement(
    By.xpath('.//button[normalize-space(.)="Delete"]'),
  );
  await driver.wait(async () => deleteButton.isEnabled(), 10000);
  await deleteButton.click();
  await driver
    .findElement(By.xpath('//button[normalize-space(.)="Delete saved record"]'))
    .click();
  await driver.wait(
    async () =>
      (await driver.findElements(By.css('.library-entry'))).length === 0,
    10000,
  );
  await driver.wait(
    async () =>
      (
        await sectionText(
          driver,
          'section[aria-labelledby="library-list-heading"]',
        )
      ).includes('No saved investigations.'),
    10000,
  );
}

export async function checkSavedInvestigations({
  driver,
  popupWindow,
  libraryUrl,
  fixtureId,
  fixtureName,
  investigationLabel,
  changeKind,
  authority,
  passed,
  simulateQuota,
}) {
  const investigationWindow = await driver.getWindowHandle();
  await saveOnce(driver);
  passed(
    `${authority}: explicit save writes one archive and preserves the live comparison`,
    {
      savedInvestigations: {
        save: 'one explicit action',
        disclosures: disclosures.length,
      },
    },
  );

  const firstLibrary = await openLibraryFromPopup({
    driver,
    popupWindow,
    libraryUrl,
  });
  await assertLibraryRecord({
    driver,
    fixtureId,
    fixtureName,
    investigationLabel,
    changeKind,
  });
  passed(
    `${authority}: the popup launcher opens the local library and the archive reopens read-only without extension IDs`,
    {
      savedInvestigations: {
        launcher: 'normal active-tab classification',
        archive: 'read-only inline view',
      },
    },
  );

  const secondLibrary = await openDirectLibrary(driver, libraryUrl);
  assert.equal(
    (await driver.findElements(By.css('.library-entry'))).length,
    1,
    'A second library view must see the same record',
  );
  await driver.switchTo().window(firstLibrary);
  await driver.executeScript(() => {
    BroadcastChannel.prototype.postMessage = () => {};
  });
  await deleteShownRecord(driver);
  passed(
    `${authority}: single-record delete is confirmed and removes the row after transaction completion`,
    { savedInvestigations: { deletion: 'single record' } },
  );

  await driver.switchTo().window(secondLibrary);
  assert.equal(
    (await driver.findElements(By.css('.library-entry'))).length,
    1,
    'The withheld-notification view must retain its old row until an action',
  );
  await driver.findElement(By.id('open-saved-record')).click();
  await driver.wait(
    async () =>
      (
        await sectionText(
          driver,
          'section[aria-labelledby="library-list-heading"]',
        )
      ).includes('no longer available'),
    10000,
  );
  assert.equal((await driver.findElements(By.id('archive-heading'))).length, 0);
  await driver
    .findElement(By.xpath('//button[normalize-space(.)="Refresh"]'))
    .click();
  await driver.wait(
    async () =>
      (await driver.findElements(By.css('.library-entry'))).length === 0,
    10000,
  );
  passed(
    `${authority}: a withheld-notification view fails its next open and refreshes to the deleted state`,
    {
      savedInvestigations: {
        staleView: 'next action failed without a notification',
        notification: 'withheld by a no-op BroadcastChannel',
      },
    },
  );
  await driver.close();
  await driver.switchTo().window(firstLibrary);
  await driver.close();
  await driver.switchTo().window(investigationWindow);
  await assertPair(driver);

  if (simulateQuota) {
    await driver.executeScript(() => {
      globalThis.__addonrayOriginalPut = IDBObjectStore.prototype.put;
      globalThis.__addonrayOriginalAdd = IDBObjectStore.prototype.add;
      const fail = function () {
        throw new DOMException('simulated quota', 'QuotaExceededError');
      };
      IDBObjectStore.prototype.put = fail;
      IDBObjectStore.prototype.add = fail;
    });
    await driver.findElement(By.id('save-investigation')).click();
    await driver.wait(
      async () =>
        (await sectionText(driver, saveSection)).includes('quota was exceeded'),
      10000,
    );
    await assertPair(driver);
    await driver.executeScript(() => {
      IDBObjectStore.prototype.put = globalThis.__addonrayOriginalPut;
      IDBObjectStore.prototype.add = globalThis.__addonrayOriginalAdd;
      delete globalThis.__addonrayOriginalPut;
      delete globalThis.__addonrayOriginalAdd;
    });
    passed(
      `${authority}: simulated QuotaExceededError is reported truthfully and preserves the live investigation`,
      {
        savedInvestigations: {
          quota: 'simulated in the packaged product',
          engineQuotaObserved: false,
        },
      },
    );
  }

  await driver.executeScript(() => {
    const probe = {
      original: IDBDatabase.prototype.transaction,
      failNext: true,
      writes: 0,
    };
    window.__addonrayReadinessProbe = probe;
    IDBDatabase.prototype.transaction = function (...args) {
      if (probe.failNext) {
        probe.failNext = false;
        throw new DOMException(
          'simulated connection loss',
          'InvalidStateError',
        );
      }
      if (args[1] === 'readwrite') probe.writes += 1;
      return Reflect.apply(probe.original, this, args);
    };
  });
  try {
    await driver.findElement(By.id('save-investigation')).click();
    await driver.wait(
      until.elementLocated(By.id('retry-saved-storage')),
      10000,
    );
    assert.equal(
      await driver.findElement(By.id('save-investigation')).isEnabled(),
      false,
    );
    await assertPair(driver);
    await driver.findElement(By.id('retry-saved-storage')).click();
    await driver.wait(
      async () => driver.findElement(By.id('save-investigation')).isEnabled(),
      10000,
    );
    await assertPair(driver);
    const retry = await driver.executeScript(() => ({
      failedBarrier: window.__addonrayReadinessProbe.failNext === false,
      writes: window.__addonrayReadinessProbe.writes,
    }));
    assert.equal(retry.failedBarrier, true);
    assert.equal(retry.writes, 0, 'Readiness retry must not autosave');
    passed(
      `${authority}: explicit storage retry recovers a simulated lost connection without reload, autosave or live-pair loss`,
      {
        savedInvestigations: {
          readinessRetry: 'simulated connection loss',
          ...retry,
        },
      },
    );
  } finally {
    await driver.executeScript(() => {
      const probe = window.__addonrayReadinessProbe;
      if (probe) {
        IDBDatabase.prototype.transaction = probe.original;
        delete window.__addonrayReadinessProbe;
      }
    });
  }

  await saveOnce(driver);
  const lifecycleLibrary = await openDirectLibrary(driver, libraryUrl);
  await assertLibraryRecord({
    driver,
    fixtureId,
    fixtureName,
    investigationLabel,
    changeKind,
  });
  const lifecycleDeleter = await openDirectLibrary(driver, libraryUrl);
  await driver.switchTo().window(lifecycleDeleter);
  await driver.executeScript(() => {
    BroadcastChannel.prototype.postMessage = () => {};
  });
  await deleteShownRecord(driver);
  await driver.switchTo().window(lifecycleLibrary);
  console.log('Saved lifecycle: dispatch pagehide');
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
      (await driver.findElements(By.id('archive-heading'))).length === 0 &&
      !(await driver.findElement(By.css('body')).getText()).includes(
        'Read-only saved investigation',
      ),
    10000,
  );
  console.log('Saved lifecycle: pagehide cleared archive');
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
      (await driver.findElement(By.css('body')).getText()).includes(
        'No saved investigations.',
      ),
    10000,
  );
  assert.equal((await driver.findElements(By.id('archive-heading'))).length, 0);
  console.log('Saved lifecycle: pageshow revalidated empty');
  passed(
    `${authority}: a simulated restored library page revalidates and cannot show a deleted archive`,
    {
      savedInvestigations: {
        lifecycle: 'simulated pageshow with persisted=true',
        actualBfcacheObserved: false,
        notification: 'withheld by a no-op BroadcastChannel',
      },
    },
  );
  console.log('Saved lifecycle: close views');
  await driver.close();
  await driver.switchTo().window(lifecycleDeleter);
  await driver.close();
  await driver.switchTo().window(investigationWindow);
  console.log('Saved lifecycle: final save');
  await saveOnce(driver);
  await openDirectLibrary(driver, libraryUrl);
  await assertLibraryRecord({
    driver,
    fixtureId,
    fixtureName,
    investigationLabel,
    changeKind,
  });
  await driver.close();
  await driver.switchTo().window(investigationWindow);
  passed(
    `${authority}: a reloaded library lists and reopens the saved archive`,
    { savedInvestigations: { reload: 'fresh document read' } },
  );
  return { libraryUrl };
}

export async function finishSavedInvestigations({
  driver,
  libraryUrl,
  returnWindow,
  authority,
  passed,
  revoked,
  fixtureName,
  changeKind,
}) {
  const handle = await openDirectLibrary(driver, libraryUrl);
  await assertLibraryRecord({
    driver,
    fixtureName,
    changeKind,
  });
  const rows = await driver.findElements(By.css('.library-entry'));
  assert.equal(rows.length, 1, 'The saved archive must survive access changes');
  if (revoked) {
    const granted = await driver.executeAsyncScript((done) =>
      (globalThis.browser ?? globalThis.chrome).permissions
        .contains({ permissions: ['management'] })
        .then(done),
    );
    assert.equal(granted, false, 'Management access must be removed');
    assert.equal(
      (await driver.findElements(By.css('.library-entry'))).length,
      1,
      'The archive must remain visible without management access',
    );
    await driver.findElement(By.id('open-saved-record')).click();
    await driver.wait(until.elementLocated(By.id('archive-heading')), 10000);
    passed(
      `${authority}: saved archives remain listable and readable after management access is removed`,
      { savedInvestigations: { permissionRemoval: 'archive remained usable' } },
    );
  }
  await deleteShownRecord(driver);
  await driver.close();
  if ((await driver.getAllWindowHandles()).includes(returnWindow))
    await driver.switchTo().window(returnWindow);
  else await driver.switchTo().newWindow('tab');
  passed(
    `${authority}: the retained archive is deleted explicitly and the library returns to empty`,
    { savedInvestigations: { cleanup: 'record deleted' } },
  );
  return handle;
}

function readPrivateStartup(driver) {
  return driver.executeScript(() => {
    const target = gBrowser.selectedBrowser;
    return {
      uri: target.currentURI?.spec ?? '',
      loading: target.webProgress?.isLoadingDocument ?? true,
      delayedStartupFinished: Boolean(
        window.gBrowserInit?.delayedStartupFinished,
      ),
    };
  });
}

async function waitForPrivateStartup(driver) {
  return driver.wait(async () => {
    const state = await readPrivateStartup(driver);
    return state.delayedStartupFinished &&
      state.uri !== '' &&
      state.uri !== 'about:blank' &&
      !state.loading
      ? state
      : false;
  }, 10000);
}

async function waitForPrivateRoute(driver, url, id, selector, timeout) {
  await driver.setContext('content');
  await driver.get(url);
  await driver.wait(
    () =>
      driver.executeScript(
        (expectedUrl, extensionId, requiredSelector) =>
          location.href === expectedUrl &&
          document.readyState === 'complete' &&
          globalThis.browser?.runtime?.id === extensionId &&
          Boolean(document.querySelector(requiredSelector)),
        url,
        id,
        selector,
      ),
    timeout,
  );
}

export async function checkFirefoxSavedPrivate({
  driver,
  id,
  popupUrl,
  libraryUrl,
  authority,
  passed,
  returnWindow,
}) {
  const sentinelId = '99999999-9999-9999-9999-999999999999';
  const sentinelName = 'PRIVATE-SENTINEL-NAME';
  const evidence = { stage: 'seed-sentinel' };
  const owned = new Set();
  const origin = returnWindow ?? (await driver.getWindowHandle());
  let stage = 'seed-sentinel';
  let stable = null;
  try {
    const normalLibrary = await openDirectLibrary(driver, libraryUrl);
    await driver.executeAsyncScript(
      (recordId, name, done) => {
        const record = {
          schemaVersion: 1,
          recordId,
          origin: 'captured',
          savedAt: Date.now(),
          expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
          report: {
            before: { extensions: [{ name, version: '1', enabled: true }] },
            after: { extensions: [{ name, version: '1', enabled: false }] },
            changes: [{ kind: 'disabled', name, version: '1', enabled: false }],
            assessment: 'uncertain',
            timing: { before: null, after: null },
            pageErrors: { before: null, after: null },
            observationLimits: {
              pageErrorWindowMs: 30000,
              pageErrorEvents: 200,
              pageErrorSummaryBytes: 1024,
            },
          },
        };
        const request = indexedDB.open('addonray-saved-investigations');
        request.onerror = () => done({ error: String(request.error) });
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(['records'], 'readwrite');
          transaction.objectStore('records').put(record);
          transaction.oncomplete = () => {
            database.close();
            done({ ok: true });
          };
          transaction.onabort = () =>
            done({ error: String(transaction.error) });
        };
      },
      sentinelId,
      sentinelName,
    );
    await driver
      .findElement(By.xpath('//button[normalize-space(.)="Refresh"]'))
      .click();
    await driver.wait(
      async () =>
        (await driver.findElements(By.css('.library-entry'))).length === 1,
      10000,
    );
    await driver.findElement(By.id('open-saved-record')).click();
    await driver.wait(
      async () =>
        (
          await driver.findElement(By.css('article.archive')).getText()
        ).includes(sentinelName),
      10000,
    );
    evidence.normalControl = 'sentinel visible in a normal window';
    stage = 'close-normal-control';
    await driver.close();
    owned.delete(normalLibrary);
    const afterClose = await driver.getAllWindowHandles();
    stage = 'return-to-origin';
    if (afterClose.includes(origin)) await driver.switchTo().window(origin);
    else if (afterClose.length > 0)
      await driver.switchTo().window(afterClose[0]);

    stage = 'open-stable-tab';
    await driver.switchTo().newWindow('tab');
    stable = await driver.getWindowHandle();
    await driver.get('about:blank');
    await driver.setContext('chrome');
    const enabled = await driver.executeAsyncScript(
      async (extensionId, done) => {
        try {
          const { ExtensionPermissions } = ChromeUtils.importESModule(
            'resource://gre/modules/ExtensionPermissions.sys.mjs',
          );
          const { AddonManager } = ChromeUtils.importESModule(
            'resource://gre/modules/AddonManager.sys.mjs',
          );
          const extension = WebExtensionPolicy.getByID(extensionId).extension;
          await ExtensionPermissions.add(
            extensionId,
            { permissions: ['internal:privateBrowsingAllowed'], origins: [] },
            extension,
          );
          await (await AddonManager.getAddonByID(extensionId)).reload();
          done({
            enabled: (
              await ExtensionPermissions.get(extensionId)
            ).permissions.includes('internal:privateBrowsingAllowed'),
          });
        } catch (error) {
          done({ enabled: false, failure: String(error) });
        }
      },
      id,
    );
    assert.equal(enabled.enabled, true, JSON.stringify(enabled));
    evidence.privateAllowance = 'test-only internal privateBrowsingAllowed';
    await driver.setContext('content');

    stage = 'open-private-window';
    const previous = new Set(await driver.getAllWindowHandles());
    await driver.setContext('chrome');
    await driver.executeScript(() => {
      OpenBrowserWindow({ private: true });
    });
    await driver.setContext('content');
    const privateWindow = await driver.wait(
      async () =>
        (await driver.getAllWindowHandles()).find(
          (handle) => !previous.has(handle),
        ),
      10000,
    );
    owned.add(privateWindow);
    await driver.switchTo().window(privateWindow);
    await driver.setContext('chrome');
    evidence.privateWindow = await driver.executeScript(() =>
      ChromeUtils.importESModule(
        'resource://gre/modules/PrivateBrowsingUtils.sys.mjs',
      ).PrivateBrowsingUtils.isWindowPrivate(window),
    );
    assert.equal(evidence.privateWindow, true);
    stage = 'wait-private-startup';
    await waitForPrivateStartup(driver);
    await driver.setContext('content');
    stage = 'private-popup-route';
    await waitForPrivateRoute(
      driver,
      popupUrl,
      id,
      '#open-saved-investigations',
      10000,
    );
    assert.equal(
      await driver.executeAsyncScript((done) =>
        browser.tabs.getCurrent().then((tab) => done(tab.incognito)),
      ),
      true,
    );
    const beforeClick = new Set(await driver.getAllWindowHandles());
    await driver.findElement(By.id('open-saved-investigations')).click();
    await new Promise((resolve) => setTimeout(resolve, 750));
    const afterClick = await driver.getAllWindowHandles();
    assert.equal(
      afterClick.filter((handle) => !beforeClick.has(handle)).length,
      0,
      'The private popup must not open a library tab',
    );
    const privatePopupText = await driver.findElement(By.css('body')).getText();
    assert(privatePopupText.includes('verified normal windows'));
    evidence.privateLauncher = 'refused in an authentic private window';

    stage = 'private-library-route';
    await waitForPrivateRoute(
      driver,
      libraryUrl,
      id,
      '#library-denied-heading',
      10000,
    );
    const privateText = await driver.findElement(By.css('body')).getText();
    assert(privateText.includes('Normal windows only'));
    assert(!privateText.includes(sentinelName));
    assert(!privateText.includes(sentinelId.slice(0, 8)));
    assert.equal(
      (await driver.findElements(By.css('.library-entry'))).length,
      0,
    );
    assert.equal(
      (await driver.findElements(By.id('archive-heading'))).length,
      0,
    );
    evidence.privateLibrary = 'no rows or archive data rendered';
    stage = 'passed';
    passed(
      `${authority}: the popup launcher and library both refuse an authentic private window before exposing a seeded archive`,
      { savedInvestigations: evidence },
    );
    return evidence;
  } catch (error) {
    evidence.failure = { stage, error: String(error) };
    throw new Error(`Saved private check failed at ${stage}: ${error}`, {
      cause: error,
    });
  } finally {
    await driver.setContext('content');
    for (const handle of owned) {
      if ((await driver.getAllWindowHandles()).includes(handle)) {
        await driver.switchTo().window(handle);
        await driver.close();
      }
    }
    const remaining = await driver.getAllWindowHandles();
    if (stable && remaining.includes(stable))
      await driver.switchTo().window(stable);
    else if (remaining.includes(origin)) await driver.switchTo().window(origin);
    else if (remaining.length > 0) await driver.switchTo().window(remaining[0]);
    else await driver.switchTo().newWindow('tab');
  }
}
