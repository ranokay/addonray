import { REPORT_TEXT_MAX_BYTES } from './report-shape';

export type ClipboardOutcome =
  | { status: 'success'; message: string }
  | { status: 'denied' | 'unavailable' | 'error'; message: string };

export const CLIPBOARD_SUCCESS_MESSAGE =
  'Copied the exact Markdown report to the system clipboard. Other applications can read it, and AddonRay cannot recall it after copying.';
export const CLIPBOARD_DENIED_MESSAGE =
  'Clipboard access was denied by the browser. The report was not copied.';
export const CLIPBOARD_UNAVAILABLE_MESSAGE =
  'Clipboard writing is unavailable in this browser. The report was not copied.';
export const CLIPBOARD_ERROR_MESSAGE =
  'The report could not be copied. Try again from this review.';
export const CLIPBOARD_OVERSIZE_MESSAGE =
  'The Markdown report exceeds the 1 MiB clipboard limit. It was not copied.';

export const CLIPBOARD_DISCLOSURE =
  'Copying places the exact Markdown above on your system clipboard. Other applications and people can read it. AddonRay cannot recall or erase copied content after the write.';

export interface ClipboardTarget {
  writeText(text: string): Promise<void>;
}

function defaultTarget(): ClipboardTarget | null {
  try {
    const clipboard = globalThis.navigator?.clipboard;
    return clipboard && typeof clipboard.writeText === 'function'
      ? clipboard
      : null;
  } catch {
    return null;
  }
}

function denied(error: unknown) {
  if (typeof error !== 'object' || error === null || !('name' in error))
    return false;
  return (
    error.name === 'NotAllowedError' ||
    error.name === 'SecurityError' ||
    error.name === 'AbortError'
  );
}

// No truncation, prompts, retries or background access. The caller must keep
// the write inside its own explicit user activation; this adapter only performs
// the platform write and reports the bounded outcome.
export async function writeReportClipboard(
  text: string,
  target: ClipboardTarget | null = defaultTarget(),
): Promise<ClipboardOutcome> {
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > REPORT_TEXT_MAX_BYTES)
    return { status: 'error', message: CLIPBOARD_OVERSIZE_MESSAGE };
  if (!target)
    return { status: 'unavailable', message: CLIPBOARD_UNAVAILABLE_MESSAGE };
  try {
    await target.writeText(text);
    return { status: 'success', message: CLIPBOARD_SUCCESS_MESSAGE };
  } catch (error) {
    return denied(error)
      ? { status: 'denied', message: CLIPBOARD_DENIED_MESSAGE }
      : { status: 'error', message: CLIPBOARD_ERROR_MESSAGE };
  }
}
