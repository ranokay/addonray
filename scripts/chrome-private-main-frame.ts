export class ProductGuardFailure extends Error {
  readonly guardFailure = true;

  constructor(reason: string) {
    super(reason);
    this.name = 'ProductGuardFailure';
  }
}

const policyBlockPattern =
  /ERR_BLOCKED_BY_CLIENT|blocked by Chromium|This page has been blocked/i;

export interface PrivateMainFrameObservation {
  title?: string | null;
  text?: string | null;
  rows?: number | null;
  denied?: boolean;
  navigationError?: string | null;
}

// A loaded product page must prove its private denial. Transport failures and
// concrete browser-policy blocks are separate outcomes; they never become a
// product guard pass or hide a loaded page that exposed data.
export function classifyPrivateMainFrame(
  value: PrivateMainFrameObservation,
  sentinelName: string,
) {
  const title = String(value.title ?? '');
  const text = String(value.text ?? '');
  if (title === 'Saved investigations · AddonRay') {
    if (!value.denied)
      throw new ProductGuardFailure('product-page-loaded-without-denial');
    if (value.rows !== 0)
      throw new ProductGuardFailure('denied-page-rendered-rows');
    if (text.includes(sentinelName))
      throw new ProductGuardFailure('denied-page-rendered-sentinel');
    return {
      status: 'denied',
      title,
      rows: 0,
      sentinelVisible: false,
    };
  }
  if (
    policyBlockPattern.test(text) ||
    /ERR_BLOCKED_BY_CLIENT/i.test(String(value.navigationError ?? ''))
  )
    return {
      status: 'browser-blocked',
      title: title || null,
      text: text.slice(0, 400),
      navigationError: value.navigationError ?? null,
    };
  return {
    status: 'unavailable',
    title: title || null,
    text: text.slice(0, 400),
    navigationError: value.navigationError ?? null,
    reason: 'route-loaded-without-product-page',
  };
}
