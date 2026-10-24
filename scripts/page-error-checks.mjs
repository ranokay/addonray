import assert from 'node:assert/strict';
import { cpus } from 'node:os';
import { By } from 'selenium-webdriver';

const counts = [
  'scriptErrors',
  'unhandledRejections',
  'total',
  'finish',
  'observedMs',
];

function validateSummary(value) {
  assert.deepEqual(Object.keys(value).sort(), [...counts].sort());
  for (const field of counts.slice(0, 3)) {
    assert(Number.isSafeInteger(value[field]));
    assert(value[field] >= 0 && value[field] <= 200);
  }
  assert.equal(value.total, value.scriptErrors + value.unhandledRejections);
  assert(['stop', 'timeout', 'limit'].includes(value.finish));
  assert(
    Number.isFinite(value.observedMs) &&
      value.observedMs >= 0 &&
      value.observedMs <= 30000,
  );
  if (value.finish === 'timeout') assert.equal(value.observedMs, 30000);
  if (value.finish === 'limit') assert.equal(value.total, 200);
  const serialized = JSON.stringify(value);
  assert.doesNotMatch(
    serialized,
    /PRIVATE_|https?:|file:|moz-extension:|chrome-extension:/,
  );
  const bytes = Buffer.byteLength(serialized);
  assert(bytes <= 1024);
  return bytes;
}

function assertInterrupted(outcome) {
  assert(
    outcome && ['interrupted', 'source-unavailable'].includes(outcome.status),
    `Expected interruption, received ${JSON.stringify(outcome)}`,
  );
  assert.equal(
    'value' in outcome,
    false,
    'Interruption must retain no count summary',
  );
}

function budget(samples, clock) {
  assert(
    samples.length >= 30,
    'At least 30 synchronous-operation samples required',
  );
  assert(samples.every((value) => Number.isFinite(value) && value >= 0));
  assert(
    Number.isFinite(clock) && clock > 0 && clock <= 5,
    'Clock cannot qualify the 5 ms budget',
  );
  const sorted = [...samples].sort((a, b) => a - b);
  const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1];
  const guardedP95 = p95 + 2 * clock;
  assert(
    guardedP95 <= 5,
    `Synchronous operation p95 plus two observed clock steps is ${guardedP95} ms`,
  );
  return {
    samplesMs: samples,
    p95Ms: p95,
    quantizationGuardedP95Ms: guardedP95,
  };
}

