import { expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { Inventory } from '../entrypoints/popup/Inventory';
import type { ExtensionEntry } from '../lib/inspector';
import { filterInventory, permissionExplanation } from '../lib/inventory';

const entries: ExtensionEntry[] = [
  {
    id: 'notes@fixture.test',
    name: 'Page Notes',
    version: '1',
    enabled: true,
    permissions: ['activeTab', 'storage'],
    hostPermissions: [],
  },
  {
    id: 'translate@fixture.test',
    name: 'Quiet Translate',
    version: '2',
    enabled: false,
    permissions: null,
    hostPermissions: null,
  },
  {
    id: 'ruler@fixture.test',
    name: 'Reading Ruler',
    version: '3',
    enabled: true,
    permissions: ['futurePermission'],
    hostPermissions: ['https://docs.example.invalid/*'],
  },
];

it.each([
  ['  PAGE notes  ', ['Page Notes']],
  ['TRANSLATE@fixture', ['Quiet Translate']],
  ['activeTAB', ['Page Notes']],
  ['DOCS.example.invalid', ['Reading Ruler']],
  ['.*', []],
])('searches reported metadata literally: %s', (query, names) => {
  expect(
    filterInventory(entries, query, 'all').map((entry) => entry.name),
  ).toEqual(names);
});

it('combines state with search without mutating the alphabetical inventory', () => {
  expect(
    filterInventory(entries, 'fixture', 'disabled').map((entry) => entry.name),
  ).toEqual(['Quiet Translate']);
  expect(filterInventory(entries, 'Translate', 'enabled')).toEqual([]);
  expect(
    filterInventory(entries, ' ', 'enabled').map((entry) => entry.name),
  ).toEqual(['Page Notes', 'Reading Ruler']);
  expect(entries.map((entry) => entry.name)).toEqual([
    'Page Notes',
    'Quiet Translate',
    'Reading Ruler',
  ]);
});

it('does not invent searchable values for unavailable permission metadata', () => {
  expect(filterInventory(entries, 'null', 'all')).toEqual([]);
  expect(filterInventory(entries, 'storage', 'disabled')).toEqual([]);
});

it('distinguishes empty inventory from a loaded list', () => {
  const empty = renderToStaticMarkup(<Inventory entries={[]} />);
  expect(empty).toContain('No extensions reported.');
  expect(empty).toContain('0 of 0 extensions');
  expect(renderToStaticMarkup(<Inventory entries={entries} />)).toContain(
    '3 of 3 extensions',
  );
});

it('keeps missing metadata distinct from an empty reported list', () => {
  const markup = renderToStaticMarkup(<Inventory entries={entries} />);
  expect(markup).toContain(
    'Unknown. Firefox did not supply API permission metadata.',
  );
  expect(markup).toContain(
    'Unknown. Firefox did not supply host permission metadata.',
  );
  expect(markup).toContain('None reported.');
});

it('preserves unrecognized identifiers with an explicit explanation fallback', () => {
  const markup = renderToStaticMarkup(<Inventory entries={entries} />);
  expect(markup).toContain('futurePermission');
  expect(markup).toContain('No explanation is available for this permission.');
  expect(permissionExplanation('constructor')).toContain(
    'No explanation is available',
  );
});

it('renders supplied names, identifiers and host patterns as text', () => {
  const markup = renderToStaticMarkup(
    <Inventory
      entries={[
        {
          id: '<script>id</script>',
          name: '<img src=x onerror=alert(1)>',
          version: '1',
          enabled: true,
          permissions: ['<script>permission</script>'],
          hostPermissions: ['<img src=x>'],
        },
      ]}
    />,
  );
  expect(markup).not.toContain('<script>');
  expect(markup).not.toContain('<img');
  expect(markup).not.toContain('<a ');
  expect(markup).toContain('&lt;img src=x&gt;');
});
