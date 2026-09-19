// src/data/cloudProviders.ts
// Curated catalog of cloud LLM providers, 9Router-style.
//
// v1 scope: only `openai-compatible` providers. They work with the existing
// streaming client plus an `Authorization: Bearer` header — no protocol
// adapters needed. Native Anthropic/Gemini protocols can join later as
// `protocol: 'anthropic' | 'gemini'` entries (kept out of the catalog until
// the client speaks their wire format).
//
// ICONS: drop 128×128 PNGs in `public/providers/` named `<id>.png`
// (e.g. `public/providers/openrouter.png`). `icon` below points at that path;
// when the file is missing the UI falls back to the initials tile.

export type CloudProtocol = 'openai-compatible';

export interface CloudProviderDef {
  /** Stable id, also used as the connection key (e.g. `cloud:openrouter`). */
  id: string;
  name: string;
  defaultBaseUrl: string;
  protocol: CloudProtocol;
  docsUrl: string;
  /** Tile background (brand-ish color, used as fallback behind the icon). */
  color: string;
  /** 1–2 letters rendered on the tile when no icon file exists. */
  initials: string;
  /** Optional icon path under `public/` (e.g. `/providers/openrouter.png`). */
  icon?: string;
  /** True for providers with a usable free tier — shown in the Free Tier section. */
  freeTier?: boolean;
  /** i18n key for the info banner; falls back to `infoDefault`. */
  infoKey?: string;
  infoDefault?: string;
  /** Suggested model ids shown as quick-add chips on the detail page. */
  suggestedModels?: string[];
}

export interface CustomProviderDef extends CloudProviderDef {
  custom: true;
}

export const CLOUD_CATALOG: CloudProviderDef[] = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    protocol: 'openai-compatible',
    docsUrl: 'https://openrouter.ai/docs',
    color: '#8b7cf6',
    initials: 'OR',
    freeTier: true,
    icon: '/providers/openrouter.png',
    infoKey: 'cloud.info.openrouter',
    infoDefault: 'One key for hundreds of models. Many offer free tiers with rate limits.',
    suggestedModels: [
      'openai/gpt-4o-mini',
      'anthropic/claude-3.5-sonnet',
      'meta-llama/llama-3.3-70b-instruct',
      'google/gemini-flash-1.5',
      'deepseek/deepseek-chat',
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    protocol: 'openai-compatible',
    docsUrl: 'https://api-docs.deepseek.com',
    color: '#4d6bfe',
    initials: 'DS',
    icon: '/providers/deepseek.png',
    infoKey: 'cloud.info.deepseek',
    infoDefault: 'Official DeepSeek API: deepseek-chat (V3) and deepseek-reasoner (R1).',
    suggestedModels: ['deepseek-chat', 'deepseek-reasoner'],
  },
  {
    id: 'groq',
    name: 'Groq',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    protocol: 'openai-compatible',
    docsUrl: 'https://console.groq.com/docs',
    color: '#f55036',
    initials: 'G',
    freeTier: true,
    icon: '/providers/groq.png',
    infoKey: 'cloud.info.groq',
    infoDefault: 'Ultra-low-latency inference. Free tier with daily rate limits.',
    suggestedModels: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
  },
  {
    id: 'together',
    name: 'Together AI',
    defaultBaseUrl: 'https://api.together.xyz/v1',
    protocol: 'openai-compatible',
    docsUrl: 'https://docs.together.ai',
    color: '#0b63e5',
    initials: 'TO',
    icon: '/providers/together.png',
    infoKey: 'cloud.info.together',
    infoDefault: 'Open-source models API with free trial credit for new accounts.',
    suggestedModels: [
      'meta-llama/Llama-3.3-70B-Instruct-Turbo',
      'mistralai/Mixtral-8x7B-Instruct-v0.1',
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    protocol: 'openai-compatible',
    docsUrl: 'https://platform.openai.com/docs',
    color: '#10a37f',
    initials: 'AI',
    icon: '/providers/openai.png',
    infoKey: 'cloud.info.openai',
    infoDefault: 'Official OpenAI API: GPT, o-series reasoning and embeddings.',
    suggestedModels: ['gpt-4o-mini', 'gpt-4o', 'o4-mini'],
  },
  {
    id: 'xai',
    name: 'xAI (Grok)',
    defaultBaseUrl: 'https://api.x.ai/v1',
    protocol: 'openai-compatible',
    docsUrl: 'https://docs.x.ai',
    color: '#000000',
    initials: 'X',
    icon: '/providers/xai.png',
    infoKey: 'cloud.info.xai',
    infoDefault: 'Official xAI API for Grok models, OpenAI-compatible.',
    suggestedModels: ['grok-3-mini', 'grok-3', 'grok-2-1212'],
  },
  {
    id: 'kimi',
    name: 'Kimi (Moonshot)',
    defaultBaseUrl: 'https://api.moonshot.ai/v1',
    protocol: 'openai-compatible',
    docsUrl: 'https://platform.moonshot.ai/docs',
    color: '#1a1a1a',
    initials: 'K',
    freeTier: true,
    icon: '/providers/kimi.png',
    infoKey: 'cloud.info.kimi',
    infoDefault: 'Moonshot AI platform: Kimi K2 and Moonshot v1 models with free trial credit.',
    suggestedModels: ['kimi-k2', 'moonshot-v1-32k', 'moonshot-v1-8k'],
  },
  {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    defaultBaseUrl: 'https://integrate.api.nvidia.com/v1',
    protocol: 'openai-compatible',
    docsUrl: 'https://docs.api.nvidia.com/nim',
    color: '#76b900',
    initials: 'NV',
    freeTier: true,
    icon: '/providers/nvidia.png',
    infoKey: 'cloud.info.nvidia',
    infoDefault: 'Free access for NVIDIA Developer Program members (prototyping & testing).',
    suggestedModels: [
      'meta/llama-3.1-70b-instruct',
      'deepseek-ai/deepseek-r1',
      'moonshotai/kimi-k2-instruct',
    ],
  },
  {
    id: 'ollama-cloud',
    name: 'Ollama Cloud',
    defaultBaseUrl: 'https://ollama.com/v1',
    protocol: 'openai-compatible',
    docsUrl: 'https://ollama.com',
    color: '#000000',
    initials: 'OC',
    freeTier: true,
    icon: '/providers/ollama-cloud.png',
    infoKey: 'cloud.info.ollama-cloud',
    infoDefault: 'Run big open models in the cloud with your Ollama account.',
    suggestedModels: ['qwen3:235b', 'deepseek-v3.1:671b', 'gpt-oss:120b'],
  },
  {
    id: 'gemini',
    name: 'Gemini',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    protocol: 'openai-compatible',
    docsUrl: 'https://ai.google.dev/gemini-api/docs/openai',
    color: '#1c7dff',
    initials: 'Ge',
    freeTier: true,
    icon: '/providers/gemini.png',
    infoKey: 'cloud.info.gemini',
    infoDefault: 'Google AI Studio key via the OpenAI-compatibility endpoint. Generous free tier.',
    suggestedModels: ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-pro'],
  },
];
