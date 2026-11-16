import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { chromeExtensionId, launchChrome } from './chrome-session.mjs';
import {
  sourcePage,
  writeDispatchFixture,
} from './request-grant-dispatch-fixtures.mjs';
import {
  controlledCoverage,
  evaluateGrantDispatch,
} from './request-grant-dispatch-report.ts';

// Bounded #17 diagnostic. It holds the fixture manifest, extension path and
// ID, headful command-line launch, controlled cases and registration logic
// constant while comparing the first native grant (live extension context),
// a new worker in that context, and a browser restart with the persisted
// grant. The controlled comparison supports an observed dispatch failure on
// this exact build; it is not a root-cause or retail/installed claim.
//
// Exit 0: probe completed with a decisive outcome. When it reports
// "REQ-1 GATE FAILED", the console and report also state that reproduction
// SUCCEEDED. An unexpected observed dispatch is classified as gate-passed,
// never as failed feasibility. Exit 1: probe error or inconclusive evidence.
const PROMPT_WAIT_MS = 90_000;
const OBSERVATION_SECONDS = 5;
const cases = ['/case/a', '/case/b', '/case/c'];
const originPattern = 'http://127.0.0.1/*';
const startedAt = new Date().toISOString();
await mkdir(resolve('.scratch'), { recursive: true });
const base = await mkdtemp(resolve('.scratch/request-grant-dispatch-'));
const profile = join(base, 'profile');
const extensionDir = join(base, 'extension');
const extension = await writeDispatchFixture(extensionDir);
const extensionId = chromeExtensionId(extensionDir);

const manifest = await extension.verify();
assert.deepEqual(manifest.optional_permissions, ['webRequest']);
assert.deepEqual(manifest.optional_host_permissions, ['*://*/*']);
assert.equal(manifest.permissions, undefined);
assert.equal(manifest.host_permissions, undefined);
assert.deepEqual(manifest.background, { service_worker: 'bg.js' });

const source = createServer((request, response) => {
  if (request.url === '/source') {
    response.setHeader('content-type', 'text/html');
    response.end(sourcePage);
    return;
  }
  response.setHeader('content-type', 'text/plain');
  response.end('ok');
});
await new Promise((accept) => source.listen(0, '127.0.0.1', accept));
const serverUrl = `http://127.0.0.1:${source.address().port}`;
const sourcePageUrl = `${serverUrl}/source`;

function sourceIdentity() {
  try {
    return {
      revision: execFileSync('git', ['rev-parse', 'HEAD'], {
        encoding: 'utf8',
      }).trim(),
      dirty:
        execFileSync('git', ['status', '--porcelain'], {
          encoding: 'utf8',
        }).trim().length > 0,
    };
  } catch {
    return { revision: null, dirty: null };
  }
}

function osIdentity() {
  if (process.platform !== 'darwin')
    return `${process.platform} ${process.arch}`;
  try {
    const product = execFileSync('sw_vers', ['-productVersion'], {
      encoding: 'utf8',
    }).trim();
    const build = execFileSync('sw_vers', ['-buildVersion'], {
      encoding: 'utf8',
    }).trim();
    return `macOS ${product} (${build})`;
  } catch {
    return `macOS ${process.arch}`;
  }
}

const sha256 = (value) =>
  createHash('sha256').update(Buffer.from(value, 'utf8')).digest('hex');
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function readState(driver) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const reply = await driver.executeScript(() => window.__state());
      return { state: reply.state, runtimeId: reply.runtimeId };
    } catch (error) {
      lastError = error;
      await sleep(500);
    }
  }
  throw lastError;
}

async function openOwner(driver) {
  await driver.get(`chrome-extension://${extensionId}/owner.html`);
  await driver.wait(
    () => driver.executeScript(() => Boolean(window.__snapshotReadyAt)),
    15000,
  );
  return readState(driver);
}

