import { expect, it, vi } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { InvestigationView } from '../entrypoints/investigation/App';
import { getBrowserContext } from '../lib/browser-target';
import type { InventorySnapshot, PageAssessment } from '../lib/comparison';
import type { Investigation } from '../lib/investigation';

type State = ReturnType<Investigation['getSnapshot']>;

const before: InventorySnapshot = [
  {
    id: 'fixture@test',
    name: 'Controlled fixture',
    version: '1',
    enabled: true,
  },
];
const after: InventorySnapshot = [
  {
    id: 'fixture@test',
    name: 'Controlled fixture',
    version: '1',
    enabled: false,
  },
];

function view(
  update: Partial<State> = {},
  target: 'firefox' | 'chrome' = 'firefox',
) {
  const actions = {
    onCaptureBefore: vi.fn(async () => {}),
    onCaptureAfter: vi.fn(async () => {}),
    onStartOver: vi.fn(),
    onAssessment: vi.fn((_value: PageAssessment) => {}),
  };
  const state: State = {
    before: null,
    after: null,
    busy: null,
    assessment: null,
    timingBefore: null,
    timingAfter: null,
    afterStarted: false,
    ...update,
  };
  const markup = renderToStaticMarkup(
    <InvestigationView
      state={state}
      context={getBrowserContext(target)}
      label="Investigation AB12"
      {...actions}
    />,
  );
  return { markup, actions };
}

function button(markup: string, id: string) {
  const tag = markup.match(new RegExp(`<button[^>]*id="${id}"[^>]*>`))?.[0];
  if (!tag) throw new Error(`Missing button ${id}`);
  return tag;
}

it.each(['firefox', 'chrome'] as const)(
  'opens an empty %s investigation without invoking collection',
  (target) => {
    const { markup, actions } = view({}, target);
    expect(markup).toContain('Manual comparison');
    expect(markup).toContain(getBrowserContext(target).name);
    expect(markup).toContain('No before snapshot captured.');
    expect(markup).toContain('No after snapshot captured.');
    expect(button(markup, 'capture-before')).not.toContain('disabled');
    expect(button(markup, 'capture-after')).toContain('disabled');
    expect(markup).not.toContain('data-testid="before-snapshot"');
    expect(markup).not.toContain('data-testid="comparison-changes"');
    expect(markup).not.toContain('name="page-assessment"');
    for (const action of Object.values(actions))
      expect(action).not.toHaveBeenCalled();
  },
);

it('keeps Start over available while disabling both pending capture actions', () => {
  const { markup } = view({ busy: 'before' });
  expect(button(markup, 'capture-before')).toContain('disabled');
  expect(button(markup, 'capture-after')).toContain('disabled');
  expect(button(markup, 'start-over')).not.toContain('disabled');
  expect(markup).toContain('Capturing before');
});

it('treats an empty successful Before as a snapshot that permits After', () => {
  const { markup } = view({ before: { status: 'success', value: [] } });
  expect(markup).toContain('data-testid="before-snapshot"');
  expect(markup).toContain('0 extensions reported.');
  expect(markup).toContain('No extensions reported in this snapshot.');
  expect(button(markup, 'capture-before')).toContain('disabled');
  expect(button(markup, 'capture-after')).not.toContain('disabled');
});

it.each([
  ['denied', 'Inventory access declined'],
  ['unavailable', 'Inventory unavailable'],
  ['error', 'Capture failed'],
] as const)(
  'explains %s Before results without treating them as a snapshot',
  (status, heading) => {
    const { markup } = view({
      before: { status, reason: 'Bounded capture explanation.' },
    });
    expect(markup).toContain(heading);
    expect(markup).toContain('Bounded capture explanation.');
    expect(markup).not.toContain('data-testid="before-snapshot"');
    expect(button(markup, 'capture-before')).not.toContain('disabled');
    expect(button(markup, 'capture-after')).toContain('disabled');
  },
);

it('keeps a successful Before visible and enables retry after an After failure', () => {
  const { markup } = view({
    before: { status: 'success', value: before },
    after: { status: 'error', reason: 'Retry capture after.' },
  });
  expect(markup).toContain('data-testid="before-snapshot"');
  expect(markup).toContain('View captured extensions');
  expect(markup).toContain('Controlled fixture');
  expect(markup).toContain('Capture failed');
  expect(markup).not.toContain('data-testid="after-snapshot"');
  expect(button(markup, 'capture-before')).toContain('disabled');
  expect(button(markup, 'capture-after')).not.toContain('disabled');
});

