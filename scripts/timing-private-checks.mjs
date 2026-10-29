/* global browser, ChromeUtils, WebExtensionPolicy, OpenBrowserWindow, gBrowser */
import assert from 'node:assert/strict';
import { By, until } from 'selenium-webdriver';

const startupTimeout = 10000;
const controlRouteTimeout = 5000;
const receiverRouteTimeout = 10000;

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

// A new private window exposes a tab handle before its own startup document has
// committed. Requesting the fixture route during that window lets the pending
// startup navigation replace it. Wait for the window's startup document itself.
async function waitForPrivateStartup(driver) {
  return driver.wait(async () => {
    const state = await readPrivateStartup(driver);
    return state.delayedStartupFinished &&
      state.uri !== '' &&
      state.uri !== 'about:blank' &&
      !state.loading
      ? state
      : false;
  }, startupTimeout);
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

export async function checkFirefoxPrivateHandoff({
  driver,
  id,
  popupUrl,
  investigationUrl,
  localUrl,
  report,
  passed,
  returnWindow,
}) {
  const origin = returnWindow ?? (await driver.getWindowHandle());
  const owned = new Set();
  const evidence = { stage: 'enable-disposable-fixture', cleanup: {} };
  report.timingHandoff.privateWindow = evidence;
  try {
    // Reloading the fixture discards its own contexts; keep the driver in an owned blank tab.
    await driver.switchTo().newWindow('tab');
    owned.add(await driver.getWindowHandle());
    await driver.get('about:blank');
    await driver.setContext('chrome');
    const enabled = await driver.executeAsyncScript(async (id, done) => {
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
          { permissions: ['internal:privateBrowsingAllowed'], origins: [] },
          extension,
        );
        await (await AddonManager.getAddonByID(id)).reload();
        done({
          enabled: (await ExtensionPermissions.get(id)).permissions.includes(
            'internal:privateBrowsingAllowed',
          ),
        });
      } catch (error) {
        done({ enabled: false, failure: String(error) });
      }
    }, id);
    assert.equal(enabled.enabled, true, JSON.stringify(enabled));
    await driver.setContext('content');
    await driver.switchTo().newWindow('tab');
    owned.add(await driver.getWindowHandle());
    await driver.get(popupUrl);
    await driver.wait(until.elementLocated(By.id('grant-research')), 10000);
    await driver.findElement(By.id('grant-research')).click();
    await driver.wait(
      () =>
        driver.executeAsyncScript((done) =>
          browser.permissions
            .contains({ permissions: ['management', 'scripting'] })
            .then(done),
        ),
      10000,
    );
    evidence.stage = 'create-private-window';
    const previous = new Set(await driver.getAllWindowHandles());
    await driver.setContext('chrome');
    await driver.executeScript(() => {
      OpenBrowserWindow({ private: true });
    });
    await driver.setContext('content');
    const privateControl = await driver.wait(
      async () =>
        (await driver.getAllWindowHandles()).find(
          (handle) => !previous.has(handle),
        ),
      10000,
    );
    owned.add(privateControl);
    await driver.switchTo().window(privateControl);
    await driver.setContext('chrome');
    evidence.privateWindow = await driver.executeScript(() =>
      ChromeUtils.importESModule(
        'resource://gre/modules/PrivateBrowsingUtils.sys.mjs',
      ).PrivateBrowsingUtils.isWindowPrivate(window),
    );
    assert.equal(evidence.privateWindow, true);
    evidence.startup = { atHandle: await readPrivateStartup(driver) };
    try {
      evidence.startup.settled = await waitForPrivateStartup(driver);
      await driver.setContext('content');
      await driver.wait(
        () => driver.executeScript(() => document.readyState === 'complete'),
        startupTimeout,
      );
      await waitForPrivateRoute(
        driver,
        popupUrl,
        id,
        '#page',
        controlRouteTimeout,
      );
    } catch (error) {
      evidence.stage = 'unqualified-private-control-route';
      evidence.routeFailure = String(error);
      try {
        await driver.setContext('content');
        evidence.control = await driver.executeScript(() => ({
          url: location.href,
          readyState: document.readyState,
          extensionApiAvailable: typeof browser !== 'undefined',
          text: document.body?.innerText.slice(0, 1200) ?? '',
        }));
      } catch (readError) {
        evidence.control = { readFailure: String(readError) };
      }
      try {
        await driver.setContext('chrome');
        evidence.startup.last = await readPrivateStartup(driver);
      } catch (readError) {
        evidence.startup.last = { readFailure: String(readError) };
      }
      evidence.source =
        'Requested fixture control document did not load at its exact route in the verified private window after the private startup document settled. No private-source or receiver guard verdict.';
      report.gaps.push(
        'Private-window headless fixture control could not load at its exact route; actual unmodified native private-source exclusion is required separately. Deterministic guards do not replace this observation.',
      );
      return evidence;
    }
    evidence.controlRoute = await driver.executeScript(() => ({
      url: location.href,
      readyState: document.readyState,
    }));
    const privateFlag = await driver.executeAsyncScript((done) =>
      browser.tabs.getCurrent().then((tab) => done(tab.incognito)),
    );
    assert.equal(privateFlag, true);
    await driver.switchTo().newWindow('tab');
    const source = await driver.getWindowHandle();
    owned.add(source);
    await driver.get(`${localUrl}timing-private-source`);
    await driver.switchTo().window(privateControl);
    await driver.setContext('chrome');
    await driver.executeScript((url) => {
      const tab = [...gBrowser.tabs].find(
        (tab) => tab.linkedBrowser.currentURI.spec === url,
      );
      gBrowser.selectedTab = tab;
    }, `${localUrl}timing-private-source`);
    await driver.findElement(By.id('unified-extensions-button')).click();
    await driver
      .findElement(
        By.css(
          `[data-extensionid="${id}"] .unified-extensions-item-action-button`,
        ),
      )
      .click();
    await driver.wait(
      until.elementLocated(By.css('.webextension-popup-browser')),
      10000,
    );
    await driver.setContext('content');
    evidence.stage = 'capture-private-source';
    await driver.executeScript((url) => {
      const popup = browser.extension
        .getViews({ type: 'popup' })
        .find((view) => view.location.href === url);
      popup.document.querySelector('#page').click();
    }, popupUrl);
    const read = () =>
      driver.executeScript((url) => {
        const popup = browser.extension
          .getViews({ type: 'popup' })
          .find((view) => view.location.href === url);
        return popup
          ? {
              body: popup.document.body.innerText,
              normal: popup.addonrayTimingPopup.normal(),
              selected: !!popup.document.querySelector('#timing-destination'),
            }
          : null;
      }, popupUrl);
    await driver.wait(
      async () => (await read())?.body.includes('Document: complete'),
      10000,
    );
    assert.equal((await read()).normal, false);
    await driver.executeScript(
      (url) =>
        browser.extension
          .getViews({ type: 'popup' })
          .find((view) => view.location.href === url)
          .document.querySelector('#timing-destinations')
          .click(),
      popupUrl,
    );
    await driver.wait(
      async () => (await read())?.body.includes('verified normal windows'),
      10000,
    );
    assert.equal((await read()).selected, false);
    passed(
      'Firefox source-popup fixture: actual private source cannot discover or send timing attachments',
    );
    await driver.setContext('chrome');
    await driver.executeScript(() =>
      document
        .querySelector('.webextension-popup-browser')
        ?.closest('panel')
        .hidePopup(),
    );
    await driver.setContext('content');
    await driver.switchTo().window(privateControl);
    await waitForPrivateRoute(
      driver,
      investigationUrl,
      id,
      '#investigation-label',
      receiverRouteTimeout,
    );
    evidence.receiverRoute = await driver.executeScript(() => ({
      url: location.href,
      readyState: document.readyState,
    }));
    const receiver = await driver.executeAsyncScript(async (done) => {
      const tab = await browser.tabs.getCurrent();
      done({
        incognito: tab.incognito,
        metadata: await window.addonrayTimingInvestigation.metadata(window),
        measurements: [...document.querySelectorAll('[data-side]')].map(
          (cell) => cell.textContent,
        ),
      });
    });
    assert.equal(receiver.incognito, true);
    assert.equal(receiver.metadata, null);
    assert(
      receiver.measurements.every(
        (value) =>
          value === 'Not attached' || value === 'Needs two measured values',
      ),
    );
    passed(
      'Firefox source fixture: fresh private investigation reports its private context and rejects non-popup discovery',
    );
    Object.assign(evidence, {
      stage: 'passed',
      source:
        'Actual private HTTP source, real toolbar grant, compiled production source-popup fixture',
      receiver:
        'Fresh unchanged packaged investigation assets report a private tab and reject metadata(window) as non-popup. No independently exercised otherwise-valid receiver-private guard verdict; that branch has deterministic tests.',
      authority:
        'Disposable fixture-only internal privateBrowsingAllowed permission and reload through Firefox browser test authority; no product change',
    });
    return evidence;
  } catch (error) {
    evidence.failure = String(error);
    throw error;
  } finally {
    await driver.setContext('content');
    for (const handle of owned) {
      if ((await driver.getAllWindowHandles()).includes(handle)) {
        await driver.switchTo().window(handle);
        await driver.close();
      }
    }
    const remaining = await driver.getAllWindowHandles();
    if (remaining.includes(origin)) await driver.switchTo().window(origin);
    else if (remaining.length) await driver.switchTo().window(remaining[0]);
    evidence.cleanup.ownedTabsClosed = true;
  }
}
