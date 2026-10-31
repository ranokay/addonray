import type { Browser } from 'wxt/browser';
import type { BrowserContext } from './browser-target';
import type { Investigation } from './investigation';
import {
  createSavedRecord,
  exchangeBytes,
  inspectStoredRecord,
  isRetentionDays,
  recordLabel,
  SAVED_DEFAULT_RETENTION_DAYS,
  SAVED_LIMITS,
  storedRecordBytes,
  type SavedRecord,
  type SavedRetentionDays,
} from './saved-record';
import {
  SavedStoreError,
  type SavedStore,
  type SavedStoreState,
} from './saved-store';
import { normalContext } from './saved-context';

export interface SavedSaveBrowser {
  tabs: {
    getCurrent(): Promise<Pick<Browser.tabs.Tab, 'incognito'> | undefined>;
  };
  permissions: {
    contains(permissions: Browser.permissions.Permissions): Promise<boolean>;
  };
}

export interface SavedNotifier {
  notify(): void;
}

interface SaveSnapshot {
  ready: boolean;
  busy: boolean;
  message: string | null;
  lastLabel: string | null;
  retentionDays: SavedRetentionDays;
}

type InvestigationState = ReturnType<Investigation['getSnapshot']>;

function pageData(state: InvestigationState) {
  return Boolean(
    state.timingBefore ||
    state.timingAfter ||
    state.errorBefore ||
    state.errorAfter,
  );
}

