// src/components/ReportPrintView.tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { MarkdownRenderer } from './MarkdownRenderer';
import { BenchmarkResult } from '../services/dbService';

interface ReportPrintViewProps {
  prompt: string;
  results: BenchmarkResult[];
}

/**
 * Off-screen, always-light-themed report layout used only as a capture
 * source for the PDF exporter (via html2canvas). Never shown to the user
 * directly — see the fixed/hidden wrapper around it in App.tsx.
 */
export const ReportPrintView = React.forwardRef<HTMLDivElement, ReportPrintViewProps>(
  ({ prompt, results }, ref) => {
    const { t } = useTranslation();
    return (
      <div
        ref={ref}
        className="bg-white text-slate-900"
        style={{ width: '800px', padding: '32px', fontFamily: 'sans-serif' }}
      >
        <h1 className="text-2xl font-bold text-indigo-600 mb-1">{t('report.title', '📊 PromptDeck Benchmark Report')}</h1>
        <p className="text-xs text-slate-400 mb-6">{new Date().toLocaleString()}</p>

        <h2 className="text-sm font-bold text-slate-700 mb-1">{t('report.prompt', 'Prompt')}</h2>
        <blockquote className="border-l-4 border-indigo-400 pl-3 text-sm text-slate-600 mb-6 whitespace-pre-wrap">
          {prompt || t('report.empty', '(empty)')}
        </blockquote>

        <h2 className="text-sm font-bold text-slate-700 mb-2">{t('report.summary', '⚡ Performance Summary')}</h2>
        <table className="w-full text-xs border-collapse mb-8 border border-slate-300">
          <thead>
            <tr className="bg-slate-100">
              <th className="p-2 border border-slate-300 text-left">{t('report.model', 'Model')}</th>
              <th className="p-2 border border-slate-300 text-left">{t('report.tps', 'TPS (tok/s)')}</th>
              <th className="p-2 border border-slate-300 text-left">{t('report.ttft', 'TTFT (ms)')}</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => (
              <tr key={i}>
                <td className="p-2 border border-slate-300 font-mono">{r.model}</td>
                <td className="p-2 border border-slate-300">
                  {r.tps ? `${r.tpsEstimated ? '~' : ''}${r.tps.toFixed(2)}` : 'N/A'}
                </td>
                <td className="p-2 border border-slate-300">{r.ttft ? r.ttft : 'N/A'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className="text-sm font-bold text-slate-700 mb-3">{t('report.outputs', '📝 Model Outputs')}</h2>
        {results.map((r, i) => (
          <div key={i} className="mb-8 pb-6 border-b border-slate-200 last:border-0">
            <h3 className="text-sm font-bold text-indigo-600 mb-2">🤖 {r.model}</h3>
            <div className="text-sm">
              {r.output ? (
                <MarkdownRenderer content={r.output} />
              ) : (
                <span className="italic text-slate-400">{t('report.noOutput', 'No output')}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }
);

ReportPrintView.displayName = 'ReportPrintView';
