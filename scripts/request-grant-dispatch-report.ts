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
  counters: Record<'allUrls' | 'exactHost', number>;
  events: DispatchEvent[];
  observedMs: number;
  samples: number;
  fetch: {
    tabId: number;
    origin: string;
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

const sha256Pattern = /^[a-f0-9]{64}$/;

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
    for (const filter of ['allUrls', 'exactHost'] as const) {
      const matched = phase.events.some(
        (event) =>
          event.filter === filter &&
          event.url === url &&
          event.statusCode === 200 &&
          event.type === 'xmlhttprequest' &&
          event.tabId === phase.fetch.tabId &&
          event.initiator === origin,
      );
      if (matched) {
        entry[filter] = true;
        matchedEvents++;
      }
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
  for (const key of [
    'manifestSha256',
    'backgroundSha256',
    'ownerScriptSha256',
  ] as const) {
    if (!sha256Pattern.test(fixture[key]))
      problems.push(`${key} is not a lowercase SHA-256 digest`);
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

function phaseProblems(phase: DispatchPhase): string[] {
  const problems: string[] = [];
  if (phase.events.length > MAX_DEBUG_EVENTS)
    problems.push(
      `${phase.label} retains more than ${MAX_DEBUG_EVENTS} events`,
    );
  if (phase.samples < 1 || phase.observedMs < 0)
    problems.push(`${phase.label} did not record an observation window`);
  if (duplicateRegistrationCount(phase.attempts) > 0)
    problems.push(`${phase.label} registered a duplicate listener`);
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
  for (const phase of [firstGrant, workerRestart, browserRestart]) {
    if (phase) reasons.push(...phaseProblems(phase));
  }
  if (firstGrant && workerRestart) {
    if (workerRestart.loadSerial === firstGrant.loadSerial)
      reasons.push('the worker-restart phase did not observe a new worker');
    if (firstGrant.namespaceAtLoad)
      reasons.push('the first-grant worker already saw the webRequest API');
  } else if (firstGrant && !workerRestart) {
    reasons.push('worker identity could not be compared');
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