export async function checkPageErrors({
  driver,
  fixtureUrl,
  localUrl,
  launchSourcePopup,
  approveOptional,
  report,
  passed,
}) {
  const origin = new URL(localUrl).origin;
  const evidence = {
    authority:
      'Named source fixture with production model, adapter, bootstrap and observer modules. Driver invokes actual toolbar action for activeTab. Fixture controls replace React UI; native user consent/usability is separate.',
    method:
      'Page-owned button handlers generate genuine errors/rejections. Observer results are canonical fixed summaries. Synchronous operation measurements use explicitly hashed wrappers around production bodies; sample bookkeeping occurs outside the timed body. Each setup sample uses the maximum individual synchronous setup operation in that attempt, retaining the individual raw measurements. Worlds are qualified separately. Injection/driver latency, observation wall duration, and collector operations are separate.',
    cpu: cpus()[0]?.model ?? null,
    summaryBudgetBytes: 1024,
    operationBudgetMs: 5,
    observations: {},
    overhead: [],
    cleanup: {},
  };
  report.pageErrorQualification = evidence;
  report.gaps.push(
    'Page-error lifecycle checks use a named source fixture and minimal owner/popup controls, not packaged React entry points or human usability evidence. Measurement copies add disclosed wrappers and numeric DOM markers. Page-visible metrics/tokens do not establish hostile-page integrity. Clock guards are empirical, not guaranteed error bounds.',
  );
  const ownedHandles = new Set();
  let controlHandle;
  let sourceHandle;
  let sourceTabId;
  let ownerHandle;
  let sourceUrl;
  async function switchOwner() {
    await driver.switchTo().window(ownerHandle);
  }
  async function switchSource() {
    await driver.switchTo().window(sourceHandle);
  }
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
  async function createSource(path) {
    await driver.switchTo().window(controlHandle);
    const before = new Set(await driver.getAllWindowHandles());
    sourceUrl = `${origin}${path}?PRIVATE_URL_SENTINEL=do-not-return`;
    sourceTabId = await driver.executeAsyncScript((url, done) => {
      (globalThis.browser ?? globalThis.chrome).tabs
        .create({ url, active: true })
        .then(
          (tab) => done(tab.id),
          () => done(null),
        );
    }, sourceUrl);
    assert.equal(typeof sourceTabId, 'number');
    sourceHandle = await driver.wait(
      async () =>
        (await driver.getAllWindowHandles()).find(
          (handle) => !before.has(handle),
        ),
      10000,
    );
    ownedHandles.add(sourceHandle);
    await switchSource();
    await driver.wait(
      async () => (await driver.findElements(By.id('error-emit'))).length === 1,
      10000,
    );
  }
  async function launch() {
    const before = new Set(await driver.getAllWindowHandles());
    await driver.switchTo().window(controlHandle);
    await launchSourcePopup({
      sourceHandle,
      sourceTabId,
      sourceUrl,
      fixtureUrl,
      controlHandle,
    });
    ownerHandle = await driver.wait(
      async () =>
        (await driver.getAllWindowHandles()).find(
          (handle) => !before.has(handle),
        ),
      10000,
    );
    ownedHandles.add(ownerHandle);
    await waitPhase('ready');
    assert.equal(new URL(await driver.getCurrentUrl()).search, '');
    assert.equal(new URL(await driver.getCurrentUrl()).hash, '');
    assert.equal((await debug()).outcome, null);
    assert.equal((await debug()).permissionRequests, 0);
  }
  async function granted(name) {
    await switchOwner();
    return driver.executeAsyncScript((name, done) => {
      (globalThis.browser ?? globalThis.chrome).permissions
        .contains({ permissions: [name] })
        .then(done);
    }, name);
  }
  async function start() {
    const alreadyGranted = await granted('scripting');
    await driver.findElement(By.id('page-error-start')).click();
    if (!alreadyGranted)
      await approveOptional?.({ permissions: ['scripting'], ownerHandle });
    return waitPhase('observing');
  }
  async function reset() {
    await switchOwner();
    await driver.findElement(By.id('page-error-reset')).click();
    const state = await waitPhase('ready');
    assert.equal(state.outcome, null);
  }
  async function stop() {
    await switchOwner();
    await driver.findElement(By.id('page-error-stop')).click();
    const state = await waitPhase('finished');
    assert.equal(state.outcome?.status, 'success', JSON.stringify(state));
    validateSummary(state.outcome.value);
    return state.outcome.value;
  }
  async function metric(token, kind) {
    await switchSource();
    return driver.executeScript(
      (token, kind) =>
        JSON.parse(
          document.documentElement.getAttribute(
            `data-addonray-error-metrics-${token}-${kind}`,
          ) ?? 'null',
        ),
      token,
      kind,
    );
  }
  async function closeOwner() {
    await switchOwner();
    await driver.close();
    ownedHandles.delete(ownerHandle);
  }
  try {
    await driver.switchTo().newWindow('tab');
    controlHandle = await driver.getWindowHandle();
    ownedHandles.add(controlHandle);
    await driver.get(fixtureUrl);
    await createSource('/page-errors/source');
    await emit();
    await launch();
    evidence.observations.open = await debug();
    passed(
      'Page-error source launcher binds an inactive own tab before activation, without permission requests or collection',
    );

    await start();
    await switchSource();
    await driver
      .switchTo()
      .frame(await driver.findElement(By.id('error-child')));
    await driver.findElement(By.id('error-emit')).click();
    await driver.wait(
      () =>
        driver.executeScript(
          () =>
            globalThis.errorPositive.errors === 1 &&
            globalThis.errorPositive.rejections === 1,
        ),
      10000,
    );
    await driver.switchTo().defaultContent();
    await driver.findElement(By.id('error-excluded')).click();
    await driver.wait(async () => {
      const observed = await positive();
      return observed.excluded === 1 && observed.resourceFailures === 1;
    }, 10000);
    await emit();
    const partial = await stop();
    assert.equal(partial.scriptErrors, 1);
    assert.equal(partial.unhandledRejections, 1);
    assert.equal(partial.total, 2);
    assert.equal(partial.finish, 'stop');
    assert.equal((await positive()).payloadReads, 0);
    evidence.observations.partial = partial;
    passed(
      'Production page-error modules observe only future top-frame event pairs, exclude child/resource/console events, and retain a minimized Stop summary',
    );

    await reset();
    await start();
    const zero = await stop();
    assert.equal(zero.total, 0);
    evidence.observations.zero = zero;
    passed(
      'A confirmed empty observation is a genuine zero and reset erases the prior summary',
    );

    await reset();
    await start();
    await switchSource();
    const beforeFlood = await positive();
    await driver.findElement(By.id('error-flood')).click();
    await driver.wait(async () => {
      const now = await positive();
      return (
        now.errors >= beforeFlood.errors + 101 &&
        now.rejections >= beforeFlood.rejections + 101
      );
    }, 10000);
    const capped = await waitPhase('finished');
    assert.equal(capped.outcome?.status, 'success');
    validateSummary(capped.outcome.value);
    assert.equal(capped.outcome.value.total, 200);
    assert.equal(capped.outcome.value.finish, 'limit');
    evidence.observations.cap = capped.outcome.value;
    passed(
      'The production observer stops at the actual 200-event total during a 202-event page-owned flood',
    );

    await reset();
    const began = Date.now();
    await start();
    const timed = await waitPhase('finished', 42000);
    assert.equal(timed.outcome?.status, 'success');
    validateSummary(timed.outcome.value);
    assert.equal(timed.outcome.value.finish, 'timeout');
    assert.equal(timed.outcome.value.observedMs, 30000);
    assert(Date.now() - began >= 30000);
    evidence.observations.duration = {
      summary: timed.outcome.value,
      wallElapsedMs: Date.now() - began,
    };
    passed(
      'The production observer enforces its actual 30-second eligible window and returns one fixed summary',
    );

    await reset();
    await start();
    await emit();
    await switchOwner();
    await driver.findElement(By.id('page-error-clear')).click();
    await waitPhase('ready');
    await emit();
    assert.equal((await debug()).outcome, null);
    passed(
      'Clear discards an active attempt and later source events cannot restore its result',
    );

    await start();
    await switchOwner();
    assert.equal(
      await driver.executeAsyncScript((done) =>
        globalThis.checkFixture.revoke('scripting').then(done),
      ),
      true,
    );
    await waitPhase('ready');
    assert.equal((await debug()).outcome, null);
    if (fixtureUrl.startsWith('moz-extension:')) {
      await start();
      await switchOwner();
      const managementGranted = await granted('management');
      if (!managementGranted) {
        await driver.findElement(By.id('error-grant-management')).click();
        await approveOptional?.({ permissions: ['management'], ownerHandle });
        await driver.wait(() => granted('management'), 10000);
      }
      assert.equal(
        await driver.executeAsyncScript((done) =>
          globalThis.checkFixture.revoke('management').then(done),
        ),
        true,
      );
      await waitPhase('ready');
      assert.equal((await debug()).outcome, null);
    } else {
      report.gaps.push(
        'Chrome source-fixture management permission cannot be approved through this headless route. Actual optional-management revocation for page-error checks requires the separate unmodified native session; deterministic guards are not that evidence.',
      );
    }
    evidence.observations.revocation = {
      scripting: true,
      management: fixtureUrl.startsWith('moz-extension:')
        ? true
        : 'not-exercised',
    };
    passed(
      'Actual optional permission revocation discards the active page-error attempt, with exercised permission names recorded',
    );

    await start();
    await switchSource();
    await driver.get(`${origin}/page-errors/replacement`);
    const interrupted = await waitPhase('finished');
    assertInterrupted(interrupted.outcome);
    evidence.observations.navigation = interrupted.outcome;
    await switchOwner();
    await driver.navigate().refresh();
    await waitPhase('unbound');
    assert.equal((await debug()).outcome, null);
    passed(
      'Source navigation interrupts without zero counts, and owner reload loses its source binding and results',
    );
    await closeOwner();
    await switchSource();
    await driver.close();
    ownedHandles.delete(sourceHandle);

    for (const path of ['/page-errors/empty', '/page-errors/heavy']) {
      await createSource(path);
      await launch();
      await switchOwner();
      await driver.executeScript(() => globalThis.checkFixture.measure(true));
      const operationSamples = { setup: [], handler: [], finalization: [] };
      const clockSamples = [];
      const supervisorSamples = { setup: [], finalization: [] };
      const supervisorClockSamples = [];
      const observations = [];
      const endToEndMs = [];
      const selectedWorld = fixtureUrl.startsWith('chrome-extension:')
        ? 'main'
        : 'supervisor';
      for (let sample = 0; sample < 30; sample++) {
        if (sample) await reset();
        const startWall = performance.now();
        const state = await start();
        await emit();
        const summary = await stop();
        assert.equal(summary.total, 2);
        const metrics = await metric(state.latestToken, selectedWorld);
        assert(metrics, 'Selected-world measurement record missing');
        for (const operation of Object.keys(operationSamples))
          operationSamples[operation].push(
            ...(operation === 'setup'
              ? [Math.max(...metrics.setup)]
              : metrics[operation]),
          );
        clockSamples.push(metrics.clock.minimumPositiveStep);
        observations.push({ summaryBytes: validateSummary(summary), metrics });
        endToEndMs.push(performance.now() - startWall);
        const callbacks = metrics.physicalCalls;
        await emit();
        assert.equal(
          (await metric(state.latestToken, selectedWorld)).physicalCalls,
          callbacks,
          'Stopped measured observer still receives physical callbacks',
        );
        if (selectedWorld === 'main') {
          const supervisorMetrics = await metric(
            state.latestToken,
            'supervisor',
          );
          supervisorSamples.setup.push(Math.max(...supervisorMetrics.setup));
          supervisorSamples.finalization.push(
            ...supervisorMetrics.finalization,
          );
          supervisorClockSamples.push(
            supervisorMetrics.clock.minimumPositiveStep,
          );
        }
      }
      const clock = Math.max(...clockSamples);
      assert(
        clockSamples.every((value) => Number.isFinite(value) && value > 0),
      );
      if (selectedWorld === 'main')
        assert(
          supervisorClockSamples.length === 30 &&
            supervisorClockSamples.every(
              (value) => Number.isFinite(value) && value > 0,
            ),
        );
      evidence.overhead.push({
        path,
        selectedWorld,
        samples: 30,
        clockSamplesMs: clockSamples,
        guardClockStepMs: clock,
        operations: Object.fromEntries(
          Object.entries(operationSamples).map(([name, samples]) => [
            name,
            budget(samples, clock),
          ]),
        ),
        isolatedSupervisor:
          selectedWorld === 'main'
            ? {
                clockSamplesMs: supervisorClockSamples,
                guardClockStepMs: Math.max(...supervisorClockSamples),
                operations: Object.fromEntries(
                  Object.entries(supervisorSamples).map(([name, samples]) => [
                    name,
                    budget(samples, Math.max(...supervisorClockSamples)),
                  ]),
                ),
              }
            : null,
        observations,
        driverAndUserFlowSamplesMs: endToEndMs,
      });
      passed(
        `Measured production observer bodies on ${path} meet the 1 KiB and 5 ms p95 plus two observed clock-step budgets, with no callbacks after Stop`,
      );
      // State erasure is separate from listener removal. Observe finalization,
      // then generate another real event pair against the old token.
      for (const discard of [
        'clear',
        'scripting',
        ...(selectedWorld === 'supervisor' ? ['management'] : []),
        'reload',
      ]) {
        await reset();
        if (discard === 'management' && !(await granted('management'))) {
          await driver.findElement(By.id('error-grant-management')).click();
          await approveOptional?.({ permissions: ['management'], ownerHandle });
          await driver.wait(() => granted('management'), 10000);
        }
        const attempt = await start();
        await emit();
        const beforeDiscard = await metric(attempt.latestToken, selectedWorld);
        await switchOwner();
        if (discard === 'reload') await driver.navigate().refresh();
        else if (discard === 'clear')
          await driver.findElement(By.id('page-error-clear')).click();
        else
          await driver.executeAsyncScript(
            (name, done) => globalThis.checkFixture.revoke(name).then(done),
            discard,
          );
        const erased = await waitPhase(
          discard === 'reload' ? 'unbound' : 'ready',
        );
        assert.equal(erased.outcome, null);
        await driver.wait(
          async () =>
            (await metric(attempt.latestToken, selectedWorld)).finalization
              .length > 0,
          5000,
        );
        await emit();
        const afterDiscard = await metric(attempt.latestToken, selectedWorld);
        assert.equal(afterDiscard.physicalCalls, beforeDiscard.physicalCalls);
        evidence.observations[`discard:${path}:${discard}`] = {
          before: beforeDiscard,
          after: afterDiscard,
        };
        if (discard === 'reload') {
          await closeOwner();
          await launch();
          await switchOwner();
          await driver.executeScript(() =>
            globalThis.checkFixture.measure(true),
          );
        }
      }
      passed(
        `Measured ${path} callbacks are removed after Clear, observed optional revocation and owner reload`,
      );
      // Measure teardown cleanup independently of result delivery through the same connection.
      await reset();
      const active = await start();
      await emit();
      const currentMetrics = await metric(active.latestToken, selectedWorld);
      await closeOwner();
      const cleanupBegan = performance.now();
      await driver.wait(
        async () =>
          (await metric(active.latestToken, selectedWorld)).finalization
            .length > 0,
        5000,
      );
      const cleanupObservedMs = performance.now() - cleanupBegan;
      await emit();
      const closedMetrics = await metric(active.latestToken, selectedWorld);
      assert.equal(closedMetrics.physicalCalls, currentMetrics.physicalCalls);
      evidence.observations[`close${selectedWorld}${path}`] = {
        before: currentMetrics,
        after: closedMetrics,
        cleanupObservedMs,
      };
      await switchSource();
      await driver.close();
      ownedHandles.delete(sourceHandle);
    }
    passed(
      'Owner closure removes measured physical error callbacks through the existing control connection',
    );

    await createSource('/page-errors/empty');
    await launch();
    await switchOwner();
    await driver.executeScript(() => globalThis.checkFixture.measure(true));
    const restoreAttempt = await start();
    await emit();
    const restoreWorld = fixtureUrl.startsWith('chrome-extension:')
      ? 'main'
      : 'supervisor';
    const beforeLeave = await metric(restoreAttempt.latestToken, restoreWorld);
    await switchSource();
    await driver.get(`${origin}/page-errors/replacement`);
    const leaveState = await waitPhase('finished');
    assertInterrupted(leaveState.outcome);
    await switchSource();
    await driver.navigate().back();
    await driver.wait(
      async () => (await driver.findElements(By.id('error-emit'))).length === 1,
      10000,
    );
    const lifecycle = await driver.executeScript(() => ({
      ...globalThis.errorLife,
    }));
    const restoredMetrics = await metric(
      restoreAttempt.latestToken,
      restoreWorld,
    );
    if (lifecycle.persisted) {
      assert(
        restoredMetrics,
        'Restored document must retain its measured callback record',
      );
      assert.equal(restoredMetrics.physicalCalls, beforeLeave.physicalCalls);
      await emit();
      assert.equal(
        (await metric(restoreAttempt.latestToken, restoreWorld)).physicalCalls,
        beforeLeave.physicalCalls,
      );
    } else {
      report.gaps.push(
        'The production-source measured BFCache attempt restored a fresh document instead of persisted state. This run does not qualify physical no-resume after genuine BFCache restoration.',
      );
    }
    evidence.observations.bfcache = {
      lifecycle,
      beforeLeave,
      restoredMetrics,
      ownerOutcome: leaveState.outcome,
    };
    passed(
      'Production-source navigation interrupts; actual BFCache outcome and physical no-resume evidence are recorded separately',
    );
    await closeOwner();
    await switchSource();
    await driver.close();
    ownedHandles.delete(sourceHandle);

    await createSource('/page-errors/csp');
    await launch();
    await start();
    await emit();
    assert.equal((await stop()).total, 2);
    await reset();
    await start();
    await switchSource();
    await driver.close();
    ownedHandles.delete(sourceHandle);
    const closedSource = await waitPhase('finished');
    assertInterrupted(closedSource.outcome);
    evidence.observations.sourceClosure = closedSource.outcome;
    passed(
      'Restrictive fixture CSP permits the selected-world check, and source closure interrupts without retargeting',
    );
  } catch (error) {
    try {
      evidence.failureState = await debug();
    } catch {
      /* Preserve the original failure. */
    }
    throw error;
  } finally {
    for (const handle of [...ownedHandles].reverse()) {
      if (!(await driver.getAllWindowHandles()).includes(handle)) continue;
      await driver.switchTo().window(handle);
      await driver.close();
    }
    const remaining = await driver.getAllWindowHandles();
    evidence.cleanup.ownedTabsClosed = [...ownedHandles].every(
      (handle) => !remaining.includes(handle),
    );
    if (remaining.length) await driver.switchTo().window(remaining[0]);
    assert.equal(evidence.cleanup.ownedTabsClosed, true);
  }
}
