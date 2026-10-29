import assert from 'node:assert/strict';
import { By } from 'selenium-webdriver';

// Shared driver-side operations for the page-error source fixture. The
// qualification probe and the diagnostic study use the same selectors and
// synchronization; measurement and scenario assertions stay with each caller.
export function createPageErrorOperations({
  driver,
  ownerHandle,
  sourceHandle,
  approveOptional,
}) {
  const switchOwner = async () => driver.switchTo().window(ownerHandle());
  const switchSource = async () => driver.switchTo().window(sourceHandle());

  async function debug() {
    await switchOwner();
    return driver.executeScript(() => globalThis.checkFixture?.debug());
  }

  async function waitPhase(phase, timeout = 12000) {
    return driver.wait(async () => {
      const state = await debug();
      if (phase === 'observing' && state?.phase === 'finished')
        throw new Error(`Observation failed: ${JSON.stringify(state.outcome)}`);
      return state?.phase === phase && state;
    }, timeout);
  }

  async function positive() {
    await switchSource();
    return driver.executeScript(() => ({ ...globalThis.errorPositive }));
  }

  async function emit() {
    const before = await positive();
    await driver.findElement(By.id('error-emit')).click();
    return driver.wait(async () => {
      const after = await positive();
      return (
        after.errors === before.errors + 1 &&
        after.rejections === before.rejections + 1 &&
        after
      );
    }, 10000);
  }

  async function granted(name) {
    await switchOwner();
    return driver.executeAsyncScript((permission, done) => {
      (globalThis.browser ?? globalThis.chrome).permissions
        .contains({ permissions: [permission] })
        .then(done);
    }, name);
  }

  async function start() {
    const alreadyGranted = await granted('scripting');
    await driver.findElement(By.id('page-error-start')).click();
    if (!alreadyGranted)
      await approveOptional?.({ permissions: ['scripting'] });
    return waitPhase('observing');
  }

  async function reset() {
    await switchOwner();
    await driver.findElement(By.id('page-error-reset')).click();
    const state = await waitPhase('ready');
    assert.equal(state.outcome, null);
  }

  async function stop(validate = () => {}) {
    await switchOwner();
    await driver.findElement(By.id('page-error-stop')).click();
    const state = await waitPhase('finished');
    assert.equal(state.outcome?.status, 'success', JSON.stringify(state));
    const summary = state.outcome.value;
    validate(summary);
    return summary;
  }

  async function metric(token, kind) {
    await switchSource();
    return driver.executeScript(
      (value, world) =>
        JSON.parse(
          document.documentElement.getAttribute(
            `data-addonray-error-metrics-${value}-${world}`,
          ) ?? 'null',
        ),
      token,
      kind,
    );
  }

  return {
    switchOwner,
    switchSource,
    debug,
    waitPhase,
    positive,
    emit,
    granted,
    start,
    reset,
    stop,
    metric,
  };
}
