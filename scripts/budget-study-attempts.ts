export interface StudyAttemptFlowMs {
  start: number | null;
  emit: number | null;
  stop: number | null;
  postStop: number | null;
  total: number | null;
}

export interface StudyAttempt {
  index: number;
  status: 'running' | 'completed' | 'failed';
  stage: string;
  startedAt: string;
  finishedAt: string | null;
  summary: unknown;
  metrics: unknown;
  setupSlots: number[] | null;
  flowMs: StudyAttemptFlowMs;
  postStopCallbacksStable: boolean | null;
  error: string | null;
}

// The study registers the attempt before executing it so a failure after the
// metrics are read can still publish the index, stage, timings and raw samples.
export function createStudyAttempt(
  index: number,
  now: () => string = () => new Date().toISOString(),
): StudyAttempt {
  return {
    index,
    status: 'running',
    stage: 'registered',
    startedAt: now(),
    finishedAt: null,
    summary: null,
    metrics: null,
    setupSlots: null,
    flowMs: {
      start: null,
      emit: null,
      stop: null,
      postStop: null,
      total: null,
    },
    postStopCallbacksStable: null,
    error: null,
  };
}

export function markStudyAttemptStage(
  attempt: StudyAttempt,
  stage: string,
): StudyAttempt {
  attempt.stage = stage;
  return attempt;
}

export function recordStudyAttemptMeasurement(
  attempt: StudyAttempt,
  {
    summary,
    metrics,
    setupSlots,
    flowMs,
  }: {
    summary: unknown;
    metrics: unknown;
    setupSlots: number[];
    flowMs: StudyAttemptFlowMs;
  },
): StudyAttempt {
  attempt.summary = summary;
  attempt.metrics = metrics;
  attempt.setupSlots = setupSlots;
  attempt.flowMs = { ...attempt.flowMs, ...flowMs };
  attempt.stage = 'measured';
  return attempt;
}

export function completeStudyAttempt(
  attempt: StudyAttempt,
  now: () => string = () => new Date().toISOString(),
): StudyAttempt {
  attempt.status = 'completed';
  attempt.stage = 'complete';
  attempt.finishedAt = now();
  return attempt;
}

export function failStudyAttempt(
  attempt: StudyAttempt,
  stage: string,
  error: unknown,
  now: () => string = () => new Date().toISOString(),
): StudyAttempt {
  attempt.status = 'failed';
  attempt.stage = stage;
  attempt.error = error instanceof Error ? error.message : String(error);
  attempt.finishedAt = now();
  return attempt;
}
