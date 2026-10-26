/* global gBrowser */
import assert from 'node:assert/strict';
import { By, Key, until } from 'selenium-webdriver';

const milestones = ['domContentLoaded', 'loadEvent', 'firstContentfulPaint'];
const before = '[data-testid="before-snapshot"]';
const after = '[data-testid="after-snapshot"]';

// The driver remains on its own packaged control document while the toolbar popup
// is foreground. No production hook, host grant, or background coordinator is used.
async function popupCommand(driver, popupUrl, command, value = null) {
  const result = await driver.executeAsyncScript(
    async (url, action, input, done) => {
      try {
        const api = globalThis.browser ?? globalThis.chrome;
        const view = api.extension
          .getViews({ type: 'popup' })
          .find((candidate) => {
            try {
              return candidate.location.href === url;
            } catch {
              return false;
            }
          });
        if ((!view || !view.document?.body) && action === 'read')
          return done({
            pending: true,
            body: '',
            status: '',
            destination: null,
            side: null,
            options: [],
            sides: [],
            confirmDisabled: true,
            discoveryDisabled: true,
          });
        if (!view) return done({ unavailable: true });
        const doc = view.document;
        if (action === 'click' || action === 'focus') {
          const element = input.startsWith('text:')
            ? [...doc.querySelectorAll('button')].find((item) =>
                item.textContent.includes(input.slice(5)),
              )
            : doc.querySelector(input);
          if (!element) throw new Error('Requested popup control is absent');
          element[action]();
        } else if (action === 'select') {
          const element = doc.querySelector(input.selector);
          element.value = input.value;
          element.dispatchEvent(new view.Event('change', { bubbles: true }));
        } else if (action === 'destination-action') {
          const target = api.extension
            .getViews({ type: 'tab' })
            .find((candidate) => {
              try {
                return (
                  candidate.document.querySelector('#investigation-label')
                    ?.textContent === input.label
                );
              } catch {
                return false;
              }
            });
          if (!target) throw new Error('Owned investigation is absent');
          if (input.selector)
            target.document.querySelector(input.selector).click();
          if (input.reload) target.location.reload();
          if (input.close) {
            const tab = await (
              target.browser ?? target.chrome
            ).tabs.getCurrent();
            await api.tabs.remove(tab.id);
          }
        }
        done({
          body: doc.body.innerText,
          status:
            doc.querySelector('#timing-attachment-status')?.textContent ?? '',
          destination: doc.querySelector('#timing-destination')?.value ?? null,
          side: doc.querySelector('#timing-side')?.value ?? null,
          options: [
            ...(doc.querySelector('#timing-destination')?.options ?? []),
          ].map((option) => ({
            value: option.value,
            label: option.textContent,
          })),
          sides: [...(doc.querySelector('#timing-side')?.options ?? [])].map(
            (option) => option.value,
          ),
          confirmDisabled:
            doc.querySelector('#attach-timing')?.disabled ?? true,
          discoveryDisabled:
            doc.querySelector('#timing-destinations')?.disabled ?? true,
        });
      } catch (error) {
        done({ failure: String(error) });
      }
    },
    popupUrl,
    command,
    value,
  );
  assert.equal(result.failure, undefined, result.failure);
  assert.equal(
    result.unavailable,
    undefined,
    'Actual toolbar popup is unavailable',
  );
  return result;
}

