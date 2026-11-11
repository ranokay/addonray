import { beforeAll, expect, test } from 'bun:test';
import { readFile, mkdtemp, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import {
  writeReader,
  writeFixtures,
} from '../scripts/clipboard-feasibility-fixtures.mjs';
import { writeEvidence } from '../scripts/clipboard-feasibility-evidence.mjs';

beforeAll(async () => {
  await mkdir('.scratch', { recursive: true });
});

test('failed-write evidence omits clipboard text and fragments at every nesting level', async () => {
  const secret = 'private clipboard content';
  const read = {
    status: 'resolved',
    bytes: 25,
    hash: 'digest',
    text: secret,
    prefix: secret,
    suffix: secret,
  };
  const report = {
    checks: [{ status: 'failed', read }],
    policy: { execCommand: { read } },
  };
  expect(await writeEvidence(report, 'firefox', '999.77.123')).toBe(false);
  const output = await readFile(
    '.scratch/clipboard-feasibility-firefox-999.77.123.json',
    'utf8',
  );
  expect(output).not.toContain(secret);
  const saved = JSON.parse(output);
  expect(saved.checks[0].read).toEqual({
    status: 'resolved',
    bytes: 25,
    hash: 'digest',
  });
  expect(saved.policy.execCommand.read).toEqual(saved.checks[0].read);
  expect(read.text).toBe(secret);
});

test('different requested Firefox versions retain separate evidence files', async () => {
  await writeEvidence({ checks: [], marker: 'first' }, 'firefox', '999.77.124');
  await writeEvidence(
    { checks: [], marker: 'second' },
    'firefox',
    '999.77.125',
  );
  expect(
    JSON.parse(
      await readFile(
        '.scratch/clipboard-feasibility-firefox-999.77.124.json',
        'utf8',
      ),
    ).marker,
  ).toBe('first');
  expect(
    JSON.parse(
      await readFile(
        '.scratch/clipboard-feasibility-firefox-999.77.125.json',
        'utf8',
      ),
    ).marker,
  ).toBe('second');
});

test('reader retains large multiline text in memory and omits it from the visible result', async () => {
  const directory = await mkdtemp('.scratch/clipboard-reader-test-');
  await writeReader(directory);
  const text = 'sensitive'.repeat(10000) + '\r\nnext line\n';
  const element = { textContent: '', addEventListener() {} };
  const result = await runInNewContext(
    `${await readFile(join(directory, 'reader.js'), 'utf8')}\nwindow.__clipboardRead();`,
    {
      window: {},
      navigator: { clipboard: { readText: async () => text } },
      document: { getElementById: () => element },
      TextEncoder,
      crypto: webcrypto,
    },
  );
  expect(result.status).toBe('resolved');
  expect(result.text).toBe(text);
  expect(element.textContent).not.toContain('sensitive');
});

test('restoration writes exact retained text including CRLF and large values', async () => {
  const directory = await mkdtemp('.scratch/clipboard-writer-test-');
  await writeFixtures(directory);
  const text = 'line one\r\nline two\n' + 'x'.repeat(70000);
  const callbacks = new Map();
  const writes = [];
  runInNewContext(await readFile(join(directory, 'writer.js'), 'utf8'), {
    window: { __clipboardRestoreText: text },
    navigator: {
      clipboard: {
        writeText: async (value) => {
          writes.push(value);
        },
      },
    },
    document: {
      hasFocus: () => true,
      getElementById: (id) => ({
        value: 'normalized fallback',
        addEventListener: (_event, callback) => {
          callbacks.set(id, callback);
        },
      }),
    },
    performance: { now: () => 0 },
  });
  callbacks.get('restore')?.();
  expect(writes).toEqual([text]);
});
