// Fail-closed guard for host-clipboard mutation in headful and native probe runs.
// The harness cannot detect or create isolation. It only refuses to start unless
// the operator has explicitly asserted an isolated clipboard with this variable.
export const DISPOSABLE_CLIPBOARD_ENV = 'ADDONRAY_CLIPBOARD_DISPOSABLE';

// Test-only snapshots capture and restore plain text. Other clipboard formats
// (rich text, images, file references) are not captured and are never claimed.
export const CLIPBOARD_RESTORE_SCOPE = 'text-only';

export function headfulClipboardRefusal(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const headful = env.HEADFUL === '1';
  const native = env.ADDONRAY_NATIVE_CLIPBOARD === '1';
  if (!headful && !native) return null;
  if (env[DISPOSABLE_CLIPBOARD_ENV] === '1') return null;
  return [
    'Headful or native clipboard checks refuse to start before any clipboard mutation.',
    `Set ${DISPOSABLE_CLIPBOARD_ENV}=1 only after you have isolated this host's clipboard yourself,`,
    'for example in a dedicated VM or user session that no one else copies from.',
    'The harness does not detect or create that isolation, and it restores the clipboard as text only.',
  ].join(' ');
}

export function assertHeadfulClipboardAllowed(
  env: Record<string, string | undefined> = process.env,
): void {
  const refusal = headfulClipboardRefusal(env);
  if (refusal) throw new Error(refusal);
}
