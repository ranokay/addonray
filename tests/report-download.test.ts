import { afterEach, expect, it, vi } from 'bun:test';
import { requestReportDownload } from '../lib/report-download';

const originalDocument = Object.getOwnPropertyDescriptor(
  globalThis,
  'document',
);
afterEach(() => {
  vi.restoreAllMocks();
  if (originalDocument)
    Object.defineProperty(globalThis, 'document', originalDocument);
  else Reflect.deleteProperty(globalThis, 'document');
});

function fixture() {
  const events: string[] = [];
  const anchor = {
    href: '',
    download: '',
    hidden: false,
    click: vi.fn(() => {
      events.push('click');
    }),
    remove: vi.fn(() => {
      events.push('remove');
    }),
  };
  const createElement = vi.fn((tag: string) => {
    expect(tag).toBe('a');
    return anchor;
  });
  const append = vi.fn((element: unknown) => {
    expect(element).toBe(anchor);
    events.push('append');
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement, body: { append } },
  });
  const create = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
    events.push('create');
    return 'blob:controlled-fixture';
  });
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {
    events.push('revoke');
  });
  return { anchor, create, revoke, events, createElement };
}

it('dispatches the exact UTF-8 text under a generic filename and releases the URL', async () => {
  const { anchor, create, revoke, events } = fixture();
  const reviewed = '# Report\n\nCafé 🧪\n';
  requestReportDownload(reviewed);
  const blob = create.mock.calls[0]?.[0];
  if (!(blob instanceof Blob)) throw new Error('Expected a report Blob');
  expect(await blob.text()).toBe(reviewed);
  expect(blob.size).toBe(new TextEncoder().encode(reviewed).length);
  expect(blob.type).toBe('text/markdown;charset=utf-8');
  expect(anchor.download).toBe('addonray-investigation.md');
  expect(anchor.href).toBe('blob:controlled-fixture');
  expect(anchor.hidden).toBe(true);
  expect(events).toEqual(['create', 'append', 'click', 'remove', 'revoke']);
  expect(revoke).toHaveBeenCalledWith('blob:controlled-fixture');
});

it('releases the link and URL if the browser request throws without retrying', () => {
  const { anchor, revoke } = fixture();
  anchor.click.mockImplementation(() => {
    throw new Error('Blocked');
  });
  expect(() => requestReportDownload('reviewed')).toThrow('Blocked');
  expect(anchor.click).toHaveBeenCalledTimes(1);
  expect(anchor.remove).toHaveBeenCalledTimes(1);
  expect(revoke).toHaveBeenCalledTimes(1);
});

it('releases a created URL even when document setup fails', () => {
  const { createElement, revoke } = fixture();
  createElement.mockImplementation(() => {
    throw new Error('Closed');
  });
  expect(() => requestReportDownload('reviewed')).toThrow('Closed');
  expect(revoke).toHaveBeenCalledTimes(1);
});

it('still releases the URL if removing the link fails', () => {
  const { anchor, revoke } = fixture();
  anchor.remove.mockImplementation(() => {
    throw new Error('Detached document');
  });
  expect(() => requestReportDownload('reviewed')).toThrow('Detached document');
  expect(revoke).toHaveBeenCalledTimes(1);
});
