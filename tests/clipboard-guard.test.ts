import { describe, expect, it } from 'bun:test';
import {
  assertHeadfulClipboardAllowed,
  CLIPBOARD_RESTORE_SCOPE,
  DISPOSABLE_CLIPBOARD_ENV,
  headfulClipboardRefusal,
} from '../scripts/clipboard-guard';

describe('headful and native clipboard guard', () => {
  it('stays out of the way of headless runs', () => {
    expect(headfulClipboardRefusal({})).toBeNull();
    expect(headfulClipboardRefusal({ HEADFUL: '0' })).toBeNull();
    expect(() => assertHeadfulClipboardAllowed({})).not.toThrow();
  });

  it('refuses headful runs without an explicit disposable assertion', () => {
    const refusal = headfulClipboardRefusal({ HEADFUL: '1' });
    expect(refusal).toContain(`${DISPOSABLE_CLIPBOARD_ENV}=1`);
    expect(refusal).toContain('before any clipboard mutation');
    expect(refusal).toContain('does not detect or create that isolation');
    expect(() => assertHeadfulClipboardAllowed({ HEADFUL: '1' })).toThrow(
      /before any clipboard mutation/,
    );
  });

  it('refuses native observation without an explicit disposable assertion', () => {
    expect(
      headfulClipboardRefusal({ ADDONRAY_NATIVE_CLIPBOARD: '1' }),
    ).not.toBeNull();
    expect(() =>
      assertHeadfulClipboardAllowed({ ADDONRAY_NATIVE_CLIPBOARD: '1' }),
    ).toThrow();
  });

  it('refuses when the assertion is present but not exactly 1', () => {
    for (const value of ['0', 'true', 'yes', '']) {
      expect(
        headfulClipboardRefusal({
          HEADFUL: '1',
          [DISPOSABLE_CLIPBOARD_ENV]: value,
        }),
      ).not.toBeNull();
    }
  });

  it('allows headful and native runs only with the explicit assertion', () => {
    const env = {
      HEADFUL: '1',
      ADDONRAY_NATIVE_CLIPBOARD: '1',
      [DISPOSABLE_CLIPBOARD_ENV]: '1',
    };
    expect(headfulClipboardRefusal(env)).toBeNull();
    expect(() => assertHeadfulClipboardAllowed(env)).not.toThrow();
  });

  it('labels clipboard restoration as text-only', () => {
    expect(CLIPBOARD_RESTORE_SCOPE).toBe('text-only');
  });
});
