import { expect, it, vi } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { TimingComparison } from '../entrypoints/investigation/TimingComparison';
import { TimingAttachment } from '../entrypoints/popup/TimingAttachment';
import type { TimingSnapshot } from '../lib/inspector';
import { createSession } from '../lib/session';
import type { PopupTimingHandoff } from '../lib/timing-handoff';
import { browser } from './browser';

function measured(dom: number, load: number, paint: number): TimingSnapshot {
  return {
    domContentLoaded: { status: 'measured', milliseconds: dom },
    loadEvent: { status: 'measured', milliseconds: load },
    firstContentfulPaint: { status: 'measured', milliseconds: paint },
  };
}

function compare(before: TimingSnapshot, after: TimingSnapshot | null) {
  return renderToStaticMarkup(
    <TimingComparison
      before={before}
      after={after}
      hasBeforeInventory
      hasAfterInventory
      afterStarted
    />,
  );
}

it('labels the three milestones, elapsed values and signed After-minus-Before differences', () => {
  const html = compare(measured(100, 500, 70), measured(125.567, 475, 70));
  expect(html).toContain('<th scope="col">Before</th>');
  expect(html).toContain('<th scope="col">After</th>');
  expect(html).toContain('Difference in ms');
  expect(html).toContain('DOM content loaded');
  expect(html).toContain('Load event completed');
  expect(html).toContain('First content displayed');
  expect(html).toContain('When this document&#x27;s DOMContentLoaded handlers');
  expect(html).toContain('125.57 ms');
  expect(html).toContain('data-side="difference">+25.57 ms');
  expect(html).toContain('data-side="difference">−25 ms');
  expect(html).toContain('data-side="difference">0 ms');
  expect(html).toContain(
    'Positive differences mean a later recorded milestone',
  );
  expect(html).toContain('Negative differences mean an earlier milestone');
  expect(html).toContain('do not prove an extension caused a change');
  expect(html).toContain('your page assessment remains separate');
  expect(html).not.toContain('%');
  expect(html).not.toContain('faster');
  expect(html).not.toContain('slower');
});

it('preserves missing observations and never makes a difference from an unavailable value', () => {
  const html = compare(
    {
      domContentLoaded: { status: 'unavailable' },
      loadEvent: { status: 'unrecorded' },
      firstContentfulPaint: { status: 'measured', milliseconds: 0 },
    },
    measured(10, 20, 0),
  );
  expect(html).toContain('Unavailable at capture');
  expect(html).toContain('Not recorded at capture');
  expect(html.match(/Needs two measured values/g)).toHaveLength(2);
  expect(html).toContain('data-side="difference">0 ms');
  expect(html).not.toContain('data-side="difference">+10 ms');
  expect(html).not.toContain('data-side="difference">+20 ms');
});

it('keeps tiny measured values and positive or negative differences visible', () => {
  const html = compare(measured(0.001, 20.002, 0), measured(0.002, 20.001, 0));
  expect(html).toContain('&lt;0.01 ms');
  expect(html).toContain('data-side="difference">+&lt;0.01 ms');
  expect(html).toContain('data-side="difference">−&lt;0.01 ms');
  expect(html).toContain('Browser clock precision can reduce numeric detail');
});

it('explains missing After attachments without replacing them with measured zero', () => {
  const html = compare(measured(10, 20, 30), null);
  expect(html.match(/data-side="after">Not attached/g)).toHaveLength(3);
  expect(html.match(/Needs two measured values/g)).toHaveLength(3);
  expect(html).toContain('Return to the same source tab');
  expect(html).toContain('attach After timing');
  expect(html).toContain('same browser tab');
  expect(html).toContain('matching it does not verify the page');
  expect(html).toContain('Inventory and timing captures are separate');
  expect(html).toContain('Clearing or closing the popup keeps an accepted');
});

it('explains the closed Before timing slot after the After inventory has started', () => {
  const html = renderToStaticMarkup(
    <TimingComparison
      before={null}
      after={null}
      hasBeforeInventory
      hasAfterInventory={false}
      afterStarted
    />,
  );
  expect(html).toContain('This attempt remains inventory-only');
  expect(html).toContain('Choose Start over to begin a timing comparison');
  expect(html).toContain(
    'repeat the Before inventory and Before timing sequence',
  );
  expect(html).toContain('Private or unclassifiable windows are excluded');
});

it('offers deliberate attachment discovery without discovering or choosing a destination on render', () => {
  const session = createSession(browser);
  vi.spyOn(session, 'isTimingCaptureCurrent').mockReturnValue(true);
  const handoff: PopupTimingHandoff = {
    listDestinations: vi.fn<PopupTimingHandoff['listDestinations']>(
      async () => ({
        status: 'success',
        value: [],
      }),
    ),
    attach: vi.fn<PopupTimingHandoff['attach']>(async () => ({
      status: 'success',
      value: null,
    })),
  };
  const html = renderToStaticMarkup(
    <TimingAttachment captureId={1} session={session} handoff={handoff} />,
  );
  expect(html).toContain('id="timing-destinations"');
  expect(html).toContain('Attach timing');
  expect(html).toContain('id="timing-attachment-status" role="status"');
  expect(html).not.toContain('<select');
  expect(html).not.toContain('id="attach-timing"');
  expect(handoff.listDestinations).not.toHaveBeenCalled();
  expect(handoff.attach).not.toHaveBeenCalled();
});
