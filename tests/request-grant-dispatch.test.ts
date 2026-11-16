import { expect, it } from 'bun:test';
import {
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
  namespace = true,
): RegistrationAttempt {
  return { stage, filter, namespace, result, at: 1 };
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
    at: 1,
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
  },
): DispatchPhase {
  return {
    label,
    loadSerial: options.loadSerial,
    namespaceAtLoad: options.namespaceAtLoad,
    attempts: options.attempts,
    counters: {
      allUrls: options.events.filter((event) => event.filter === 'allUrls')
        .length,
      exactHost: options.events.filter((event) => event.filter === 'exactHost')
        .length,
    },
    events: options.events,
    observedMs: 5000,
    samples: 20,
    fetch: { tabId: 42, origin, statuses: [200, 200, 200], documentId: 'doc' },
  };
}

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
        attempts: [
          attempt('allUrls', 'Cannot access webRequest', 'top-level', false),
          attempt('exactHost', 'Cannot access webRequest', 'top-level', false),
          attempt('allUrls', 'ok', 'permissions.onAdded'),
          attempt('exactHost', 'ok', 'permissions.onAdded'),
          attempt('allUrls', 'already-registered', 'message:arm'),
          attempt('exactHost', 'already-registered', 'message:arm'),
        ],
        events: [],
      }),
      workerRestart: phase('worker restart', {
        loadSerial: 'worker-b',
        namespaceAtLoad: true,
        attempts: [
          attempt('allUrls', 'ok'),
          attempt('exactHost', 'ok'),
          attempt('allUrls', 'already-registered', 'message:arm'),
          attempt('exactHost', 'already-registered', 'message:arm'),
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
      }),
      extensionReload: null,
      ...overrides,
    },
    gaps: [],
  };
}

it('reproduces the failed first-grant gate when only the restarted context observes', () => {
  const evaluation = evaluateGrantDispatch(reportWith());
  expect(evaluation.outcome).toBe('reproduction-succeeded');
  expect(evaluation.browserRestart.complete).toBe(true);
  expect(evaluation.firstGrant.matchedEvents).toBe(0);
  expect(evaluation.workerRestart.matchedEvents).toBe(0);
});

it('classifies unexpected first-grant dispatch as gate-passed, never as a failure record', () => {
  const first = reportWith().phases.firstGrant;
  const evaluation = evaluateGrantDispatch(
    reportWith({
      firstGrant: { ...first!, events: controlledEvents('allUrls') },
    }),
  );
  expect(evaluation.outcome).toBe('gate-passed');
  expect(evaluation.reasons.join(' ')).toContain('classified separately');
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
  const missing = evaluateGrantDispatch(reportWith({ workerRestart: null }));
  expect(missing.outcome).toBe('inconclusive');
  const sameWorker = evaluateGrantDispatch(
    reportWith({
      workerRestart: {
        ...reportWith().phases.workerRestart!,
        loadSerial: 'worker-a',
      },
    }),
  );
  expect(sameWorker.outcome).toBe('inconclusive');
});

it('is inconclusive when the first-grant worker already saw the API or the restart did not', () => {
  const first = reportWith().phases.firstGrant;
  const restarted = reportWith().phases.browserRestart;
  expect(
    evaluateGrantDispatch(
      reportWith({ firstGrant: { ...first!, namespaceAtLoad: true } }),
    ).outcome,
  ).toBe('inconclusive');
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
  const events = controlledEvents('allUrls');
  const matched = matchPositiveControl(
    phase('browser restart', {
      loadSerial: 'worker-c',
      namespaceAtLoad: true,
      attempts: [],
      events,
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
  const events = [
    unrelated,
    ...controlledEvents('allUrls'),
    ...controlledEvents('exactHost'),
  ];
  const matched = matchPositiveControl(
    phase('browser restart', {
      loadSerial: 'worker-c',
      namespaceAtLoad: true,
      attempts: [],
      events,
    }),
    fixture,
  );
  expect(matched.complete).toBe(true);
  expect(matched.matchedEvents).toBe(6);
});

it('detects duplicate listener registration and oversized debug event lists', () => {
  expect(
    duplicateRegistrationCount([
      attempt('allUrls', 'ok'),
      attempt('exactHost', 'ok'),
      attempt('allUrls', 'already-registered', 'message:arm'),
    ]),
  ).toBe(0);
  expect(
    duplicateRegistrationCount([
      attempt('allUrls', 'ok', 'top-level'),
      attempt('allUrls', 'ok', 'permissions.onAdded'),
    ]),
  ).toBe(1);
  const restarted = reportWith().phases.browserRestart;
  const oversized = reportWith({
    browserRestart: {
      ...restarted!,
      events: Array.from({ length: 41 }, () => controlledEvents()[0]!),
    },
  });
  expect(evaluateGrantDispatch(oversized).outcome).toBe('inconclusive');
});
