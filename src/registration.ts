// SDK-free primitives encoding the two invariants that caused real crashes
// during development (see DEVLOG.md v3 and v3.1). Kept isolated from
// @ableton-extensions/sdk so they're unit-testable without the SDK
// installed, and so the invariant is enforced by a regression test instead
// of just a comment.

// `registerCommand` throws if called twice with the same ID, and — unlike
// context menu actions — commands have no unregister function. This grows a
// registration pool from `state.registeredCount` up to `count`, calling
// `registerSlot` exactly once per new index and never re-invoking it for an
// index that's already registered, even if called again with the same or a
// lower count.
export function ensureSlots(count: number, state: { registeredCount: number }, registerSlot: (index: number) => void): void {
  for (let i = state.registeredCount; i < count; i++) {
    registerSlot(i);
  }
  state.registeredCount = Math.max(state.registeredCount, count);
}

// Swaps a set of registered items (e.g. context menu actions) for a new
// set without ever leaving a gap where fewer than expected are registered.
// The new items are registered first; only once that succeeds are the old
// ones torn down, and they're torn down concurrently (not one at a time) so
// a right-click landing mid-swap can never see a half-updated menu.
// `onSwapped` fires after the new items exist but before the old ones are
// removed, for callers that need to flip other state at exactly that point.
export async function swapRegistrations<T>(
  registerNew: () => Promise<T[]>,
  previousItems: T[],
  unregisterOne: (item: T) => Promise<void>,
  onSwapped?: () => void,
): Promise<T[]> {
  const nextItems = await registerNew();
  onSwapped?.();
  await Promise.all(previousItems.map(unregisterOne));
  return nextItems;
}
