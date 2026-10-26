import { expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { PageErrorComparison } from '../entrypoints/investigation/PageErrorComparison';
import { getBrowserContext } from '../lib/browser-target';
import type { PageErrorSummary } from '../lib/page-error-check';

const stopped: PageErrorSummary = {
  scriptErrors: 2,
  unhandledRejections: 1,
  total: 3,
  finish: 'stop',
  observedMs: 1200.5,
};

function compare(
  before: PageErrorSummary | null,
  after: PageErrorSummary | null,
  target: 'firefox' | 'chrome' = 'firefox',
) {
  return renderToStaticMarkup(
    <PageErrorComparison
      before={before}
      after={after}
      hasBeforeInventory
      hasAfterInventory
      afterStarted
      context={getBrowserContext(target)}
    />,
  );
}

it('shows confirmed counts, durations and completion reasons side by side without arithmetic comparisons', () => {
  const html = compare(stopped, {
    scriptErrors: 0,
    unhandledRejections: 0,
    total: 0,
    finish: 'timeout',
    observedMs: 30_000,
  });
  expect(html).toContain('<th scope="col">Observation</th>');
  expect(html).toContain('<th scope="col">Before</th>');
  expect(html).toContain('<th scope="col">After</th>');
  expect(html).toContain('data-testid="comparison-error-scriptErrors"');
  expect(html).toContain('data-testid="comparison-error-unhandledRejections"');
  expect(html).toContain('data-testid="comparison-error-total"');
  expect(html).toContain('data-testid="comparison-error-observedMs"');
  expect(html).toContain('data-testid="comparison-error-finish"');
  expect(html).toContain('1,200.5 ms');
  expect(html).toContain('30,000 ms');
  expect(html).toContain('Stopped by you');
  expect(html).toContain('30-second window ended');
  expect(html).not.toContain('data-side="difference"');
  expect(html).not.toContain('Difference in');
  expect(html).not.toContain('per second');
  expect(html).not.toContain('%');
  expect(html).not.toContain('fewer errors');
  expect(html).not.toContain('more errors');
});

it('distinguishes missing attachments from confirmed zero counts and preserves a capped interval', () => {
  const missing = compare(
    {
      ...stopped,
      scriptErrors: 0,
      unhandledRejections: 0,
      total: 0,
      observedMs: 0,
    },
    null,
  );
  expect(missing.match(/data-side="after">Not attached/g)).toHaveLength(5);
  expect(missing.match(/data-side="before">0<\/td>/g)).toHaveLength(3);
  expect(missing).toContain('data-side="before">0 ms');
  const capped = compare(stopped, {
    scriptErrors: 199,
    unhandledRejections: 1,
    total: 200,
    finish: 'limit',
    observedMs: 0.001,
  });
  expect(capped).toContain('200-event limit reached');
  expect(capped).toContain('data-side="after">200</td>');
  expect(capped).toContain('&lt;0.01 ms');
  expect(capped).toContain('Stop can shorten an observation');
  expect(capped).toContain('200-event limit stops counting later events');
  expect(capped).toContain('Durations and reproduced interactions can differ');
  expect(capped).toContain(
    'Zero observed events does not mean the page is error-free',
  );
});

it.each(['firefox', 'chrome'] as const)(
  'makes the %s source and privacy limits readable without opening details',
  (target) => {
    const html = compare(stopped, null, target);
    const visible = html.slice(0, html.indexOf('<details'));
    expect(visible).toContain('same browser tab');
    expect(visible).toContain(
      'Matching it does not verify the page, document or test conditions',
    );
    expect(visible).toContain('No URL or title is collected');
    expect(visible).toContain('cannot identify a responsible extension');
    expect(visible).toContain('your page assessment remains separate');
    expect(html).toContain('Normal windows only');
    expect(html).toContain('private or unclassifiable contexts are excluded');
    expect(html).toContain('Each completed check can attach successfully once');
    expect(html).toContain('This investigation owns accepted copies');
    if (target === 'chrome') {
      expect(visible).toContain('Chrome&#x27;s observer runs with the page');
      expect(visible).toContain(
        'The page can interfere with the observer or its counts',
      );
    } else {
      expect(html).not.toContain('Chrome');
    }
  },
);
