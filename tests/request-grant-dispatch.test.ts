import { expect, it } from 'bun:test';
import {
  controlledCoverage,
  countControlledMatches,
  duplicateRegistrationCount,
  evaluateGrantDispatch,
  matchPositiveControl,
  type DispatchEvent,
  type DispatchPhase,
  type FixtureIdentity,
  type GrantDispatchReport,
  type RegistrationAttempt,
} from '../scripts/request-grant-dispatch-report';

const origin = 'http://127.0.0.1:41000';
const cases = ['/case/a', '/case/b', '/case/c'];

const fixture: FixtureIdentity = {
  extensionPath: '/tmp/request-grant-dispatch/extension',
  extensionId: 'a'.repeat(32),
  computedId: 'a'.repeat(32),
  runtimeId: 'a'.repeat(32),
  manifestSha256: 'b'.repeat(64),
  backgroundSha256: 'c'.repeat(64),
  ownerScriptSha256: 'd'.repeat(64),
  cases,
  originPattern: 'http://127.0.0.1/*',
  launch: {
    headful: true,
    commandLineInstall: true,
    loadExtensions: ['/tmp/request-grant-dispatch/extension'],
    userDataDir: '/tmp/request-grant-dispatch/profile',
  },
};

function attempt(
  filter: 'allUrls' | 'exactHost',
  result: string,
  stage = 'top-level',
  at = 1,
  namespace = true,
): RegistrationAttempt {
  return { stage, filter, namespace, result, at };
}

function controlledEvents(
  filter: 'allUrls' | 'exactHost' = 'allUrls',
  overrides: Partial<DispatchEvent> = {},
): DispatchEvent[] {
  return cases.map((path) => ({
    filter,
    url: `${origin}${path}`,
    statusCode: 200,
    type: 'xmlhttprequest',
    tabId: 42,
    initiator: origin,
    at: 10,
    ...overrides,
  }));
}

function phase(
  label: string,
  options: {
    loadSerial: string;
    namespaceAtLoad: boolean;
    attempts: RegistrationAttempt[];
    events: DispatchEvent[];
    trafficStartedAt?: number;
    observedMs?: number;
    samples?: number;
    readiness?: DispatchPhase['readiness'];
    statuses?: number[];
  },
): DispatchPhase {
  return {
    label,
    loadSerial: options.loadSerial,
    namespaceAtLoad: options.namespaceAtLoad,
    attempts: options.attempts,
    readiness:
      options.readiness === undefined
        ? {
            at: 1,
            loadSerial: options.loadSerial,
            namespaceAtLoad: options.namespaceAtLoad,
            attempts: options.attempts,
          }
        : options.readiness,
    trafficStartedAt: options.trafficStartedAt ?? 10,
    counters: {
      allUrls: options.events.filter((event) => event.filter === 'allUrls')
        .length,
      exactHost: options.events.filter((event) => event.filter === 'exactHost')
        .length,
    },
    events: options.events,
    observedMs: options.observedMs ?? 5000,
    samples: options.samples ?? 20,
    fetch: {
      tabId: 42,
      origin,
      startedAt: 10,
      statuses: options.statuses ?? [200, 200, 200],
      documentId: 'doc',
    },
  };
}

const firstGrantAttempts = [
  attempt('allUrls', 'Cannot access webRequest', 'top-level', 1, false),
  attempt('exactHost', 'Cannot access webRequest', 'top-level', 1, false),
  attempt('allUrls', 'ok', 'permissions.onAdded', 2),
  attempt('exactHost', 'ok', 'permissions.onAdded', 2),
];

