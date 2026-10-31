# @lp-labs/events

Package version: `0.1.0`.

A typed synchronous event bus with zero runtime dependencies. Independent bus
instances, deterministic subscription order, abortable subscriptions, and explicit
cleanup. No React integration, global singleton, or sibling-package dependency.

## Installation

```sh
npm install @lp-labs/events
```

Node.js 18+ is supported. ESM and CommonJS builds include their own declaration
files and are selected automatically. Browser use requires a bundler that resolves
package exports and an ES2022-compatible runtime with standard AbortSignal support
when using cancellation. TypeScript 5.4+ is required for the declarations. Public
types have no dependency on DOM or Node.js ambient declarations: the signal option
uses the minimal structural shape implemented by a standard AbortSignal.

## Usage

```ts
import { createEventBus } from "@lp-labs/events";

interface Events {
  message: { text: string };
  ready: void;
  progress: number | undefined;
}

const bus = createEventBus<Events>();
const unsubscribe = bus.on("message", ({ text }) => console.log(text));
bus.once("ready", () => console.log("ready"));

bus.emit("message", { text: "Hello" }); // returns 1
bus.emit("ready"); // returns 1; removes the once subscription
bus.emit("progress"); // undefined is a valid payload
unsubscribe(); // idempotent
bus.dispose(); // permanently closes this instance
```

```js
const { createEventBus } = require("@lp-labs/events");
const bus = createEventBus();
bus.on("message", (value) => console.log(value));
bus.emit("message", "Hello");
```

JavaScript has the same runtime API but no event-map validation. TypeScript event
maps can be interfaces or object types without an index signature. String, number,
and symbol keys are supported; number and string keys remain distinct. Every event
has exactly one payload, passed unchanged by reference, or undefined when omitted.
`void`, `undefined`, and payload types including `undefined` allow omission.
Optional map properties do too. `null` alone does not allow omission. Use an object
or tuple payload to carry several values.

## Complete API

Runtime exports are `createEventBus` and `EventBusDisposedError`; there is no
default export. Type-only exports are `EventBus`, `Listener`, `EventArgs`,
`SubscriptionOptions`, and `Unsubscribe`.

### createEventBus<Events extends object>(): EventBus<Events>

Creates an empty, active, isolated bus. No arguments or configuration defaults
other than the synchronous behavior described below. Methods may be detached from
the bus without binding.

### on(event, listener, options?): Unsubscribe

Registers `(payload: Events[typeof event]) => void` at the end of the event's
listener order. Returns an idempotent `() => void` that removes only this
registration. Duplicate registrations are allowed and are independent.

`options` defaults to absent. Its only supported field is
`signal?: AbortSignal`, a standard platform AbortSignal. An already-aborted signal
registers nothing and returns a no-op unsubscribe function. A later abort
synchronously removes that registration. The abort reason is ignored. Every
removal path detaches the signal's abort handler, including manual unsubscribe,
`off`, successful or throwing `once` invocation, `clear`, and `dispose`.
Do not pass custom signal lookalikes or override signal methods.

### once(event, listener, options?): Unsubscribe

Same options and return value as `on`, but removes the registration immediately
before calling the listener. Recursive emissions cannot invoke it twice, and it
stays removed even if its listener throws. A once listener skipped because an
earlier listener threw stays subscribed.

### off(event, listener): number

Removes all registrations of this exact function for this event, including both
`on` and `once` registrations. Returns the number removed; zero for no match.
It does not affect the same function on other events.

### emit(event, ...args: EventArgs<Events[typeof event]>): number

Synchronously invokes eligible listeners in registration order. Returns the number
invoked by this emission only, excluding nested emissions. An event with no
listeners returns zero. This method does not return normally if a listener throws.

Each emission takes a snapshot of registrations for that event:

- Added listeners are not in the current snapshot.
- Removed listeners are skipped even if they were in the snapshot.
- Removing and re-adding a function creates a new registration, deferred for this
  snapshot.
- Nested emissions take their own fresh snapshot, so they can see new listeners.
- A once listener is removed before invocation, not after.
- Clearing or disposing from a listener skips affected pending listeners.
- Payloads are not cloned or frozen; changes are visible to later listeners.
- Callbacks receive undefined as their `this` receiver. Return values are ignored.

