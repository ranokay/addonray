import { expect, it } from 'bun:test';
import {
  completeStudyAttempt,
  createStudyAttempt,
  failStudyAttempt,
  markStudyAttemptStage,
  recordStudyAttemptMeasurement,
} from '../scripts/budget-study-attempts';

it('retains metrics and timings when a post-stop check throws', () => {
  const attempt = createStudyAttempt(7);
  const summary = {
    scriptErrors: 1,
    unhandledRejections: 1,
    total: 2,
    finish: 'stop',
    observedMs: 12.5,
  };
  const metrics = {
    setup: [1, 0],
    handler: [0, 0],
    finalization: [0],
    physicalCalls: 2,
    clock: { minimumPositiveStep: 1, reads: 100 },
  };
  const flowMs = {
    start: 10.5,
    emit: 20.25,
    stop: 30.75,
    postStop: null,
    total: 31.5,
  };

  expect(attempt.status).toBe('running');
  expect(attempt.index).toBe(7);
  expect(attempt.metrics).toBeNull();

  recordStudyAttemptMeasurement(attempt, {
    summary,
    metrics,
    setupSlots: [1, 0],
    flowMs,
  });
  markStudyAttemptStage(attempt, 'post-stop-checking');

  try {
    throw new Error(
      'Stopped measured observer still receives physical callbacks',
    );
  } catch (error) {
    failStudyAttempt(attempt, attempt.stage, error);
  }

  expect(attempt.status).toBe('failed');
  expect(attempt.index).toBe(7);
  expect(attempt.stage).toBe('post-stop-checking');
  expect(attempt.error).toContain('physical callbacks');
  expect(attempt.summary).toEqual(summary);
  expect(attempt.metrics).toEqual(metrics);
  expect(attempt.setupSlots).toEqual([1, 0]);
  expect(attempt.flowMs).toEqual(flowMs);
  expect(attempt.finishedAt).not.toBeNull();
  const persisted = JSON.parse(JSON.stringify(attempt));
  expect(persisted.status).toBe('failed');
  expect(persisted.stage).toBe('post-stop-checking');
  expect(persisted.metrics).toEqual(metrics);
  expect(persisted.summary).toEqual(summary);
});

it('marks completed attempts without discarding their measurement', () => {
  const attempt = createStudyAttempt(0);
  recordStudyAttemptMeasurement(attempt, {
    summary: { total: 2 },
    metrics: { setup: [0, 0] },
    setupSlots: [0, 0],
    flowMs: { start: 1, emit: 2, stop: 3, postStop: 4, total: 5 },
  });
  completeStudyAttempt(attempt);
  expect(attempt.status).toBe('completed');
  expect(attempt.stage).toBe('complete');
  expect(attempt.metrics).toEqual({ setup: [0, 0] });
  expect(attempt.flowMs.total).toBe(5);
});
