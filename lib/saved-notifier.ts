export interface SavedChangeHint {
  notify(): void;
  subscribe(subscriber: () => void): () => void;
  dispose(): void;
}

const channelName = 'addonray-saved-investigations-v1';

// Cross-view change signals are hints only. Receivers still recheck context and
// re-read storage before they render or mutate anything.
export function createSavedChangeHint(): SavedChangeHint {
  let live = true;
  const subscribers = new Set<() => void>();
  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(channelName);
    channel.onmessage = () => {
      if (!live) return;
      for (const subscriber of [...subscribers]) subscriber();
    };
  } catch {
    channel = null;
  }
  return {
    notify() {
      if (!live) return;
      for (const subscriber of [...subscribers]) subscriber();
      channel?.postMessage('changed');
    },
    subscribe(subscriber) {
      if (!live) return () => {};
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    },
    dispose() {
      live = false;
      subscribers.clear();
      channel?.close();
      channel = null;
    },
  };
}