async function fetchCases(driver) {
  const ownerHandle = await driver.getWindowHandle();
  const before = new Set(await driver.getAllWindowHandles());
  const created = await driver.executeScript(async (url) => {
    const tab = await globalThis.chrome.tabs.create({ url, active: true });
    return { tabId: tab.id, createdAt: Date.now() };
  }, sourcePageUrl);
  const handle = await driver.wait(async () => {
    const handles = await driver.getAllWindowHandles();
    return handles.find((candidate) => !before.has(candidate)) ?? false;
  }, 10000);
  await driver.switchTo().window(handle);
  await driver.wait(
    () => driver.executeScript(() => typeof window.__fire === 'function'),
    10000,
  );
  const documentId = await driver.executeScript(() => window.__documentId);
  const origin = await driver.executeScript(() => location.origin);
  const fetches = await driver.executeScript(
    (paths) => window.__fire(paths),
    cases,
  );
  await sleep(300);
  await driver.close();
  await driver.switchTo().window(ownerHandle);
  return {
    tabId: created.tabId,
    origin,
    documentId,
    startedAt: fetches[0]?.startedAt ?? 0,
    statuses: fetches.map((entry) => entry.status),
  };
}

async function observe(driver, fetch) {
  const started = Date.now();
  let samples = 0;
  let last = (await readState(driver)).state;
  while (Date.now() - started < OBSERVATION_SECONDS * 1000) {
    samples++;
    const coverage = controlledCoverage(last.events, {
      cases,
      origin: fetch.origin,
      tabId: fetch.tabId,
    });
    // Keep polling until both filters cover every controlled case, so events
    // that arrive in separate batches are not reported as an incomplete control.
    if (coverage.complete) break;
    await sleep(250);
    last = (await readState(driver)).state;
  }
  return { state: last, samples, observedMs: Date.now() - started };
}

async function recordPhase(driver, label) {
  // Wake and read the worker before any controlled traffic so readiness,
  // registration and the traffic boundary are recorded in order.
  const readinessState = await readState(driver);
  const readiness = {
    at: Date.now(),
    loadSerial: readinessState.state.loadSerial,
    namespaceAtLoad: readinessState.state.namespaceAtLoad,
    attempts: readinessState.state.attempts,
  };
  const trafficStartedAt = Date.now();
  const fetch = await fetchCases(driver);
  const observation = await observe(driver, fetch);
  const state = observation.state;
  return {
    label,
    loadSerial: state.loadSerial,
    namespaceAtLoad: state.namespaceAtLoad,
    attempts: state.attempts,
    readiness,
    trafficStartedAt,
    counters: state.counters,
    events: state.events,
    observedMs: observation.observedMs,
    samples: observation.samples,
    fetch,
  };
}