function reportWith(
  overrides: Partial<GrantDispatchReport['phases']> = {},
  fixtureOverrides: Partial<FixtureIdentity> = {},
): GrantDispatchReport {
  return {
    probe: 'request-grant-dispatch-chrome',
    issue: '#17',
    authority: 'test',
    target: {
      browser: 'Chrome for Testing',
      browserVersion: '156.0.8078.47',
      driverVersion: '156.0.8078.47',
      os: 'macOS 27.2 (26B123)',
      arch: 'arm64',
      sourceRevision: '0'.repeat(40),
      sourceDirty: false,
      invocation: ['bun'],
      startedAt: '2026-11-16T00:00:00.000Z',
    },
    fixture: { ...fixture, ...fixtureOverrides },
    phases: {
      firstGrant: phase('first grant', {
        loadSerial: 'worker-a',
        namespaceAtLoad: false,
        attempts: firstGrantAttempts,
        events: [],
      }),
      workerRestart: phase('worker restart', {
        loadSerial: 'worker-b',
        namespaceAtLoad: true,
        attempts: [
          attempt('allUrls', 'ok'),
          attempt('exactHost', 'ok'),
          attempt('allUrls', 'already-registered', 'message:arm', 3),
          attempt('exactHost', 'already-registered', 'message:arm', 3),
        ],
        events: [],
      }),
      browserRestart: phase('browser restart', {
        loadSerial: 'worker-c',
        namespaceAtLoad: true,
        attempts: [attempt('allUrls', 'ok'), attempt('exactHost', 'ok')],
        events: [
          ...controlledEvents('allUrls'),
          ...controlledEvents('exactHost'),
        ],
        observedMs: 17,
        samples: 1,
      }),
      extensionReload: null,
      ...overrides,
    },
    gaps: [],
  };
}

function firstGrantWith(
  overrides: Partial<DispatchPhase> & { statuses?: number[] },
): GrantDispatchReport {
  const base = reportWith().phases.firstGrant!;
  const { statuses, ...phaseOverrides } = overrides;
  return reportWith({
    firstGrant: {
      ...base,
      ...phaseOverrides,
      ...(statuses === undefined ? {} : { fetch: { ...base.fetch, statuses } }),
    },
  });
}

it('reproduces the failed first-grant gate when only the restarted context observes', () => {
  const evaluation = evaluateGrantDispatch(reportWith());
  expect(evaluation.outcome).toBe('reproduction-succeeded');
  expect(evaluation.browserRestart.complete).toBe(true);
  expect(evaluation.firstGrant.matchedEvents).toBe(0);
  expect(evaluation.workerRestart.matchedEvents).toBe(0);
  expect(evaluation.reasons.join(' ')).toContain(
    'no controlled terminal events',
  );
});

it('classifies unexpected first-grant dispatch as gate-passed, never as a failure record', () => {
  const evaluation = evaluateGrantDispatch(
    firstGrantWith({
      events: controlledEvents('allUrls'),
      samples: 1,
      observedMs: 20,
    }),
  );
  expect(evaluation.outcome).toBe('gate-passed');
  expect(evaluation.reasons.join(' ')).toContain('classified separately');
});

it('rejects a negative window that ended before the bounded observation', () => {
  for (const overrides of [
    { samples: 1, observedMs: 0 },
    { samples: 3, observedMs: 700 },
    { samples: 20, observedMs: 4999 },
  ]) {
    const evaluation = evaluateGrantDispatch(firstGrantWith(overrides));
    expect(evaluation.outcome).toBe('inconclusive');
    expect(evaluation.reasons.join(' ')).toContain('negative window');
  }
});

it('rejects malformed observation values and missing readiness', () => {
  for (const overrides of [
    { observedMs: Number.NaN },
    { observedMs: Number.POSITIVE_INFINITY },
    { samples: 1.5 },
    { samples: 0 },
    { readiness: null },
    {
      readiness: {
        at: 11,
        loadSerial: 'worker-a',
        namespaceAtLoad: false,
        attempts: firstGrantAttempts,
      },
    },
  ]) {
    const evaluation = evaluateGrantDispatch(firstGrantWith(overrides));
    expect(evaluation.outcome).toBe('inconclusive');
  }
  const wrongWorker = evaluateGrantDispatch(
    firstGrantWith({
      readiness: {
        at: 1,
        loadSerial: 'worker-z',
        namespaceAtLoad: false,
        attempts: firstGrantAttempts,
      },
    }),
  );
  expect(wrongWorker.reasons.join(' ')).toContain('different worker');
});