export function createSavedSave(
  api: SavedSaveBrowser,
  investigation: Investigation,
  store: SavedStore,
  notifier?: SavedNotifier,
  context?: BrowserContext,
) {
  let state: SaveSnapshot = {
    ready: false,
    busy: false,
    message: null,
    lastLabel: null,
    retentionDays: SAVED_DEFAULT_RETENTION_DAYS,
  };
  let live = true;
  let operation = 0;
  let activeController: AbortController | null = null;
  const subscribers = new Set<() => void>();
  const publish = (next: SaveSnapshot) => {
    state = next;
    subscribers.forEach((subscriber) => subscriber());
  };
  const message = (text: string | null, lastLabel = state.lastLabel) =>
    publish({ ...state, busy: false, message: text, lastLabel });

  let checking: Promise<void> | null = null;
  function checkReady(): Promise<void> {
    if (!live || state.busy) return Promise.resolve();
    if (checking !== null) return checking;
    checking = (async () => {
      // Check the owning context before opening extension storage. A private
      // investigation page must not create or read saved storage merely by
      // rendering its save section.
      const normal = await normalContext(api);
      if (!live) return;
      if (!normal) {
        publish({
          ...state,
          ready: false,
          message: 'Save is available only in verified normal windows.',
        });
        return;
      }
      publish({ ...state, ready: false, message: null });
      try {
        await store.ready();
        if (live) publish({ ...state, ready: true, message: null });
      } catch (error) {
        if (!live) return;
        const text =
          error instanceof SavedStoreError
            ? error.message
            : `${context?.name ?? 'Browser'} saved storage is unavailable.`;
        publish({ ...state, ready: false, message: text });
      }
    })().finally(() => {
      checking = null;
    });
    return checking;
  }
  const ready = checkReady();

  return {
    getSnapshot: () => state,
    subscribe(subscriber: () => void) {
      if (!live) return () => {};
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    },
    retryStorage() {
      if (state.ready) return Promise.resolve();
      return checkReady();
    },
    setRetentionDays(days: SavedRetentionDays) {
      if (!live || state.busy || !isRetentionDays(days)) return;
      publish({ ...state, retentionDays: days });
    },
    async save() {
      if (!live || state.busy) return;
      // Acquisition and the idle check are one synchronous operation. A save
      // therefore cannot overlap a capture, attachment or report action.
      const lease = investigation.activity.tryBegin('save');
      if (!lease) {
        message('Another investigation action is in progress. Try again.');
        return;
      }
      if (!state.ready) {
        lease.release();
        await checkReady();
        return;
      }
      const snapshot = investigation.getSnapshot();
      const generation = investigation.getGeneration();
      if (
        snapshot.busy !== null ||
        snapshot.before?.status !== 'success' ||
        snapshot.after?.status !== 'success'
      ) {
        lease.release();
        message('Capture both inventories before saving.');
        return;
      }
      const ticket = ++operation;
      const controller = new AbortController();
      activeController = controller;
      publish({ ...state, busy: true, message: null });
      let unwatch: (() => void) | null = null;
      try {
        // Bind the pending write to the current store identity and deletion
        // epoch before any asynchronous context or permission checks.
        const expected: SavedStoreState = await store.readState();
        if (
          !live ||
          ticket !== operation ||
          snapshot !== investigation.getSnapshot() ||
          generation !== investigation.getGeneration()
        )
          throw new Error('cancelled');
        if (!(await normalContext(api))) {
          message('Save is available only in verified normal windows.');
          return;
        }
        if (
          snapshot !== investigation.getSnapshot() ||
          generation !== investigation.getGeneration()
        )
          throw new Error('cancelled');
        const granted = await api.permissions.contains({
          permissions: pageData(snapshot)
            ? ['management', 'scripting']
            : ['management'],
        });
        if (!granted) {
          investigation.startOver();
          message('Access changed. The investigation was cleared.');
          return;
        }
        if (
          !live ||
          ticket !== operation ||
          snapshot !== investigation.getSnapshot() ||
          generation !== investigation.getGeneration()
        )
          throw new Error('cancelled');
        if (!(await normalContext(api))) {
          message('Save is available only in verified normal windows.');
          return;
        }
        if (
          !live ||
          ticket !== operation ||
          snapshot !== investigation.getSnapshot() ||
          generation !== investigation.getGeneration()
        )
          throw new Error('cancelled');
        const recordResult = createSavedRecord(snapshot, {
          now: Date.now(),
          recordId: crypto.randomUUID(),
          retentionDays: state.retentionDays,
        });
        if (recordResult.status !== 'success') {
          message(recordResult.reason);
          return;
        }
        const record: SavedRecord = recordResult.value;
        const bytes = storedRecordBytes(record);
        if (bytes > SAVED_LIMITS.recordBytes) {
          message('The saved record exceeds the 1 MiB limit.');
          return;
        }
        if (exchangeBytes(record) > SAVED_LIMITS.jsonBytes) {
          message('The saved record exceeds the 1 MiB JSON limit.');
          return;
        }
        if (inspectStoredRecord(record).status !== 'valid') {
          message('The saved record could not be validated.');
          return;
        }
        unwatch = investigation.watch(() => {
          if (
            investigation.getSnapshot() !== snapshot ||
            investigation.getGeneration() !== generation
          )
            controller.abort();
        });
        if (
          !live ||
          ticket !== operation ||
          snapshot !== investigation.getSnapshot() ||
          generation !== investigation.getGeneration()
        ) {
          controller.abort();
          throw new Error('cancelled');
        }
        // Last abortable context check. The adapter creates its readwrite
        // transaction synchronously after this await, so no context change can
        // slip between this check and the enqueued write.
        if (!(await normalContext(api))) {
          message('Save is available only in verified normal windows.');
          return;
        }
        if (
          !live ||
          ticket !== operation ||
          snapshot !== investigation.getSnapshot() ||
          generation !== investigation.getGeneration()
        ) {
          controller.abort();
          throw new Error('cancelled');
        }
        // The store rechecks the store identity, epoch and bounds inside one
        // readwrite transaction and resolves only after it commits.
        const result = await store.save(record, expected, controller.signal);
        if (!live || ticket !== operation) return;
        if (result === 'saved') {
          const label = recordLabel(record);
          try {
            notifier?.notify();
          } catch {
            /* A liveness hint cannot turn a committed save into a failure. */
          }
          publish({
            ...state,
            busy: false,
            message: `Saved locally. ${label}`,
            lastLabel: label,
          });
          return;
        }
        if (
          snapshot !== investigation.getSnapshot() ||
          generation !== investigation.getGeneration()
        ) {
          message(
            'The investigation changed before the save completed. The live investigation was kept.',
          );
          return;
        }
        if (result === 'stale' || result === 'stale-store') {
          message(
            'The investigation or local storage changed. Save again from the current investigation.',
          );
          return;
        }
        if (result === 'duplicate') {
          message(
            'A saved record with this ID already exists. The live investigation was kept.',
          );
          return;
        }
        if (result === 'records')
          message(
            'The library already contains 50 saved records. Delete one before saving.',
          );
        else if (result === 'record')
          message('This record exceeds the 1 MiB saved-record limit.');
        else if (result === 'total')
          message(
            'The library would exceed its 5 MiB limit. Delete a saved record before saving.',
          );
        else if (result === 'exhausted')
          message(
            'Saved storage cannot accept another record because its deletion counter is exhausted.',
          );
        else if (result === 'quota')
          message(
            'Browser storage quota was exceeded. The live investigation was kept.',
          );
        else if (result === 'timeout')
          message(
            'Saved storage did not respond. The live investigation was kept.',
          );
        else if (result === 'cancelled')
          message(
            'The save was cancelled because the investigation changed. The live investigation was kept.',
          );
        else if (result === 'unavailable')
          message(
            'Saved storage is unavailable. The live investigation was kept.',
          );
        else
          message(
            'The save could not be completed. The live investigation was kept.',
          );
      } catch (error) {
        if (live && ticket === operation) {
          if (investigation.getSnapshot() !== snapshot)
            message(
              'The investigation changed before the save completed. The live investigation was kept.',
            );
          else if (error instanceof SavedStoreError) {
            if (error.code === 'unavailable')
              publish({
                ...state,
                ready: false,
                busy: false,
                message: `${error.message} The live investigation was kept. Retry saved storage before saving again.`,
              });
            else message(`${error.message} The live investigation was kept.`);
          } else
            message(
              'The save could not be completed. The live investigation was kept.',
            );
        }
      } finally {
        unwatch?.();
        if (activeController === controller) activeController = null;
        lease.release();
        if (live && ticket === operation && state.busy)
          publish({ ...state, busy: false });
      }
    },
    dispose() {
      live = false;
      operation += 1;
      activeController?.abort();
      activeController = null;
      subscribers.clear();
      store.close();
    },
    ready,
  };
}

export type SavedSave = ReturnType<typeof createSavedSave>;
