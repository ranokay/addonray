import { expect, it } from 'bun:test';
import { compareInventories, type SnapshotEntry } from '../lib/comparison';

function entry(id: string, enabled = true): SnapshotEntry {
  return { id, name: id, version: '1.0', enabled };
}

it('reports only additions, removals and enabled-state transitions by exact identity', () => {
  const before = [
    entry('removed'),
    entry('disabled'),
    entry('enabled', false),
    entry('same'),
  ];
  const after = [
    entry('same'),
    entry('enabled'),
    entry('added', false),
    entry('disabled', false),
  ];
  expect(compareInventories(before, after)).toEqual([
    { kind: 'added', entry: entry('added', false) },
    { kind: 'removed', entry: entry('removed') },
    { kind: 'enabled', entry: entry('enabled') },
    { kind: 'disabled', entry: entry('disabled', false) },
  ]);
  expect(before.map((item) => item.id)).toEqual([
    'removed',
    'disabled',
    'enabled',
    'same',
  ]);
  expect(after.map((item) => item.id)).toEqual([
    'same',
    'enabled',
    'added',
    'disabled',
  ]);
});

it('keeps name/version-only changes outside the narrowly labelled state difference', () => {
  expect(
    compareInventories(
      [entry('same')],
      [{ ...entry('same'), name: 'Renamed', version: '2.0' }],
    ),
  ).toEqual([]);
  expect(
    compareInventories([entry('OLD')], [{ ...entry('old'), name: 'OLD' }]).map(
      ({ kind, entry }) => [kind, entry.id],
    ),
  ).toEqual([
    ['added', 'old'],
    ['removed', 'OLD'],
  ]);
});

it('uses the current name for an enabled-state transition without inventing a new identity', () => {
  const current = { ...entry('same', false), name: 'New name' };
  expect(compareInventories([entry('same')], [current])).toEqual([
    { kind: 'disabled', entry: current },
  ]);
});

it('handles empty snapshots as valid observations and orders identities consistently', () => {
  expect(compareInventories([], [])).toEqual([]);
  expect(
    compareInventories([], [entry('z'), entry('a')]).map(
      ({ entry }) => entry.id,
    ),
  ).toEqual(['a', 'z']);
  expect(
    compareInventories([entry('z'), entry('a')], []).map(({ kind }) => kind),
  ).toEqual(['removed', 'removed']);
});
