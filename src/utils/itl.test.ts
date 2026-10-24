import { describe, expect, it } from 'vitest';
import { ItlTracker } from './itl';

describe('ItlTracker', () => {
  it('reports nothing for a single chunk — one gap is not a distribution', () => {
    const t = new ItlTracker();
    t.add(0, 1);
    expect(t.stats()).toBeNull();
  });

  it('measures a steady stream as a flat distribution', () => {
    const t = new ItlTracker();
    for (let i = 0; i < 50; i++) t.add(i * 20, 1);
    const s = t.stats()!;
    expect(s.medianMs).toBeCloseTo(20, 1);
    expect(s.p95Ms).toBeCloseTo(20, 1);
    expect(s.samples).toBe(49);
  });

  it('divides a multi-token chunk instead of counting it as one token', () => {
    const t = new ItlTracker();
    t.add(0, 1);
    t.add(100, 4); // 100ms for 4 tokens
    expect(t.stats()!.medianMs).toBeCloseTo(25, 1);
  });

  it('shows stalls in p95 while the median stays put', () => {
    const t = new ItlTracker();
    for (let i = 0; i < 100; i++) t.add(i * 10, 1);
    let at = 100 * 10;
    for (let k = 0; k < 8; k++) {
      at += 500;
      t.add(at, 1);
    }
    const s = t.stats()!;
    expect(s.medianMs).toBeCloseTo(10, 1);
    expect(s.p95Ms).toBeGreaterThan(s.medianMs * 5);
  });

  it('does not let a single outlier move p95', () => {
    // One stall in 100 samples is a p99 event; p95 must stay at baseline,
    // otherwise every run would look like it stutters.
    const t = new ItlTracker();
    for (let i = 0; i < 100; i++) t.add(i * 10, 1);
    t.add(1000 + 2000, 1);
    expect(t.stats()!.p95Ms).toBeCloseTo(10, 1);
  });

  it('records a zero-token chunk as time but not as a sample', () => {
    const t = new ItlTracker();
    t.add(0, 1);
    t.add(10, 0);
    t.add(20, 1);
    const s = t.stats()!;
    expect(s.samples).toBe(1);
    expect(s.medianMs).toBeCloseTo(10, 1);
  });

  it('rejects an out-of-order timestamp instead of producing a negative gap', () => {
    const t = new ItlTracker();
    t.add(100, 1);
    t.add(50, 1);
    expect(t.stats()).toBeNull();
  });

  it('propagates the estimated flag', () => {
    const t = new ItlTracker();
    t.add(0, 1);
    t.add(10, 1);
    t.markEstimated();
    expect(t.stats()!.estimated).toBe(true);
  });

  it('interpolates percentiles across a uniform distribution', () => {
    const t = new ItlTracker();
    let clock = 0;
    t.add(clock, 1);
    for (let gap = 1; gap <= 100; gap++) {
      clock += gap;
      t.add(clock, 1);
    }
    const s = t.stats()!;
    expect(s.medianMs).toBeCloseTo(50, 0);
    expect(s.p95Ms).toBeCloseTo(95, 0);
  });

  it('caps the sample buffer so a pathological stream cannot grow memory', () => {
    const t = new ItlTracker();
    for (let i = 0; i < 6000; i++) t.add(i * 5, 1);
    expect(t.stats()!.samples).toBe(5000);
  });
});
