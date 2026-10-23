import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { cpus } from 'node:os';
import { collectPageObservation } from '../lib/inspector.ts';

const collectorSource = collectPageObservation.toString();
const collectorSourceSha256 = createHash('sha256')
  .update(collectorSource)
  .digest('hex');

// These files belong only to the disposable host-granted controller, outside the packages.
export async function prepareTimingModule(directory) {
  await writeFile(
    join(directory, 'timing-collector.js'),
    `export const measure = function () {
      const collect = (${collectorSource});
      const started = performance.now();
      const observation = collect();
      return { observation, elapsed: performance.now() - started };
    };
    export const calibrate = function () {
      const started = performance.now();
      let previous = started;
      let minimumPositiveStep = null;
      let reads = 0;
      for (; reads < 100000; reads += 1) {
        const current = performance.now();
        if (current > previous) {
          const step = current - previous;
          minimumPositiveStep = minimumPositiveStep === null ? step : Math.min(minimumPositiveStep, step);
          previous = current;
        }
        if (current - started >= 20) break;
      }
      return { minimumPositiveStep, reads };
    };`,
  );
}

export function timingFixtures() {
  const held = new Set();
  let resourcesServed = 0;
  return {
    get resourcesServed() {
      return resourcesServed;
    },
    get pendingResources() {
      return held.size;
    },
    release() {
      for (const response of held)
        response.end('<svg xmlns="http://www.w3.org/2000/svg"/>');
      held.clear();
    },
    handle(request, response) {
      const path = new URL(request.url, 'http://fixture.invalid').pathname;
      if (!path.startsWith('/timing/')) return false;
      response.setHeader('Cache-Control', 'no-store');
      if (path === '/timing/held.svg') {
        response.setHeader('Content-Type', 'image/svg+xml');
        held.add(response);
        response.on('close', () => held.delete(response));
      } else if (path === '/timing/tiny.svg') {
        resourcesServed += 1;
        response.setHeader('Content-Type', 'image/svg+xml');
        response.end(
          '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
        );
      } else {
        response.setHeader('Content-Type', 'text/html');
        const images =
          path === '/timing/heavy'
            ? Array.from(
                { length: 200 },
                (_, index) => `<img src="/timing/tiny.svg?i=${index}" alt="">`,
              ).join('')
            : path === '/timing/incomplete'
              ? '<img src="/timing/held.svg" alt="">'
              : '';
        response.end(
          path === '/timing/empty'
            ? '<!doctype html><html><body></body></html>'
            : `<!doctype html><title>Controlled timing sentinel</title><h1>Controlled timing sentinel</h1>${images}`,
        );
      }
      return true;
    },
  };
}

