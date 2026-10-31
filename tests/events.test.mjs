import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { getEventListeners } from 'node:events';
import * as esm from '@lp-labs/events';

const require = createRequire(import.meta.url);
const cjs = require('@lp-labs/events');

for (const [format, { createEventBus, EventBusDisposedError }] of [
  ['ESM', esm],
  ['CommonJS', cjs],
]) {
  test(`${format}: named exports`, () => {
    assert.deepEqual(Object.keys(esm).sort(), Object.keys(cjs).sort());
    assert.deepEqual(Object.keys(esm).sort(), ['EventBusDisposedError', 'createEventBus']);
  });

  test(`${format}: ordering, payload identity, counts and empty emission`, () => {
    const bus = createEventBus();
    const payload = {};
    const calls = [];
    assert.equal(bus.emit('empty'), 0);
    bus.on('event', (value) => calls.push([1, value]));
    bus.on('event', (value) => calls.push([2, value]));
    bus.on('other', () => {});
    assert.equal(bus.listenerCount(), 3);
    assert.equal(bus.listenerCount('event'), 2);
    assert.equal(bus.listenerCount('missing'), 0);
    assert.equal(bus.emit('event', payload), 2);
    assert.deepEqual(calls, [
      [1, payload],
      [2, payload],
    ]);
    assert.equal(calls[0][1], payload);
  });

  test(`${format}: undefined payloads and special event keys`, () => {
    const bus = createEventBus();
    const symbol = Symbol();
    for (const key of ['__proto__', 'constructor', '', 0, symbol]) {
      let received = 'not called';
      bus.on(key, (value) => {
        received = value;
      });
      assert.equal(bus.emit(key), 1);
      assert.equal(received, undefined);
      assert.equal(bus.clear(key), 1);
    }
    assert.equal(bus.listenerCount(), 0);
  });

  test(`${format}: duplicates are independent; off removes all matching entries`, () => {
    const bus = createEventBus();
    const listener = () => {};
    const unsubscribe = bus.on('event', listener);
    bus.on('event', listener);
    bus.once('event', listener);
    bus.on('other', listener);
    unsubscribe();
    unsubscribe();
    assert.equal(bus.listenerCount('event'), 2);
    assert.equal(bus.off('event', listener), 2);
    assert.equal(bus.off('event', listener), 0);
    assert.equal(bus.off('missing', listener), 0);
    assert.equal(bus.listenerCount('other'), 1);
  });

  test(`${format}: once is removed before recursive emission`, () => {
    const bus = createEventBus();
    const calls = [];
    bus.once('event', () => {
      calls.push('once');
      assert.equal(bus.listenerCount('event'), 1);
      assert.equal(bus.emit('event'), 1);
    });
    bus.on('event', () => calls.push('regular'));
    assert.equal(bus.emit('event'), 2);
    assert.deepEqual(calls, ['once', 'regular', 'regular']);
    assert.equal(bus.emit('event'), 1);
  });

  test(`${format}: add during emission waits for next emission`, () => {
    const bus = createEventBus();
    const calls = [];
    let added = false;
    bus.on('event', () => {
      calls.push('first');
      if (!added) {
        added = true;
        bus.on('event', () => calls.push('new'));
      }
    });
    assert.equal(bus.emit('event'), 1);
    assert.equal(bus.emit('event'), 2);
    assert.deepEqual(calls, ['first', 'first', 'new']);
  });

  test(`${format}: additions are visible to a nested emission`, () => {
    const bus = createEventBus();
    const calls = [];
    let nested = false;
    bus.on('event', () => {
      calls.push('first');
      if (!nested) {
        nested = true;
        bus.on('event', () => calls.push('new'));
        assert.equal(bus.emit('event'), 2);
      }
    });
    assert.equal(bus.emit('event'), 1);
    assert.deepEqual(calls, ['first', 'first', 'new']);
  });

  test(`${format}: removal and re-add during emission skip original entry`, () => {
    const bus = createEventBus();
    const calls = [];
    const later = () => calls.push('later');
    const self = bus.on('event', () => {
      calls.push('first');
      self();
      assert.equal(bus.off('event', later), 1);
      bus.on('event', later);
    });
    bus.on('event', later);
    assert.equal(bus.emit('event'), 1);
    assert.equal(bus.emit('event'), 1);
    assert.deepEqual(calls, ['first', 'later']);
  });

  test(`${format}: pre-aborted subscription registers nothing`, () => {
    const bus = createEventBus();
    const controller = new AbortController();
    controller.abort();
    const unsubscribe = bus.on('event', () => assert.fail(), {
      signal: controller.signal,
    });
    const once = bus.once('event', () => assert.fail(), {
      signal: controller.signal,
    });
    unsubscribe();
    once();
    assert.equal(bus.listenerCount(), 0);
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  });

  test(`${format}: abort after subscription removes pending listeners during emit`, () => {
    const bus = createEventBus();
    const controller = new AbortController();
    bus.on('event', () => controller.abort());
    bus.on('event', () => assert.fail(), { signal: controller.signal });
    bus.once('other', () => assert.fail(), { signal: controller.signal });
    assert.equal(getEventListeners(controller.signal, 'abort').length, 2);
    assert.equal(bus.emit('event'), 1);
    assert.equal(bus.listenerCount(), 1);
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  });

  test(`${format}: every removal path detaches abort handlers`, () => {
    for (const mode of ['unsubscribe', 'off', 'once', 'clear', 'dispose']) {
      const bus = createEventBus();
      const controller = new AbortController();
      const listener = () => {};
      const unsubscribe = bus[mode === 'once' ? 'once' : 'on']('event', listener, {
        signal: controller.signal,
      });
      assert.equal(getEventListeners(controller.signal, 'abort').length, 1);
      if (mode === 'unsubscribe') unsubscribe();
      if (mode === 'off') bus.off('event', listener);
      if (mode === 'once') bus.emit('event');
      if (mode === 'clear') bus.clear();
      if (mode === 'dispose') bus.dispose();
      assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
      assert.equal(bus.listenerCount(), 0);
      unsubscribe();
      controller.abort();
    }
  });

  test(`${format}: clear counts and skip pending listeners`, () => {
    const bus = createEventBus();
    bus.on('event', () => assert.equal(bus.clear('event'), 2));
    bus.on('event', () => assert.fail());
    bus.on('other', () => {});
    assert.equal(bus.emit('event'), 1);
    assert.equal(bus.clear('missing'), 0);
    assert.equal(bus.clear(), 1);
    assert.equal(bus.clear(), 0);
  });

  test(`${format}: errors propagate unchanged and stop emission`, () => {
    for (const thrown of [new Error('listener failed'), undefined, 'failure']) {
      const bus = createEventBus();
      let laterCalls = 0;
      bus.on('event', () => {
        throw thrown;
      });
      bus.on('event', () => {
        laterCalls++;
      });
      let caught = false;
      try {
        bus.emit('event');
      } catch (error) {
        caught = true;
        assert.equal(error, thrown);
      }
      assert.equal(caught, true);
      assert.equal(laterCalls, 0);
      assert.equal(bus.listenerCount(), 2);
    }
  });

  test(`${format}: throwing once stays removed; unvisited once stays registered`, () => {
    const bus = createEventBus();
    const error = new Error('failure');
    let later = 0;
    bus.once('event', () => {
      throw error;
    });
    bus.once('event', () => {
      later++;
    });
    assert.throws(
      () => bus.emit('event'),
      (value) => value === error,
    );
    assert.equal(bus.listenerCount(), 1);
    assert.equal(bus.emit('event'), 1);
    assert.equal(later, 1);
    assert.equal(bus.listenerCount(), 0);
  });

  test(`${format}: disposal during emit, safe cleanup and rejected new work`, () => {
    const bus = createEventBus();
    assert.equal(bus.isDisposed, false);
    const unsubscribe = bus.on('event', () => bus.dispose());
    bus.on('event', () => assert.fail());
    assert.equal(bus.emit('event'), 1);
    assert.equal(bus.isDisposed, true);
    assert.equal(bus.listenerCount(), 0);
    assert.equal(bus.clear(), 0);
    assert.equal(
      bus.off('event', () => {}),
      0,
    );
    unsubscribe();
    bus.dispose();
    for (const action of [
      () => bus.emit('event'),
      () => bus.on('event', () => {}),
      () => bus.once('event', () => {}, { signal: AbortSignal.abort() }),
    ]) {
      assert.throws(action, EventBusDisposedError);
    }
    const error = new EventBusDisposedError();
    assert.ok(error instanceof Error);
    assert.equal(error.name, 'EventBusDisposedError');
    assert.equal(error.message, 'The event bus has been disposed.');
  });

  test(`${format}: invalid listeners fail before registering`, () => {
    const bus = createEventBus();
    for (const method of ['on', 'once']) {
      assert.throws(() => bus[method]('event', null), TypeError);
      assert.throws(() => bus[method]('event', {}, { signal: AbortSignal.abort() }), TypeError);
    }
    assert.equal(bus.listenerCount(), 0);
  });

  test(`${format}: methods can be detached; buses are isolated`, () => {
    const first = createEventBus();
    const second = createEventBus();
    const { on, once, emit, off, clear, listenerCount, dispose } = first;
    const listener = () => {};
    on('event', listener);
    once('event', () => {});
    assert.equal(listenerCount(), 2);
    assert.equal(second.listenerCount(), 0);
    assert.equal(emit('event'), 2);
    assert.equal(off('event', listener), 1);
    assert.equal(clear(), 0);
    dispose();
    assert.equal(first.isDisposed, true);
  });

  test(`${format}: callbacks have no receiver; return values are ignored`, () => {
    const bus = createEventBus();
    bus.on('event', function (payload) {
      assert.equal(this, undefined);
      assert.equal(payload, 42);
      return 'ignored';
    });
    assert.equal(bus.emit('event', 42), 1);
  });
}
