import { expect, it, vi } from 'bun:test';
import {
  CLIPBOARD_DENIED_MESSAGE,
  CLIPBOARD_ERROR_MESSAGE,
  CLIPBOARD_OVERSIZE_MESSAGE,
  CLIPBOARD_SUCCESS_MESSAGE,
  CLIPBOARD_UNAVAILABLE_MESSAGE,
  writeReportClipboard,
} from '../lib/report-clipboard';
import { REPORT_TEXT_MAX_BYTES } from '../lib/report-shape';

it('writes the exact reviewed text and reports success only after resolution', async () => {
  const resolved = Promise.withResolvers<void>();
  const writeText = vi.fn<(text: string) => Promise<void>>(
    () => resolved.promise,
  );
  const result = writeReportClipboard('exact report\n', { writeText });
  expect(writeText.mock.calls).toEqual([['exact report\n']]);
  expect(result).toBeInstanceOf(Promise);
  resolved.resolve();
  expect(await result).toEqual({
    status: 'success',
    message: CLIPBOARD_SUCCESS_MESSAGE,
  });
});

it('accepts exactly the 1 MiB UTF-8 bound without truncation', async () => {
  const text = 'x'.repeat(REPORT_TEXT_MAX_BYTES);
  const writeText = vi.fn<(value: string) => Promise<void>>(async () => {});
  const result = await writeReportClipboard(text, { writeText });
  expect(result.status).toBe('success');
  expect(writeText.mock.calls).toEqual([[text]]);
});

it('refuses one byte over 1 MiB before touching the clipboard', async () => {
  const writeText = vi.fn(async () => {});
  const result = await writeReportClipboard(
    `${'x'.repeat(REPORT_TEXT_MAX_BYTES)}y`,
    { writeText },
  );
  expect(result).toEqual({
    status: 'error',
    message: CLIPBOARD_OVERSIZE_MESSAGE,
  });
  expect(writeText).not.toHaveBeenCalled();
});

it('counts UTF-8 bytes rather than code units', async () => {
  const writeText = vi.fn(async () => {});
  // 262,145 four-byte characters exceed 1 MiB although their string length is
  // well below the bound.
  const result = await writeReportClipboard('🧪'.repeat(262_145), {
    writeText,
  });
  expect(result.status).toBe('error');
  expect(writeText).not.toHaveBeenCalled();
});

it('reports a browser denial explicitly and never as success', async () => {
  const writeText = vi.fn(async () => {
    const error = new Error('blocked');
    error.name = 'NotAllowedError';
    throw error;
  });
  expect(await writeReportClipboard('report', { writeText })).toEqual({
    status: 'denied',
    message: CLIPBOARD_DENIED_MESSAGE,
  });
});

it('reports unavailable clipboard access explicitly', async () => {
  expect(await writeReportClipboard('report', null)).toEqual({
    status: 'unavailable',
    message: CLIPBOARD_UNAVAILABLE_MESSAGE,
  });
});

it('reports an ordinary platform failure without exposing its detail', async () => {
  const writeText = vi.fn(async () => {
    throw new Error('private platform detail');
  });
  const result = await writeReportClipboard('report', { writeText });
  expect(result).toEqual({
    status: 'error',
    message: CLIPBOARD_ERROR_MESSAGE,
  });
  expect(JSON.stringify(result)).not.toContain('private platform detail');
});
