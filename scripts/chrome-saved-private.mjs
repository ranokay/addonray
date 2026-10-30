import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { By, until } from 'selenium-webdriver';
import { launchChrome } from './chrome-session.mjs';

function chromeExtensionId(path) {
  const digest = createHash('sha256').update(resolve(path)).digest();
  return [...digest.subarray(0, 16)]
    .flatMap((byte) => [byte >> 4, byte & 0x0f])
    .map((nibble) => String.fromCharCode(97 + nibble))
    .join('');
}

function sleep(milliseconds) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
}

async function waitForLibrary(driver, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const heading = await driver.findElements(By.id('library-list-heading'));
    if (heading.length) return;
    const denied = await driver.findElements(By.id('library-denied-heading'));
    if (denied.length) return;
    await sleep(100);
  }
  throw new Error('Library route did not reach a context decision');
}

async function allowIncognito(driver, extensionId) {
  await driver.get(`chrome://extensions/?id=${extensionId}`);
  await driver.wait(async () => {
    return driver.executeScript(() => {
      const manager = document.querySelector('extensions-manager');
      return Boolean(
        manager?.shadowRoot
          ?.querySelector('extensions-detail-view')
          ?.shadowRoot?.querySelector('#allow-incognito'),
      );
    });
  }, 10000);
  const result = await driver.executeScript(() => {
    const manager = document.querySelector('extensions-manager');
    const detail = manager?.shadowRoot?.querySelector('extensions-detail-view');
    const row = detail?.shadowRoot?.querySelector('#allow-incognito');
    const toggle =
      row?.shadowRoot?.querySelector('cr-toggle') ??
      row?.querySelector('cr-toggle');
    if (!toggle) return { found: false, checked: null };
    if (toggle.checked !== true) toggle.click();
    return { found: true, clicked: true };
  });
  await sleep(500);
  const checked = await driver.executeScript(() => {
    const manager = document.querySelector('extensions-manager');
    const detail = manager?.shadowRoot?.querySelector('extensions-detail-view');
    const row = detail?.shadowRoot?.querySelector('#allow-incognito');
    const toggle =
      row?.shadowRoot?.querySelector('cr-toggle') ??
      row?.querySelector('cr-toggle');
    return toggle?.checked === true;
  });
  assert.equal(result.found, true, JSON.stringify(result));
  assert.equal(checked, true, 'Chrome must allow the fixture in incognito');
  return result;
}

