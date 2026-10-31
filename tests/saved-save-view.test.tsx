import { expect, it, vi } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { SavedInvestigationSection } from '../entrypoints/investigation/SavedInvestigation';
import type { SavedSave } from '../lib/saved-save';

function saver(
  snapshot: Partial<ReturnType<SavedSave['getSnapshot']>> = {},
): SavedSave {
  const state = {
    ready: true,
    busy: false,
    message: null,
    lastLabel: null,
    retentionDays: 30 as const,
    ...snapshot,
  };
  return {
    getSnapshot: () => state,
    subscribe: () => () => {},
    save: vi.fn(async () => {}),
    retryStorage: vi.fn(async () => {}),
    setRetentionDays: vi.fn(),
    dispose: vi.fn(),
    ready: Promise.resolve(),
  };
}

function button(markup: string, id: string) {
  const tag = markup.match(new RegExp(`<button[^>]*id="${id}"[^>]*>`))?.[0];
  if (!tag) throw new Error(`Missing button ${id}`);
  return tag;
}

it('discloses every storage boundary before enabling an explicit save', () => {
  const current = saver();
  const markup = renderToStaticMarkup(
    <SavedInvestigationSection
      saver={current}
      eligible
      libraryUrl="moz-extension://addonray/library.html"
    />,
  );
  for (const phrase of [
    'persist on this device and browser profile',
    'Any AddonRay extension page in this profile can read them',
    'no sync, cloud, telemetry or companion transfer',
    'no encryption layer',
    'Deletion and expiry are product-level actions',
    'browser or OS backups',
    'Uninstall clearing is browser-controlled',
    'Exported files, prints and clipboard content leave',
    'omits extension IDs, source tab IDs and page URLs or titles',
    'never updates an existing archive or saves automatically',
  ])
    expect(markup).toContain(phrase);
  expect(button(markup, 'save-investigation')).not.toContain('disabled');
  expect(markup).toContain('href="moz-extension://addonray/library.html"');
  expect(current.save).not.toHaveBeenCalled();
});

it('defaults new-archive retention to 30 days and offers only 7, 30 or 90', () => {
  const markup = renderToStaticMarkup(
    <SavedInvestigationSection
      saver={saver()}
      eligible
      libraryUrl="/library.html"
    />,
  );
  expect(markup).toContain('Keep this archive for');
  expect(markup).toContain('value="7"');
  expect(markup).toContain('value="30" selected');
  expect(markup).toContain('value="90"');
  expect(markup).toContain('never kept beyond 90 days');
  expect(markup).toContain('existing records keep their saved expiry');
  expect(markup).toContain('no background timer');
});

it('disables save until the investigation and storage are ready', () => {
  const markup = renderToStaticMarkup(
    <SavedInvestigationSection
      saver={saver({ ready: false })}
      eligible
      libraryUrl="/library.html"
    />,
  );
  expect(button(markup, 'save-investigation')).toContain('disabled');
  expect(markup).toContain('Saved storage is not ready');
});

it('offers an explicit storage retry after readiness fails while keeping Save disabled', () => {
  const current = saver({ ready: false, message: 'Saved storage timed out.' });
  const markup = renderToStaticMarkup(
    <SavedInvestigationSection
      saver={current}
      eligible
      libraryUrl="/library.html"
    />,
  );
  expect(button(markup, 'save-investigation')).toContain('disabled');
  expect(button(markup, 'retry-saved-storage')).not.toContain('disabled');
  expect(current.retryStorage).not.toHaveBeenCalled();
  expect(current.save).not.toHaveBeenCalled();
});

it('disables save without a completed idle pair and shows the bounded result', () => {
  const markup = renderToStaticMarkup(
    <SavedInvestigationSection
      saver={saver({ busy: true, message: 'Saving…' })}
      eligible={false}
      libraryUrl="/library.html"
    />,
  );
  expect(button(markup, 'save-investigation')).toContain('disabled');
  expect(markup).toContain('Saving…');
});

it('renders a completed save message as text', () => {
  const markup = renderToStaticMarkup(
    <SavedInvestigationSection
      saver={saver({ message: 'Saved locally. <b>untrusted</b>' })}
      eligible
      libraryUrl="/library.html"
    />,
  );
  expect(markup).toContain('&lt;b&gt;untrusted&lt;/b&gt;');
  expect(markup).not.toContain('<b>untrusted</b>');
});
