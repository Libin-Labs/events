/** The argument is optional precisely when undefined is a valid payload. */
export type EventArgs<Payload> = undefined extends Payload
  ? [payload?: Payload]
  : [payload: Payload];

export type Listener<Payload> = (payload: Payload) => void;

export type Unsubscribe = () => void;

export interface SubscriptionOptions {
  readonly signal?: {
    readonly aborted: boolean;
    addEventListener(type: 'abort', listener: () => void, options?: { once?: boolean }): void;
    removeEventListener(type: 'abort', listener: () => void): void;
  };
}

export interface EventBus<Events extends object> {
  readonly isDisposed: boolean;
  on<Key extends keyof Events>(
    event: Key,
    listener: Listener<NoInfer<Events[Key]>>,
    options?: SubscriptionOptions,
  ): Unsubscribe;
  once<Key extends keyof Events>(
    event: Key,
    listener: Listener<NoInfer<Events[Key]>>,
    options?: SubscriptionOptions,
  ): Unsubscribe;
  off<Key extends keyof Events>(event: Key, listener: Listener<NoInfer<Events[Key]>>): number;
  emit<Key extends keyof Events>(event: Key, ...args: EventArgs<NoInfer<Events[Key]>>): number;
  listenerCount(event?: keyof Events): number;
  clear(event?: keyof Events): number;
  dispose(): void;
}
