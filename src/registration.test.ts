import assert from "node:assert/strict";
import { test } from "node:test";
import { ensureSlots, swapRegistrations } from "./registration.js";

test("ensureSlots registers each new index exactly once", () => {
  const registered: number[] = [];
  const state = { registeredCount: 0 };

  ensureSlots(3, state, (i) => registered.push(i));

  assert.deepEqual(registered, [0, 1, 2]);
  assert.equal(state.registeredCount, 3);
});

test("ensureSlots never re-registers an already-registered index (DEVLOG v3 crash regression)", () => {
  // The bug: registerCommand throws if called twice with the same ID, and
  // commands have no unregister. Calling ensureSlots again with the same or
  // a smaller count must be a no-op for indices already registered.
  const registered: number[] = [];
  const state = { registeredCount: 0 };

  ensureSlots(3, state, (i) => registered.push(i));
  ensureSlots(3, state, (i) => registered.push(i)); // same count again
  ensureSlots(1, state, (i) => registered.push(i)); // smaller count

  assert.deepEqual(registered, [0, 1, 2]);
});

test("ensureSlots only registers the newly-added indices when the pool grows", () => {
  const registered: number[] = [];
  const state = { registeredCount: 0 };

  ensureSlots(2, state, (i) => registered.push(i));
  ensureSlots(5, state, (i) => registered.push(i));

  assert.deepEqual(registered, [0, 1, 2, 3, 4]);
  assert.equal(state.registeredCount, 5);
});

test("swapRegistrations registers the new set before unregistering the old set (DEVLOG v3.1 disappearing-menu regression)", async () => {
  const events: string[] = [];

  const registerNew = async () => {
    events.push("register:start");
    events.push("register:done");
    return ["new-item"];
  };
  const unregisterOne = async (item: string) => {
    events.push(`unregister:${item}`);
  };

  await swapRegistrations(registerNew, ["old-item"], unregisterOne);

  assert.deepEqual(events, ["register:start", "register:done", "unregister:old-item"]);
});

test("swapRegistrations unregisters old items concurrently, not one at a time", async () => {
  const started: string[] = [];
  const resolvers = new Map<string, () => void>();

  const unregisterOne = (item: string) =>
    new Promise<void>((resolve) => {
      started.push(item);
      resolvers.set(item, resolve);
    });

  const swapPromise = swapRegistrations(async () => ["new-item"], ["old-1", "old-2", "old-3"], unregisterOne);

  // Give the microtask queue a turn. A sequential `for (const fn of old)
  // await fn()` loop would only have started "old-1" by now; Promise.all
  // starts all three before any of them resolve.
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(started.sort(), ["old-1", "old-2", "old-3"]);

  for (const resolve of resolvers.values()) resolve();
  await swapPromise;
});

test("swapRegistrations calls onSwapped after the new set exists but before old items are removed", async () => {
  const events: string[] = [];

  await swapRegistrations(
    async () => {
      events.push("registered");
      return ["new-item"];
    },
    ["old-item"],
    async (item) => {
      events.push(`unregistered:${item}`);
    },
    () => events.push("swapped"),
  );

  assert.deepEqual(events, ["registered", "swapped", "unregistered:old-item"]);
});
