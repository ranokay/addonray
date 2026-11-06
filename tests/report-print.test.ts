import { afterEach, expect, it, vi } from 'bun:test';
import {
  printablePreviewMatches,
  printReportPreview,
  requestPrintableReport,
} from '../lib/report-print';

const reviewed =
  '<!doctype html>\n<html lang="en"><body><p>Report</p></body></html>\n';

type FakeFrame = {
  srcdoc: string;
  contentDocument: {
    readyState: string;
    documentElement: { outerHTML: string };
  } | null;
  contentWindow: {
    document: { readyState: string };
    frameElement: unknown;
    focus: () => void;
    print: () => void;
  } | null;
};

function frame(overrides: Partial<FakeFrame> = {}): FakeFrame {
  const document = {
    readyState: 'complete',
    documentElement: {
      outerHTML: '<html lang="en"><body><p>Report</p></body></html>',
    },
  };
  const candidate = {
    srcdoc: reviewed,
    contentDocument: document,
    contentWindow: null as FakeFrame['contentWindow'],
    ...overrides,
  };
  candidate.contentWindow = {
    document,
    frameElement: candidate,
    focus: vi.fn(),
    print: vi.fn(),
  };
  return candidate;
}

const originalParser = Object.getOwnPropertyDescriptor(globalThis, 'DOMParser');
afterEach(() => {
  if (originalParser)
    Object.defineProperty(globalThis, 'DOMParser', originalParser);
  else Reflect.deleteProperty(globalThis, 'DOMParser');
});

function parser(outerHTML: string) {
  Object.defineProperty(globalThis, 'DOMParser', {
    configurable: true,
    value: class {
      parseFromString() {
        return { documentElement: { outerHTML } };
      }
    },
  });
}

it('accepts only a loaded frame whose parsed document matches the reviewed text', () => {
  parser('<html lang="en"><body><p>Report</p></body></html>');
  expect(printablePreviewMatches(frame() as never, reviewed)).toBe(true);
  parser('<html lang="en"><body><p>Previous</p></body></html>');
  expect(printablePreviewMatches(frame() as never, reviewed)).toBe(false);
});

it('refuses a missing, unloaded, stale or cross-origin frame', () => {
  parser('<html lang="en"><body><p>Report</p></body></html>');
  expect(printablePreviewMatches(null, reviewed)).toBe(false);
  expect(
    printablePreviewMatches(frame({ srcdoc: 'old' }) as never, reviewed),
  ).toBe(false);
  expect(
    printablePreviewMatches(
      frame({
        contentDocument: {
          readyState: 'loading',
          documentElement: { outerHTML: '' },
        },
      }) as never,
      reviewed,
    ),
  ).toBe(false);
  const crossOrigin = frame();
  if (crossOrigin.contentWindow)
    crossOrigin.contentWindow.frameElement = { other: true };
  expect(printablePreviewMatches(crossOrigin as never, reviewed)).toBe(false);
});

it('prints the exact reviewed frame only after a matching loaded document', () => {
  parser('<html lang="en"><body><p>Report</p></body></html>');
  const candidate = frame();
  requestPrintableReport(candidate as never, reviewed);
  expect(candidate.contentWindow?.focus).toHaveBeenCalledTimes(1);
  expect(candidate.contentWindow?.print).toHaveBeenCalledTimes(1);

  const stale = frame({ srcdoc: 'old' });
  expect(() => requestPrintableReport(stale as never, reviewed)).toThrow(
    'does not match',
  );
  expect(stale.contentWindow?.print).not.toHaveBeenCalled();
});

it('looks up the preview frame by id and refuses a missing element', () => {
  parser('<html lang="en"><body><p>Report</p></body></html>');
  const candidate = frame();
  const target = {
    getElementById: vi.fn((id: string) =>
      id === 'report-html-preview' ? candidate : null,
    ),
  };
  printReportPreview('report-html-preview', reviewed, target as never);
  expect(candidate.contentWindow?.print).toHaveBeenCalledTimes(1);
  expect(() =>
    printReportPreview('missing-frame', reviewed, target as never),
  ).toThrow('does not match');
});