export async function checkChromeSavedPrivate({
  uiDirectory,
  profileDirectory,
  authority,
  passed,
}) {
  await mkdir(profileDirectory, { recursive: true });
  const extensionDirectory = resolve('.scratch/chrome-saved-private-fixture');
  await rm(extensionDirectory, { recursive: true, force: true });
  await cp(uiDirectory, extensionDirectory, { recursive: true });
  const id = chromeExtensionId(extensionDirectory);
  const libraryUrl = `chrome-extension://${id}/library.html`;
  const popupUrl = `chrome-extension://${id}/popup.html`;
  const sentinelId = 'abababab-abab-abab-abab-abababababab';
  const sentinelName = 'INCOGNITO-SENTINEL';
  let normal;
  let privateSession;

  try {
    normal = await launchChrome({
      userDataDir: profileDirectory,
      loadExtensions: [extensionDirectory],
    });
    await normal.driver.get(libraryUrl);
    try {
      await waitForLibrary(normal.driver);
    } catch (error) {
      console.error(
        'Chrome saved-private normal library failed',
        await normal.driver.getCurrentUrl().catch(() => 'url-unavailable'),
        await normal.driver.getTitle().catch(() => 'title-unavailable'),
        await normal.driver
          .findElement(By.css('body'))
          .getText()
          .catch(() => 'body-unavailable'),
      );
      throw error;
    }
    const seed = await normal.driver.executeAsyncScript(
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
        const request = indexedDB.open('addonray-saved-investigations', 1);
        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains('records'))
            database.createObjectStore('records', { keyPath: 'recordId' });
          if (!database.objectStoreNames.contains('meta'))
            database.createObjectStore('meta', { keyPath: 'key' });
          request.transaction.objectStore('meta').put({
            key: 'state',
            value: { storeId: 'sentinel-store-0123456789', epoch: 0 },
          });
        };
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
    assert.equal(seed.ok, true, JSON.stringify(seed));
    await normal.driver.findElement(By.id('library-list-heading'));
    await normal.driver
      .findElement(By.xpath('//button[normalize-space(.)="Refresh"]'))
      .click();
    await normal.driver.wait(
      async () =>
        (await normal.driver.findElements(By.css('.library-entry'))).length ===
        1,
      10000,
    );
    await normal.driver.findElement(By.id('open-saved-record')).click();
    const archive = await normal.driver.wait(
      until.elementLocated(By.css('article.archive')),
      10000,
    );
    assert((await archive.getText()).includes(sentinelName));
    await allowIncognito(normal.driver, id);
    normal.cdp.close();
    await normal.driver.quit();
    normal = null;

    const incognito = await launchChrome({
      userDataDir: profileDirectory,
      loadExtensions: [extensionDirectory],
      incognito: true,
    });
    privateSession = incognito;
    const { driver, cdp } = incognito;
    const contexts = await cdp.send('Target.getBrowserContexts');
    const tabTargets = await cdp.send('Target.getTargets', {
      filter: [{ type: 'tab' }],
    });
    const incognitoContext =
      contexts.browserContextIds[0] ??
      tabTargets.targetInfos[0]?.browserContextId ??
      null;
    let tab =
      tabTargets.targetInfos.find(
        (target) =>
          incognitoContext !== null &&
          target.browserContextId === incognitoContext,
      ) ?? tabTargets.targetInfos[0];
    if (!tab && incognitoContext) {
      const created = await cdp.send('Target.createTarget', {
        url: 'about:blank',
        browserContextId: incognitoContext,
      });
      tab = { targetId: created.targetId };
    }
    assert(tab, 'No incognito tab target for the toolbar action');
    const trigger = await cdp
      .send('Extensions.triggerAction', {
        id,
        targetId: tab.targetId,
      })
      .catch((error) => ({ error: String(error) }));
    assert.equal(trigger.error, undefined, trigger.error);
    let popup;
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const targets = await cdp.send('Target.getTargets');
      popup = targets.targetInfos.find((target) => target.url === popupUrl);
      if (popup) break;
      await sleep(100);
    }
    assert(popup, 'The authentic incognito toolbar popup did not open');
    const { sessionId } = await cdp.send('Target.attachToTarget', {
      targetId: popup.targetId,
      flatten: true,
    });
    async function evaluate(expression, userGesture = false) {
      const result = await cdp.send(
        'Runtime.evaluate',
        {
          expression,
          awaitPromise: true,
          returnByValue: true,
          userGesture,
        },
        sessionId,
      );
      assert.equal(result.exceptionDetails, undefined, JSON.stringify(result));
      return result.result?.value;
    }
    const readyDeadline = Date.now() + 10000;
    let body = '';
    while (Date.now() < readyDeadline) {
      body = await evaluate('document.body.innerText');
      if (body.includes('Saved investigations')) break;
      await sleep(100);
    }
    assert(body.includes('Saved investigations'), body);
    const seeded = await evaluate(`(async () => {
      const record = {
        schemaVersion: 1,
        recordId: ${JSON.stringify(sentinelId)},
        origin: 'captured',
        savedAt: Date.now(),
        expiresAt: Date.now() + 30*24*60*60*1000,
        report: {
          before: { extensions: [{ name: ${JSON.stringify(sentinelName)}, version: '1', enabled: true }] },
          after: { extensions: [{ name: ${JSON.stringify(sentinelName)}, version: '1', enabled: false }] },
          changes: [{ kind: 'disabled', name: ${JSON.stringify(sentinelName)}, version: '1', enabled: false }],
          assessment: 'uncertain',
          timing: { before: null, after: null },
          pageErrors: { before: null, after: null },
          observationLimits: { pageErrorWindowMs: 30000, pageErrorEvents: 200, pageErrorSummaryBytes: 1024 }
        }
      };
      return await new Promise((done) => {
        const request = indexedDB.open('addonray-saved-investigations', 1);
        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains('records'))
            database.createObjectStore('records', { keyPath: 'recordId' });
          if (!database.objectStoreNames.contains('meta'))
            database.createObjectStore('meta', { keyPath: 'key' });
          request.transaction.objectStore('meta').put({
            key: 'state',
            value: { storeId: 'sentinel-store-0123456789', epoch: 0 }
          });
        };
        request.onerror = () => done({ error: String(request.error) });
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(['records'], 'readwrite');
          transaction.objectStore('records').put(record);
          transaction.oncomplete = () => { database.close(); done({ ok: true }); };
          transaction.onabort = () => done({ error: String(transaction.error) });
        };
      });
    })()`);
    assert.equal(seeded.ok, true, JSON.stringify(seeded));

    const beforeClick = await cdp.send('Target.getTargets');
    await evaluate(
      "document.querySelector('#open-saved-investigations').click()",
      true,
    );
    await sleep(750);
    const afterClick = await cdp.send('Target.getTargets');
    assert.equal(
      afterClick.targetInfos.filter(
        (target) =>
          target.url === libraryUrl &&
          !beforeClick.targetInfos.some(
            (before) => before.targetId === target.targetId,
          ),
      ).length,
      0,
      'The incognito popup must not open a library tab',
    );
    body = await evaluate('document.body.innerText');
    assert(
      body.includes('verified normal windows'),
      'The incognito popup must report its context refusal',
    );

    let mainFrame = { status: 'unavailable' };
    if (incognitoContext) {
      let libSession = null;
      try {
        const created = await cdp.send('Target.createTarget', {
          url: libraryUrl,
          browserContextId: incognitoContext,
        });
        ({ sessionId: libSession } = await cdp.send('Target.attachToTarget', {
          targetId: created.targetId,
          flatten: true,
        }));
        await sleep(1000);
        const observed = await cdp.send(
          'Runtime.evaluate',
          {
            expression:
              '({ title: document.title, text: document.body.innerText, rows: document.querySelectorAll(".library-entry").length, denied: Boolean(document.querySelector("#library-denied-heading")) })',
            returnByValue: true,
          },
          libSession,
        );
        const value = observed.result?.value ?? {};
        mainFrame = {
          status:
            value.title === 'Saved investigations · AddonRay'
              ? value.denied
                ? 'denied'
                : 'unexpected'
              : 'browser-blocked',
          rows: value.rows ?? null,
          sentinelVisible: String(value.text ?? '').includes(sentinelName),
          title: value.title ?? null,
        };
        assert.equal(mainFrame.rows, 0);
        assert.equal(mainFrame.sentinelVisible, false);
        if (mainFrame.status === 'unexpected')
          throw new Error('Private library route rendered without a denial');
        await cdp.send('Target.closeTarget', { targetId: created.targetId });
      } catch (error) {
        if (mainFrame.status === 'unexpected') throw error;
        mainFrame = { status: 'browser-blocked', error: String(error) };
      } finally {
        if (libSession)
          await cdp
            .send('Target.detachFromTarget', { sessionId: libSession })
            .catch(() => {});
      }
    }
    assert.notEqual(mainFrame.status, 'unexpected');
    await cdp.send('Target.closeTarget', { targetId: popup.targetId });
    await cdp.send('Target.detachFromTarget', { sessionId });
    passed(
      `${authority}: the authentic incognito popup refuses the library and exposes no seeded archive`,
      {
        savedInvestigations: {
          privateLauncher: 'refused',
          privateMainFrame: mainFrame,
          storagePartition:
            'sentinel seeded in the incognito extension partition before the action',
        },
      },
    );
    incognito.cdp.close();
    await driver.quit();
    privateSession = null;
    return mainFrame;
  } finally {
    if (normal) await normal.driver.quit().catch(() => {});
    if (privateSession) await privateSession.driver.quit().catch(() => {});
  }
}