export async function checkTimingHandoff({
  driver,
  cdp,
  browser: target,
  productId,
  popupUrl,
  investigationUrl,
  localUrl,
  grantPermissions,
  revokeScripting,
  checkPrivate,
  report,
  passed,
  authority,
  sourceFixture = false,
}) {
  const originWindow = await driver.getWindowHandle();
  const handles = new Set();
  const evidence = (report.timingHandoff = {
    authority,
    transport: sourceFixture
      ? 'Named source-popup fixture; compiled production core and unchanged packaged investigation assets; pre-granted consent seam'
      : 'Actual toolbar popup; driver-only same-extension control document reads and operates its own view DOM',
    automaticCapture: false,
    sourceHostPermission: false,
    normalWindowVerified: false,
    privateWindow: 'pending',
    unknownContext:
      'Deterministic tests only; no authentic unclassifiable browser view is manufactured',
    cleanup: {},
  });
  let popupTarget = null;
  const command = async (action, value) => {
    const state = await popupCommand(driver, popupUrl, action, value);
    evidence.lastPopup = state;
    return state;
  };
  async function tab(url) {
    await driver.switchTo().newWindow('tab');
    const handle = await driver.getWindowHandle();
    handles.add(handle);
    await driver.get(url);
    await driver.wait(
      () => driver.executeScript(() => document.readyState === 'complete'),
      10000,
    );
    return handle;
  }
  async function emptyTimings() {
    for (const name of milestones) {
      const row = await driver.findElement(
        By.css(`[data-testid="comparison-timing-${name}"]`),
      );
      assert.equal(
        await row.findElement(By.css('[data-side="before"]')).getText(),
        'Not attached',
      );
      assert.equal(
        await row.findElement(By.css('[data-side="after"]')).getText(),
        'Not attached',
      );
      assert.equal(
        await row.findElement(By.css('[data-side="difference"]')).getText(),
        'Needs two measured values',
      );
    }
  }
  async function captureInventory(handle, side) {
    evidence.stage = `inventory:${side}`;
    await driver.switchTo().window(handle);
    await driver.findElement(By.id(`capture-${side}`)).click();
    try {
      await driver.wait(
        until.elementLocated(By.css(side === 'before' ? before : after)),
        10000,
      );
    } catch (error) {
      evidence.inventoryFailure = await driver.executeScript(
        () => document.body.innerText,
      );
      throw error;
    }
  }
  async function label(handle) {
    await driver.switchTo().window(handle);
    return driver.findElement(By.id('investigation-label')).getText();
  }
  async function rows(handle) {
    await driver.switchTo().window(handle);
    return driver.executeScript(() =>
      Object.fromEntries(
        ['domContentLoaded', 'loadEvent', 'firstContentfulPaint'].map(
          (name) => [
            name,
            Object.fromEntries(
              [
                ...document.querySelectorAll(
                  `[data-testid="comparison-timing-${name}"] [data-side]`,
                ),
              ].map((cell) => [cell.dataset.side, cell.textContent]),
            ),
          ],
        ),
      ),
    );
  }
  async function closePopup() {
    if (target === 'firefox') {
      await driver.setContext('chrome');
      await driver.executeScript(() =>
        document
          .querySelector('.webextension-popup-browser')
          ?.closest('panel')
          .hidePopup(),
      );
      await driver.setContext('content');
    } else if (popupTarget) {
      const targets = (await cdp.send('Target.getTargets')).targetInfos;
      if (targets.some((item) => item.targetId === popupTarget))
        await cdp.send('Target.closeTarget', { targetId: popupTarget });
      popupTarget = null;
    }
  }
  let control;
  async function openPopup(sourceUrl) {
    evidence.stage = 'open-popup';
    await driver.switchTo().window(control);
    if (target === 'firefox') {
      await driver.setContext('chrome');
      await driver.executeScript((url) => {
        const source = [...gBrowser.tabs].find(
          (item) => item.linkedBrowser.currentURI.spec === url,
        );
        if (!source) throw new Error('Controlled source tab absent');
        gBrowser.selectedTab = source;
      }, sourceUrl);
      await driver.findElement(By.id('unified-extensions-button')).click();
      await driver
        .findElement(
          By.css(
            `[data-extensionid="${productId}"] .unified-extensions-item-action-button`,
          ),
        )
        .click();
      await driver.wait(
        until.elementLocated(By.css('.webextension-popup-browser')),
        10000,
      );
      await driver.setContext('content');
    } else {
      const targets = await cdp.send('Target.getTargets', {
        filter: [{ type: 'tab' }, { exclude: true }],
      });
      const source = targets.targetInfos.find((item) => item.url === sourceUrl);
      assert(source, 'Controlled source target absent');
      const existingTargets = new Set(
        (await cdp.send('Target.getTargets')).targetInfos.map(
          (item) => item.targetId,
        ),
      );
      await cdp.send('Target.activateTarget', { targetId: source.targetId });
      await cdp.send('Extensions.triggerAction', {
        id: productId,
        targetId: source.targetId,
      });
      popupTarget = (
        await driver.wait(
          async () =>
            (await cdp.send('Target.getTargets')).targetInfos.find(
              (item) =>
                item.url === popupUrl && !existingTargets.has(item.targetId),
            ),
          10000,
        )
      ).targetId;
    }
    await driver.wait(
      async () => (await command('read')).body.includes('Selected-page access'),
      10000,
    );
    assert(
      !(await command('read')).body.includes('Document: complete'),
      'Opening popup must not capture',
    );
  }
  async function pageCapture() {
    evidence.stage = 'capture-page';
    if (target === 'firefox') {
      if (sourceFixture) await command('click', 'text:Allow page access');
      else {
        await command('focus', 'text:Allow page access');
        await driver.setContext('chrome');
        await driver.actions().sendKeys(Key.ENTER).perform();
        await driver.setContext('content');
      }
    } else {
      const attached = await cdp.send('Target.attachToTarget', {
        targetId: popupTarget,
        flatten: true,
      });
      const result = await cdp.send(
        'Runtime.evaluate',
        {
          expression:
            'Array.from(document.querySelectorAll("button")).find(button=>button.textContent.includes("Allow page access")).click()',
          userGesture: true,
          returnByValue: true,
        },
        attached.sessionId,
      );
      assert.equal(result.exceptionDetails, undefined);
    }
    await driver.wait(
      async () => (await command('read')).body.includes('Document: complete'),
      10000,
    );
  }
  async function discover(destinationLabel, side) {
    evidence.stage = `discover:${side}`;
    await command('click', '#timing-destinations');
    const listed = await driver.wait(async () => {
      const state = await command('read');
      return state.options.some((item) => item.value) && state;
    }, 10000);
    assert.equal(listed.destination, '', 'No investigation may be preselected');
    assert.equal(listed.side, '', 'No side may be preselected');
    assert.equal(listed.confirmDisabled, true);
    const option = listed.options.find(
      (item) => item.label === destinationLabel,
    );
    assert(option, `Expected eligible destination ${destinationLabel}`);
    await command('select', {
      selector: '#timing-destination',
      value: option.value,
    });
    await driver.wait(async () => {
      const state = await command('read');
      return state.destination === option.value && state.sides.includes(side);
    }, 10000);
    await command('select', { selector: '#timing-side', value: side });
    await driver.wait(
      async () => !(await command('read')).confirmDisabled,
      10000,
    );
    return listed;
  }
  async function confirm(success) {
    evidence.stage = `confirm:${success}`;
    await command('click', '#attach-timing');
    const state = await driver.wait(async () => {
      const value = await command('read');
      return (
        /^(?:Timing attached to|Timing attachment (?:failed|unavailable|cancelled)|Attachment access declined)/.test(
          value.status,
        ) && value
      );
    }, 10000);
    assert.equal(
      state.status.includes('Timing attached to'),
      success,
      state.status,
    );
    return state;
  }
  try {
    control = await tab(popupUrl);
    await grantPermissions();
    const first = await tab(investigationUrl);
    const second = await tab(investigationUrl);
    const firstLabel = await label(first);
    const secondLabel = await label(second);
    assert.notEqual(firstLabel, secondLabel);
    await emptyTimings();
    await captureInventory(first, 'before');
    await captureInventory(second, 'before');
    await driver.switchTo().window(control);
    const nonPopup = await driver.executeAsyncScript(
      async (url, labels, done) => {
        const api = globalThis.browser ?? globalThis.chrome;
        const views = api.extension
          .getViews({ type: 'tab' })
          .filter(
            (view) =>
              view.location.href === url &&
              labels.includes(
                view.document.querySelector('#investigation-label')
                  ?.textContent,
              ),
          );
        const outcomes = [];
        for (const view of views) {
          outcomes.push({
            metadata: await view.addonrayTimingInvestigation.metadata(window),
            received: await view.addonrayTimingInvestigation.receive(
              {},
              window,
            ),
          });
        }
        done(outcomes);
      },
      investigationUrl,
      [firstLabel, secondLabel],
    );
    assert.equal(nonPopup.length, 2);
    for (const outcome of nonPopup) {
      assert.equal(outcome.metadata, null);
      assert.equal(outcome.received.status, 'error');
    }
    passed(
      `${authority}: actual receiver endpoints reject a same-extension non-popup sender and expose no metadata`,
    );
    const source = await tab(`${localUrl}timing-comparison-source`);
    await tab(`${localUrl}timing-comparison-other`);
    await openPopup(`${localUrl}timing-comparison-source`);
    await pageCapture();
    const listed = await discover(firstLabel, 'before');
    const eligibleLabels = listed.options
      .filter((item) => item.value)
      .map((item) => item.label);
    assert(eligibleLabels.includes(firstLabel));
    assert(eligibleLabels.includes(secondLabel));
    evidence.otherEligibleInvestigations = eligibleLabels.filter(
      (item) => ![firstLabel, secondLabel].includes(item),
    ).length;
    evidence.normalWindowVerified = true;
    passed(
      `${authority}: actual toolbar capture discovers two normal investigations with explicit empty selections`,
    );
    const accepted = await confirm(true);
    assert(accepted.status.includes('used'));
    assert(accepted.body.includes('Document: complete'));
    assert.equal(accepted.destination, null);
    await closePopup();
    const fixedBefore = await rows(first);
    for (const name of milestones) assert.match(fixedBefore[name].before, /ms/);
    await driver.switchTo().window(second);
    await emptyTimings();
    passed(
      `${authority}: selected Before receives a fixed copy that survives actual popup closure; other destination stays empty`,
    );

    await captureInventory(first, 'after');
    await openPopup(`${localUrl}timing-comparison-other`);
    await pageCapture();
    await discover(firstLabel, 'after');
    const mismatch = await confirm(false);
    assert.match(mismatch.status, /same.*tab|different.*tab/i);
    await closePopup();
    assert.deepEqual(await rows(first), fixedBefore);
    passed(
      `${authority}: After from another real source tab is rejected without replacing the fixed Before`,
    );

    await driver.switchTo().window(source);
    await driver.navigate().refresh();
    await openPopup(`${localUrl}timing-comparison-source`);
    await pageCapture();
    await discover(firstLabel, 'after');
    await confirm(true);
    await closePopup();
    const pair = await rows(first);
    for (const name of milestones) {
      assert.equal(pair[name].before, fixedBefore[name].before);
      assert.match(pair[name].after, /ms/);
      assert.match(pair[name].difference, /(?:[+−-]|0).*ms/);
    }
    passed(
      `${authority}: source reload followed by a fresh toolbar action attaches After and shows signed millisecond differences`,
    );
    await openPopup(`${localUrl}timing-comparison-source`);
    await pageCapture();
    const fixedChoices = await discover(secondLabel, 'before');
    assert(!fixedChoices.options.some((item) => item.label === firstLabel));
    await closePopup();
    passed(
      `${authority}: completed fixed slots are absent from a fresh capture's eligible destinations`,
    );

    await driver.switchTo().window(first);
    await driver.findElement(By.id('start-over')).click();
    await captureInventory(first, 'before');
    await openPopup(`${localUrl}timing-comparison-source`);
    await pageCapture();
    await discover(firstLabel, 'before');
    await command('destination-action', {
      label: firstLabel,
      selector: '#capture-after',
    });
    await driver.wait(
      async () =>
        driver.executeScript((label) => {
          const view = (globalThis.browser ?? globalThis.chrome).extension
            .getViews({ type: 'tab' })
            .find(
              (item) =>
                item.document.querySelector('#investigation-label')
                  ?.textContent === label,
            );
          return Boolean(
            view?.document
              .querySelector('[data-testid="timing-comparison-status"]')
              ?.textContent.includes('Before timing was not attached'),
          );
        }, firstLabel),
      10000,
    );
    await confirm(false);
    await closePopup();
    await driver.switchTo().window(first);
    assert.equal((await driver.findElements(By.css(before))).length, 1);
    if ((await driver.findElements(By.css(after))).length === 0)
      await captureInventory(first, 'after');
    assert.equal((await driver.findElements(By.css(after))).length, 1);
    await emptyTimings();
    passed(
      `${authority}: starting After inventory closes a previously selected Before timing without losing either inventory`,
    );

    for (const change of ['reset', 'reload', 'close']) {
      await driver.switchTo().window(second);
      if (change !== 'reset') await captureInventory(second, 'before');
      const currentLabel = await label(second);
      await openPopup(`${localUrl}timing-comparison-source`);
      await pageCapture();
      await discover(currentLabel, 'before');
      await command('destination-action', {
        label: currentLabel,
        ...(change === 'reset'
          ? { selector: '#start-over' }
          : { [change]: true }),
      });
      await driver.wait(
        () =>
          driver.executeScript(
            (oldLabel, operation) => {
              const views = (
                globalThis.browser ?? globalThis.chrome
              ).extension.getViews({ type: 'tab' });
              const view = views.find(
                (candidate) =>
                  candidate.document.querySelector('#investigation-label')
                    ?.textContent === oldLabel,
              );
              return operation === 'reset'
                ? view &&
                    !view.document.querySelector(
                      '[data-testid="before-snapshot"]',
                    )
                : !view;
            },
            currentLabel,
            change,
          ),
        10000,
      );
      await confirm(false);
      await closePopup();
      if (change !== 'close') {
        await driver.switchTo().window(second);
        await driver.wait(until.elementLocated(By.id('capture-before')), 10000);
        assert.equal((await driver.findElements(By.css(before))).length, 0);
        await emptyTimings();
      } else handles.delete(second);
      passed(
        `${authority}: stale ${change} destination is rejected instead of silently replaced`,
      );
    }
    if (revokeScripting) {
      await driver.switchTo().window(first);
      await driver.findElement(By.id('start-over')).click();
      await captureInventory(first, 'before');
      await openPopup(`${localUrl}timing-comparison-source`);
      await pageCapture();
      await discover(firstLabel, 'before');
      await confirm(true);
      await closePopup();
      await captureInventory(first, 'after');
      await openPopup(`${localUrl}timing-comparison-source`);
      await pageCapture();
      await discover(firstLabel, 'after');
      assert.equal(await revokeScripting(), true);
      await driver.wait(async () => {
        const state = await command('read');
        return !state.pending && state.destination === null;
      }, 10000);
      await closePopup();
      await driver.switchTo().window(first);
      assert.equal((await driver.findElements(By.css(before))).length, 0);
      assert.equal((await driver.findElements(By.css(after))).length, 0);
      await emptyTimings();
      passed(
        `${authority}: actual scripting revocation clears a populated investigation and pending popup selection`,
      );
    }
    if (checkPrivate)
      evidence.privateWindow = await checkPrivate({
        returnWindow: originWindow,
        control,
        command,
        openPopup,
        pageCapture,
        closePopup,
      });
  } finally {
    await closePopup();
    for (const handle of handles) {
      if ((await driver.getAllWindowHandles()).includes(handle)) {
        await driver.switchTo().window(handle);
        await driver.close();
      }
    }
    await driver.switchTo().window(originWindow);
    evidence.cleanup.ownedTabsClosed = true;
  }
}
