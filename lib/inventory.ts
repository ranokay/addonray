import type { ExtensionEntry } from './inspector';
import { firefoxContext, type BrowserContext } from './browser-target';

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

// Meanings are bounded summaries of the browser references in docs/api-limits.md.
const explanations = new Map([
  [
    'activeTab',
    'Temporary access to the tab where you interact with the extension. Browser restrictions still apply.',
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

export function permissionExplanation(
  identifier: string,
  context: BrowserContext = firefoxContext,
) {
  if (identifier === 'management') {
    return context.target === 'chrome'
      ? 'Read information about installed extensions exposed by Chrome. Chrome also permits extension state changes through this API when allowed; AddonRay only reads the inventory.'
      : 'Read information about installed add-ons exposed by Firefox. This does not authorize switching ordinary extensions.';
  }
  if (identifier === 'scripting') {
    return `Insert scripts and styles into pages where ${context.name} grants access. This permission alone does not grant access to every page.`;
  }
  if (identifier === 'storage') {
    return `Use ${context.name} extension storage to save and retrieve data. This metadata does not reveal what is stored.`;
  }
  if (identifier === 'webRequest' && context.target === 'chrome') {
    return 'Observe network requests within the permitted host scope. Chrome MV3 limits blocking webRequest listeners to policy-installed extensions.';
  }
  return (
    explanations.get(identifier) ??
    'No explanation is available for this permission. Its original identifier is shown.'
  );
}
