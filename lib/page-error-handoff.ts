import type { Browser } from 'wxt/browser';
import type { Result } from './inspector';
import type { Investigation } from './investigation';
import {
  copyPageErrorSummary,
  type PageErrorCheck,
  type PageErrorCapture,
} from './page-error-check';

export type PageErrorSide = 'before' | 'after';
export interface PageErrorDestination {
  identity: string;
  label: string;
  generation: number;
  sides: PageErrorSide[];
}
interface Selection {
  identity: string;
  generation: number;
  side: PageErrorSide;
  actionId: string;
}
interface SenderEndpoint {
  normal(): Promise<boolean>;
  available(): boolean;
  read(selection: Selection, target: PageErrorView): PageErrorCapture | null;
  commit(
    selection: Selection,
    target: PageErrorView,
    write: () => boolean,
  ): boolean;
}
interface ReceiverEndpoint {
  metadata(sender: PageErrorView): Promise<PageErrorDestination | null>;
  receive(selection: unknown, sender: PageErrorView): Promise<Result<null>>;
}
export interface PageErrorView {
  location: { href: string };
  addonrayErrorSender?: SenderEndpoint;
  addonrayErrorInvestigation?: ReceiverEndpoint;
}
export interface PageErrorHandoffBrowser {
  extension: { getViews(query: { type: 'tab' }): unknown[] };
  runtime: { getURL(path: '/page-error.html' | '/investigation.html'): string };
  permissions: {
    contains(permissions: Browser.permissions.Permissions): Promise<boolean>;
  };
  tabs: {
    getCurrent(): Promise<Pick<Browser.tabs.Tab, 'incognito'> | undefined>;
  };
}
export interface PageErrorHandoff {
  listDestinations(): Promise<Result<PageErrorDestination[]>>;
  attach(
    destination: PageErrorDestination,
    side: PageErrorSide,
  ): Promise<Result<null>>;
  dispose(): void;
}

const failure = (): Result<never> => ({
  status: 'error',
  reason:
    'The selected side changed, closed, or requires the same browser tab. Discover destinations and choose again.',
});
const unavailable = (): Result<never> => ({
  status: 'unavailable',
  reason:
    'A completed unused check, inventory and page access, and verified normal windows are required. Try again explicitly.',
});
const uncertain = (): Result<never> => ({
  status: 'error',
  reason:
    'This check has been used and cannot attach again. Review the chosen investigation; it may contain the copy.',
});
const uuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value);
const generation = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const side = (value: unknown): value is PageErrorSide =>
  value === 'before' || value === 'after';

function record(input: unknown): Record<string, unknown> | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input))
    return null;
  const fields = Object.getOwnPropertyDescriptors(input);
  const copied: Record<string, unknown> = {};
  for (const key of Object.keys(fields)) {
    const field = fields[key];
    if (!field || !('value' in field)) return null;
    Object.defineProperty(copied, key, {
      value: field.value,
      enumerable: true,
    });
  }
  return copied;
}
function copyDestination(input: unknown): PageErrorDestination | null {
  const value = record(input);
  if (
    !value ||
    !uuid(value.identity) ||
    value.label !== `Investigation ${value.identity.slice(0, 8)}` ||
    !generation(value.generation) ||
    !Array.isArray(value.sides) ||
    value.sides.length > 2
  )
    return null;
  // Iteration constructs our own array, including for Firefox cross-document values.
  const sides: PageErrorSide[] = [];
  for (const item of value.sides) {
    if (!side(item) || sides.includes(item)) return null;
    sides.push(item);
  }
  return {
    identity: value.identity,
    label: value.label,
    generation: value.generation,
    sides,
  };
}
function copySelection(input: unknown): Selection | null {
  const value = record(input);
  return value &&
    uuid(value.identity) &&
    generation(value.generation) &&
    side(value.side) &&
    uuid(value.actionId)
    ? {
        identity: value.identity,
        generation: value.generation,
        side: value.side,
        actionId: value.actionId,
      }
    : null;
}
function own(
  api: PageErrorHandoffBrowser,
  input: unknown,
  path: '/page-error.html' | '/investigation.html',
): input is PageErrorView {
  if (typeof input !== 'object' || input === null || !('location' in input))
    return false;
  const location: unknown = input.location;
  return (
    typeof location === 'object' &&
    location !== null &&
    'href' in location &&
    location.href === api.runtime.getURL(path) &&
    api.extension.getViews({ type: 'tab' }).includes(input)
  );
}
async function normal(api: PageErrorHandoffBrowser, revoked?: () => void) {
  if ((await api.tabs.getCurrent())?.incognito !== false) return false;
  const granted = await api.permissions.contains({
    permissions: ['management', 'scripting'],
  });
  if (!granted) revoked?.();
  return granted && (await api.tabs.getCurrent())?.incognito === false;
}

