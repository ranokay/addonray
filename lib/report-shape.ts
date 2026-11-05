import type { TimingMeasurement, TimingSnapshot } from './inspector';

export type JsonObject = Record<string, unknown>;

export function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function exactKeys(value: object, keys: readonly string[]) {
  const present = Object.keys(value);
  return (
    present.length === keys.length && present.every((key) => keys.includes(key))
  );
}

export function copyTimingMeasurement(
  value: TimingMeasurement,
): TimingMeasurement {
  return value.status === 'measured'
    ? { status: 'measured', milliseconds: value.milliseconds }
    : { status: value.status };
}

export function copyTimingSnapshot(value: TimingSnapshot | null) {
  if (!value) return null;
  return {
    domContentLoaded: copyTimingMeasurement(value.domContentLoaded),
    loadEvent: copyTimingMeasurement(value.loadEvent),
    firstContentfulPaint: copyTimingMeasurement(value.firstContentfulPaint),
  };
}
