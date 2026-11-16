export interface DispatchEvent {
  filter: 'allUrls' | 'exactHost';
  url: string;
  statusCode: number | null;
  type: string;
  tabId: number;
  initiator: string | null;
  at: number;
}

export interface RegistrationAttempt {
  stage: string;
  filter: 'allUrls' | 'exactHost';
  namespace: boolean;
  result: string;
  at: number;
}

export interface DispatchPhase {
  label: string;
  loadSerial: string;
  namespaceAtLoad: boolean;
  attempts: RegistrationAttempt[];
  readiness: {
    at: number;
    loadSerial: string;
    namespaceAtLoad: boolean;
    attempts: RegistrationAttempt[];
  } | null;
  trafficStartedAt: number;
  counters: Record<'allUrls' | 'exactHost', number>;
  events: DispatchEvent[];
  observedMs: number;
  samples: number;
  fetch: {
    tabId: number;
    origin: string;
    startedAt: number;
    statuses: number[];
    documentId: string;
  };
}

export interface ReloadObservation {
  label: string;
  opened: boolean;
  attempts: Array<{ attempt: number; opened: boolean; url: string | null }>;
  phase: DispatchPhase | null;
}

export interface FixtureIdentity {
  extensionPath: string;
  extensionId: string;
  computedId: string;
  runtimeId: string;
  manifestSha256: string;
  backgroundSha256: string;
  ownerScriptSha256: string;
  cases: string[];
  originPattern: string;
  launch: {
    headful: boolean;
    commandLineInstall: boolean;
    loadExtensions: string[];
    userDataDir: string | null;
  };
}

export interface GrantDispatchReport {
  probe: string;
  issue: string;
  authority: string;
  target: {
    browser: string;
    browserVersion: string | null;
    driverVersion: string | null;
    os: string;
    arch: string;
    sourceRevision: string | null;
    sourceDirty: boolean | null;
    invocation: string[];
    startedAt: string;
  };
  fixture: FixtureIdentity;
  phases: {
    firstGrant: DispatchPhase | null;
    workerRestart: DispatchPhase | null;
    browserRestart: DispatchPhase | null;
    extensionReload: ReloadObservation | null;
  };
  gaps: string[];
}

export interface PositiveControlMatch {
  complete: boolean;
  cases: Array<{ path: string; allUrls: boolean; exactHost: boolean }>;
  matchedEvents: number;
}

export type GrantDispatchOutcome =
  'reproduction-succeeded' | 'gate-passed' | 'inconclusive';

// Event lists are bounded controlled-fixture debug data, never summary state.
// Request URLs, tab IDs and initiators stay in the ignored raw report.
export const MAX_DEBUG_EVENTS = 40;
// A negative conclusion needs the full bounded window and polling density used
// by the probe. A positive control can break early once a match arrives.
export const MIN_NEGATIVE_OBSERVATION_MS = 5000;
export const MIN_NEGATIVE_SAMPLES = 15;

const sha256Pattern = /^[a-f0-9]{64}$/;

function controlledEventMatches(
  event: DispatchEvent,
  url: string,
  origin: string,
  tabId: number,
): boolean {
  return (
    event.url === url &&
    event.statusCode === 200 &&
    event.type === 'xmlhttprequest' &&
    event.tabId === tabId &&
    event.initiator === origin
  );
}

export function countControlledMatches(
  events: DispatchEvent[],
  options: { cases: string[]; origin: string; tabId: number },
): number {
  const expected = options.cases.map(
    (path) => new URL(path, options.origin).href,
  );
  return events.filter((event) =>
    expected.some((url) =>
      controlledEventMatches(event, url, options.origin, options.tabId),
    ),
  ).length;
}

export function controlledCoverage(
  events: DispatchEvent[],
  options: { cases: string[]; origin: string; tabId: number },
): { complete: boolean; matched: number } {
  let matched = 0;
  for (const path of options.cases) {
    const url = new URL(path, options.origin).href;
    for (const filter of ['allUrls', 'exactHost'] as const) {
      if (
        events.some(
          (event) =>
            event.filter === filter &&
            controlledEventMatches(event, url, options.origin, options.tabId),
        )
      )
        matched++;
    }
  }
  return { complete: matched === options.cases.length * 2, matched };
}