export function installInvestigationErrorHandoff(
  api: PageErrorHandoffBrowser,
  investigation: Investigation,
  view: PageErrorView,
) {
  let live = true;
  const receiverCurrent = () =>
    live &&
    view.addonrayErrorInvestigation === endpoint &&
    own(api, view, '/investigation.html');
  const senderCurrent = (sender: PageErrorView) =>
    own(api, sender, '/page-error.html') &&
    sender.addonrayErrorSender?.available() === true;
  async function allowed(sender: PageErrorView) {
    return (
      receiverCurrent() &&
      senderCurrent(sender) &&
      (await sender.addonrayErrorSender?.normal()) === true &&
      (await normal(api, investigation.startOver)) &&
      (await sender.addonrayErrorSender?.normal()) === true &&
      (await api.tabs.getCurrent())?.incognito === false &&
      receiverCurrent() &&
      senderCurrent(sender)
    );
  }
  const endpoint: ReceiverEndpoint = {
    async metadata(sender) {
      try {
        if (!(await allowed(sender))) return null;
        return {
          identity: investigation.identity,
          label: investigation.label,
          generation: investigation.getGeneration(),
          sides: investigation.errorSides(),
        };
      } catch {
        return null;
      }
    },
    async receive(input, sender) {
      const lease = investigation.activity.tryBegin('attachment');
      if (!lease) return failure();
      try {
        const selected = copySelection(input);
        if (
          !selected ||
          selected.identity !== investigation.identity ||
          !(await allowed(sender)) ||
          selected.generation !== investigation.getGeneration()
        )
          return failure();
        const source = sender.addonrayErrorSender;
        const capture = record(source?.read(selected, view));
        const summary = copyPageErrorSummary(capture?.value);
        if (
          !capture ||
          !uuid(capture.identity) ||
          !generation(capture.generation) ||
          !generation(capture.sourceTabId) ||
          !summary ||
          !receiverCurrent() ||
          !senderCurrent(sender)
        )
          return failure();
        // No await or notification between the final source pull and reserved private write.
        return investigation.attachError(
          selected.side,
          capture.sourceTabId,
          summary,
          selected.generation,
          (write) =>
            source?.commit(
              selected,
              view,
              () => receiverCurrent() && write(),
            ) === true,
        );
      } catch {
        return failure();
      } finally {
        lease.release();
      }
    },
  };
  view.addonrayErrorInvestigation = endpoint;
  return () => {
    live = false;
    if (view.addonrayErrorInvestigation === endpoint)
      delete view.addonrayErrorInvestigation;
  };
}

