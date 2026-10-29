/* global WebExtensionPolicy */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { arch, cpus, platform, release } from 'node:os';
import { resolve } from 'node:path';
import { Builder, By } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';
import { sha256 } from './check-package.mjs';
import { installTemporaryExtension } from './firefox-install.mjs';
import { extensionArchive } from './package-paths.mjs';
import { pageErrorDriverControls } from './page-error-driver-controls.mjs';
import {
  pageErrorFixtureHandler,
  preparePageErrorFixture,
} from './page-error-fixture.mjs';
import {
  evaluateSynchronousBudget,
  nearestRankP95,
} from './synchronous-budget.ts';
import {
  completeStudyAttempt,
  createStudyAttempt,
  failStudyAttempt,
  markStudyAttemptStage,
  recordStudyAttemptMeasurement,
} from './budget-study-attempts.ts';

// This is a bounded diagnostic study, not a qualification run. The 30-sample
// block is the existing agreed measurement. Two exact versions, two fixtures,
// two conditions and three counterbalanced repetitions give 360 attempts per
// version and a predeclared 720 attempts across both versions. There are no
// retries, extra samples or configurable thresholds.
const samplesPerBlock = 30;
const acceptedVersions = new Set(['140.0', '153.5.1esr']);
const requestedVersion = process.env.FIREFOX_VERSION;
assert(
  requestedVersion && acceptedVersions.has(requestedVersion),
  'FIREFOX_VERSION must be 140.0 or 153.5.1esr for this bounded study',
);

const blockPlan = [
  { fixture: '/page-errors/empty', repetition: 1, condition: 'baseline' },
  { fixture: '/page-errors/empty', repetition: 1, condition: 'load' },
  { fixture: '/page-errors/empty', repetition: 2, condition: 'load' },
  { fixture: '/page-errors/empty', repetition: 2, condition: 'baseline' },
  { fixture: '/page-errors/empty', repetition: 3, condition: 'baseline' },
  { fixture: '/page-errors/empty', repetition: 3, condition: 'load' },
  { fixture: '/page-errors/heavy', repetition: 1, condition: 'load' },
  { fixture: '/page-errors/heavy', repetition: 1, condition: 'baseline' },
  { fixture: '/page-errors/heavy', repetition: 2, condition: 'baseline' },
  { fixture: '/page-errors/heavy', repetition: 2, condition: 'load' },
  { fixture: '/page-errors/heavy', repetition: 3, condition: 'load' },
  { fixture: '/page-errors/heavy', repetition: 3, condition: 'baseline' },
];
assert.equal(blockPlan.length, 12);
assert.equal(
  blockPlan.filter((block) => block.fixture === '/page-errors/empty').length,
  6,
);
assert.equal(
  blockPlan.filter((block) => block.condition === 'baseline').length,
  6,
);
for (const repetition of [1, 2, 3])
  assert.equal(
    blockPlan.filter((block) => block.repetition === repetition).length,
    4,
  );

process.env.SE_AVOID_STATS = 'true';
process.env.SE_DRIVER_VERSION = '0.37.1';
process.env.SE_SKIP_DRIVER_IN_PATH = 'true';
process.env.SE_SKIP_BROWSER_IN_PATH = 'true';

await mkdir('.scratch/collector-budget', { recursive: true });
const timestamp = new Date().toISOString();
const reportPath = resolve(
  `.scratch/collector-budget/study-firefox-${requestedVersion}-${timestamp.replace(/[:.]/g, '-')}-${process.pid}.json`,
);

