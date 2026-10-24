import { beforeEach, expect, it, vi } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { browser } from './browser';
import { App } from '../entrypoints/page-error/App';
import { getBrowserContext } from '../lib/browser-target';
import {
  createPageErrorCheck,
  pageErrorFailureMessages,
  type PageErrorDriver,
  type PageErrorSummary,
} from '../lib/page-error-check';

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
});

function fixture(target: 'firefox' | 'chrome' = 'firefox') {
  const result =
    Promise.withResolvers<Awaited<ReturnType<PageErrorDriver['start']>>>();
  let ready = () => {};
  const driver: PageErrorDriver = {
    start: vi.fn((_id, _signal, onObserving) => {
      ready = onObserving;
      return result.promise;
    }),
    stop: vi.fn(() => {}),
  };
  const check = createPageErrorCheck(
    browser,
    driver,
    getBrowserContext(target),
  );
  return {
    check,
    driver,
    result,
    observing: () => ready(),
    markup: () => renderToStaticMarkup(<App check={check} />),
  };
}

function button(markup: string, id: string) {
  const tag = markup.match(new RegExp(`<button[^>]*id="${id}"[^>]*>`))?.[0];
  if (!tag) throw new Error(`Missing button ${id}`);
  return tag;
}

const summary = (
  overrides: Partial<PageErrorSummary> = {},
): PageErrorSummary => ({
  scriptErrors: 2,
  unhandledRejections: 1,
  total: 3,
  finish: 'stop',
  observedMs: 1200.5,
  ...overrides,
});

it('renders an unbound check with disabled collection controls and no browser work', () => {
  const current = fixture();
  const markup = current.markup();
  expect(markup).toContain('Page-error check');
  expect(markup).toContain('id="page-error-check-label"');
  expect(markup).toContain(current.check.label);
  expect(markup).toContain('This check has no source page');
  expect(markup).toContain('data-phase="unbound" role="status"');
  expect(button(markup, 'page-error-start')).toContain('disabled');
  expect(button(markup, 'page-error-stop')).toContain('disabled');
  expect(markup).not.toContain('id="page-error-summary"');
  expect(markup).not.toContain('id="page-error-reset"');
  expect(current.driver.start).not.toHaveBeenCalled();
  expect(current.driver.stop).not.toHaveBeenCalled();
});

it('enables only explicit Start after binding without displaying source identity or collecting on render', () => {
  const current = fixture();
  current.check.bindSource(666555444);
  const markup = current.markup();
  expect(button(markup, 'page-error-start')).not.toContain('disabled');
  expect(button(markup, 'page-error-stop')).toContain('disabled');
  expect(markup).toContain('data-phase="ready"');
  expect(markup).not.toContain('666555444');
  expect(markup).not.toContain('id="page-error-summary"');
  expect(current.driver.start).not.toHaveBeenCalled();
});

it('keeps Clear available during starting and observing without displaying live counts', async () => {
  const current = fixture();
  current.check.bindSource(17);
  const pending = current.check.start();
  let markup = current.markup();
  expect(markup).toContain('data-phase="starting"');
  expect(markup).toContain('Waiting for page access');
  expect(button(markup, 'page-error-start')).toContain('disabled');
  expect(button(markup, 'page-error-stop')).toContain('disabled');
  expect(button(markup, 'page-error-clear')).not.toContain('disabled');
  current.observing();
  markup = current.markup();
  expect(markup).toContain('data-phase="observing"');
  expect(markup).toContain('Return to the original source tab');
  expect(button(markup, 'page-error-stop')).not.toContain('disabled');
  expect(markup).not.toContain('id="page-error-summary"');
  expect(markup).not.toContain('id="page-error-total"');
  current.check.clear();
  current.result.resolve({ status: 'interrupted' });
  await pending;
});

