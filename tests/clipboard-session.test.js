import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { verifyClipboardOutcomes } from '../scripts/clipboard-checks.mjs';
import { prepareClipboardFixtures } from '../scripts/clipboard-fixtures.mjs';

test('copy probe stops before product interaction when its clipboard backup is unreadable', async () => {
  let interactions = 0;
  await expect(
    verifyClipboardOutcomes({
      driver: {
        getWindowHandle: async () => 'product',
        findElement: () => {
          interactions += 1;
          throw new Error('Product must not be touched');
        },
      },
      clipboard: { snapshot: async () => ({ status: 'rejected' }) },
    }),
  ).rejects.toThrow('Copy checks require a readable clipboard backup');
  expect(interactions).toBe(0);
});

test('generated product-test writer restores retained CRLF text instead of normalized textarea text', async () => {
  await mkdir('.scratch', { recursive: true });
  const directory = await mkdtemp('.scratch/product-clipboard-writer-');
  const { writer } = await prepareClipboardFixtures(directory);
  const original = 'first\r\nsecond\r\n' + 'x'.repeat(70000);
  let restore;
  const writes = [];
  runInNewContext(await readFile(join(writer, 'writer.js'), 'utf8'), {
    window: { __clipboardRestoreText: original },
    navigator: {
      clipboard: {
        writeText: async (text) => {
          writes.push(text);
        },
      },
    },
    document: {
      getElementById: () => ({
        value: original.replaceAll('\r\n', '\n'),
        addEventListener: (_event, callback) => {
          restore = callback;
        },
      }),
    },
  });
  await restore();
  expect(writes).toEqual([original]);
});
