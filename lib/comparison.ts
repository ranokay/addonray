import type { ExtensionEntry } from './inspector';

export type SnapshotEntry = Readonly<
  Pick<ExtensionEntry, 'id' | 'name' | 'version' | 'enabled'>
>;
export type InventorySnapshot = readonly SnapshotEntry[];
export const pageAssessments = [
  'better',
  'unchanged',
  'worse',
  'uncertain',
] as const;
export type PageAssessment = (typeof pageAssessments)[number];

export interface InventoryChange {
  kind: 'added' | 'removed' | 'enabled' | 'disabled';
  entry: SnapshotEntry;
}

export function compareInventories(
  before: InventorySnapshot,
  after: InventorySnapshot,
): InventoryChange[] {
  const previous = new Map(before.map((entry) => [entry.id, entry]));
  const current = new Map(after.map((entry) => [entry.id, entry]));
  const changes: InventoryChange[] = [];
  for (const entry of after) {
    const earlier = previous.get(entry.id);
    if (!earlier) changes.push({ kind: 'added', entry });
    else if (earlier.enabled !== entry.enabled) {
      changes.push({ kind: entry.enabled ? 'enabled' : 'disabled', entry });
    }
  }
  for (const entry of before) {
    if (!current.has(entry.id)) changes.push({ kind: 'removed', entry });
  }
  const order = { added: 0, removed: 1, enabled: 2, disabled: 3 };
  return changes.sort(
    (left, right) =>
      order[left.kind] - order[right.kind] ||
      (left.entry.id < right.entry.id
        ? -1
        : left.entry.id > right.entry.id
          ? 1
          : 0),
  );
}
