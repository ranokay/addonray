import { expect, it, vi } from 'bun:test';
import { createLiveActivity } from '../lib/live-activity';

it('allows ordinary live actions to overlap', () => {
  const activity = createLiveActivity();
  const capture = activity.tryBegin('capture');
  const attachment = activity.tryBegin('attachment');
  const report = activity.tryBegin('report');
  expect(capture).not.toBeNull();
  expect(attachment).not.toBeNull();
  expect(report).not.toBeNull();
  capture?.release();
  attachment?.release();
  report?.release();
});

it('makes save exclusive and blocks new ordinary actions while it is held', () => {
  const activity = createLiveActivity();
  const capture = activity.tryBegin('capture');
  expect(activity.tryBegin('save')).toBeNull();
  capture?.release();
  const save = activity.tryBegin('save');
  expect(save).not.toBeNull();
  expect(activity.tryBegin('save')).toBeNull();
  for (const kind of ['capture', 'attachment', 'report'] as const)
    expect(activity.tryBegin(kind)).toBeNull();
  save?.release();
  expect(activity.tryBegin('capture')).not.toBeNull();
});

it('releases each lease once and notifies subscribers on transitions', () => {
  const activity = createLiveActivity();
  const subscriber = vi.fn();
  const unsubscribe = activity.subscribe(subscriber);
  const lease = activity.tryBegin('save');
  lease?.release();
  lease?.release();
  expect(subscriber).toHaveBeenCalledTimes(2);
  unsubscribe();
  activity.tryBegin('capture')?.release();
  expect(subscriber).toHaveBeenCalledTimes(2);
});

it('fails closed after disposal', () => {
  const activity = createLiveActivity();
  const lease = activity.tryBegin('save');
  const subscriber = vi.fn();
  activity.subscribe(subscriber);
  activity.dispose();
  expect(activity.tryBegin('capture')).toBeNull();
  expect(activity.tryBegin('save')).toBeNull();
  lease?.release();
  expect(subscriber).not.toHaveBeenCalled();
});