it('shows the completed pair, a reported state change and an unset assessment', () => {
  const { markup } = view({
    before: { status: 'success', value: before },
    after: { status: 'success', value: after },
  });
  expect(markup).toContain('data-testid="before-snapshot"');
  expect(markup).toContain('data-testid="after-snapshot"');
  expect(markup).toContain('data-testid="comparison-changes"');
  expect(markup).toContain('1 reported inventory change.');
  expect(markup).toContain('Disabled');
  expect(markup).toContain('Your page assessment');
  expect(markup.match(/name="page-assessment"/g)).toHaveLength(4);
  expect(markup).not.toContain('checked=""');
  expect(markup).toContain('No assessment selected.');
  expect(button(markup, 'capture-before')).toContain('disabled');
  expect(button(markup, 'capture-after')).toContain('disabled');
});

it('uses narrow zero-delta wording even when names and versions changed', () => {
  const renamed = [
    {
      id: 'fixture@test',
      name: 'Renamed fixture',
      version: '2',
      enabled: true,
    },
  ];
  const { markup } = view({
    before: { status: 'success', value: before },
    after: { status: 'success', value: renamed },
  });
  expect(markup).toContain(
    'No reported additions, removals or enabled-state changes.',
  );
  expect(markup).not.toContain('All conditions unchanged');
  expect(markup).toContain('Renamed fixture');
  expect(markup).toContain('Version 2');
});

it.each(['better', 'unchanged', 'worse', 'uncertain'] as const)(
  'marks only the explicit %s page assessment',
  (assessment) => {
    const { markup } = view({
      before: { status: 'success', value: [] },
      after: { status: 'success', value: [] },
      assessment,
    });
    const inputs = markup.match(/<input[^>]*>/g) ?? [];
    const checked = inputs.filter((input) => input.includes('checked=""'));
    expect(checked).toHaveLength(1);
    expect(checked[0]).toContain(`value="${assessment}"`);
  },
);

it('renders snapshot fields as escaped text and omits permission metadata', () => {
  const supplied = [
    {
      id: '<script>id</script>',
      name: '<img src=x onerror=alert(1)>',
      version: '<b>version</b>',
      enabled: true,
      permissions: ['secretPermission'],
      hostPermissions: ['https://private.example/*'],
    },
  ];
  const { markup } = view({ before: { status: 'success', value: supplied } });
  expect(markup).toContain('&lt;script&gt;id&lt;/script&gt;');
  expect(markup).toContain('&lt;img src=x onerror=alert(1)&gt;');
  expect(markup).toContain('&lt;b&gt;version&lt;/b&gt;');
  expect(markup).not.toContain('<script>');
  expect(markup).not.toContain('<img');
  expect(markup).not.toContain('<a ');
  expect(markup).not.toContain('secretPermission');
  expect(markup).not.toContain('private.example');
});

it('explains independent lifetime and the Chrome consent boundary', () => {
  const { markup } = view({}, 'chrome');
  expect(markup).toContain(
    'Closing, reloading or unloading it loses the results.',
  );
  expect(markup).toContain(
    'Other investigations and the popup are independent.',
  );
  expect(markup).toContain('Start over clears only this investigation.');
  expect(markup).toContain(
    'Chrome groups inventory and extension controls under one permission.',
  );
  expect(markup).toContain('No collection runs between captures.');
  expect(markup).not.toContain('Firefox');
});

it('shows a synthetic investigation label and optional timing guidance independently of the inventory pair', () => {
  const { markup } = view();
  expect(markup).toContain('id="investigation-label"');
  expect(markup).toContain('Investigation AB12');
  expect(markup).toContain('Optional loading timings');
  expect(markup).toContain('Capture the Before inventory first');
  expect(markup).toContain('inventory-only comparisons still work');
  expect(markup).not.toContain('Your page assessment');
});

it('retains a fixed Before timing and its retry guidance after an After inventory failure', () => {
  const { markup } = view({
    before: { status: 'success', value: before },
    after: { status: 'error', reason: 'Retry capture after.' },
    afterStarted: true,
    timingBefore: {
      domContentLoaded: { status: 'measured', milliseconds: 12.34 },
      loadEvent: { status: 'unrecorded' },
      firstContentfulPaint: { status: 'unavailable' },
    },
  });
  expect(markup).toContain('12.34 ms');
  expect(markup).toContain('Before timing attached');
  expect(markup).toContain('capture the After inventory here');
  expect(button(markup, 'capture-after')).not.toContain('disabled');
  expect(markup).not.toContain('Your page assessment');
});
