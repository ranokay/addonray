import type { Browser } from 'wxt/browser';
import { copyTimingSnapshot, type Result } from './inspector';
import type { Investigation } from './investigation';
import type { InspectorSession } from './session';

export type TimingSide = 'before' | 'after';
export interface TimingDestination {
  identity: string;
  label: string;
  generation: number;
  sides: TimingSide[];
}

interface PopupEndpoint {
  normal(): boolean;
  current(id: number, tabId: number): boolean;
  consume(id: number, tabId: number): boolean;
}
interface InvestigationEndpoint {
  metadata(sender: TimingView): Promise<TimingDestination | null>;
  receive(request: unknown, sender: TimingView): Promise<Result<null>>;
}
export interface TimingView {
  location: { href: string };
  addonrayTimingPopup?: PopupEndpoint;
  addonrayTimingInvestigation?: InvestigationEndpoint;
}
export interface TimingHandoffBrowser {
  extension: { getViews(query: { type: 'tab' | 'popup' }): unknown[] };
  runtime: { getURL(path: string): string };
  permissions: {
    contains(permissions: Browser.permissions.Permissions): Promise<boolean>;
  };
  tabs: {
    getCurrent(): Promise<Pick<Browser.tabs.Tab, 'incognito'> | undefined>;
  };
}
export interface PopupTimingHandoff {
  listDestinations(): Promise<Result<TimingDestination[]>>;
  attach(
    destination: TimingDestination,
    side: TimingSide,
  ): Promise<Result<null>>;
}

function error(reason: string): Result<null> {
  return { status: 'error', reason };
}
const stale = () =>
  error(
    'The investigation changed or closed. Discover destinations and choose again.',
  );

function isView(value: unknown): value is TimingView {
  if (typeof value !== 'object' || value === null || !('location' in value))
    return false;
  const location: unknown = value.location;
  return (
    typeof location === 'object' &&
    location !== null &&
    'href' in location &&
    typeof location.href === 'string'
  );
}

function ownRoute(api: TimingHandoffBrowser, view: TimingView, path: string) {
  return view.location.href === api.runtime.getURL(path);
}
function popup(api: TimingHandoffBrowser, sender: TimingView) {
  return (
    api.extension.getViews({ type: 'popup' }).includes(sender) &&
    ownRoute(api, sender, '/popup.html') &&
    sender.addonrayTimingPopup?.normal() === true
  );
}
function destination(value: unknown): value is TimingDestination {
  if (typeof value !== 'object' || value === null) return false;
  return (
    'identity' in value &&
    typeof value.identity === 'string' &&
    /^[a-f0-9-]{36}$/.test(value.identity) &&
    'label' in value &&
    typeof value.label === 'string' &&
    value.label.length <= 64 &&
    'generation' in value &&
    typeof value.generation === 'number' &&
    Number.isSafeInteger(value.generation) &&
    value.generation >= 0 &&
    'sides' in value &&
    Array.isArray(value.sides) &&
    value.sides.length <= 2 &&
    value.sides.every((side: unknown) => side === 'before' || side === 'after')
  );
}

export function installInvestigationTimingHandoff(
  api: TimingHandoffBrowser,
  investigation: Investigation,
  view: TimingView,
) {
  let live = true;
  const normal = async () => (await api.tabs.getCurrent())?.incognito === false;
  const endpoint: InvestigationEndpoint = {
    async metadata(sender) {
      try {
        if (
          !live ||
          !popup(api, sender) ||
          !(await normal()) ||
          !live ||
          !popup(api, sender)
        )
          return null;
        return {
          identity: investigation.identity,
          label: investigation.label,
          generation: investigation.getGeneration(),
          sides: investigation.timingSides(),
        };
      } catch {
        return null;
      }
    },
    async receive(input, sender) {
      const lease = investigation.activity.tryBegin('attachment');
      if (!lease) return error('Another investigation action is in progress.');
      try {
        if (!live || !popup(api, sender))
          return error('The timing sender is unavailable.');
        if (typeof input !== 'object' || input === null)
          return error('The timing attachment is invalid.');
        // Copy primitives and measurements in this document before any await or popup closure.
        const identity = 'identity' in input ? input.identity : null;
        const generation = 'generation' in input ? input.generation : null;
        const side = 'side' in input ? input.side : null;
        const sourceTabId = 'sourceTabId' in input ? input.sourceTabId : null;
        const captureId = 'captureId' in input ? input.captureId : null;
        const timings = copyTimingSnapshot(
          'timings' in input ? input.timings : null,
        );
        if (
          identity !== investigation.identity ||
          typeof generation !== 'number' ||
          !Number.isSafeInteger(generation) ||
          (side !== 'before' && side !== 'after') ||
          typeof sourceTabId !== 'number' ||
          !Number.isSafeInteger(sourceTabId) ||
          sourceTabId < 0 ||
          typeof captureId !== 'number' ||
          !Number.isSafeInteger(captureId) ||
          !timings
        )
          return error('The timing attachment is invalid.');
        if (!(await normal()))
          return error(
            'Timing attachments are available only in verified normal windows.',
          );
        const granted = await api.permissions.contains({
          permissions: ['management', 'scripting'],
        });
        if (!granted) {
          investigation.startOver();
          return error(
            'Inventory or page access was revoked. This investigation was cleared.',
          );
        }
        if (
          !live ||
          !popup(api, sender) ||
          generation !== investigation.getGeneration() ||
          !sender.addonrayTimingPopup?.current(captureId, sourceTabId)
        )
          return stale();
        if (!investigation.timingSides().includes(side))
          return error(
            'That timing side is unavailable or already filled. Start over for another attempt.',
          );
        // Both calls are synchronous after permission/state checks; no user action can interleave.
        // Validate destination source matching before consuming the sender's capture.
        const result = investigation.attachTiming(
          side,
          sourceTabId,
          timings,
          generation,
          () =>
            sender.addonrayTimingPopup?.consume(captureId, sourceTabId) ===
            true,
        );
        if (result.status !== 'success') return result;
        return { status: 'success', value: null };
      } catch {
        return stale();
      } finally {
        lease.release();
      }
    },
  };
  view.addonrayTimingInvestigation = endpoint;
  return () => {
    live = false;
    if (view.addonrayTimingInvestigation === endpoint)
      delete view.addonrayTimingInvestigation;
  };
}

