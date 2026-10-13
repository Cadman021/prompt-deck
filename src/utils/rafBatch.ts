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
