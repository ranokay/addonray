import { expect, it } from 'bun:test';
import { getBrowserContext } from '../lib/browser-target';

it.each([
  ['firefox', 'Firefox'],
  ['chrome', 'Chrome'],
] as const)('resolves the explicit %s build target', (target, name) => {
  const context = getBrowserContext(target);
  expect(context.target).toBe(target);
  expect(context.name).toBe(name);
});

it.each([undefined, null, '', 'edge', 'safari', 'chromium', 'CHROME'])(
  'rejects an unapproved browser target: %j',
  (target) => {
    expect(() => getBrowserContext(target)).toThrow(
      'Unsupported browser target',
    );
  },
);