function gitValue(...args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

const report = {
  study: 'page-error collector budget variability',
  authority:
    'Diagnostic/instrumented source fixture. Production observer, adapter and model modules are unchanged; measurement wrappers add disclosed sample publication. Reuses the existing 30-sample setup/handler/finalization gate. This is not a qualification pass.',
  status: 'running',
  qualificationPass: false,
  timestamp,
  sourceCommit: gitValue('rev-parse', 'HEAD'),
  sourceDirty: Boolean(gitValue('status', '--porcelain')),
  host: {
    os: platform(),
    release: release(),
    arch: arch(),
    cpu: cpus()[0]?.model ?? null,
    cpus: cpus().length,
  },
  requestedVersion,
  browserVersion: null,
  geckodriverVersion: null,
  artifact: { path: extensionArchive, sha256: null },
  fixture: null,
  plan: {
    samplesPerBlock,
    repetitions: 3,
    conditions: ['baseline', 'load'],
    fixtures: ['/page-errors/empty', '/page-errors/heavy'],
    blocks: blockPlan,
    attemptsPerVersion: 360,
    attemptsAcrossBothVersions: 720,
    budgetLimitMs: 5,
    order:
      'empty: B,L / L,B / B,L; heavy: L,B / B,L / L,B. Across 12 blocks each condition is first three times.',
  },
  blocks: [],
  cleanup: {
    ownedTabsClosed: false,
    workerTerminated: null,
    browserClosed: false,
    serverClosed: false,
  },
  failure: null,
  exitCode: null,
};

async function persist() {
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

report.artifact.sha256 = sha256(await readFile(extensionArchive));
const fixtureDirectory = await mkdtemp(
  resolve('.scratch/collector-budget/firefox-fixture-'),
);
report.fixture = await preparePageErrorFixture(fixtureDirectory, 'firefox');

const server = createServer((request, response) => {
  if (pageErrorFixtureHandler(request, response)) return;
  response.statusCode = 404;
  response.end('Not found');
});
await new Promise((accept) => server.listen(0, '127.0.0.1', accept));
const localUrl = `http://127.0.0.1:${server.address().port}/`;
let driver;
let controlHandle;
let sourceHandle;
let ownerHandle;
let sourceTabId;
let sourceUrl;
let workerActive = false;
const ownedHandles = new Set();
let protocolFailure = null;

function normaliseFailure(error) {
  return error instanceof Error ? error.message : String(error);
}

function sampleSummary(samples) {
  if (!samples.length)
    return { count: 0, minimumMs: null, p95Ms: null, maximumMs: null };
  const sorted = [...samples].sort((left, right) => left - right);
  return {
    count: samples.length,
    minimumMs: sorted[0],
    p95Ms: nearestRankP95(samples),
    maximumMs: sorted.at(-1),
  };
}

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
  sourceUrl = `${localUrl.replace(/\/$/, '')}${path}?budget-study=1`;
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

async function launch(controls) {
  const before = new Set(await driver.getAllWindowHandles());
  await driver.switchTo().window(controlHandle);
  await controls.launchSourcePopup({
    sourceHandle,
    sourceTabId,
    sourceUrl,
    fixtureUrl: controls.fixtureUrl,
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
  assert.equal((await debug()).outcome, null);
  assert.equal((await debug()).permissionRequests, 0);
  await switchOwner();
  await driver.executeScript(() => globalThis.checkFixture.measure(true));
}

async function granted(name) {
  await switchOwner();
  return driver.executeAsyncScript((permission, done) => {
    (globalThis.browser ?? globalThis.chrome).permissions
      .contains({ permissions: [permission] })
      .then(done);
  }, name);
}

async function start(controls) {
  const alreadyGranted = await granted('scripting');
  await driver.findElement(By.id('page-error-start')).click();
  if (!alreadyGranted)
    await controls.approveOptional({
      permissions: ['scripting'],
      ownerHandle,
    });
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
  const summary = state.outcome.value;
  assert.deepEqual(Object.keys(summary).sort(), [
    'finish',
    'observedMs',
    'scriptErrors',
    'total',
    'unhandledRejections',
  ]);
  assert.equal(summary.total, 2);
  assert.equal(summary.scriptErrors, 1);
  assert.equal(summary.unhandledRejections, 1);
  assert.equal(summary.finish, 'stop');
  assert(Number.isFinite(summary.observedMs) && summary.observedMs >= 0);
  return summary;
}

async function metric(token) {
  await switchSource();
  return driver.executeScript(
    (value) =>
      JSON.parse(
        document.documentElement.getAttribute(
          `data-addonray-error-metrics-${value}-supervisor`,
        ) ?? 'null',
      ),
    token,
  );
}

async function startWorker() {
  await switchSource();
  const state = await driver.executeScript(() =>
    window.startAddonrayBudgetWorker?.(),
  );
  assert.equal(state?.created, true, 'Budget worker helper missing');
  assert.equal(state?.already, false, 'Budget worker already active');
  workerActive = true;
  await driver.wait(
    () =>
      driver.executeScript(
        () =>
          document.documentElement.getAttribute(
            'data-addonray-budget-worker',
          ) === 'started',
      ),
    5000,
  );
  return {
    ...state,
    startedObserved: await driver.executeScript(
      () =>
        document.documentElement.getAttribute('data-addonray-budget-worker') ===
        'started',
    ),
  };
}

async function stopWorker() {
  if (!workerActive) return { terminated: false, reason: 'not-active' };
  await switchSource();
  const state = await driver.executeScript(() =>
    window.stopAddonrayBudgetWorker?.(),
  );
  assert.equal(state?.terminated, true, 'Busy worker missing at stop');
  const cleared = await driver.executeScript(
    () =>
      document.documentElement.getAttribute('data-addonray-budget-worker') ===
      null,
  );
  assert.equal(cleared, true, 'Busy worker marker remained after stop');
  workerActive = false;
  return { ...state, markerCleared: cleared };
}

async function probeClock() {
  await switchSource();
  return driver.executeScript(() => {
    const steps = [];
    const began = performance.now();
    let previous = began;
    let reads = 0;
    while (performance.now() - began < 50) {
      const current = performance.now();
      reads += 1;
      if (current > previous) {
        steps.push(current - previous);
        previous = current;
      }
    }
    const sorted = [...steps].sort((left, right) => left - right);
    const at = (quantile) =>
      sorted[Math.ceil(sorted.length * quantile) - 1] ?? null;
    return {
      wallMs: performance.now() - began,
      reads,
      positiveSteps: steps.length,
      stepsMs: steps,
      minimumPositiveStepMs: sorted[0] ?? null,
      p50StepMs: at(0.5),
      p95StepMs: at(0.95),
      maximumStepMs: sorted.at(-1) ?? null,
      hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    };
  });
}

async function closeOwner() {
  await switchOwner();
  await driver.close();
  ownedHandles.delete(ownerHandle);
  ownerHandle = undefined;
}

async function closeSource() {
  await switchSource();
  await driver.close();
  ownedHandles.delete(sourceHandle);
  sourceHandle = undefined;
}

async function measureAttempt(index, controls, attempt, publish) {
  if (index) {
    markStudyAttemptStage(attempt, 'resetting');
    await reset();
  }
  markStudyAttemptStage(attempt, 'starting');
  const started = performance.now();
  let state;
  try {
    state = await start(controls);
  } finally {
    attempt.flowMs.start = performance.now() - started;
  }
  markStudyAttemptStage(attempt, 'emitting');
  const emitStarted = performance.now();
  try {
    await emit();
  } finally {
    attempt.flowMs.emit = performance.now() - emitStarted;
  }
  markStudyAttemptStage(attempt, 'stopping');
  const stopStarted = performance.now();
  let summary;
  try {
    summary = await stop();
  } finally {
    attempt.flowMs.stop = performance.now() - stopStarted;
  }
  markStudyAttemptStage(attempt, 'reading-metrics');
  const metrics = await metric(state.latestToken, 'supervisor');
  assert(metrics, 'Selected-world measurement record missing');
  const setupSlots = Array.isArray(metrics.setup) ? metrics.setup : [];
  const callbacks = metrics.physicalCalls;
  recordStudyAttemptMeasurement(attempt, {
    summary,
    metrics,
    setupSlots,
    flowMs: {
      ...attempt.flowMs,
      total: performance.now() - started,
    },
  });
  // Persist the available measurement before the post-Stop assertion can throw.
  await publish();
  markStudyAttemptStage(attempt, 'post-stop-checking');
  const postStopStarted = performance.now();
  try {
    await emit();
    const afterStop = await metric(state.latestToken, 'supervisor');
    attempt.postStopCallbacksStable = afterStop.physicalCalls === callbacks;
    assert(
      attempt.postStopCallbacksStable,
      'Stopped measured observer still receives physical callbacks',
    );
  } finally {
    attempt.flowMs.postStop = performance.now() - postStopStarted;
  }
  markStudyAttemptStage(attempt, 'post-stop-complete');
  return attempt;
}

function evaluateBlock(block) {
  const clock = Math.max(...block.clockSamplesMs);
  assert(
    block.clockSamplesMs.length === samplesPerBlock &&
      block.clockSamplesMs.every(
        (value) => Number.isFinite(value) && value > 0 && value <= 5,
      ),
    'Clock calibration missing or invalid',
  );
  assert.equal(block.operationSamples.setup.length, samplesPerBlock);
  assert.equal(block.operationSamples.handler.length, samplesPerBlock * 2);
  assert.equal(block.operationSamples.finalization.length, samplesPerBlock);
  for (const [name, samples] of Object.entries(block.operationSamples))
    assert(
      samples.every((value) => Number.isFinite(value) && value >= 0),
      `${name} measurement missing or invalid`,
    );
  assert(
    block.setupSlotCounts.every((count) => count === 2),
    'Unexpected setup measurement slots',
  );
  assert(
    block.setupInstallSamples.every(
      (value) => Number.isFinite(value) && value >= 0,
    ) &&
      block.setupStartSamples.every(
        (value) => Number.isFinite(value) && value >= 0,
      ),
    'Setup component measurement missing or invalid',
  );
  block.guardClockStepMs = clock;
  block.setupComponents = {
    installation: sampleSummary(block.setupInstallSamples),
    startHandling: sampleSummary(block.setupStartSamples),
  };
  block.operations = {};
  for (const [name, samples] of Object.entries(block.operationSamples)) {
    try {
      block.operations[name] = {
        status: 'passed',
        ...evaluateSynchronousBudget(samples, clock),
      };
    } catch (error) {
      const p95Ms = nearestRankP95(samples);
      block.operations[name] = {
        status: 'failed',
        error: normaliseFailure(error),
        samplesMs: samples,
        clockStepMs: clock,
        p95Ms,
        quantizationGuardedP95Ms: p95Ms + 2 * clock,
      };
    }
  }
  block.failedOperations = Object.entries(block.operations)
    .filter(([, operation]) => operation.status === 'failed')
    .map(([name]) => name);
  block.budgetStatus = block.failedOperations.length ? 'failed' : 'passed';
  return block;
}

async function runBlock(plan, controls) {
  const block = {
    id: `${plan.fixture.replaceAll('/', '-')}-r${plan.repetition}-${plan.condition}`,
    fixture: plan.fixture,
    repetition: plan.repetition,
    condition: plan.condition,
    status: 'running',
    attempts: [],
    operationSamples: { setup: [], handler: [], finalization: [] },
    clockSamplesMs: [],
    setupInstallSamples: [],
    setupStartSamples: [],
    setupSlotCounts: [],
    worker: null,
    clockProbe: null,
    cleanup: null,
    budgetStatus: null,
    failedOperations: [],
  };
  report.blocks.push(block);
  await persist();
  try {
    await createSource(plan.fixture);
    await launch(controls);
    if (plan.condition === 'load') block.worker = await startWorker();
    block.clockProbe = await probeClock();
    for (let sample = 0; sample < samplesPerBlock; sample++) {
      const attempt = createStudyAttempt(sample);
      block.attempts.push(attempt);
      await persist();
      try {
        await measureAttempt(sample, controls, attempt, persist);
        const setupSlots = attempt.metrics.setup;
        block.setupSlotCounts.push(
          Array.isArray(setupSlots) ? setupSlots.length : 0,
        );
        if (Array.isArray(setupSlots)) {
          block.setupInstallSamples.push(setupSlots[0]);
          block.setupStartSamples.push(setupSlots[1]);
          block.operationSamples.setup.push(Math.max(...setupSlots));
        } else {
          block.setupInstallSamples.push(undefined);
          block.setupStartSamples.push(undefined);
          block.operationSamples.setup.push(Number.NaN);
        }
        block.operationSamples.handler.push(...attempt.metrics.handler);
        block.operationSamples.finalization.push(
          ...attempt.metrics.finalization,
        );
        block.clockSamplesMs.push(attempt.metrics.clock.minimumPositiveStep);
        completeStudyAttempt(attempt);
      } catch (error) {
        failStudyAttempt(attempt, attempt.stage, error);
        block.status = 'protocol-failed';
        await persist();
        throw error;
      }
      await persist();
    }
    evaluateBlock(block);
    block.status = block.budgetStatus;
  } finally {
    try {
      if (workerActive) {
        const stopped = await stopWorker();
        report.cleanup.workerTerminated = stopped.terminated;
        block.worker = { ...(block.worker ?? {}), ...stopped };
      }
    } finally {
      if (ownerHandle) await closeOwner();
      if (sourceHandle) await closeSource();
      await persist();
    }
  }
  return block;
}

try {
  const options = new firefox.Options().addArguments('-headless');
  options.setBrowserVersion(requestedVersion);
  driver = await new Builder()
    .forBrowser('firefox')
    .setFirefoxService(
      new firefox.ServiceBuilder().addArguments('--allow-system-access'),
    )
    .setFirefoxOptions(options)
    .build();
  await driver.manage().setTimeouts({ script: 15000, pageLoad: 30000 });
  report.browserVersion = (await driver.getCapabilities()).get(
    'browserVersion',
  );
  assert.equal(report.browserVersion, requestedVersion.replace(/esr$/, ''));
  report.geckodriverVersion = (await driver.getCapabilities()).get(
    'moz:geckodriverVersion',
  );
  assert.equal(report.geckodriverVersion, '0.37.1');
  for (const extension of [extensionArchive, fixtureDirectory])
    await installTemporaryExtension(driver, extension);

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

  const fixtureUrl = await extensionUrl(report.fixture.id, 'probe.html');
  await driver.switchTo().newWindow('tab');
  controlHandle = await driver.getWindowHandle();
  ownedHandles.add(controlHandle);
  await driver.get(fixtureUrl);
  const controls = {
    ...pageErrorDriverControls({
      driver,
      browser: 'firefox',
      fixtureUrl,
      fixtureId: report.fixture.id,
      controlHandle,
    }),
    fixtureUrl,
  };

  for (const plan of blockPlan) {
    const block = await runBlock(plan, controls);
    console.log(
      `${block.id}: ${block.budgetStatus}; ${block.attempts.length} attempts`,
    );
    await persist();
  }
  const failed = report.blocks.filter(
    (block) => block.budgetStatus === 'failed',
  );
  report.status = failed.length ? 'budget-failed' : 'completed';
  report.budgetBlocksFailed = failed.length;
  report.exitCode = failed.length ? 1 : 0;
} catch (error) {
  protocolFailure = error;
  report.status = 'protocol-failed';
  report.failure = normaliseFailure(error);
  report.exitCode = 2;
  console.error(String(error));
} finally {
  try {
    if (workerActive) {
      const stopped = await stopWorker();
      report.cleanup.workerTerminated = stopped.terminated;
    }
  } catch (error) {
    protocolFailure ??= error;
    report.cleanup.workerError = normaliseFailure(error);
  }
  if (driver) {
    try {
      for (const handle of [...ownedHandles].reverse()) {
        if (!(await driver.getAllWindowHandles()).includes(handle)) continue;
        await driver.switchTo().window(handle);
        await driver.close();
      }
      const remaining = await driver.getAllWindowHandles();
      const leaked = [...ownedHandles].filter((handle) =>
        remaining.includes(handle),
      );
      report.cleanup.ownedTabsClosed = leaked.length === 0;
      if (leaked.length) {
        protocolFailure ??= new Error(`Owned tabs remain: ${leaked}`);
        report.cleanup.tabError = `Owned tabs remain: ${leaked}`;
      }
    } catch (error) {
      protocolFailure ??= error;
      report.cleanup.tabError = normaliseFailure(error);
    }
    try {
      await driver.quit();
      report.cleanup.browserClosed = true;
    } catch (error) {
      protocolFailure ??= error;
      report.cleanup.browserError = normaliseFailure(error);
    }
  }
  try {
    await new Promise((accept) => {
      server.closeAllConnections();
      server.close(accept);
    });
    report.cleanup.serverClosed = true;
  } catch (error) {
    protocolFailure ??= error;
    report.cleanup.serverError = normaliseFailure(error);
  }
  if (protocolFailure) {
    report.status = 'protocol-failed';
    report.failure ??= normaliseFailure(protocolFailure);
    report.exitCode = 2;
  }
  if (report.exitCode === null) report.exitCode = 0;
  await persist();
  const digest = sha256(await readFile(reportPath));
  await writeFile(`${reportPath}.sha256`, `${digest}  ${reportPath}\n`);
  console.log(
    `Study: ${report.status}; ${report.blocks.length} blocks; exit ${report.exitCode}`,
  );
  console.log(`Report: ${reportPath}`);
  console.log(`SHA-256: ${digest}`);
  process.exitCode = report.exitCode;
}
