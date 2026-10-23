import type { browser, Browser } from 'wxt/browser';
import { firefoxContext, type BrowserContext } from './browser-target';

export interface InspectorBrowser {
  permissions: {
    request: (permissions: Browser.permissions.Permissions) => Promise<boolean>;
    onRemoved: typeof browser.permissions.onRemoved;
  };
  tabs: {
    query: (
      query: Browser.tabs.QueryInfo,
    ) => Promise<
      Array<
        Pick<Browser.tabs.Tab, 'id'> &
          Partial<Pick<Browser.tabs.Tab, 'incognito'>>
      >
    >;
  };
  management?: {
    getAll: () => Promise<Browser.management.ExtensionInfo[]>;
  };
  scripting?: {
    executeScript: (injection: {
      target: Browser.scripting.InjectionTarget;
      func: () => unknown;
    }) => Promise<Array<{ result?: unknown }>>;
  };
}

export type InventoryBrowser = Pick<
  InspectorBrowser,
  'permissions' | 'management'
>;

export type Result<T> =
  | { status: 'success'; value: T }
  | {
      status: 'denied' | 'unavailable' | 'error' | 'cancelled';
      reason: string;
    };

export interface ExtensionEntry {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  permissions: string[] | null;
  hostPermissions: string[] | null;
}

export type TimingMeasurement =
  | { status: 'measured'; milliseconds: number }
  | { status: 'unrecorded' }
  | { status: 'unavailable' };

export interface TimingSnapshot {
  domContentLoaded: TimingMeasurement;
  loadEvent: TimingMeasurement;
  firstContentfulPaint: TimingMeasurement;
}

export interface PageObservation {
  readyState: 'loading' | 'interactive' | 'complete';
  performanceEntryTypes: string[] | null;
  timings: TimingSnapshot;
}

export interface PageCapture {
  observation: PageObservation;
  sourceTabId: number;
  incognito: boolean | null;
}

export function capabilityLimits(context: BrowserContext = firefoxContext) {
  return [
    {
      name: 'Change other extensions globally',
      status: context.target === 'chrome' ? 'Not offered' : 'Unsupported',
      reason:
        context.target === 'chrome'
          ? "Chrome's management API can enable or disable extensions when permitted. AddonRay is inspection-only and never changes other extensions."
          : 'Ordinary Firefox extensions cannot switch other extensions on or off.',
    },
    {
      name: 'Change another extension for one site',
      status: 'Unsupported',
      reason: `Use ${context.name} or that extension’s own controls. AddonRay has no authority over their site access.`,
    },
    {
      name: 'Tail other extensions’ consoles',
      status: 'Unsupported',
      reason: `${context.name} does not expose a cross-extension console feed to this tool.`,
    },
    {
      name: 'Identify a conflict or resource owner',
      status: 'Unsupported',
      reason:
        'Page observations do not reliably attribute CPU, memory, or failures to a particular extension.',
    },
    {
      name: 'Native companion',
      status: 'Not implemented',
      reason:
        'A future optional companion needs separate consent and feasibility evidence.',
    },
  ] as const;
}

