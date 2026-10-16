// src/components/JudgePanel.tsx
// LLM-as-judge: one model scores finished bench outputs against a fixed
// rubric. Outputs go in BLIND (Response 1..N) and are mapped back here.
// Advisory only — the judge never votes; the human still crowns.
import React, { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Scale, Play, Square, Crown } from 'lucide-react';
import { useSettingsStore } from '../store/useSettingsStore';
import type { OllamaModel } from '../types/ollama';
import type { CloudGroup, ModelSource } from '../services/modelTarget';
import { resolveRunEndpoint, runTargetStream } from '../services/runTarget';
import {
  buildJudgePrompt,
  decodeJudgeTarget,
  parseJudgeResponse,
  type JudgeVerdict,
} from '../services/judge';

export interface JudgeItem {
  slotId: string;
  qualified: string;
  output: string;
}

interface JudgePanelProps {
  prompt: string;
  items: JudgeItem[];
  models: OllamaModel[];
  cloudGroups: CloudGroup[];
}

const encodeValue = (source: ModelSource, model: string): string =>
  JSON.stringify({
    kind: source.kind,
    providerId: source.kind === 'cloud' ? source.providerId : undefined,
    model,
  });

export const JudgePanel: React.FC<JudgePanelProps> = ({ prompt, items, models, cloudGroups }) => {
  const { t } = useTranslation();
  const { provider, baseUrl } = useSettingsStore();

  const defaultTarget = useMemo(() => {
    if (models.length > 0) return encodeValue({ kind: 'local' }, models[0].name);
    const g = cloudGroups[0];
    if (g && g.models[0])
      return encodeValue({ kind: 'cloud', providerId: g.providerId }, g.models[0]);
    return '';
  }, [models, cloudGroups]);

  const [targetValue, setTargetValue] = useState('');
  const [running, setRunning] = useState(false);
  const [verdict, setVerdict] = useState<JudgeVerdict | null>(null);
  const [parseError, setParseError] = useState(false);
  const [raw, setRaw] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const activeValue = targetValue || defaultTarget;

  const runJudge = () => {
    if (running || !activeValue || items.length < 2) return;
    const target = decodeJudgeTarget(activeValue);
    if (!target) return;
    const { source, model } = target;
    const resolved = resolveRunEndpoint(source, model, { provider, baseUrl });
    if ('error' in resolved) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setVerdict(null);
    setParseError(false);
    setRaw('');
    // Deterministic judging: low temperature, capped length.
    runTargetStream(
      resolved.run.config,
      {
        model: resolved.run.model,
        prompt: buildJudgePrompt(
          prompt,
          items.map((i) => i.output)
        ),
        temperature: 0.2,
        maxTokens: 1024,
      },
      controller.signal,
      {
        onDone: (output, _metrics, _error, aborted) => {
          setRunning(false);
          if (aborted) return;
          setRaw(output);
          const parsed = parseJudgeResponse(output, items.length);
          if ('verdict' in parsed) {
            setVerdict(parsed.verdict);
          } else {
            setParseError(true);
          }
        },
      }
    );
  };

  const stopJudge = () => {
    abortRef.current?.abort();
    setRunning(false);
  };

  const winnerItem = verdict ? items[verdict.winner - 1] : undefined;

  return (
    <section className="rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex-wrap">
        <Scale className="w-4 h-4 text-violet-500" />
        <h3 className="text-xs font-bold">{t('judge.title', 'LLM Judge')}</h3>
        <span className="text-[11px] text-slate-400 dark:text-slate-500">
          {t('judge.subtitle', 'One model scores all outputs blind against a fixed rubric')}
        </span>
        <div className="flex-1" />
        <select
          value={activeValue}
          onChange={(e) => setTargetValue(e.target.value)}
          disabled={running}
          className="text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 focus:outline-none max-w-[220px]"
          title={t('judge.judgeModel', 'Judge model')}
        >
          <optgroup label={t('bench.localModels', 'Local models')}>
            {models.map((m) => (
              <option key={`local:${m.name}`} value={encodeValue({ kind: 'local' }, m.name)}>
                {m.name}
              </option>
            ))}
          </optgroup>
          {cloudGroups.map((g) => (
            <optgroup key={g.providerId} label={`☁ ${g.name}`}>
              {g.models.map((m) => (
                <option
                  key={`cloud:${g.providerId}:${m}`}
                  value={encodeValue({ kind: 'cloud', providerId: g.providerId }, m)}
                >
                  {m}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {running ? (
          <button
            onClick={stopJudge}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-rose-600 hover:bg-rose-500 text-white transition"
          >
            <Square className="w-3 h-3 fill-current" />
            {t('testsuite.stop', 'Stop')}
          </button>
        ) : (
          <button
            onClick={runJudge}
            disabled={!activeValue}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition disabled:opacity-50"
          >
            <Play className="w-3 h-3 fill-current" />
            {t('judge.run', 'Judge')}
          </button>
        )}
      </div>

      {(verdict || parseError || running) && (
        <div className="p-3.5 space-y-2">
          {running && !verdict && (
            <p className="text-xs text-slate-500 animate-pulse">{t('judge.judging', 'Judging…')}</p>
          )}
          {verdict && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {verdict.scores.map((s) => {
                  const item = items[s.index - 1];
                  const isWinner = s.index === verdict.winner;
                  return (
                    <div
                      key={s.index}
                      className={`p-2.5 rounded-lg border text-xs ${
                        isWinner
                          ? 'border-violet-400 dark:border-violet-500/60 bg-violet-50/60 dark:bg-violet-950/30'
                          : 'border-slate-200 dark:border-slate-700/60'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        {isWinner && <Crown className="w-3.5 h-3.5 text-violet-500" />}
                        <span className="font-mono font-bold truncate" title={item?.qualified}>
                          {item?.qualified}
                        </span>
                        <span className="ms-auto font-mono font-bold text-violet-600 dark:text-violet-300">
                          {s.score}/10
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden mb-1.5">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
                          style={{ width: `${s.score * 10}%` }}
                        />
                      </div>
                      {s.reason && (
                        <p
                          className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed"
                          dir="auto"
                        >
                          {s.reason}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
              {winnerItem && (
                <p className="text-[11px] text-violet-600 dark:text-violet-300 font-semibold">
                  {t('judge.pick', "Judge's pick")}:{' '}
                  <span className="font-mono">{winnerItem.qualified}</span>
                </p>
              )}
            </>
          )}
          {parseError && (
            <details className="text-xs">
              <summary className="text-rose-500 cursor-pointer">
                {t(
                  'judge.parseError',
                  "Couldn't parse the verdict as JSON — read the raw response"
                )}
              </summary>
              <pre
                className="mt-1.5 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700/60 whitespace-pre-wrap font-mono text-[11px] max-h-48 overflow-y-auto"
                dir="auto"
              >
                {raw || '—'}
              </pre>
            </details>
          )}
        </div>
      )}
    </section>
  );
};