it('requires exactly-once successful registration of both filters before traffic', () => {
  const missing = evaluateGrantDispatch(
    firstGrantWith({
      attempts: firstGrantAttempts.filter(
        (attempt) => attempt.filter !== 'exactHost' || attempt.result !== 'ok',
      ),
    }),
  );
  expect(missing.outcome).toBe('inconclusive');
  expect(missing.reasons.join(' ')).toContain('never registered the exactHost');

  const afterTraffic = evaluateGrantDispatch(
    firstGrantWith({
      attempts: [
        attempt('allUrls', 'ok', 'permissions.onAdded', 2),
        attempt('exactHost', 'ok', 'permissions.onAdded', 11),
      ],
    }),
  );
  expect(afterTraffic.reasons.join(' ')).toContain('after traffic');

  const failedAfterSuccess = evaluateGrantDispatch(
    firstGrantWith({
      attempts: [
        ...firstGrantAttempts,
        attempt('allUrls', 'registration failed', 'message:arm', 5),
      ],
    }),
  );
  expect(failedAfterSuccess.reasons.join(' ')).toContain(
    'failed allUrls registration after success',
  );
});

it('requires three successful controlled fetches and a source identity', () => {
  for (const overrides of [
    { statuses: [200, 200, 500] },
    { statuses: [200, 200] },
    { statuses: [] },
  ]) {
    expect(evaluateGrantDispatch(firstGrantWith(overrides)).outcome).toBe(
      'inconclusive',
    );
  }
  const missingDocument = firstGrantWith({});
  missingDocument.phases.firstGrant!.fetch.documentId = '';
  expect(evaluateGrantDispatch(missingDocument).outcome).toBe('inconclusive');
});

it('treats a saturated debug event list as truncated, not as a conclusion', () => {
  const restarted = reportWith().phases.browserRestart;
  const saturated = reportWith({
    browserRestart: {
      ...restarted!,
      events: Array.from({ length: 40 }, () => controlledEvents()[0]!),
    },
  });
  expect(evaluateGrantDispatch(saturated).outcome).toBe('inconclusive');
});

it('does not let unrelated events end a negative conclusion', () => {
  const unrelated: DispatchEvent = {
    filter: 'allUrls',
    url: `${origin}/favicon.ico`,
    statusCode: 200,
    type: 'image',
    tabId: 42,
    initiator: origin,
    at: 20,
  };
  const evaluation = evaluateGrantDispatch(
    firstGrantWith({
      events: [unrelated],
      counters: { allUrls: 7, exactHost: 5 },
    }),
  );
  expect(evaluation.outcome).toBe('reproduction-succeeded');
  expect(evaluation.firstGrant.matchedEvents).toBe(0);
});

it('counts only controlled matches while polling', () => {
  const unrelated: DispatchEvent = {
    filter: 'allUrls',
    url: `${origin}/favicon.ico`,
    statusCode: 200,
    type: 'image',
    tabId: 42,
    initiator: origin,
    at: 1,
  };
  expect(
    countControlledMatches([unrelated], { cases, origin, tabId: 42 }),
  ).toBe(0);
  expect(
    countControlledMatches([...controlledEvents('allUrls'), unrelated], {
      cases,
      origin,
      tabId: 42,
    }),
  ).toBe(3);
  expect(
    countControlledMatches(controlledEvents('allUrls', { tabId: 43 }), {
      cases,
      origin,
      tabId: 42,
    }),
  ).toBe(0);
});

it('requires both filters for every case before positive polling stops', () => {
  const options = { cases, origin, tabId: 42 };
  expect(controlledCoverage([], options)).toEqual({
    complete: false,
    matched: 0,
  });
  expect(controlledCoverage(controlledEvents('allUrls'), options)).toEqual({
    complete: false,
    matched: 3,
  });
  const full = controlledCoverage(
    [...controlledEvents('allUrls'), ...controlledEvents('exactHost')],
    options,
  );
  expect(full).toEqual({ complete: true, matched: 6 });
  const duplicated = controlledCoverage(
    [
      ...controlledEvents('allUrls'),
      ...controlledEvents('allUrls', { at: 11 }),
    ],
    options,
  );
  expect(duplicated.complete).toBe(false);
  const unrelated = controlledCoverage(
    [
      {
        filter: 'allUrls',
        url: `${origin}/favicon.ico`,
        statusCode: 200,
        type: 'image',
        tabId: 42,
        initiator: origin,
        at: 1,
      },
    ],
    options,
  );
  expect(unrelated).toEqual({ complete: false, matched: 0 });
});

it('is inconclusive without a complete restarted positive control', () => {
  const restarted = reportWith().phases.browserRestart;
  const evaluation = evaluateGrantDispatch(
    reportWith({
      browserRestart: {
        ...restarted!,
        events: restarted!.events.filter(
          (event) => !event.url.endsWith('/case/c'),
        ),
      },
    }),
  );
  expect(evaluation.outcome).toBe('inconclusive');
  expect(evaluation.reasons.join(' ')).toContain('positive control');
});

