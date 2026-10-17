// Tests for the per-key rAF coalescer — including cancellation, which the
// Test Suite relies on so a lagging stream frame can't overwrite a cell that
// already finalized (the cloud "stuck running" bug).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rafBatch, cancelRafBatch } from './rafBatch';

function stubFrames() {
  const cbs = new Map<number, FrameRequestCallback>();
  let next = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    next += 1;
    cbs.set(next, cb);
    return next;
  });
  vi.stubGlobal('cancelAnimationFrame', (n: number) => {
    cbs.delete(n);
  });
  return {
    size: () => cbs.size,
    flush: () => {
      const queued = [...cbs.values()];
      cbs.clear();
      for (const cb of queued) cb(0);
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('rafBatch', () => {
  it('coalesces multiple updates in the same frame into one', () => {
    const frames = stubFrames();
    const fn = vi.fn();
    rafBatch('coalesce', fn);
    rafBatch('coalesce', fn);
    expect(frames.size()).toBe(1);
    frames.flush();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('cancelRafBatch drops a queued update', () => {
    const frames = stubFrames();
    const fn = vi.fn();
    rafBatch('cancel', fn);
    cancelRafBatch('cancel');
    frames.flush();
    expect(fn).not.toHaveBeenCalled();
  });

  it('allows re-scheduling after a cancel', () => {
    const frames = stubFrames();
    const fn = vi.fn();
    rafBatch('reschedule', fn);
    cancelRafBatch('reschedule');
    rafBatch('reschedule', fn);
    frames.flush();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('ignores cancel for unknown keys', () => {
    stubFrames();
    expect(() => cancelRafBatch('never-scheduled')).not.toThrow();
  });
});
