// src/components/ProviderSettings.tsx
import React from 'react';
import { useSettingsStore, Provider } from '../store/useSettingsStore';

export const ProviderSettings: React.FC = () => {
  const { provider, baseUrl, setProvider, setBaseUrl } = useSettingsStore();

  return (
    <div className="flex flex-col gap-2 w-full">

      <select
        value={provider}
        onChange={(e) => setProvider(e.target.value as Provider)}
        className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 focus:outline-none"
        title="LLM Provider"
      >
        <option value="ollama">Ollama</option>
        <option value="openai-compatible">LM Studio / llama.cpp</option>
      </select>

      <input
        type="text"
        value={baseUrl}
        onChange={(e) => setBaseUrl(e.target.value)}
        placeholder="Server base URL"
        className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 focus:outline-none font-mono"
        title="Server Base URL"
      />
    </div>
  );
};