export function createPopupTimingHandoff(
  api: TimingHandoffBrowser,
  session: InspectorSession,
  view: TimingView,
): PopupTimingHandoff {
  let busy = false;
  const source: PopupEndpoint = {
    normal: () => session.getTimingCapture()?.incognito === false,
    current: (id, tabId) =>
      session.isTimingCaptureCurrent(id) &&
      session.getTimingCapture()?.sourceTabId === tabId &&
      source.normal(),
    consume: (id, tabId) => session.consumeTimingCapture(id, tabId),
  };
  view.addonrayTimingPopup = source;

  return {
    async listDestinations() {
      const capture = session.getTimingCapture();
      if (!capture || !session.isTimingCaptureCurrent(capture.id))
        return {
          status: 'unavailable',
          reason: 'Capture the page again before attaching a timing.',
        };
      if (!source.normal())
        return {
          status: 'unavailable',
          reason:
            'Timing attachments are available only in verified normal windows.',
        };
      try {
        const destinations: TimingDestination[] = [];
        const views = api.extension.getViews({ type: 'tab' });
        if (views.length > 32)
          return {
            status: 'unavailable',
            reason:
              'Too many AddonRay views are open. Close some and discover destinations again.',
          };
        for (const target of views) {
          try {
            if (
              !isView(target) ||
              !ownRoute(api, target, '/investigation.html')
            )
              continue;
            const metadata: unknown =
              await target.addonrayTimingInvestigation?.metadata(view);
            if (!source.current(capture.id, capture.sourceTabId))
              return {
                status: 'cancelled',
                reason: 'This page capture was cleared or replaced.',
              };
            if (destination(metadata) && metadata.sides.length) {
              destinations.push({
                identity: metadata.identity,
                label: metadata.label,
                generation: metadata.generation,
                sides: [...metadata.sides],
              });
            }
          } catch {
            /* A closed view is not a destination. */
          }
        }
        return { status: 'success', value: destinations };
      } catch {
        return {
          status: 'unavailable',
          reason:
            'Investigation destinations are unavailable in this browser context.',
        };
      }
    },
    async attach(selected, side) {
      if (busy) return error('A timing attachment is already pending.');
      const capture = session.getTimingCapture();
      if (!capture || !source.current(capture.id, capture.sourceTabId))
        return error('Capture the page again before attaching a timing.');
      if (!destination(selected) || !selected.sides.includes(side))
        return stale();
      busy = true;
      try {
        for (const target of api.extension.getViews({ type: 'tab' })) {
          if (!isView(target) || !ownRoute(api, target, '/investigation.html'))
            continue;
          const endpoint = target.addonrayTimingInvestigation;
          const current: unknown = await endpoint?.metadata(view);
          if (!source.current(capture.id, capture.sourceTabId)) return stale();
          if (!destination(current) || current.identity !== selected.identity)
            continue;
          if (current.generation !== selected.generation) return stale();
          const result = await endpoint?.receive(
            {
              identity: selected.identity,
              generation: selected.generation,
              side,
              sourceTabId: capture.sourceTabId,
              captureId: capture.id,
              timings: copyTimingSnapshot(capture.timings),
            },
            view,
          );
          // Do not retain a cross-realm acknowledgment after popup/destination teardown.
          if (result?.status === 'success')
            return { status: 'success', value: null };
          return error(
            result
              ? result.reason
              : 'The timing attachment could not be accepted.',
          );
        }
        return stale();
      } catch {
        return stale();
      } finally {
        busy = false;
      }
    },
  };
}