export function matchPositiveControl(
  phase: DispatchPhase | null,
  fixture: FixtureIdentity,
): PositiveControlMatch {
  const cases = fixture.cases.map((path) => ({
    path,
    allUrls: false,
    exactHost: false,
  }));
  if (!phase) return { complete: false, cases, matchedEvents: 0 };
  const origin = phase.fetch.origin;
  let matchedEvents = 0;
  for (const entry of cases) {
    const url = new URL(entry.path, origin).href;
    const matchesFilter = (filter: 'allUrls' | 'exactHost') =>
      phase.events.some(
        (event) =>
          event.filter === filter &&
          controlledEventMatches(event, url, origin, phase.fetch.tabId),
      );
    if (matchesFilter('allUrls')) {
      entry.allUrls = true;
      matchedEvents++;
    }
    if (matchesFilter('exactHost')) {
      entry.exactHost = true;
      matchedEvents++;
    }
  }
  return {
    complete: cases.every((entry) => entry.allUrls && entry.exactHost),
    cases,
    matchedEvents,
  };
}

export function duplicateRegistrationCount(
  attempts: RegistrationAttempt[],
): number {
  const registered = new Map<string, number>();
  for (const attempt of attempts) {
    if (attempt.result !== 'ok') continue;
    registered.set(attempt.filter, (registered.get(attempt.filter) ?? 0) + 1);
  }
  return [...registered.values()].filter((count) => count > 1).length;
}

function identityProblems(fixture: FixtureIdentity): string[] {
  const problems: string[] = [];
  if (fixture.extensionId !== fixture.computedId)
    problems.push(
      'extension ID does not match the command-line path-derived ID',
    );
  if (fixture.extensionId !== fixture.runtimeId)
    problems.push('runtime ID does not match the fixture extension ID');
  for (const [name, digest] of [
    ['manifestSha256', fixture.manifestSha256],
    ['backgroundSha256', fixture.backgroundSha256],
    ['ownerScriptSha256', fixture.ownerScriptSha256],
  ] as const) {
    if (!sha256Pattern.test(digest))
      problems.push(`${name} is not a lowercase SHA-256 digest`);
  }
  if (new Set(fixture.cases).size !== fixture.cases.length)
    problems.push('controlled case paths are not unique');
  if (fixture.cases.length !== 3)
    problems.push('the controlled comparison requires exactly three cases');
  if (!fixture.launch.headful)
    problems.push('the controlled comparison requires a headful launch');
  if (!fixture.launch.commandLineInstall)
    problems.push('the controlled comparison requires command-line loading');
  if (fixture.launch.loadExtensions.length === 0)
    problems.push('the launch record names no loaded extension');
  return problems;
}

function registrationProblems(
  phase: DispatchPhase,
  attempts: RegistrationAttempt[],
  label: string,
): string[] {
  const problems: string[] = [];
  for (const attempt of attempts) {
    if (!Number.isFinite(attempt.at))
      problems.push(`${label} registration attempt has no finite timestamp`);
  }
  for (const filter of ['allUrls', 'exactHost'] as const) {
    const successful = attempts.filter(
      (attempt) => attempt.filter === filter && attempt.result === 'ok',
    );
    if (successful.length === 0) {
      problems.push(`${label} never registered the ${filter} listener`);
      continue;
    }
    if (successful.length > 1) {
      problems.push(
        `${label} registered the ${filter} listener more than once`,
      );
      continue;
    }
    const [ok] = successful;
    if (!ok) continue;
    if (
      !Number.isFinite(phase.trafficStartedAt) ||
      ok.at > phase.trafficStartedAt
    )
      problems.push(`${label} registered the ${filter} listener after traffic`);
    if (
      attempts.some(
        (attempt) =>
          attempt.filter === filter &&
          attempt.at > ok.at &&
          attempt.result !== 'already-registered',
      )
    )
      problems.push(
        `${label} reported a failed ${filter} registration after success`,
      );
  }
  return problems;
}

function fetchProblems(phase: DispatchPhase): string[] {
  const problems: string[] = [];
  if (!Number.isInteger(phase.fetch.tabId) || phase.fetch.tabId <= 0)
    problems.push(`${phase.label} has no positive source tab ID`);
  if (
    !Number.isFinite(phase.fetch.startedAt) ||
    phase.fetch.startedAt <= 0 ||
    !Number.isFinite(phase.trafficStartedAt) ||
    phase.trafficStartedAt <= 0
  )
    problems.push(`${phase.label} has no finite traffic boundary`);
  if (phase.fetch.statuses.length !== 3) {
    problems.push(`${phase.label} did not record three controlled fetches`);
  } else if (!phase.fetch.statuses.every((status) => status === 200)) {
    problems.push(
      `${phase.label} has a controlled fetch that did not return 200`,
    );
  }
  try {
    const origin = new URL(phase.fetch.origin);
    if (
      origin.origin !== phase.fetch.origin ||
      !/^https?:$/.test(origin.protocol)
    )
      problems.push(`${phase.label} has a malformed source origin`);
  } catch {
    problems.push(`${phase.label} has an unparsable source origin`);
  }
  if (!phase.fetch.documentId)
    problems.push(`${phase.label} has no source document identity`);
  return problems;
}