export async function loadInventory(
  api: InventoryBrowser,
  signal?: AbortSignal,
  context: BrowserContext = firefoxContext,
): Promise<Result<ExtensionEntry[]>> {
  try {
    // Start the request before any await to preserve the caller's user gesture.
    const granted = await api.permissions.request({
      permissions: ['management'],
    });
    if (signal?.aborted)
      return { status: 'cancelled', reason: 'This session was cleared.' };
    if (!granted)
      return { status: 'denied', reason: 'Inventory access was declined.' };
    if (!api.management?.getAll) {
      return {
        status: 'unavailable',
        reason: `${context.name} inventory access is unavailable.`,
      };
    }
    const entries = await api.management.getAll();
    return {
      status: 'success',
      value: entries
        .filter((entry) => entry.type === 'extension')
        .map((entry) => ({
          id: entry.id,
          name: entry.name,
          version: entry.version,
          enabled: entry.enabled,
          permissions: entry.permissions ? [...entry.permissions] : null,
          hostPermissions: entry.hostPermissions
            ? [...entry.hostPermissions]
            : null,
        }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    };
  } catch {
    return {
      status: 'error',
      reason: `${context.name} could not provide the inventory. Access may have changed. Try the action again.`,
    };
  }
}

// This function is serialized into the selected top frame. Keep it self-contained.
export function collectPageObservation(): PageObservation {
  function measurement(value: unknown, eventEnd: boolean): TimingMeasurement {
    if (value === undefined) return { status: 'unavailable' };
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > Number.MAX_SAFE_INTEGER
    ) {
      throw new Error('Invalid timing observation');
    }
    // Event-end zero is unrecorded; a reported zero paint timestamp is valid.
    if (eventEnd && value === 0) return { status: 'unrecorded' };
    return { status: 'measured', milliseconds: value };
  }

  const navigation =
    typeof performance !== 'undefined' &&
    typeof performance.getEntriesByType === 'function'
      ? performance.getEntriesByType('navigation')[0]
      : undefined;
  const paint =
    typeof performance !== 'undefined' &&
    typeof performance.getEntriesByName === 'function'
      ? performance.getEntriesByName('first-contentful-paint', 'paint')[0]
      : undefined;

  return {
    readyState: document.readyState,
    performanceEntryTypes:
      typeof PerformanceObserver === 'undefined'
        ? null
        : [...PerformanceObserver.supportedEntryTypes],
    // A navigation entry's name is the page URL. Return fields, never entries.
    timings: {
      domContentLoaded: measurement(
        navigation && 'domContentLoadedEventEnd' in navigation
          ? navigation.domContentLoadedEventEnd
          : undefined,
        true,
      ),
      loadEvent: measurement(
        navigation && 'loadEventEnd' in navigation
          ? navigation.loadEventEnd
          : undefined,
        true,
      ),
      firstContentfulPaint: measurement(paint?.startTime, false),
    },
  };
}

function isTimingMeasurement(
  value: unknown,
  eventEnd: boolean,
): value is TimingMeasurement {
  if (typeof value !== 'object' || value === null || !('status' in value))
    return false;
  if (value.status === 'unrecorded') return eventEnd;
  if (value.status === 'unavailable') return true;
  return (
    value.status === 'measured' &&
    'milliseconds' in value &&
    typeof value.milliseconds === 'number' &&
    Number.isFinite(value.milliseconds) &&
    value.milliseconds >= 0 &&
    (!eventEnd || value.milliseconds > 0) &&
    value.milliseconds <= Number.MAX_SAFE_INTEGER
  );
}

function isTimingSnapshot(value: unknown): value is TimingSnapshot {
  return (
    typeof value === 'object' &&
    value !== null &&
    'domContentLoaded' in value &&
    isTimingMeasurement(value.domContentLoaded, true) &&
    'loadEvent' in value &&
    isTimingMeasurement(value.loadEvent, true) &&
    'firstContentfulPaint' in value &&
    isTimingMeasurement(value.firstContentfulPaint, false)
  );
}

function copyTimingMeasurement(value: TimingMeasurement): TimingMeasurement {
  return value.status === 'measured'
    ? { status: value.status, milliseconds: value.milliseconds }
    : { status: value.status };
}

export function copyTimingSnapshot(value: unknown): TimingSnapshot | null {
  try {
    if (!isTimingSnapshot(value)) return null;
    const copy: TimingSnapshot = {
      domContentLoaded: copyTimingMeasurement(value.domContentLoaded),
      loadEvent: copyTimingMeasurement(value.loadEvent),
      firstContentfulPaint: copyTimingMeasurement(value.firstContentfulPaint),
    };
    return isTimingSnapshot(copy) ? copy : null;
  } catch {
    return null;
  }
}

function isPageObservation(value: unknown): value is PageObservation {
  if (typeof value !== 'object' || value === null) return false;
  if (!('readyState' in value) || !('performanceEntryTypes' in value))
    return false;
  if (!('timings' in value) || !isTimingSnapshot(value.timings)) return false;
  if (
    value.readyState !== 'loading' &&
    value.readyState !== 'interactive' &&
    value.readyState !== 'complete'
  ) {
    return false;
  }
  const types = value.performanceEntryTypes;
  return (
    types === null ||
    (Array.isArray(types) &&
      types.length <= 64 &&
      types.every(
        (type: unknown) =>
          typeof type === 'string' &&
          type.length <= 128 &&
          /^[a-z0-9-]+$/.test(type),
      ))
  );
}

export async function inspectPage(
  api: InspectorBrowser,
  signal?: AbortSignal,
  context: BrowserContext = firefoxContext,
): Promise<Result<PageObservation>> {
  const capture = await capturePage(api, signal, context);
  return capture.status === 'success'
    ? { status: 'success', value: capture.value.observation }
    : capture;
}

export async function capturePage(
  api: InspectorBrowser,
  signal?: AbortSignal,
  context: BrowserContext = firefoxContext,
): Promise<Result<PageCapture>> {
  try {
    // Bind the selection at the click, while starting consent in the same gesture.
    const selectedTab = api.tabs.query({ active: true, currentWindow: true });
    const consent = api.permissions.request({ permissions: ['scripting'] });
    const [tabs, granted] = await Promise.all([selectedTab, consent]);
    if (signal?.aborted)
      return { status: 'cancelled', reason: 'This session was cleared.' };
    if (!granted)
      return {
        status: 'denied',
        reason: 'Page inspection access was declined.',
      };
    const tabId = tabs[0]?.id;
    if (tabId === undefined) {
      return {
        status: 'unavailable',
        reason: 'There is no selected tab to inspect.',
      };
    }
    if (!api.scripting?.executeScript) {
      return {
        status: 'unavailable',
        reason: `${context.name} scripting is unavailable.`,
      };
    }
    const results = await api.scripting.executeScript({
      target: { tabId, frameIds: [0] },
      func: collectPageObservation,
    });
    const response: unknown = results[0]?.result;
    if (!isPageObservation(response)) {
      return {
        status: 'error',
        reason: 'The page returned an invalid or unavailable probe result.',
      };
    }
    // Copy only the allowed fields; never retain arbitrary page response properties.
    return {
      status: 'success',
      value: {
        sourceTabId: tabId,
        incognito:
          typeof tabs[0]?.incognito === 'boolean' ? tabs[0].incognito : null,
        observation: {
          readyState: response.readyState,
          performanceEntryTypes: response.performanceEntryTypes
            ? [...response.performanceEntryTypes]
            : null,
          timings: {
            domContentLoaded: copyTimingMeasurement(
              response.timings.domContentLoaded,
            ),
            loadEvent: copyTimingMeasurement(response.timings.loadEvent),
            firstContentfulPaint: copyTimingMeasurement(
              response.timings.firstContentfulPaint,
            ),
          },
        },
      },
    };
  } catch {
    return {
      status: 'error',
      reason: `${context.name} refused the page probe. Protected pages, navigation, or a closed tab can cause this.`,
    };
  }
}
