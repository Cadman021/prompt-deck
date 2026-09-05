// src/components/BenchmarkChart.tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { BenchmarkMetrics } from '../types/ollama';

interface ModelMetric {
  name: string;
  metrics: BenchmarkMetrics;
}

interface BenchmarkChartProps {
  entries: ModelMetric[];
}

const COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6'];

export const BenchmarkChart: React.FC<BenchmarkChartProps> = ({ entries }) => {
  const { t } = useTranslation();
  if (!entries || entries.length < 2) return null;

  const tpsData = entries.map((e, i) => ({
    name: e.name,
    value: e.metrics.tps,
    fill: COLORS[i % COLORS.length],
  }));

  const ttftData = entries.map((e, i) => ({
    name: e.name,
    value: e.metrics.ttftMs,
    fill: COLORS[i % COLORS.length],
  }));

  return (
    <div className="grid grid-cols-2 gap-4 p-4 bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
      {/* TPS Chart */}
      <div>
        <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2 text-center">
          Tokens / Sec ({t("Chart.moreIsBetter")})
        </h3>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={tpsData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-800" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 10, fill: 'currentColor' }}
              className="text-slate-500 dark:text-slate-400"
              interval={0}
              angle={entries.length > 3 ? -20 : 0}
              textAnchor={entries.length > 3 ? 'end' : 'middle'}
              height={entries.length > 3 ? 40 : 20}
            />
            <YAxis tick={{ fontSize: 11, fill: 'currentColor' }} className="text-slate-500 dark:text-slate-400" />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '8px',
                fontSize: '12px',
                color: '#f1f5f9',
              }}
              labelStyle={{ color: '#f1f5f9', fontWeight: 600, marginBottom: 4 }}
              itemStyle={{ color: '#f1f5f9' }}
              formatter={(value) => [`${value} tok/s`, 'TPS']}
            />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              {tpsData.map((entry, index) => (
                <Cell key={`cell-tps-${index}`} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* TTFT Chart */}
      <div>
        <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2 text-center">
          Time To First Token — ms ({t("Chart.lessIsBetter")})
        </h3>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={ttftData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-800" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 10, fill: 'currentColor' }}
              className="text-slate-500 dark:text-slate-400"
              interval={0}
              angle={entries.length > 3 ? -20 : 0}
              textAnchor={entries.length > 3 ? 'end' : 'middle'}
              height={entries.length > 3 ? 40 : 20}
            />
            <YAxis tick={{ fontSize: 11, fill: 'currentColor' }} className="text-slate-500 dark:text-slate-400" />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '8px',
                fontSize: '12px',
                color: '#f1f5f9',
              }}
              labelStyle={{ color: '#f1f5f9', fontWeight: 600, marginBottom: 4 }}
              itemStyle={{ color: '#f1f5f9' }}
              formatter={(value) => [`${value} ms`, 'TTFT']}
            />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              {ttftData.map((entry, index) => (
                <Cell key={`cell-ttft-${index}`} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};