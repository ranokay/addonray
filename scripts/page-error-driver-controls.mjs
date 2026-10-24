/* global gBrowser */
import assert from 'node:assert/strict';
import { By, until } from 'selenium-webdriver';

// Driver-only control of a named fixture's real toolbar view. This supplies no
// product host permission and makes no native usability or consent verdict.
export function pageErrorDriverControls({
  driver,
  browser: target,
  cdp,
  fixtureUrl,
  fixtureId,
  controlHandle,
}) {
  const popupUrl = fixtureUrl.replace(/probe\.html$/, 'popup.html');
  return {
    async launchSourcePopup({ sourceUrl }) {
      await driver.switchTo().window(controlHandle);
      if (target === 'firefox') {
        await driver.setContext('chrome');
        await driver.executeScript((url) => {
          const source = [...gBrowser.tabs].find(
            (tab) => tab.linkedBrowser.currentURI.spec === url,
          );
          if (!source) throw new Error('Controlled source absent');
          gBrowser.selectedTab = source;
        }, sourceUrl);
        await driver.findElement(By.id('unified-extensions-button')).click();
        await driver
          .findElement(
            By.css(
              `[data-extensionid="${fixtureId}"] .unified-extensions-item-action-button`,
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
        const source = targets.targetInfos.find((tab) => tab.url === sourceUrl);
        assert(source, 'Controlled source absent');
        await cdp.send('Target.activateTarget', { targetId: source.targetId });
        await cdp.send('Extensions.triggerAction', {
          id: fixtureId,
          targetId: source.targetId,
        });
      }
      await driver.wait(
        () =>
          driver.executeScript((url) => {
            try {
              const api = globalThis.browser ?? globalThis.chrome;
              return api.extension
                .getViews({ type: 'popup' })
                .some(
                  (view) =>
                    view.location.href === url &&
                    view.document.querySelector('#new-page-error-check') &&
                    typeof view.addonrayErrorSource?.current === 'function',
                );
            } catch {
              return false;
            }
          }, popupUrl),
        10000,
      );
      await driver.executeScript((url) => {
        const api = globalThis.browser ?? globalThis.chrome;
        const popup = api.extension
          .getViews({ type: 'popup' })
          .find((view) => view.location.href === url);
        popup.document.querySelector('#new-page-error-check').click();
      }, popupUrl);
      // Switching the WebDriver target early activates the new tab and defeats
      // the production inactive-binding guard. Observe readiness from the own
      // control document until the launcher itself has activated the owner.
      await driver.wait(
        () =>
          driver.executeAsyncScript((done) => {
            const api = globalThis.browser ?? globalThis.chrome;
            const view = api.extension
              .getViews({ type: 'tab' })
              .find((candidate) => {
                try {
                  return (
                    candidate.location.href ===
                      api.runtime.getURL('/page-error.html') &&
                    candidate.checkFixture?.debug().phase === 'ready'
                  );
                } catch {
                  return false;
                }
              });
            if (!view) return done(false);
            (view.browser ?? view.chrome).tabs.getCurrent().then(
              (tab) => done(tab.active === true),
              () => done(false),
            );
          }),
        10000,
      );
    },
    async approveOptional({ permissions }) {
      if (target !== 'firefox') return;
      try {
        let allow;
        await driver.wait(async () => {
          await driver.setContext('content');
          const granted = await driver.executeAsyncScript(
            (names, done) =>
              (globalThis.browser ?? globalThis.chrome).permissions
                .contains({ permissions: names })
                .then(done),
            permissions,
          );
          if (granted) return true;
          await driver.setContext('chrome');
          const buttons = await driver.findElements(
            By.css(
              '#addon-webext-permissions-notification .popup-notification-primary-button',
            ),
          );
          for (const button of buttons) {
            if (await button.isDisplayed()) {
              allow = button;
              return true;
            }
          }
          return false;
        }, 10000);
        if (!allow) return;
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
      } finally {
        await driver.setContext('content');
      }
    },
  };
}
