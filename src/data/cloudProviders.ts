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
  /** Direct link to the page where users create an API key. */
  keyUrl: string;
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
    keyUrl: 'https://openrouter.ai/keys',
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
    keyUrl: 'https://platform.deepseek.com/api_keys',
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
    keyUrl: 'https://console.groq.com/keys',
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
    keyUrl: 'https://api.together.ai/settings/api-keys',
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
    keyUrl: 'https://platform.openai.com/api-keys',
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
    keyUrl: 'https://console.x.ai/',
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
    keyUrl: 'https://platform.moonshot.ai/console/api-keys',
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
    keyUrl: 'https://build.nvidia.com/',
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
    keyUrl: 'https://ollama.com/settings/keys',
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
    keyUrl: 'https://aistudio.google.com/apikey',
    color: '#1c7dff',
    initials: 'Ge',
    freeTier: true,
    icon: '/providers/gemini.png',
    infoKey: 'cloud.info.gemini',
    infoDefault: 'Google AI Studio key via the OpenAI-compatibility endpoint. Generous free tier.',
    suggestedModels: ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-pro'],
  },
  {
    id: 'kilo-gateway',
    name: 'Kilo Gateway',
    defaultBaseUrl: 'https://api.kilo.ai/api/gateway',
    protocol: 'openai-compatible',
    keyUrl: 'https://app.kilo.ai/',
    color: '#f9ed68',
    initials: 'KG',
    freeTier: true,
    icon: '/providers/kilo-gateway.png',
    infoKey: 'cloud.info.kilo-gateway',
    infoDefault: 'One key for hundreds of models. Many offer free tiers with rate limits.',
    suggestedModels: [
      'google/gemma-4-26b-a4b-it:free',
      'google/gemma-4-26b-a4b-it',
      'anthropic/claude-opus-4.7',
      'openai/gpt-5.4',
      'x-ai/grok-4',
    ],
  },
  {
    id: 'bazaarlink',
    name: 'Bazaarlink',
    defaultBaseUrl: 'https://api.bazaarlink.ai/v1',
    protocol: 'openai-compatible',
    keyUrl: 'https://bazaarlink.ai/en/docs',
    color: '#1c7dff',
    initials: 'BL',
    freeTier: true,
    icon: '/providers/bazaarlink.png',
    infoKey: 'cloud.info.bazaarlink',
    infoDefault: 'One Interface.Every AI Model.',
    suggestedModels: ['deepseek/deepseek-v4-flash-0731free', 'qwen/qwen3.7-flash'],
  },
  {
    id: 'modelark',
    name: 'BytePlus ModelArk',
    defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    protocol: 'openai-compatible',
    keyUrl: 'https://docs.byteplus.com/en/docs/ModelArk/1364661',
    color: '#0066ff',
    initials: 'MA',
    icon: '/providers/modelark.png',
    infoKey: 'cloud.info.modelark',
    infoDefault: 'BytePlus ModelArk (Beijing region): Doubao and DeepSeek models via OpenAI-compatible API.',
    suggestedModels: ['doubao-seed-1-6-251015', 'doubao-seed-1-6-flash-250828'],
  },
  {
    id: 'poolside',
    name: 'Poolside',
    defaultBaseUrl: 'https://inference.poolside.ai/v1',
    protocol: 'openai-compatible',
    keyUrl: 'https://platform.poolside.ai/api-keys',
    color: '#0066ff',
    initials: 'P',
    icon: '/providers/poolside.png',
    infoKey: 'cloud.info.poolside',
    infoDefault: 'Poolside AI: Proprietary Laguna foundation models and autonomous software engineering agents for enterprise development via API and local deployment.',
    suggestedModels: ['poolside/laguna-xs-2.1', 'poolside/laguna-s-2.1'],
  },
  {
    id: 'agnes',
    name: 'Agnes',
    defaultBaseUrl: 'https://apihub.agnes-ai.com/v1',
    protocol: 'openai-compatible',
    keyUrl: 'https://platform.agnes-ai.com/',
    color: '#0c0e11',
    initials: 'A',
    freeTier: true,
    icon: '/providers/agnes.png',
    infoKey: 'cloud.info.agnes',
    infoDefault: 'OpenAI-compatible gateway from Agnes AI, offering free API credits on sign-up. Accepts a bearer token or an x-api-key header.',
    suggestedModels: ['agnes-3.0-flash', 'agnes-2.5-pro-alpha'],
  },
  {
    id: 'xiaomi-mimo',
    name: 'Xiaomi MiMo',
    defaultBaseUrl: 'https://api.xiaomimimo.com/v1',
    protocol: 'openai-compatible',
    keyUrl: 'https://platform.xiaomimimo.com/console/api-keys',
    color: '#ff9e49',
    initials: 'Mi',
    icon: '/providers/xiaomi-mimo.png',
    infoKey: 'cloud.info.xiaomi-mimo',
    infoDefault: 'Xiaomi MiMo gateway: mimo-v2.6-pro, flash and 2.5 models via OpenAI-compatible API.',
    suggestedModels: ['mimo-v2.6-pro', 'mimo-v2.6-flash', 'mimo-v2.5'],
  },
  {
    id: 'mistral',
    name: 'Mistral',
    defaultBaseUrl: 'https://api.mistral.ai/v1',
    protocol: 'openai-compatible',
    keyUrl: 'https://console.mistral.ai/api-keys',
    color: '#f57621',
    initials: 'M',
    icon: '/providers/mistral.png',
    infoKey: 'cloud.info.mistral',
    infoDefault: 'Official Mistral API (La Plateforme): Large, Medium and Codestral models, OpenAI-compatible.',
    suggestedModels: ['mistral-large-latest', 'mistral-medium-latest', 'codestral-latest'],
  },
  {
    id: 'bai',
    name: 'B.AI',
    defaultBaseUrl: 'https://api.b.ai/v1',
    protocol: 'openai-compatible',
    keyUrl: 'https://b.ai/',
    color: '#b7c1c3',
    initials: 'B',
    icon: '/providers/bai.png',
    infoKey: 'cloud.info.bai',
    infoDefault: 'B.AI gateway with a large model catalogue. Model ids are fetched live from the provider.',
    suggestedModels: ['gpt-6-astra', 'glm-5.2'],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    protocol: 'openai-compatible',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    color: '#ff9341',
    initials: 'An',
    icon: '/providers/anthropic.png',
    infoKey: 'cloud.info.anthropic',
    infoDefault: 'Official Anthropic API via OpenAI SDK compatibility: Claude Opus, Sonnet and Haiku with Bearer auth.',
    suggestedModels: ['claude-opus-5-5', 'claude-sonnet-4-6'],
  },
];
