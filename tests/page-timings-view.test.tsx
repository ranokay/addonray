import { expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { PageTimings } from '../entrypoints/popup/PageTimings';

it('labels three elapsed milestones and explains the document and attribution limits', () => {
  const html = renderToStaticMarkup(
    <PageTimings
      timings={{
        domContentLoaded: { status: 'measured', milliseconds: 1234.567 },
        loadEvent: { status: 'unrecorded' },
        firstContentfulPaint: { status: 'unavailable' },
      }}
    />,
  );
  expect(html).toContain('DOM content loaded');
  expect(html).toContain('Load event completed');
  expect(html).toContain('First content displayed');
  expect(html).toContain('1,234.57 ms');
  expect(html).toContain('Not recorded at capture');
  expect(html).toContain('Unavailable at capture');
  expect(html).toContain('Milliseconds since navigation began');
  expect(html).toContain('when this check ran');
  expect(html).toContain('original document load');
  expect(html).toContain('Browser clock precision');
  expect(html).toContain('identify an extension');
  expect(html).toContain('<summary>How to read these timings</summary>');
});

it('preserves the difference between a tiny measured milestone, an unrecorded event, and a reported zero paint', () => {
  const html = renderToStaticMarkup(
    <PageTimings
      timings={{
        domContentLoaded: { status: 'measured', milliseconds: 0.001 },
        loadEvent: { status: 'unrecorded' },
        firstContentfulPaint: { status: 'measured', milliseconds: 0 },
      }}
    />,
  );
  expect(html).toContain('&lt;0.01 ms');
  expect(html).toContain('Not recorded at capture');
  expect(html).toContain('data-testid="timing-firstContentfulPaint">0 ms');
  expect(html).not.toContain('0 ms</dd><dd class="metadata">When');
});
