import { vi } from 'bun:test';
import type { ImportOutput } from '../lib/import-output';

export function importOutputStub(
  overrides: Partial<ReturnType<ImportOutput['getSnapshot']>> = {},
): ImportOutput {
  const snapshot = {
    format: 'html' as const,
    preview: null,
    busy: false,
    message: null,
    ...overrides,
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    setFormat: vi.fn(),
    prepare: vi.fn(async () => {}),
    download: vi.fn(async () => {}),
    print: vi.fn(async () => {}),
    copy: vi.fn(async () => {}),
    cancel: vi.fn(),
    dispose: vi.fn(),
  };
}