export function createPageErrorHandoff(
  api: PageErrorHandoffBrowser,
  check: PageErrorCheck,
  view: PageErrorView,
): PageErrorHandoff {
  let live = true;
  let busy = false;
  let action: {
    selection: Selection;
    capture: PageErrorCapture;
    target: PageErrorView;
    active: boolean;
  } | null = null;
  const current = () =>
    live &&
    view.addonrayErrorSender === source &&
    own(api, view, '/page-error.html');
  const sameAction = (selected: Selection, target: PageErrorView) =>
    current() &&
    action?.active === true &&
    action.target === target &&
    action.selection.actionId === selected.actionId &&
    action.selection.identity === selected.identity &&
    action.selection.generation === selected.generation &&
    action.selection.side === selected.side &&
    own(api, target, '/investigation.html');
  const source: SenderEndpoint = {
    async normal() {
      // A standalone check may never have had inventory access. Missing transfer
      // grants leave it readable; the check's removal listener owns revocation.
      return current() && (await normal(api)) && current();
    },
    // A successful check already validated its original source's normal context.
    // Do not inspect that source again when transferring a past observation.
    available: () => current() && check.getAttachmentCapture() !== null,
    read(selected, target) {
      if (!sameAction(selected, target) || !action) return null;
      const saved = action.capture;
      return check.isAttachmentCurrent(
        saved.identity,
        saved.generation,
        saved.sourceTabId,
      )
        ? check.getAttachmentCapture()
        : null;
    },
    commit(selected, target, write) {
      if (!sameAction(selected, target) || !action) return false;
      const saved = action.capture;
      return check.commitAttachment(
        saved.identity,
        saved.generation,
        saved.sourceTabId,
        (stillCurrent) =>
          sameAction(selected, target) && stillCurrent() && write(),
      );
    },
  };
  view.addonrayErrorSender = source;
  const unsubscribe = check.subscribe(() => {
    if (
      action &&
      (check.getGeneration() !== action.capture.generation ||
        check.getSnapshot().phase !== 'finished')
    )
      action.active = false;
  });

  async function bounded<T>(
    work: (pending: () => boolean) => Promise<Result<T>>,
  ): Promise<Result<T>> {
    if (busy)
      return {
        status: 'error',
        reason: 'An attachment action is already pending.',
      };
    busy = true;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        work(() => active && current()),
        new Promise<Result<T>>((resolve) => {
          timer = setTimeout(() => {
            active = false;
            if (action) action.active = false;
            resolve(check.isAttachmentUsed() ? uncertain() : failure());
          }, 5000);
        }),
      ]);
    } catch {
      return check.isAttachmentUsed() ? uncertain() : failure();
    } finally {
      active = false;
      if (action) action.active = false;
      action = null;
      clearTimeout(timer);
      busy = false;
    }
  }

  return {
    listDestinations() {
      return bounded(async (pending) => {
        const capture = check.getAttachmentCapture();
        if (!capture || !(await source.normal()) || !pending())
          return unavailable();
        const fresh = () =>
          pending() &&
          check.isAttachmentCurrent(
            capture.identity,
            capture.generation,
            capture.sourceTabId,
          );
        const views = api.extension.getViews({ type: 'tab' });
        if (views.length > 32)
          return {
            status: 'unavailable',
            reason:
              'Too many AddonRay views are open. Close some and try again.',
          };
        const destinations: PageErrorDestination[] = [];
        for (const target of views) {
          try {
            if (!own(api, target, '/investigation.html')) continue;
            const metadata = copyDestination(
              await target.addonrayErrorInvestigation?.metadata(view),
            );
            if (!fresh()) return failure();
            if (metadata?.sides.length) destinations.push(metadata);
          } catch {
            /* Closed views are not destinations. */
          }
        }
        return fresh() ? { status: 'success', value: destinations } : failure();
      });
    },
    attach(destination, requestedSide) {
      return bounded(async (pending) => {
        const selected = copyDestination(destination);
        const capture = check.getAttachmentCapture();
        if (
          !selected ||
          !side(requestedSide) ||
          !selected.sides.includes(requestedSide) ||
          !capture
        )
          return failure();
        if (
          !(await source.normal()) ||
          !pending() ||
          !check.isAttachmentCurrent(
            capture.identity,
            capture.generation,
            capture.sourceTabId,
          )
        )
          return unavailable();
        const views = api.extension.getViews({ type: 'tab' });
        if (views.length > 32) return failure();
        for (const target of views) {
          if (
            !pending() ||
            !check.isAttachmentCurrent(
              capture.identity,
              capture.generation,
              capture.sourceTabId,
            )
          )
            return failure();
          if (!own(api, target, '/investigation.html')) continue;
          const endpoint = target.addonrayErrorInvestigation;
          const metadata = copyDestination(await endpoint?.metadata(view));
          if (
            !pending() ||
            !check.isAttachmentCurrent(
              capture.identity,
              capture.generation,
              capture.sourceTabId,
            )
          )
            return failure();
          if (metadata?.identity !== selected.identity) continue;
          if (
            metadata.generation !== selected.generation ||
            !metadata.sides.includes(requestedSide)
          )
            return failure();
          const selection = {
            identity: selected.identity,
            generation: selected.generation,
            side: requestedSide,
            actionId: crypto.randomUUID(),
          };
          action = { selection, capture, target, active: true };
          const reply: unknown = await endpoint?.receive(selection, view);
          const copied = record(reply);
          if (copied?.status === 'success')
            return { status: 'success', value: null };
          return check.isAttachmentUsed() ? uncertain() : failure();
        }
        return failure();
      });
    },
    dispose() {
      live = false;
      if (action) action.active = false;
      if (view.addonrayErrorSender === source) delete view.addonrayErrorSender;
      unsubscribe();
    },
  };
}
