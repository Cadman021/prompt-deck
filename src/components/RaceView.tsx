// src/components/RaceView.tsx
// Live "race" view for a running comparison: one lane per model, ordered by
// observed speed, with split times the way a timing board shows them.
//
// The bar encodes *tok/s*, not characters written. A model that rambles for
// 800 tokens is not faster than one that answers in 80 — using output length
// would make the race a verbosity contest, which is the opposite of what this
// app measures. Lane order follows live speed, so the fastest model climbs to
// the top and stays there; the ordering is the result.
//
// Performance: this board sits above the columns while every token streams in,
// so it re-renders constantly. Three things keep that cheap:
//   1. the clock only changes when the *rounded* speed could change (a tick
//      that produces the same bar is a no-op, not a repaint),
//   2. `LaneRow` is memoized, so only lanes whose numbers actually moved
//      re-render (a fast model streaming doesn't repaint a stalled one),
//   3. colors are looked up once per lane instead of once per render.
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Flag, Clock } from 'lucide-react';
import { BenchmarkMetrics } from '../types/ollama';
import { formatDurationMs } from '../utils/timeUtils';
import { modelColorHex } from '../utils/modelColor';

export interface RaceLane {
  id: string;
  /** Display name, or the blind label. */
  name: string;
  /** Identity the color derives from (blind mode: same as `name`). */
  colorKey: string;
  output: string;
  metrics: BenchmarkMetrics | null;
  loading: boolean;
  error: string | null;
  startedAt?: number | null;
  firstTokenAt?: number | null;
}

interface RaceViewProps {
  lanes: RaceLane[];
  /** True while the run is in flight — drives the clock. */
  running: boolean;
}

/** Approximate tokens from streamed text; the server's count lands on finish. */
const estimateTokens = (text: string): number => Math.round(text.length / 4);

/** Clock resolution: fast enough to feel live, coarse enough to be cheap. */
const TICK_MS = 150;

/**
 * Live tok/s for a lane. Prefers the server's number once the run is done;
 * while streaming it falls back to the same chars/4 estimate the columns use,
 * flagged with `~` so it never reads as an exact measurement.
 */
function laneSpeed(lane: RaceLane, now: number): { tps: number; live: boolean } {
  if (lane.metrics && !lane.loading) {
    return { tps: lane.metrics.tps, live: false };
  }
  if (!lane.loading || lane.firstTokenAt == null) return { tps: 0, live: true };
  const genMs = Math.max(0, now - lane.firstTokenAt);
  // Below ~0.4s the sample is too short to mean anything — show nothing
  // rather than a number that swings wildly on the first few tokens.
  if (genMs < 400) return { tps: 0, live: true };
  return { tps: Math.round(estimateTokens(lane.output) / (genMs / 1000)), live: true };
}

interface LaneRowProps {
  lane: RaceLane;
  tps: number;
  live: boolean;
  rank: number;
  top: number;
  color: string;
}

const LaneRow = React.memo<LaneRowProps>(function LaneRow({ lane, tps, live, rank, top, color }) {
  const { t } = useTranslation();
  const isLeader = rank === 0 && tps > 0;
  const width = Math.max(tps > 0 ? 4 : 0, Math.round((tps / top) * 100));
  const ttft = lane.metrics?.ttftMs ?? null;

  return (
    <li className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1">
      <span
        className={`text-micro font-mono tabular-nums text-end ${
          isLeader ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-slate-400'
        }`}
        aria-hidden="true"
      >
        {tps > 0 ? rank + 1 : '–'}
      </span>

      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span
            className="truncate text-xs font-medium text-slate-700 dark:text-slate-200"
            title={lane.name}
          >
            {lane.name}
          </span>
          {lane.error && (
            <span className="shrink-0 text-nano text-rose-700 dark:text-rose-400">
              {t('race.failed', 'failed')}
            </span>
          )}
        </div>

        {/* The track. A faint lane line keeps empty bars readable, and the
            fill uses the model's own color so a lane is traceable back to its
            column. */}
        <div
          className="mt-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"
          role="img"
          aria-label={
            lane.error
              ? t('race.laneFailed', '{{name}} failed', { name: lane.name })
              : t('race.laneSpeed', '{{name}}: {{tps}} tok/s', {
                  name: lane.name,
                  tps: tps > 0 ? tps : 0,
                })
          }
        >
          <div
            className="h-full rounded-full transition-[width] duration-150 ease-out motion-reduce:transition-none"
            style={{ width: `${width}%`, backgroundColor: color, opacity: lane.error ? 0.25 : 1 }}
          />
        </div>
      </div>

      <div className="text-end font-mono tabular-nums shrink-0 w-[5.5rem]">
        <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
          {tps > 0 ? (
            <>
              {live && <span className="opacity-60">~</span>}
              {tps}
              <span className="ms-1 text-nano font-normal text-slate-500 dark:text-slate-400">
                {t('metrics.tps')}
              </span>
            </>
          ) : (
            <span className="text-nano font-normal text-slate-500 dark:text-slate-400">
              {lane.loading ? t('race.waitingFirstToken', 'waiting for first token') : '—'}
            </span>
          )}
        </div>
        {ttft != null && ttft > 0 && (
          <div className="flex items-center justify-end gap-1 text-nano text-slate-500 dark:text-slate-400">
            <Clock className="w-2.5 h-2.5" />
            {formatDurationMs(ttft)}
          </div>
        )}
      </div>
    </li>
  );
});

export const RaceView: React.FC<RaceViewProps> = ({ lanes, running }) => {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());

  // One clock for the whole board — every lane reads the same `now`, so the
  // bars stay comparable instead of each ticking on its own schedule.
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, [running]);

  // Colors never change for a lane identity — resolve them once.
  const colors = useMemo(() => {
    const map = new Map<string, string>();
    for (const lane of lanes) map.set(lane.id, modelColorHex(lane.colorKey));
    return map;
  }, [lanes]);

  const scored = lanes.map((lane) => ({ lane, ...laneSpeed(lane, now) }));
  // Fastest first; lanes that have not produced a token yet sink to the bottom
  // but keep a stable relative order (Array#sort is stable in modern engines).
  const ordered = [...scored].sort((a, b) => b.tps - a.tps);
  const top = Math.max(1, ...scored.map((s) => s.tps));
  const fastest = scored.reduce<number>((max, s) => Math.max(max, s.tps), 0);

  if (lanes.length === 0) return null;

  return (
    <section
      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 overflow-hidden"
      aria-label={t('race.title', 'Live race')}
    >
      <header className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-slate-200 dark:border-slate-800">
        <h3 className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200">
          <Flag className="w-3.5 h-3.5 text-indigo-500" />
          {t('race.title', 'Live race')}
        </h3>
        <span className="text-micro font-mono text-slate-500 dark:text-slate-400 tabular-nums">
          {running
            ? t('race.inProgress', 'streaming — bars show live tok/s')
            : t('race.finished', 'finished — final tok/s')}
        </span>
      </header>

      <ol className="p-3 space-y-1.5">
        {ordered.map(({ lane, tps, live }, rank) => (
          <LaneRow
            key={lane.id}
            lane={lane}
            tps={tps}
            live={live}
            rank={rank}
            top={top}
            color={colors.get(lane.id) ?? '#888888'}
          />
        ))}
      </ol>

      {fastest > 0 && (
        <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-800 text-nano text-slate-500 dark:text-slate-400">
          {t(
            'race.hint',
            'Ranked by live speed. Final numbers come from the server when each run finishes.'
          )}
        </div>
      )}
    </section>
  );
};