it('is inconclusive when a gating phase or worker identity comparison is missing', () => {
  expect(
    evaluateGrantDispatch(reportWith({ workerRestart: null })).outcome,
  ).toBe('inconclusive');
  expect(
    evaluateGrantDispatch(
      reportWith({
        workerRestart: {
          ...reportWith().phases.workerRestart!,
          loadSerial: 'worker-a',
          readiness: {
            at: 1,
            loadSerial: 'worker-a',
            namespaceAtLoad: true,
            attempts: reportWith().phases.workerRestart!.attempts,
          },
        },
      }),
    ).outcome,
  ).toBe('inconclusive');
});

it('is inconclusive when the first-grant worker already saw the API or the restart did not', () => {
  expect(
    evaluateGrantDispatch(firstGrantWith({ namespaceAtLoad: true })).outcome,
  ).toBe('inconclusive');
  const restarted = reportWith().phases.browserRestart;
  expect(
    evaluateGrantDispatch(
      reportWith({ browserRestart: { ...restarted!, namespaceAtLoad: false } }),
    ).outcome,
  ).toBe('inconclusive');
});

it.each([
  ['a mismatched computed extension ID', { computedId: 'e'.repeat(32) }],
  ['a mismatched runtime extension ID', { runtimeId: 'e'.repeat(32) }],
  ['an absent background digest', { backgroundSha256: '' }],
  ['a headless launch', { launch: { ...fixture.launch, headful: false } }],
  [
    'a non-command-line install',
    { launch: { ...fixture.launch, commandLineInstall: false } },
  ],
  ['a changed case list', { cases: ['/case/a', '/case/b'] }],
])('rejects %s', (_label, fixtureOverride) => {
  const evaluation = evaluateGrantDispatch(
    reportWith({}, fixtureOverride as Partial<FixtureIdentity>),
  );
  expect(evaluation.outcome).toBe('inconclusive');
});

it('matches the positive control by tab, origin, path, status and resource type', () => {
  const matched = matchPositiveControl(
    phase('browser restart', {
      loadSerial: 'worker-c',
      namespaceAtLoad: true,
      attempts: [],
      events: controlledEvents('allUrls'),
    }),
    fixture,
  );
  expect(matched.complete).toBe(false);
  expect(matched.cases.every((entry) => entry.allUrls)).toBe(true);

  for (const [field, value] of [
    ['tabId', 43],
    ['type', 'image'],
    ['statusCode', 500],
    ['initiator', 'http://127.0.0.1:41999'],
    ['url', `${origin}/case/other`],
  ] as const) {
    const wrong = matchPositiveControl(
      phase('browser restart', {
        loadSerial: 'worker-c',
        namespaceAtLoad: true,
        attempts: [],
        events: controlledEvents('allUrls', { [field]: value }),
      }),
      fixture,
    );
    expect(wrong.cases.some((entry) => entry.allUrls)).toBe(false);
  }
});

it('ignores unrelated bounded events and requires both filters', () => {
  const unrelated: DispatchEvent = {
    filter: 'allUrls',
    url: `${origin}/favicon.ico`,
    statusCode: 200,
    type: 'image',
    tabId: 42,
    initiator: origin,
    at: 1,
  };
  const matched = matchPositiveControl(
    phase('browser restart', {
      loadSerial: 'worker-c',
      namespaceAtLoad: true,
      attempts: [],
      events: [
        unrelated,
        ...controlledEvents('allUrls'),
        ...controlledEvents('exactHost'),
      ],
    }),
    fixture,
  );
  expect(matched.complete).toBe(true);
  expect(matched.matchedEvents).toBe(6);
});

it('detects duplicate listener registration', () => {
  expect(
    duplicateRegistrationCount([
      attempt('allUrls', 'ok'),
      attempt('exactHost', 'ok'),
      attempt('allUrls', 'already-registered', 'message:arm', 3),
    ]),
  ).toBe(0);
  expect(
    duplicateRegistrationCount([
      attempt('allUrls', 'ok', 'top-level'),
      attempt('allUrls', 'ok', 'permissions.onAdded', 2),
    ]),
  ).toBe(1);
});
