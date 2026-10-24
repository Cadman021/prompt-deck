// src/components/ShareCard.tsx
// A fixed-size card rendered off-screen and captured to PNG, for posting a
// run's result. Deliberately *not* themed: it renders on a fixed dark ground
// so the export looks the same regardless of the user's theme — a shared image
// shouldn't depend on whether the sender happened to use AMOLED.
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Crown } from 'lucide-react';
import { BenchmarkMetrics } from '../types/ollama';
import { formatDurationMs } from '../utils/timeUtils';
import { modelColorHex } from '../utils/modelColor';
import { formatCost } from '../services/modelTarget';
import { APP_VERSION } from '../version';

export interface ShareCardModel {
  /** Qualified name used as the color key. */
  name: string;
  output: string;
  metrics: BenchmarkMetrics;
  costUsd?: number | null;
  isWinner: boolean;
}

interface ShareCardProps {
  prompt: string;
  models: ShareCardModel[];
  /** Provider host, e.g. "localhost:11434" — signals local/private runs. */
  host: string | null;
}

/** Card width in CSS px; the capture runs at 2x so the PNG is 1080 wide. */
const CARD_WIDTH = 540;

export const ShareCard = React.forwardRef<HTMLDivElement, ShareCardProps>(
  ({ prompt, models, host }, ref) => {
    const { t } = useTranslation();

    // Scale bars against the fastest model so the card reads as a ranking at
    // a glance; TTFT is drawn on its own absolute scale because it is not
    // comparable to tok/s.
    const maxTps = Math.max(1, ...models.map((m) => m.metrics.tps));
    const maxTtft = Math.max(1, ...models.map((m) => m.metrics.ttftMs || 0));

    return (
      <div
        ref={ref}
        style={{ width: CARD_WIDTH }}
        className="bg-slate-950 text-slate-100 p-7 font-sans antialiased"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-500 grid place-items-center">
              <svg
                viewBox="0 0 24 24"
                className="w-4 h-4"
                fill="none"
                stroke="white"
                strokeWidth={2.5}
              >
                <path d="M4 17l6-6-6-6M12 19h8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="text-sm font-bold tracking-tight">PromptDeck</span>
          </div>
          <span className="text-nano font-mono text-slate-500">
            {host ? `local · ${host}` : t('share.cloud', 'cloud')} · v{APP_VERSION}
          </span>
        </div>

        {/* The prompt — the subject of the comparison, so it leads. */}
        <p className="text-[0.9375rem] leading-snug text-slate-200 font-medium line-clamp-3 mb-5">
          {prompt}
        </p>

        {/* Results, ordered as given (App passes them in column order). */}
        <div className="space-y-3">
          {models.map((m) => {
            const color = modelColorHex(m.name);
            const short = m.name.split('/').pop() ?? m.name;
            return (
              <div key={m.name}>
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <span className="flex items-center gap-1.5 min-w-0">
                    {m.isWinner && <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-xs font-mono truncate text-slate-200" title={m.name}>
                      {short}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-slate-300">
                    {m.metrics.tpsEstimated ? '~' : ''}
                    {m.metrics.tps}
                    <span className="text-slate-500 ms-1 text-nano">tok/s</span>
                  </span>
                </div>

                <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(3, Math.round((m.metrics.tps / maxTps) * 100))}%`,
                      backgroundColor: color,
                    }}
                  />
                </div>

                <div className="mt-1 flex items-center gap-3 text-nano font-mono text-slate-500 tabular-nums">
                  <span>
                    TTFT {formatDurationMs(m.metrics.ttftMs)}
                    <span className="opacity-60">
                      {' '}
                      ({Math.round(((m.metrics.ttftMs || 0) / maxTtft) * 100)}%)
                    </span>
                  </span>
                  {m.metrics.tokenSource === 'server' && (
                    <span>{m.metrics.completionTokens ?? '—'} tok</span>
                  )}
                  {m.costUsd != null && <span>{formatCost(m.costUsd)}</span>}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 pt-3 border-t border-slate-800 flex items-center justify-between text-nano text-slate-500">
          <span>{t('share.tagline', 'Local, private, side-by-side LLM benchmarking')}</span>
          <span className="font-mono">github.com/Cadman021</span>
        </div>
      </div>
    );
  }
);

ShareCard.displayName = 'ShareCard';