function phaseProblems(
  phase: DispatchPhase,
  match: PositiveControlMatch,
): string[] {
  const problems: string[] = [];
  if (phase.events.length >= MAX_DEBUG_EVENTS)
    problems.push(
      `${phase.label} reached the ${MAX_DEBUG_EVENTS}-event debug cap and may be truncated`,
    );
  if (!Number.isFinite(phase.observedMs) || phase.observedMs < 0)
    problems.push(`${phase.label} has no finite observation duration`);
  if (!Number.isInteger(phase.samples) || phase.samples < 1)
    problems.push(`${phase.label} has no valid polling samples`);
  if (duplicateRegistrationCount(phase.attempts) > 0)
    problems.push(`${phase.label} registered a duplicate listener`);
  if (!phase.readiness) {
    problems.push(`${phase.label} has no pre-traffic readiness record`);
  } else {
    if (!Number.isFinite(phase.readiness.at))
      problems.push(`${phase.label} readiness has no finite timestamp`);
    if (phase.readiness.loadSerial !== phase.loadSerial)
      problems.push(`${phase.label} readiness names a different worker`);
    if (
      Number.isFinite(phase.trafficStartedAt) &&
      phase.readiness.at > phase.trafficStartedAt
    )
      problems.push(`${phase.label} readiness was recorded after traffic`);
    problems.push(
      ...registrationProblems(
        phase,
        phase.readiness.attempts,
        `${phase.label} readiness`,
      ),
    );
  }
  problems.push(...registrationProblems(phase, phase.attempts, phase.label));
  problems.push(...fetchProblems(phase));
  if (match.matchedEvents === 0) {
    if (phase.observedMs < MIN_NEGATIVE_OBSERVATION_MS)
      problems.push(
        `${phase.label} ended a negative window after ${phase.observedMs} ms`,
      );
    if (phase.samples < MIN_NEGATIVE_SAMPLES)
      problems.push(
        `${phase.label} ended a negative window after ${phase.samples} samples`,
      );
  }
  return problems;
}

export function evaluateGrantDispatch(report: GrantDispatchReport): {
  outcome: GrantDispatchOutcome;
  reasons: string[];
  firstGrant: PositiveControlMatch;
  workerRestart: PositiveControlMatch;
  browserRestart: PositiveControlMatch;
} {
  const reasons = identityProblems(report.fixture);
  const { firstGrant, workerRestart, browserRestart } = report.phases;
  const firstGrantMatch = matchPositiveControl(firstGrant, report.fixture);
  const workerRestartMatch = matchPositiveControl(
    workerRestart,
    report.fixture,
  );
  const browserRestartMatch = matchPositiveControl(
    browserRestart,
    report.fixture,
  );
  const result = {
    outcome: 'inconclusive' as GrantDispatchOutcome,
    reasons,
    firstGrant: firstGrantMatch,
    workerRestart: workerRestartMatch,
    browserRestart: browserRestartMatch,
  };
  if (!firstGrant) reasons.push('the first-grant phase is missing');
  if (!workerRestart) reasons.push('the worker-restart phase is missing');
  if (!browserRestart) reasons.push('the browser-restart phase is missing');
  if (firstGrant) reasons.push(...phaseProblems(firstGrant, firstGrantMatch));
  if (workerRestart)
    reasons.push(...phaseProblems(workerRestart, workerRestartMatch));
  if (browserRestart)
    reasons.push(...phaseProblems(browserRestart, browserRestartMatch));
  if (firstGrant && workerRestart) {
    if (workerRestart.loadSerial === firstGrant.loadSerial)
      reasons.push('the worker-restart phase did not observe a new worker');
    if (firstGrant.namespaceAtLoad)
      reasons.push('the first-grant worker already saw the webRequest API');
  }
  if (browserRestart && !browserRestart.namespaceAtLoad)
    reasons.push(
      'the browser-restart worker did not see the persisted webRequest API',
    );
  if (!browserRestartMatch.complete)
    reasons.push(
      'the browser-restart positive control did not match every controlled case',
    );
  if (reasons.length > 0) return result;

  if (firstGrantMatch.matchedEvents > 0) {
    result.outcome = 'gate-passed';
    reasons.push(
      'the first-grant phase observed controlled terminal events; this is classified separately from a failed-feasibility record',
    );
    return result;
  }
  result.outcome = 'reproduction-succeeded';
  reasons.push(
    'the first-grant phase observed no controlled terminal events while the identical browser-restart phase observed every case',
  );
  if (workerRestartMatch.matchedEvents > 0)
    reasons.push(
      'a new worker in the same extension context observed events; the failure is limited to the live worker present at grant time',
    );
  else
    reasons.push(
      'a new worker in the same extension context also observed no events',
    );
  return result;
}
