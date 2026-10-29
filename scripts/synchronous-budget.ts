import assert from 'node:assert/strict';

export function nearestRankP95(samples: number[]): number {
  assert(samples.length > 0, 'At least one sample required');
  const sorted = [...samples].sort((a, b) => a - b);
  const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1];
  assert(p95 !== undefined);
  return p95;
}

// The agreed page-error regression gate: nearest-rank p95 of at least 30
// synchronous operation samples, plus two observed clock steps, at most 5 ms.
// Keep the quantile, sample count and limit fixed here so qualification and
// diagnostic studies cannot silently evaluate different gates.
export function evaluateSynchronousBudget(
  samples: number[],
  clockStepMs: number,
): {
  samplesMs: number[];
  p95Ms: number;
  quantizationGuardedP95Ms: number;
} {
  assert(
    samples.length >= 30,
    'At least 30 synchronous-operation samples required',
  );
  assert(samples.every((value) => Number.isFinite(value) && value >= 0));
  assert(
    Number.isFinite(clockStepMs) && clockStepMs > 0 && clockStepMs <= 5,
    'Clock cannot qualify the 5 ms budget',
  );
  const p95 = nearestRankP95(samples);
  const guardedP95 = p95 + 2 * clockStepMs;
  assert(
    guardedP95 <= 5,
    `Synchronous operation p95 plus two observed clock steps is ${guardedP95} ms`,
  );
  return {
    samplesMs: samples,
    p95Ms: p95,
    quantizationGuardedP95Ms: guardedP95,
  };
}
