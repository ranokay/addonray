import { expect, it } from 'bun:test';
import type { Investigation } from '../lib/investigation';
import {
  createSavedRecord,
  exchangeBytes,
  inspectStoredRecord,
  isExpired,
  planSave,
  recordLabel,
  SAVED_LIMITS,
  SAVED_RETENTION_MS,
  serializeExchange,
  serializeStoredRecord,
  storedRecordBytes,
  type SavedRecord,
  type SavedRetentionDays,
} from '../lib/saved-record';

type State = ReturnType<Investigation['getSnapshot']>;

function state(overrides: Partial<State> = {}): State {
  return {
    before: null,
    after: null,
    busy: null,
    assessment: null,
    timingBefore: null,
    timingAfter: null,
    errorBefore: null,
    errorAfter: null,
    afterStarted: false,
    ...overrides,
  };
}

function complete(overrides: Partial<State> = {}): State {
  return state({
    before: {
      status: 'success',
      value: [
        { id: 'alpha@test', name: 'Same name', version: '1', enabled: true },
        { id: 'beta@test', name: 'Same name', version: '1', enabled: true },
      ],
    },
    after: {
      status: 'success',
      value: [
        { id: 'alpha@test', name: 'Same name', version: '1', enabled: false },
        { id: 'gamma@test', name: 'Same name', version: '1', enabled: true },
      ],
    },
    assessment: 'worse',
    ...overrides,
  });
}

function record(overrides: Partial<State> = {}): SavedRecord {
  const result = createSavedRecord(complete(overrides), {
    now: 1_800_000_000_000,
    recordId: '12345678-1234-1234-1234-123456789abc',
  });
  if (result.status !== 'success') throw new Error(result.reason);
  return result.value;
}

it('saves only completed, idle investigations with both inventories successful', () => {
  for (const current of [
    state(),
    state({ busy: 'before', before: complete().before }),
    state({ before: complete().before }),
    state({ after: complete().after }),
    state({
      before: { status: 'denied', reason: 'No access.' },
      after: complete().after,
    }),
  ]) {
    const result = createSavedRecord(current, {
      now: 1,
      recordId: '12345678-1234-1234-1234-123456789abc',
    });
    expect(result.status).toBe('unavailable');
  }
});

it('strips every extension ID and live identifier while preserving duplicate names', () => {
  const saved = record();
  expect(saved.report.before.extensions).toEqual([
    { name: 'Same name', version: '1', enabled: true },
    { name: 'Same name', version: '1', enabled: true },
  ]);
  expect(saved.report.after.extensions).toEqual([
    { name: 'Same name', version: '1', enabled: false },
    { name: 'Same name', version: '1', enabled: true },
  ]);
  expect(saved.report.changes).toEqual([
    { kind: 'added', name: 'Same name', version: '1', enabled: true },
    { kind: 'removed', name: 'Same name', version: '1', enabled: true },
    { kind: 'disabled', name: 'Same name', version: '1', enabled: false },
  ]);
  const stored = serializeStoredRecord(saved);
  const exchange = serializeExchange(saved);
  for (const text of [stored, exchange]) {
    expect(text).not.toContain('alpha@test');
    expect(text).not.toContain('beta@test');
    expect(text).not.toContain('gamma@test');
    expect(text).not.toContain('"id"');
  }
  expect(exchange).not.toContain(saved.recordId);
  expect(exchange).not.toContain('savedAt');
  expect(exchange).not.toContain('expiresAt');
  expect(exchange).not.toContain('origin');
  expect(exchange).toContain('"provenance":"captured"');
});

it('keeps precomputed changes by extension ID even when names and versions collide', () => {
  const saved = record();
  expect(saved.report.changes.map((change) => change.kind)).toEqual([
    'added',
    'removed',
    'disabled',
  ]);
  // The archived rows are indistinguishable, but the stored change list stays
  // the exact ID-based result rather than a name-based recomputation.
  expect(saved.report.before.extensions).toHaveLength(2);
  expect(saved.report.after.extensions).toHaveLength(2);
});

it('preserves measured, unrecorded, unavailable and null states exactly', () => {
  const error = {
    scriptErrors: 1,
    unhandledRejections: 0,
    total: 1,
    finish: 'stop' as const,
    observedMs: 1250.5,
  };
  const saved = record({
    timingBefore: {
      domContentLoaded: { status: 'measured', milliseconds: 12.5 },
      loadEvent: { status: 'unrecorded' },
      firstContentfulPaint: { status: 'unavailable' },
    },
    timingAfter: null,
    errorBefore: null,
    errorAfter: error,
  });
  expect(saved.report.timing.before).toEqual({
    domContentLoaded: { status: 'measured', milliseconds: 12.5 },
    loadEvent: { status: 'unrecorded' },
    firstContentfulPaint: { status: 'unavailable' },
  });
  expect(saved.report.timing.after).toBeNull();
  expect(saved.report.pageErrors.before).toBeNull();
  expect(saved.report.pageErrors.after).toEqual(error);
  expect(saved.report.assessment).toBe('worse');
});

