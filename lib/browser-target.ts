export const firefoxContext = { target: 'firefox', name: 'Firefox' } as const;
const chromeContext = { target: 'chrome', name: 'Chrome' } as const;

export type BrowserContext = typeof firefoxContext | typeof chromeContext;

export function getBrowserContext(target: unknown): BrowserContext {
  if (target === 'firefox') return firefoxContext;
  if (target === 'chrome') return chromeContext;
  throw new Error(
    'Unsupported browser target. Build AddonRay for Firefox or Chrome.',
  );
}
