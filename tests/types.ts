import {
  createEventBus,
  EventBusDisposedError,
  type EventArgs,
  type EventBus,
  type Listener,
  type SubscriptionOptions,
  type Unsubscribe,
} from '../src/index.js';

const symbol = Symbol('event');
interface Events {
  message: { text: string };
  ready: void;
  optional?: number;
  explicitUndefined: undefined;
  nullable: string | null;
  7: boolean;
  [symbol]: Date;
}

const bus: EventBus<Events> = createEventBus<Events>();
const options: SubscriptionOptions = { signal: new AbortController().signal };
const listener: Listener<Events['message']> = (payload) => {
  payload.text.toUpperCase();
  // @ts-expect-error Payload remains specific.
  payload.missing;
};
const unsubscribe: Unsubscribe = bus.on('message', listener, options);
unsubscribe();
bus.once('ready', () => {});
bus.emit('ready');
bus.emit('ready', undefined);
bus.emit('explicitUndefined');
bus.emit('optional');
bus.emit('optional', 2);
bus.emit('optional', undefined);
bus.emit('nullable', null);
bus.emit('message', { text: 'hello' });
bus.emit(7, true);
bus.emit(symbol, new Date());
const count: number = bus.emit('ready');
const removed: number = bus.off('message', listener);
const total: number = bus.listenerCount();
const eventCount: number = bus.listenerCount('ready');
const cleared: number = bus.clear('message');
const allCleared: number = bus.clear();
const disposed: boolean = bus.isDisposed;
bus.dispose();
const error: Error = new EventBusDisposedError();
const optionalArgs: EventArgs<number | undefined> = [];
const requiredArgs: EventArgs<number> = [2];
void [
  count,
  removed,
  total,
  eventCount,
  cleared,
  allCleared,
  disposed,
  error,
  optionalArgs,
  requiredArgs,
];

// @ts-expect-error Unknown event.
bus.on('missing', () => {});
// @ts-expect-error Unknown event.
bus.once('missing', () => {});
// @ts-expect-error Unknown event.
bus.emit('missing');
// @ts-expect-error Required payload cannot be omitted.
bus.emit('message');
// @ts-expect-error Payload cannot be widened by argument inference.
bus.emit('message', 2);
// @ts-expect-error Null does not make the payload optional.
bus.emit('nullable');
// @ts-expect-error void does not accept arbitrary values.
bus.emit('ready', 'value');
// @ts-expect-error Optional does not mean any payload.
bus.emit('optional', 'value');
// @ts-expect-error Listener payload is checked.
bus.on('message', (payload: number) => {
  void payload;
});
// @ts-expect-error once has the same listener constraints.
bus.once('message', (payload: number) => {
  void payload;
});
// @ts-expect-error off has the same listener constraints.
bus.off('message', (payload: number) => {
  void payload;
});
// @ts-expect-error Unknown count event.
bus.listenerCount('missing');
// @ts-expect-error Unknown clear event.
bus.clear('missing');
// @ts-expect-error Options require an AbortSignal.
bus.on('ready', () => {}, { signal: 'invalid' });
// @ts-expect-error Readonly lifecycle.
bus.isDisposed = true;
// @ts-expect-error A required tuple needs its payload.
const badArgs: EventArgs<string> = [];
void badArgs;