it('shows stopping while awaiting confirmation and renders counts only after the result arrives', async () => {
  const current = fixture();
  current.check.bindSource(17);
  const pending = current.check.start();
  current.observing();
  current.check.stop();
  let markup = current.markup();
  expect(markup).toContain('data-phase="stopping"');
  expect(markup).toContain('Waiting for confirmed partial counts');
  expect(button(markup, 'page-error-stop')).toContain('disabled');
  expect(markup).not.toContain('id="page-error-summary"');
  current.result.resolve({ status: 'success', value: summary() });
  await pending;
  markup = current.markup();
  expect(markup).toContain('Stopped by you');
  expect(markup).toContain('id="page-error-summary"');
  expect(markup).toContain('id="page-error-script-errors">2</dd>');
  expect(markup).toContain('id="page-error-rejections">1</dd>');
  expect(markup).toContain('id="page-error-total">3</dd>');
  expect(markup).toContain('1,200.5 ms');
  expect(button(markup, 'page-error-reset')).not.toContain('disabled');
  expect(button(markup, 'page-error-start')).toContain('disabled');
});

it('renders confirmed zero observations with their limits instead of an error-free verdict', async () => {
  const current = fixture();
  current.check.bindSource(17);
  const pending = current.check.start();
  current.result.resolve({
    status: 'success',
    value: summary({
      scriptErrors: 0,
      unhandledRejections: 0,
      total: 0,
      observedMs: 0,
    }),
  });
  await pending;
  const markup = current.markup();
  expect(markup).toContain('id="page-error-total">0</dd>');
  expect(markup).toContain(
    'Zero observed events does not mean the page is error-free',
  );
  expect(markup).toContain('not unique defects or a diagnosis');
  expect(markup).toContain('Observation window: 0 ms');
});

for (const failure of ['interrupted', 'denied', 'invalid-result'] as const) {
  it(`explains ${failure} without displaying zero or unconfirmed counts`, async () => {
    const current = fixture();
    current.check.bindSource(17);
    const pending = current.check.start();
    current.result.resolve({ status: failure });
    await pending;
    const markup = current.markup();
    expect(markup).toContain(pageErrorFailureMessages[failure]);
    expect(markup).not.toContain('id="page-error-summary"');
    expect(markup).not.toContain('id="page-error-total"');
    expect(button(markup, 'page-error-reset')).not.toContain('disabled');
    expect(button(markup, 'page-error-start')).toContain('disabled');
  });
}

it.each([
  [
    summary({ finish: 'timeout', observedMs: 30_000 }),
    'The 30-second observation window ended.',
  ],
  [
    summary({
      scriptErrors: 199,
      unhandledRejections: 1,
      total: 200,
      finish: 'limit',
    }),
    'The 200-event limit was reached.',
  ],
])(
  'labels confirmed duration and event-limit completion',
  async (value, message) => {
    const current = fixture();
    current.check.bindSource(17);
    const pending = current.check.start();
    current.result.resolve({ status: 'success', value });
    await pending;
    expect(current.markup()).toContain(message);
  },
);

it.each(['firefox', 'chrome'] as const)(
  'keeps the %s execution and privacy limits visible outside collapsed details',
  (target) => {
    const markup = fixture(target).markup();
    const visible = markup.slice(0, markup.indexOf('<details'));
    expect(visible).toContain('Only verified normal browser windows');
    expect(visible).toContain('We collect no raw error messages');
    expect(visible).toContain(
      'Closing, reloading or unloading this check tab discards',
    );
    expect(visible).toContain(
      'Other checks, investigations and the popup are independent',
    );
    expect(visible).toContain('30 seconds or');
    expect(visible).toContain('200 events total');
    expect(markup).toContain(
      'console.error calls, resource or network failures',
    );
    if (target === 'chrome') {
      expect(visible).toContain('Chrome&#x27;s observer runs with the page');
      expect(visible).toContain(
        'The page can interfere with the observer or its counts',
      );
      expect(markup).not.toContain('Firefox');
    } else {
      expect(visible).toContain(
        'Firefox&#x27;s observer runs in an isolated extension environment',
      );
      expect(markup).not.toContain('Chrome');
    }
  },
);

it('removes a final summary on Start over and returns to an explicit ready state', async () => {
  const current = fixture();
  current.check.bindSource(17);
  const pending = current.check.start();
  current.result.resolve({ status: 'success', value: summary() });
  await pending;
  current.check.startOver();
  const markup = current.markup();
  expect(markup).toContain('data-phase="ready"');
  expect(markup).not.toContain('id="page-error-summary"');
  expect(markup).not.toContain('id="page-error-reset"');
  expect(button(markup, 'page-error-start')).not.toContain('disabled');
  expect(current.driver.start).toHaveBeenCalledTimes(1);
});
