import type { EventArgs, EventBus, Listener, SubscriptionOptions, Unsubscribe } from './types.js';

export type { EventArgs, EventBus, Listener, SubscriptionOptions, Unsubscribe } from './types.js';

export class EventBusDisposedError extends Error {
  constructor() {
    super('The event bus has been disposed.');
    this.name = 'EventBusDisposedError';
  }
}

interface Entry {
  readonly listener: Listener<never>;
  readonly once: boolean;
  readonly signal: SubscriptionOptions['signal'];
  readonly abort: () => void;
  active: boolean;
}

export function createEventBus<Events extends object>(): EventBus<Events> {
  const events = new Map<keyof Events, Set<Entry>>();
  let disposed = false;

  function assertActive(): void {
    if (disposed) {
      throw new EventBusDisposedError();
    }
  }

  function remove(event: keyof Events, entry: Entry): void {
    if (!entry.active) return;
    entry.active = false;
    const bucket = events.get(event);
    bucket?.delete(entry);
    if (bucket?.size === 0) events.delete(event);
    entry.signal?.removeEventListener('abort', entry.abort);
  }

  function subscribe<Key extends keyof Events>(
    event: Key,
    listener: Listener<Events[Key]>,
    once: boolean,
    options?: SubscriptionOptions,
  ): Unsubscribe {
    assertActive();
    if (typeof listener !== 'function') {
      throw new TypeError('The listener must be a function.');
    }
    const signal = options?.signal;
    if (signal?.aborted) return () => {};
    const entry: Entry = {
      listener: listener as Listener<never>,
      once,
      signal,
      abort: () => remove(event, entry),
      active: true,
    };
    const bucket = events.get(event) ?? new Set<Entry>();
    bucket.add(entry);
    events.set(event, bucket);
    signal?.addEventListener('abort', entry.abort, { once: true });
    return entry.abort;
  }

  function clear(event?: keyof Events): number {
    let removed = 0;
    const keys = event === undefined ? [...events.keys()] : [event];
    for (const key of keys) {
      const bucket = events.get(key);
      if (!bucket) continue;
      for (const entry of bucket) {
        remove(key, entry);
        removed++;
      }
    }
    return removed;
  }

  return {
    get isDisposed() {
      return disposed;
    },
    on: (event, listener, options) => subscribe(event, listener, false, options),
    once: (event, listener, options) => subscribe(event, listener, true, options),
    off(event, listener) {
      let removed = 0;
      const bucket = events.get(event);
      if (!bucket) return removed;
      for (const entry of bucket) {
        if (entry.listener === listener) {
          remove(event, entry);
          removed++;
        }
      }
      return removed;
    },
    emit<Key extends keyof Events>(event: Key, ...args: EventArgs<NoInfer<Events[Key]>>): number {
      assertActive();
      const bucket = events.get(event);
      if (!bucket) return 0;
      let invoked = 0;
      for (const entry of [...bucket]) {
        if (!entry.active) continue;
        if (entry.once) remove(event, entry);
        const listener = entry.listener;
        listener(args[0] as never);
        invoked++;
      }
      return invoked;
    },
    listenerCount(event) {
      if (event !== undefined) return events.get(event)?.size ?? 0;
      let count = 0;
      for (const bucket of events.values()) count += bucket.size;
      return count;
    },
    clear,
    dispose() {
      if (disposed) return;
      disposed = true;
      clear();
    },
  };
}