it('applies the 30-day default retention and complete byte accounting', () => {
  const saved = record();
  expect(saved.savedAt).toBe(1_800_000_000_000);
  expect(saved.expiresAt - saved.savedAt).toBe(SAVED_RETENTION_MS);
  expect(storedRecordBytes(saved)).toBe(
    new TextEncoder().encode(serializeStoredRecord(saved)).length,
  );
  expect(exchangeBytes(saved)).toBe(
    new TextEncoder().encode(serializeExchange(saved)).length,
  );
  expect(storedRecordBytes(saved)).toBeGreaterThan(exchangeBytes(saved));
  expect(isExpired(saved, saved.expiresAt - 1)).toBe(false);
  expect(isExpired(saved, saved.expiresAt)).toBe(true);
  expect(recordLabel(saved)).toContain('Worse');
  expect(recordLabel(saved)).toContain(saved.recordId.slice(0, 8));
});

it('uses the chosen 7, 30 or 90-day retention from save time', () => {
  for (const retentionDays of [7, 30, 90] as const) {
    const saved = createSavedRecord(complete(), {
      now: 1_800_000_000_000,
      recordId: '12345678-1234-1234-1234-123456789abc',
      retentionDays,
    });
    expect(saved.status).toBe('success');
    if (saved.status !== 'success') continue;
    expect(saved.value.expiresAt - saved.value.savedAt).toBe(
      retentionDays * 24 * 60 * 60 * 1000,
    );
    expect(inspectStoredRecord(saved.value).status).toBe('valid');
  }
  expect(
    createSavedRecord(complete(), {
      now: 1_800_000_000_000,
      recordId: '12345678-1234-1234-1234-123456789abc',
      retentionDays: 14 as SavedRetentionDays,
    }),
  ).toEqual({
    status: 'error',
    reason: 'The selected retention is not an approved 7, 30 or 90 days.',
  });
});

it('rejects inventories and change lists above their limits', () => {
  const many = Array.from(
    { length: SAVED_LIMITS.inventoryEntries + 1 },
    (_, i) => ({
      id: `entry-${i}`,
      name: `Entry ${i}`,
      version: '1',
      enabled: true,
    }),
  );
  const overInventory = createSavedRecord(
    complete({
      before: { status: 'success', value: many },
      after: { status: 'success', value: [] },
    }),
    { now: 1, recordId: '12345678-1234-1234-1234-123456789abc' },
  );
  expect(overInventory).toEqual({
    status: 'error',
    reason: 'An inventory exceeds the 1,000-entry archive limit.',
  });
});

it('accepts an exact valid record and labels unsupported versions separately', () => {
  const saved = record();
  expect(inspectStoredRecord(saved)).toEqual({
    status: 'valid',
    record: saved,
  });
  expect(inspectStoredRecord({ ...saved, schemaVersion: 2 })).toEqual({
    status: 'unsupported',
    recordId: saved.recordId,
  });
  expect(inspectStoredRecord({ ...saved, extra: true }).status).toBe('invalid');
  expect(
    inspectStoredRecord({
      ...saved,
      recordId: 'not-a-record-id',
    }).status,
  ).toBe('invalid');
});

