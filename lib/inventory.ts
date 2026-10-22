import type { ExtensionEntry } from './inspector';

export type InventoryFilter = 'all' | 'enabled' | 'disabled';

export function filterInventory(
  entries: ExtensionEntry[],
  query: string,
  state: InventoryFilter,
) {
  const needle = query.trim().toLowerCase();
  return entries.filter((entry) => {
    if (state !== 'all' && entry.enabled !== (state === 'enabled'))
      return false;
    return [
      entry.name,
      entry.id,
      ...(entry.permissions ?? []),
      ...(entry.hostPermissions ?? []),
    ].some((value) => value.toLowerCase().includes(needle));
  });
}

// Meanings are bounded summaries of the Mozilla references in docs/api-limits.md.
const explanations = new Map([
  [
    'activeTab',
    'Temporary access to the tab where you interact with the extension. Browser restrictions still apply.',
  ],
  [
    'management',
    'Read information about installed add-ons exposed by Firefox. This does not authorize switching ordinary extensions.',
  ],
  [
    'scripting',
    'Insert scripts and styles into pages where Firefox grants access. This permission alone does not grant access to every page.',
  ],
  [
    'storage',
    'Use Firefox extension storage to save and retrieve data. This metadata does not reveal what is stored.',
  ],
  [
    'tabs',
    'Read tab details such as URLs and titles. This metadata does not show which tabs were inspected.',
  ],
  [
    'webRequest',
    'Observe network requests within the permitted host scope. Changing or blocking requests requires additional permissions.',
  ],
]);

export function permissionExplanation(identifier: string) {
  return (
    explanations.get(identifier) ??
    'No explanation is available for this permission. Its original identifier is shown.'
  );
}
