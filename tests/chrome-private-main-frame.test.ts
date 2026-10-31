import { expect, it } from 'bun:test';
import {
  classifyPrivateMainFrame,
  ProductGuardFailure,
} from '../scripts/chrome-private-main-frame.ts';

const denied = {
  title: 'Saved investigations · AddonRay',
  text: 'Normal windows only. No saved data.',
  rows: 0,
  denied: true,
  navigationError: null,
};

it('accepts only a loaded denial with no rows or sentinel', () => {
  expect(classifyPrivateMainFrame(denied, 'SENTINEL')).toEqual({
    status: 'denied',
    title: 'Saved investigations · AddonRay',
    rows: 0,
    sentinelVisible: false,
  });
});

it('fails negative product fixtures instead of turning them into transport gaps', () => {
  for (const [name, value] of [
    ['loaded without denial', { ...denied, denied: false }],
    ['denied with rows', { ...denied, rows: 1 }],
    ['denied with sentinel', { ...denied, text: 'SENTINEL' }],
  ] as const) {
    let failure: unknown;
    try {
      classifyPrivateMainFrame(value, 'SENTINEL');
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(ProductGuardFailure);
    expect(String(failure)).toContain(
      name === 'loaded without denial'
        ? 'without-denial'
        : name === 'denied with rows'
          ? 'rendered-rows'
          : 'rendered-sentinel',
    );
  }
});

it('keeps policy blocks and transport outcomes separate', () => {
  expect(
    classifyPrivateMainFrame(
      {
        title: 'chrome-extension://id/library.html',
        text: 'This page has been blocked by Chromium\nERR_BLOCKED_BY_CLIENT',
        rows: null,
        denied: false,
        navigationError: 'net::ERR_BLOCKED_BY_CLIENT',
      },
      'SENTINEL',
    ).status,
  ).toBe('browser-blocked');
  expect(
    classifyPrivateMainFrame(
      {
        title: '',
        text: '',
        rows: null,
        denied: false,
        navigationError: null,
      },
      'SENTINEL',
    ).status,
  ).toBe('unavailable');
});
