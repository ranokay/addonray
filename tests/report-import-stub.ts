import { vi } from 'bun:test';
import type { ReportImport, ReportImportSnapshot } from '../lib/report-import';

export function reportImportStub(
  overrides: Partial<ReportImportSnapshot> = {},
): ReportImport {
  const snapshot: ReportImportSnapshot = {
    report: null,
    claimedProvenance: null,
    importedAt: null,
    busy: false,
    saveable: false,
    retentionDays: 30,
    message: null,
    ...overrides,
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    select: vi.fn(async () => {}),
    setRetentionDays: vi.fn(),
    save: vi.fn(async () => {}),
    clear: vi.fn(),
    suspend: vi.fn(),
    resume: vi.fn(),
    dispose: vi.fn(),
  };
}