There is no reserved `"error"` event. All event names behave alike.

### listenerCount(event?): number

Counts active registrations, including duplicates. Omit the event to count all
events. Returns zero for an unknown event or a disposed bus.

### clear(event?): number

Removes all registrations for the supplied event, or all events when omitted.
Returns the number removed. The bus stays active and reusable unless it was
already disposed. Does not invoke any listeners.

### dispose(): void; readonly isDisposed: boolean

`isDisposed` is initially false. `dispose()` sets it to true, removes all listeners,
and permanently rejects new subscriptions and emissions. Disposal is idempotent.
Saved unsubscribe functions, `off`, `clear`, and `listenerCount` remain safe after
disposal and report zero where applicable. Disposal does not invoke listeners.

### EventBusDisposedError

An exported Error subclass with name `"EventBusDisposedError"` and message
`"The event bus has been disposed."`. `on`, `once`, and `emit` throw it after
disposal, even for an empty event or an already-aborted subscription. Constructible
with no arguments for error classification.

### Public types

```ts
type Listener<Payload> = (payload: Payload) => void;
type Unsubscribe = () => void;
type EventArgs<Payload> = undefined extends Payload
  ? [payload?: Payload]
  : [payload: Payload];
interface SubscriptionOptions {
  readonly signal?: {
    readonly aborted: boolean;
    addEventListener(
      type: "abort",
      listener: () => void,
      options?: { once?: boolean },
    ): void;
    removeEventListener(type: "abort", listener: () => void): void;
  };
}
```

`EventBus<Events>` describes the methods above. `NoInfer` prevents listener and
payload arguments from widening a literal event key to accept unrelated values.
As with indexed access in TypeScript, a variable holding a union of keys has a
union of payload types; narrow the key before emitting when correlation matters.
Use precise event maps rather than `any` or broad string index signatures for
strong checks.

## Errors and lifecycle

Listeners fail fast: the first thrown value is rethrown unchanged to the `emit`
caller, with no wrapping, swallowing, aggregation, or continuation. Prior side
effects and subscription changes are not rolled back. Remaining listeners are not
invoked during that emission. Regular throwing listeners remain registered.

Passing a non-function listener to `on` or `once` throws TypeError before any
registration, including when a signal is already aborted. The disposed-state
check has precedence over listener validation. Other argument shapes are governed
by the TypeScript API; there is no general runtime schema validation.

```ts
import { createEventBus, EventBusDisposedError } from "@lp-labs/events";

const bus = createEventBus<{ update: number }>();
const controller = new AbortController();
bus.on("update", (value) => console.log(value), {
  signal: controller.signal,
});
bus.emit("update", 10);
controller.abort(); // removes that subscription
bus.dispose();
try {
  bus.emit("update", 20);
} catch (error) {
  if (!(error instanceof EventBusDisposedError)) throw error;
}
```

Catch application listener failures around `emit` if recovery is appropriate. The
bus never catches them for you.

## Customization and boundaries

Customize the event map, use symbol keys for private channels, own one bus per
application scope, and use abort controllers to group subscription lifetimes.
Use `clear` for reusable resets and `dispose` for permanent shutdown.

There are no asynchronous emission APIs, promise handling, scheduling, priorities,
wildcards, replay, buffering, persistence, backpressure, cross-thread transport,
or automatic leak warnings/limits. Supply synchronous listeners only. TypeScript
permits promise-returning functions where a void callback is expected; the bus
does not await or observe those promises, and rejected promises can become
unhandled rejections. Handle asynchronous work outside this synchronous API.
Deep recursive emission can exhaust the JavaScript stack. There is no implicit
payload validation, immutable data enforcement, or protection against application
listener side effects.

This is an original, independent implementation, not a wrapper or copied shared
implementation. This statement describes its implementation approach; it is not
a legal guarantee or production certification. Distributed under the MIT license.

## License

[MIT](./LICENSE).

## Support

If this library is useful to you, consider supporting its maintenance with a [donation via PayPal](https://www.paypal.me/LibinPrasanth).

## Author

Created by [Libin Prasanth](https://www.linkedin.com/in/libinprasanth/). Connect on LinkedIn for updates and discussion.
