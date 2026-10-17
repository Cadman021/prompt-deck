// src/utils/rafBatch.ts
// Coalesces high-frequency state updates (stream chunks) to one React render
// per animation frame, per key. React 18 already batches, but without this
// every chunk still re-renders the column AND re-parses its Markdown.

const pending = new Map<string, number>();

export function rafBatch(key: string, fn: () => void): void {
  if (pending.has(key)) return;
  pending.set(
    key,
    requestAnimationFrame(() => {
      pending.delete(key);
      fn();
    })
  );
}

/**
 * Drops a queued update for `key` so a stale frame (e.g. the last stream
 * chunk) can't fire after a terminal write and overwrite newer state.
 */
export function cancelRafBatch(key: string): void {
  const id = pending.get(key);
  if (id === undefined) return;
  pending.delete(key);
  cancelAnimationFrame(id);
}
