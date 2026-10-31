export type LiveActivityKind = 'capture' | 'attachment' | 'report' | 'save';

export interface LiveActivityLease {
  readonly kind: LiveActivityKind;
  release(): void;
}

export interface LiveActivity {
  tryBegin(kind: LiveActivityKind): LiveActivityLease | null;
  subscribe(subscriber: () => void): () => void;
  dispose(): void;
}

// The investigation owns one activity boundary. A save lease is exclusive; other
// live actions may overlap unless a save is pending. Acquisition and the idle
// check are one synchronous operation, so no action can slip between them.
export function createLiveActivity(): LiveActivity {
  let saveActive = false;
  let disposed = false;
  const active = new Set<symbol>();
  const subscribers = new Set<() => void>();
  const notify = () => subscribers.forEach((subscriber) => subscriber());

  return {
    tryBegin(kind) {
      if (disposed) return null;
      if (kind === 'save') {
        if (saveActive || active.size > 0) return null;
        saveActive = true;
      } else if (saveActive) {
        return null;
      }
      const token = Symbol(kind);
      if (kind !== 'save') active.add(token);
      let released = false;
      notify();
      return {
        kind,
        release() {
          if (released) return;
          released = true;
          if (kind === 'save') saveActive = false;
          else active.delete(token);
          notify();
        },
      };
    },
    subscribe(subscriber) {
      if (disposed) return () => {};
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    },
    dispose() {
      disposed = true;
      saveActive = false;
      active.clear();
      subscribers.clear();
    },
  };
}