const report = {
  probe: 'request-grant-dispatch-chrome',
  issue: '#17',
  authority:
    'Test-only extension fixture loaded by command line in a disposable profile. A native optional-permission prompt is approved by the operator; no pregranted fixture or product permission stands in for that grant. The probe records controlled-fixture debug data only; the fixture uses no storage API.',
  target: {
    browser: 'Chrome for Testing',
    browserVersion: null,
    driverVersion: null,
    os: osIdentity(),
    arch: process.arch,
    sourceRevision: sourceIdentity().revision,
    sourceDirty: sourceIdentity().dirty,
    invocation: [process.execPath, ...process.argv.slice(1)],
    startedAt,
  },
  fixture: {
    extensionPath: extensionDir,
    extensionId,
    computedId: extensionId,
    runtimeId: null,
    ...extension.hashes,
    cases,
    originPattern,
    launch: {
      headful: true,
      commandLineInstall: true,
      loadExtensions: [extensionDir],
      userDataDir: profile,
    },
  },
  phases: {
    firstGrant: null,
    workerRestart: null,
    browserRestart: null,
    extensionReload: null,
  },
  grantObservation: null,
  gaps: [
    'Retail or installed Chrome behavior, other Chrome builds, other OSs and hosted CI are outside this probe.',
    'Firefox REQ-1 visibility, budgets, lifetime, cleanup and attachment gates remain unqualified.',
    'Chrome terminal visibility, port and initiator filters, redirects, blocked coverage, budgets, 30-second window, keepalive, cleanup ownership, removals, attachments and 0/1/100/500 cases remain unqualified unless separately observed.',
    'The same-process extension self-reload sub-case could not be observed under command-line loading and is retained as a failed harness observation, not as evidence for a reload UX.',
  ],
  error: null,
};
await writeFile(
  join(base, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

try {
  // Phase A and the worker-restart phase share one browser process so the
  // grant and the live extension context are the only variables.
  const first = await launchChrome({
    headless: false,
    userDataDir: profile,
    loadExtensions: [extensionDir],
  });
  const { driver, cdp } = first;
  try {
    const capabilities = await driver.getCapabilities();
    report.target.browserVersion = capabilities.get('browserVersion');
    report.target.driverVersion =
      capabilities.get('chrome')?.chromedriverVersion?.split(' ')[0] ?? null;
    const owner = await openOwner(driver);
    const startDisabledAtLoad = await driver.executeScript(
      () => window.__startDisabledAtLoad,
    );
    const snapshot = await driver.executeScript(() => window.__snapshot);
    const snapshotReadyAt = await driver.executeScript(
      () => window.__snapshotReadyAt,
    );
    const containsBefore = await driver.executeScript(() =>
      window.__contains(),
    );
    report.fixture.runtimeId = owner.runtimeId;
    console.log(
      `NATIVE PROMPT: approve the Chrome optional-permission prompt within ${PROMPT_WAIT_MS} ms`,
    );
    await driver.findElement({ id: 'start' }).click();
    await driver.wait(
      async () =>
        driver.executeScript(() => window.__results?.granted === true),
      PROMPT_WAIT_MS,
    );
    // Activation is the value captured inside the click handler immediately
    // before permissions.request, not a value read after the click returns.
    const request = await driver.executeScript(() => window.__results);
    const containsAfterGrant = await driver.executeScript(() =>
      window.__contains(),
    );
    const afterGrant = (await readState(driver)).state;
    const onAddedAt = afterGrant.grantEvents?.find(
      (event) => event.kind === 'onAdded',
    )?.at;
    assert.equal(startDisabledAtLoad, true, 'Start was enabled before load');
    assert.equal(snapshot.granted, false, 'Snapshot was not a pre-grant read');
    assert.ok(Number.isFinite(snapshot.at), 'Snapshot has no finite timestamp');
    assert.ok(
      snapshot.at <= request.requestedAt,
      'Snapshot was not ready before the Start click',
    );
    assert.ok(
      Number.isFinite(snapshotReadyAt) &&
        snapshotReadyAt <= request.requestedAt,
      'Snapshot readiness was not recorded before the Start click',
    );
    assert.equal(containsBefore, false, 'A grant was already present');
    assert.equal(request.activation, true, 'Start lost user activation');
    assert.equal(request.granted, true, 'Native grant was not approved');
    assert.ok(
      Number.isFinite(request.requestedAt) &&
        Number.isFinite(request.resolvedAt) &&
        request.resolvedAt >= request.requestedAt,
      'Grant request has no finite ordering',
    );
    assert.ok(
      Number.isFinite(onAddedAt) && onAddedAt >= request.requestedAt,
      'No permissions.onAdded event followed the request',
    );
    assert.equal(containsAfterGrant, true, 'Grant is absent after approval');
    for (const filter of ['allUrls', 'exactHost']) {
      assert.ok(
        afterGrant.attempts.some(
          (attempt) => attempt.filter === filter && attempt.result === 'ok',
        ),
        `The ${filter} listener was not registered after the grant`,
      );
    }
    report.grantObservation = {
      startDisabledAtLoad,
      snapshot,
      snapshotReadyAt,
      containsBefore,
      request,
      onAddedAt,
      registrationAfterGrant: afterGrant.attempts.filter(
        (attempt) => attempt.result === 'ok',
      ),
      containsAfterGrant,
    };
    report.phases.firstGrant = await recordPhase(
      driver,
      'first native grant, live extension context',
    );

    const targets = await cdp.send('Target.getTargets');
    const workers = targets.targetInfos.filter(
      (target) =>
        target.type === 'service_worker' && target.url.includes('/bg.js'),
    );
    assert.equal(workers.length, 1, 'Expected exactly one extension worker');
    assert.equal(
      (await cdp.send('Target.closeTarget', { targetId: workers[0].targetId }))
        .success,
      true,
      'Worker target did not close',
    );
    await sleep(1500);
    // Explicitly wake and read the new worker, and confirm a changed serial
    // and both top-level registrations, before generating controlled traffic.
    const wake = await readState(driver);
    assert.notEqual(
      wake.state.loadSerial,
      report.phases.firstGrant.loadSerial,
      'The worker target close did not produce a new worker',
    );
    for (const filter of ['allUrls', 'exactHost']) {
      assert.ok(
        wake.state.attempts.some(
          (attempt) => attempt.filter === filter && attempt.result === 'ok',
        ),
        `The new worker did not register the ${filter} listener`,
      );
    }
    report.workerRestartWake = {
      at: Date.now(),
      loadSerial: wake.state.loadSerial,
      namespaceAtLoad: wake.state.namespaceAtLoad,
      attempts: wake.state.attempts,
    };
    const workerRestart = await recordPhase(
      driver,
      'new worker in the same extension context',
    );
    assert.equal(
      workerRestart.readiness.loadSerial,
      wake.state.loadSerial,
      'A different worker served the restarted readiness or traffic',
    );
    report.phases.workerRestart = workerRestart;
  } finally {
    cdp.close();
    await driver.quit();
  }

  // Phase B: identical manifest, path, launch mode, cases and registration
  // logic; only the browser process is new, with the persisted native grant.
  const restarted = await launchChrome({
    headless: false,
    userDataDir: profile,
    loadExtensions: [extensionDir],
  });
  try {
    const owner = await openOwner(restarted.driver);
    const containsBefore = await restarted.driver.executeScript(() =>
      window.__contains(),
    );
    assert.equal(containsBefore, true, 'The persisted grant is absent');
    assert.equal(
      owner.state.namespaceAtLoad,
      true,
      'The restarted worker lacks the granted webRequest API',
    );
    await restarted.driver.executeScript(() => window.__arm());
    report.phases.browserRestart = await recordPhase(
      restarted.driver,
      'browser restart with the persisted native grant',
    );
  } finally {
    restarted.cdp.close();
    await restarted.driver.quit();
  }

  // Diagnostic-only sub-case: same-process extension self-reload. It is never
  // used as a gate or as evidence for a reload UX, and a failure here is
  // recorded separately so it cannot invalidate the three gating phases.
  try {
    const reloadSession = await launchChrome({
      headless: false,
      userDataDir: profile,
      loadExtensions: [extensionDir],
    });
    try {
      const { driver } = reloadSession;
      await openOwner(driver);
      await driver.executeScript(() => window.__reload().catch(() => null));
      await sleep(4000);
      const attempts = [];
      let opened = false;
      for (let attempt = 0; attempt < 6 && !opened; attempt++) {
        try {
          await driver.switchTo().newWindow('tab');
          await driver.get(`chrome-extension://${extensionId}/owner.html`);
          opened = await driver.executeScript(
            () => typeof window.__state === 'function',
          );
          attempts.push({ attempt, opened, url: await driver.getCurrentUrl() });
        } catch (error) {
          attempts.push({
            attempt,
            opened: false,
            url: null,
            error: String(error?.message ?? error).slice(0, 200),
          });
        }
        if (!opened) await sleep(1500);
      }
      report.phases.extensionReload = {
        label:
          'same-process extension self-reload (diagnostic only, no UX claim)',
        opened,
        attempts,
        phase: opened
          ? await recordPhase(driver, 'after extension self-reload')
          : null,
      };
    } finally {
      reloadSession.cdp.close();
      await reloadSession.driver.quit();
    }
  } catch (error) {
    report.reloadSubcaseError = {
      name: error?.name ?? null,
      message: String(error?.message ?? error).slice(0, 500),
    };
  }
} catch (error) {
  report.error = {
    name: error?.name ?? null,
    message: String(error?.message ?? error),
  };
}

source.close();
await extension.verify();

const evaluation = evaluateGrantDispatch(report);
report.gate = {
  outcome: evaluation.outcome,
  reasons: evaluation.reasons,
  firstGrantMatches: evaluation.firstGrant,
  workerRestartMatches: evaluation.workerRestart,
  browserRestartMatches: evaluation.browserRestart,
};
const reportPath = join(base, 'report.json');
const serialized = `${JSON.stringify(report, null, 2)}\n`;
await writeFile(reportPath, serialized);
await writeFile(`${reportPath}.sha256`, `${sha256(serialized)}  report.json\n`);

console.log(`report: ${reportPath}`);
console.log(`report sha256: ${sha256(serialized)}`);
for (const reason of evaluation.reasons) console.log(`- ${reason}`);
if (report.error) {
  console.error(`PROBE ERROR: ${report.error.message}`);
} else if (evaluation.outcome === 'reproduction-succeeded') {
  console.log('REQ-1 GATE FAILED: first-grant dispatch was not observed.');
  console.log('Reproduction SUCCEEDED under the controlled comparison.');
  process.exitCode = 0;
} else if (evaluation.outcome === 'gate-passed') {
  console.log(
    'REQ-1 GATE PASSED: first-grant dispatch was observed and is classified separately from a failed-feasibility record.',
  );
  process.exitCode = 0;
} else {
  console.error('REQ-1 GATE UNPROVEN: the probe is inconclusive.');
  process.exitCode = 1;
}
if (report.error) process.exitCode = 1;