it('rejects malformed values, unknown fields, overlong strings and unsafe timestamps', () => {
  const saved = record();
  const clone = () => JSON.parse(JSON.stringify(saved)) as SavedRecord;
  const invalid: unknown[] = [];
  const overlong = clone();
  overlong.report.before.extensions[0]!.name = 'x'.repeat(
    SAVED_LIMITS.stringCodePoints + 1,
  );
  invalid.push(overlong);
  const unknownChange = clone();
  (
    unknownChange.report.changes[0] as unknown as Record<string, unknown>
  ).extra = true;
  invalid.push(unknownChange);
  const badTiming = clone();
  (
    badTiming.report.timing as unknown as {
      before: Record<string, unknown>;
    }
  ).before = { domContentLoaded: { status: 'measured', milliseconds: -1 } };
  invalid.push(badTiming);
  const badError = clone();
  badError.report.pageErrors.after = {
    scriptErrors: 1,
    unhandledRejections: 1,
    total: 1,
    finish: 'stop',
    observedMs: 1,
  };
  invalid.push(badError);
  for (const malformed of [
    {
      scriptErrors: 0,
      unhandledRejections: 0,
      total: 0,
      finish: 'limit',
      observedMs: 0,
    },
    {
      scriptErrors: 0,
      unhandledRejections: 0,
      total: 0,
      finish: 'timeout',
      observedMs: 1,
    },
    {
      scriptErrors: 0,
      unhandledRejections: 0,
      total: 0,
      finish: 'stop',
      observedMs: 30000,
    },
    {
      scriptErrors: 0,
      unhandledRejections: 0,
      total: 200,
      finish: 'stop',
      observedMs: 1,
    },
  ]) {
    const malformedError = clone();
    malformedError.report.pageErrors.after = malformed as never;
    invalid.push(malformedError);
  }
  const longRetention = clone();
  longRetention.expiresAt = longRetention.savedAt + 91 * 24 * 60 * 60 * 1000;
  invalid.push(longRetention);
  const reversed = clone();
  reversed.expiresAt = reversed.savedAt;
  invalid.push(reversed);
  const badVersion = clone();
  (badVersion as unknown as Record<string, unknown>).schemaVersion = '1';
  invalid.push(badVersion);
  const unsupportedDate = clone();
  unsupportedDate.savedAt = 9_000_000_000_000_000;
  unsupportedDate.expiresAt = unsupportedDate.savedAt + 1;
  invalid.push(unsupportedDate);
  for (const value of invalid)
    expect(inspectStoredRecord(value).status).toBe('invalid');
});

it('cleans only valid expired rows and counts unsupported rows toward limits', () => {
  const now = 1_800_000_000_000;
  const expired = {
    ...record(),
    savedAt: now - SAVED_RETENTION_MS * 2,
    expiresAt: now - SAVED_RETENTION_MS,
  };
  const live = record();
  const unsupported = { ...record(), schemaVersion: 2 };
  const plan = planSave([expired, live, unsupported], 100, now);
  expect(plan.cleanupIds).toEqual([expired.recordId]);
  expect(plan.count).toBe(2);
  expect(plan.outcome).toBe('ok');
  expect(plan.totalBytes).toBe(
    storedRecordBytes(live) +
      new TextEncoder().encode(JSON.stringify(unsupported)).length,
  );

  const records = Array.from({ length: SAVED_LIMITS.records }, () => live);
  expect(planSave(records, 100, now).outcome).toBe('records');
  const expiryOnly = Array.from({ length: SAVED_LIMITS.records }, () => ({
    ...live,
    savedAt: now - SAVED_RETENTION_MS * 2,
    expiresAt: now - SAVED_RETENTION_MS,
  }));
  expect(planSave(expiryOnly, 100, now)).toMatchObject({
    outcome: 'ok',
    count: 0,
    cleanupIds: expiryOnly.map((entry) => entry.recordId),
  });
  expect(planSave([], SAVED_LIMITS.recordBytes + 1, now).outcome).toBe(
    'record',
  );
  expect(
    planSave([], SAVED_LIMITS.recordBytes, now, {
      ...SAVED_LIMITS,
      totalBytes: 1,
    }).outcome,
  ).toBe('total');
});

it('treats the exact stored-byte boundary as valid and one byte over as invalid', () => {
  const exact = (() => {
    const limit = SAVED_LIMITS.recordBytes;
    const template = record();
    const entries = (count: number, lastLength: number) =>
      Array.from({ length: count }, (_, index) => ({
        name: 'x'.repeat(index === count - 1 ? lastLength : 4096),
        version: '1',
        enabled: true,
      }));
    const candidate = (count: number, lastLength: number): SavedRecord => ({
      ...template,
      report: {
        ...template.report,
        before: { extensions: entries(count, lastLength) },
      },
    });
    for (let count = 1; ; count += 1) {
      if (storedRecordBytes(candidate(count, 4096)) < limit) continue;
      let low = 0;
      let high = 4096;
      while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        const bytes = storedRecordBytes(candidate(count, middle));
        if (bytes === limit) return candidate(count, middle);
        if (bytes < limit) low = middle + 1;
        else high = middle - 1;
      }
      throw new Error('No exact stored-byte boundary found');
    }
  })();
  expect(storedRecordBytes(exact)).toBe(SAVED_LIMITS.recordBytes);
  expect(inspectStoredRecord(exact).status).toBe('valid');
  const over = {
    ...exact,
    report: {
      ...exact.report,
      before: {
        extensions: exact.report.before.extensions.map((entry, index) =>
          index === exact.report.before.extensions.length - 1
            ? { ...entry, name: `${entry.name}x` }
            : entry,
        ),
      },
    },
  };
  expect(storedRecordBytes(over)).toBe(SAVED_LIMITS.recordBytes + 1);
  expect(inspectStoredRecord(over)).toEqual({
    status: 'invalid',
    recordId: exact.recordId,
  });
});
