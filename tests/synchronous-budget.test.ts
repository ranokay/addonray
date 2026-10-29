import { expect, it } from 'bun:test';
import { evaluateSynchronousBudget } from '../scripts/synchronous-budget';

function samples(high: number, count = 30) {
  return [...Array<number>(count - 2).fill(0), high, high];
}

it('rejects the retained 6 ms guarded result from 4 ms samples and a 1 ms clock', () => {
  expect(() => evaluateSynchronousBudget(samples(4), 1)).toThrow(
    'Synchronous operation p95 plus two observed clock steps is 6 ms',
  );
});

it('rejects the retained 7 ms guarded result from 5 ms samples and a 1 ms clock', () => {
  expect(() => evaluateSynchronousBudget(samples(5), 1)).toThrow(
    'Synchronous operation p95 plus two observed clock steps is 7 ms',
  );
});

it('rejects the retained 13 ms guarded result from 11 ms samples and a 1 ms clock', () => {
  expect(() => evaluateSynchronousBudget(samples(11), 1)).toThrow(
    'Synchronous operation p95 plus two observed clock steps is 13 ms',
  );
});

it('counts an observed 2 ms clock step as quantization rather than collector work', () => {
  expect(() => evaluateSynchronousBudget(samples(3), 2)).toThrow(
    'Synchronous operation p95 plus two observed clock steps is 7 ms',
  );
});

it('accepts exactly 5 ms but not 5.0001 ms', () => {
  expect(evaluateSynchronousBudget(samples(3), 1)).toEqual({
    samplesMs: samples(3),
    p95Ms: 3,
    quantizationGuardedP95Ms: 5,
  });
  expect(() => evaluateSynchronousBudget(samples(3.0001), 1)).toThrow(
    'Synchronous operation p95 plus two observed clock steps is 5.0001 ms',
  );
});

it('accepts a sub-millisecond clock while keeping the same 5 ms guard', () => {
  expect(evaluateSynchronousBudget(samples(4), 0.5)).toEqual({
    samplesMs: samples(4),
    p95Ms: 4,
    quantizationGuardedP95Ms: 5,
  });
});

it('uses nearest-rank p95 rather than the maximum for 60 operation samples', () => {
  const operationSamples = [...Array<number>(59).fill(0), 6];
  expect(evaluateSynchronousBudget(operationSamples, 0.5)).toEqual({
    samplesMs: operationSamples,
    p95Ms: 0,
    quantizationGuardedP95Ms: 1,
  });
});

it('requires at least 30 samples', () => {
  expect(() => evaluateSynchronousBudget([0, 0], 1)).toThrow(
    'At least 30 synchronous-operation samples required',
  );
});

it('rejects non-finite, negative or unusable measurements', () => {
  expect(() => evaluateSynchronousBudget(samples(Number.NaN), 1)).toThrow();
  expect(() =>
    evaluateSynchronousBudget(samples(Number.POSITIVE_INFINITY), 1),
  ).toThrow();
  expect(() =>
    evaluateSynchronousBudget([-1, ...samples(0).slice(1)], 1),
  ).toThrow();
  expect(() => evaluateSynchronousBudget(samples(1), 0)).toThrow(
    'Clock cannot qualify the 5 ms budget',
  );
  expect(() => evaluateSynchronousBudget(samples(1), 6)).toThrow(
    'Clock cannot qualify the 5 ms budget',
  );
});