export async function checkTimings({
  driver,
  harnessUrl,
  localUrl,
  settingsUrl,
  fixtures,
  report,
  passed,
}) {
  await driver.get(harnessUrl);
  const harnessWindow = await driver.getWindowHandle();
  const createdTabs = [];
  const origin = new URL(localUrl).origin;
  const evidence = {
    authority:
      'Separate host-granted test controller; unchanged production collector source embedded in a static module',
    collectorSourceSha256,
    cpu: cpus()[0]?.model ?? null,
    samplesPerFixture: 30,
    collectorBudgetMs: 5,
    timingBlockBudgetBytes: 1024,
    method:
      'First call and 30 sequential isolated-world executions per fixture. performance.now brackets only the synchronous production collector, including readiness/support reads. Driver injection/IPC latency is measured separately. Clock step is an observed minimum, not an accuracy guarantee.',
    fixtures: [],
  };
  report.timingQualification = evidence;
  report.gaps.push(
    'Timing/overhead checks embed the production collector source in a separate host-granted fixture module. They do not qualify the packaged adapter, native permission UI, or end-to-end latency. The observed clock step and p95 guard are empirical measurements, not guaranteed clock-error bounds or universal latency promises.',
  );

  async function createTab(path) {
    const url = `${origin}${path}?private-timing-sentinel=do-not-return`;
    const id = await driver.executeAsyncScript((url, done) => {
      (globalThis.browser ?? globalThis.chrome).tabs
        .create({ url, active: true })
        .then(
          (tab) => done(tab.id),
          () => done(null),
        );
    }, url);
    assert.equal(typeof id, 'number');
    createdTabs.push(id);
    return id;
  }

  async function read(id, action = 'measure') {
    const started = performance.now();
    const result = await driver.executeAsyncScript(
      async (id, action, done) => {
        try {
          const functions = await import('./timing-collector.js');
          const results = await (
            globalThis.browser ?? globalThis.chrome
          ).scripting.executeScript({
            target: { tabId: id, frameIds: [0] },
            func: functions[action],
          });
          done({
            usable: results.length === 1 && results[0]?.result !== undefined,
            value: results[0]?.result ?? null,
          });
        } catch {
          done({ usable: false, value: null });
        }
      },
      id,
      action,
    );
    return { ...result, injectionAndDriverMs: performance.now() - started };
  }

  function assertMinimized(observation) {
    assert.deepEqual(Object.keys(observation).sort(), [
      'performanceEntryTypes',
      'readyState',
      'timings',
    ]);
    assert.deepEqual(Object.keys(observation.timings).sort(), [
      'domContentLoaded',
      'firstContentfulPaint',
      'loadEvent',
    ]);
    const raw = JSON.stringify(observation);
    assert(!raw.includes('timing-sentinel') && !raw.includes(origin));
    assert(!raw.includes('Controlled timing sentinel'));
    const bytes = Buffer.byteLength(JSON.stringify(observation.timings));
    assert(bytes <= 1024);
    return bytes;
  }

  for (const path of ['/timing/loaded', '/timing/heavy']) {
    const requestsBefore = fixtures.resourcesServed;
    const id = await createTab(path);
    const firstAttempt = await read(id);
    let initial = firstAttempt;
    const firstCall = await driver.wait(async () => {
      const result = initial ?? (await read(id));
      initial = null;
      return result.usable &&
        result.value.observation.readyState === 'complete' &&
        result.value.observation.timings.loadEvent.status === 'measured' &&
        result.value.observation.timings.firstContentfulPaint.status ===
          'measured'
        ? result
        : false;
    }, 10000);
    assert.equal(
      firstCall.value.observation.timings.domContentLoaded.status,
      'measured',
    );
    const bytes = assertMinimized(firstCall.value.observation);
    const resourcesServed = fixtures.resourcesServed - requestsBefore;
    assert.equal(resourcesServed, path.endsWith('heavy') ? 200 : 0);
    passed(
      `Production collector source reads minimized loading milestones in the isolated world on ${path}`,
    );
    const calibration = await read(id, 'calibrate');
    assert.equal(calibration.usable, true);
    const clock = calibration.value.minimumPositiveStep;
    assert(
      typeof clock === 'number' && clock > 0 && clock <= 5,
      'Clock precision cannot qualify the 5 ms budget',
    );
    const elapsed = [];
    const injectionAndDriver = [];
    for (let sample = 0; sample < 30; sample += 1) {
      const result = await read(id);
      assert.equal(result.usable, true);
      assertMinimized(result.value.observation);
      assert(
        Number.isFinite(result.value.elapsed) && result.value.elapsed >= 0,
      );
      elapsed.push(result.value.elapsed);
      injectionAndDriver.push(result.injectionAndDriverMs);
    }
    const sorted = [...elapsed].sort((left, right) => left - right);
    const p95 = sorted[Math.ceil(0.95 * sorted.length) - 1];
    const quantizationGuardedP95 = p95 + 2 * clock;
    evidence.fixtures.push({
      path,
      controlledResourcesServed: resourcesServed,
      firstCall: firstAttempt,
      firstCompletedSnapshot: firstCall,
      clockCalibration: calibration.value,
      timingBlockBytes: bytes,
      collectorSamplesMs: elapsed,
      collectorP95Ms: p95,
      quantizationGuardedP95Ms: quantizationGuardedP95,
      injectionAndDriverSamplesMs: injectionAndDriver,
    });
    assert(
      quantizationGuardedP95 <= 5,
      `${path} collector p95 plus two observed clock steps exceeds 5 ms`,
    );
  }
  passed(
    'Both controlled fixtures meet the 1 KiB timing-block and measured 5 ms p95 collector budgets',
  );

  const partial = await createTab('/timing/incomplete');
  const incomplete = await driver.wait(async () => {
    const result = await read(partial);
    return result.usable &&
      fixtures.pendingResources > 0 &&
      result.value.observation.readyState === 'interactive' &&
      result.value.observation.timings.domContentLoaded.status === 'measured'
      ? result
      : false;
  }, 10000);
  assert.equal(
    incomplete.value.observation.timings.loadEvent.status,
    'unrecorded',
  );
  assertMinimized(incomplete.value.observation);
  evidence.incomplete = incomplete.value.observation;
  fixtures.release();
  await driver.wait(async () => {
    const result = await read(partial);
    return (
      result.usable &&
      result.value.observation.timings.loadEvent.status === 'measured'
    );
  }, 10000);
  passed(
    'Production collector preserves an unrecorded load milestone while a controlled resource is held',
  );

  const empty = await createTab('/timing/empty');
  const noPaint = await driver.wait(async () => {
    const result = await read(empty);
    return result.usable && result.value.observation.readyState === 'complete'
      ? result
      : false;
  }, 10000);
  assert.equal(
    noPaint.value.observation.timings.firstContentfulPaint.status,
    'unavailable',
  );
  assertMinimized(noPaint.value.observation);
  evidence.empty = noPaint.value.observation;
  passed(
    'Production collector preserves missing paint as unavailable on an empty controlled document',
  );

  // Browser UI navigation uses the driver because extension tabs.create may reject it.
  await driver.switchTo().newWindow('tab');
  const protectedWindow = await driver.getWindowHandle();
  await driver.get(settingsUrl);
  assert.equal(await driver.getCurrentUrl(), settingsUrl);
  await driver.switchTo().window(harnessWindow);
  const protectedId = await driver.executeAsyncScript((url, done) => {
    (globalThis.browser ?? globalThis.chrome).tabs
      .query({})
      .then((tabs) => done(tabs.find((tab) => tab.url === url)?.id ?? null));
  }, settingsUrl);
  assert.equal(typeof protectedId, 'number');
  assert.equal((await read(protectedId)).usable, false);
  passed(
    'Protected browser document supplies no production timing-collector observation',
  );
  await driver.switchTo().window(protectedWindow);
  await driver.close();
  await driver.switchTo().window(harnessWindow);
  const closed = await driver.executeAsyncScript((ids, done) => {
    (globalThis.browser ?? globalThis.chrome).tabs.remove(ids).then(
      () => done(true),
      () => done(false),
    );
  }, createdTabs);
  assert.equal(closed, true, 'Owned timing fixture tabs must close');
}
