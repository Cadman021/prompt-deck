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
  /**
   * Base-URL placeholders the provider needs before a request can be made,
   * e.g. Cloudflare's `{ACCOUNT_ID}`. Each placeholder becomes an extra field
   * in the Add/Edit key dialog and is stored per connection (`connectionVars`).
   */
  urlVars?: CloudUrlVar[];
}

/**
 * A placeholder inside `defaultBaseUrl` that the user fills in per connection
 * (Cloudflare Workers AI account id, regional subdomains, …).
 */
export interface CloudUrlVar {
  /** Placeholder token as it appears in the URL, `{ACCOUNT_ID}` style. */
  token: string;
  /** Short field label, e.g. `Account ID`. */
  labelKey: string;
  labelDefault: string;
  /** Example value shown as the input placeholder. */
  example: string;
  /** Where to find this value — rendered as a link under the field. */
  helpUrl: string;
  helpKey: string;
  helpDefault: string;
  /** Missing values block saving (a wrong account id can never connect). */
  required?: boolean;
  /** Narrower input grid column count hint is handled by the dialog. */
  secret?: boolean;
}

/** Replace every `{TOKEN}` placeholder in a base URL with its stored value. */
export function applyUrlVars(
  baseUrl: string,
  vars: Record<string, string> | undefined
): string {
  if (!vars) return baseUrl;
  return baseUrl.replace(/\{([A-Z0-9_]+)\}/g, (match, token: string) => {
    const value = vars[token]?.trim();
    return value || match;
  });
}

/** Tokens still unfilled in `baseUrl` — used to explain a failed resolve. */
export function missingUrlVars(
  baseUrl: string,
  vars: Record<string, string> | undefined
): string[] {
  const found: string[] = [];
  for (const [, token] of baseUrl.matchAll(/\{([A-Z0-9_]+)\}/g)) {
    if (!vars?.[token]?.trim()) found.push(token);
  }
  return found;
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
  // ── Cloud aggregators & inference platforms ────────────────────────────
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    defaultBaseUrl: 'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/v1',
    protocol: 'openai-compatible',
    keyUrl: 'https://dash.cloudflare.com/profile/api-tokens',
    color: '#f38020',
    initials: 'CF',
    freeTier: true,
    icon: '/providers/cloudflare.png',
    infoKey: 'cloud.info.cloudflare',
    infoDefault: 'Cloudflare Workers AI via its OpenAI-compatible endpoint. Replace {ACCOUNT_ID} in the base URL with your account id.',
    suggestedModels: ['@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/qwen/qwen2.5-coder-32b-instruct'],
    urlVars: [
      {
        token: 'ACCOUNT_ID',
        labelKey: 'cloud.urlVar.accountId',
        labelDefault: 'Account ID',
        example: 'abc123def456…',
        helpUrl: 'https://dash.cloudflare.com/',
        helpKey: 'cloud.urlVar.accountIdHelp',
        helpDefault: 'Find your Account ID in the right sidebar of dash.cloudflare.com.',
        required: true,
      },
    ],
  },
  {
    id: 'venice',
    name: 'Venice AI',
    defaultBaseUrl: 'https://api.venice.ai/api/v1',
    protocol: 'openai-compatible',
    keyUrl: 'https://venice.ai/settings/api',
    color: '#1b1b1f',
    initials: 'V',
    freeTier: true,
    icon: '/providers/venice.png',
    infoKey: 'cloud.info.venice',
    infoDefault: 'Private, uncensored inference. Free tier includes a daily allowance of text tokens.',
    suggestedModels: ['venice-uncensored', 'qwen3-235b-a22b', 'deepseek-v3.1'],
  },
  {
    id: 'siliconflow',
    name: 'SiliconFlow',
    defaultBaseUrl: 'https://api.siliconflow.cn/v1',
    protocol: 'openai-compatible',
    keyUrl: 'https://cloud.siliconflow.cn/account/ak',
    color: '#5b5bd6',
    initials: 'SF',
    freeTier: true,
    icon: '/providers/siliconflow.png',
    infoKey: 'cloud.info.siliconflow',
    infoDefault: 'Chinese model gateway (global endpoint: api.siliconflow.com) with a generous free tier.',
    suggestedModels: ['deepseek-ai/DeepSeek-V3', 'Qwen/Qwen3-235B-A22B', 'moonshotai/Kimi-K2-Instruct'],
  },
  {
    id: 'huggingface',
    name: 'Hugging Face',
    defaultBaseUrl: 'https://router.huggingface.co/v1',
    protocol: 'openai-compatible',
    keyUrl: 'https://huggingface.co/settings/tokens',
    color: '#ffd21e',
    initials: 'HF',
    freeTier: true,
    icon: '/providers/huggingface.png',
    infoKey: 'cloud.info.huggingface',
    infoDefault: 'Hugging Face Inference Providers router: one token for many upstream providers.',
    suggestedModels: ['Qwen/Qwen3-235B-A22B', 'meta-llama/Llama-3.3-70B-Instruct'],
  },
  {
    id: 'hyperbolic',
    name: 'Hyperbolic',
    defaultBaseUrl: 'https://api.hyperbolic.xyz/v1',
    protocol: 'openai-compatible',
    keyUrl: 'https://app.hyperbolic.xyz/settings',
    color: '#00a3ff',
    initials: 'Hy',
    icon: '/providers/hyperbolic.png',
    infoKey: 'cloud.info.hyperbolic',
    infoDefault: 'Cheap open-model inference (Llama, Qwen, DeepSeek) with OpenAI-compatible API.',
    suggestedModels: ['meta-llama/Llama-3.3-70B-Instruct', 'Qwen/Qwen2.5-72B-Instruct'],
  },
  {
    id: 'featherless',
    name: 'Featherless',
    defaultBaseUrl: 'https://api.featherless.ai/v1',
    protocol: 'openai-compatible',
    keyUrl: 'https://featherless.ai/account/api-keys',
    color: '#0b0b0d',
    initials: 'FL',
    icon: '/providers/featherless.png',
    infoKey: 'cloud.info.featherless',
    infoDefault: 'Flat-fee subscription to a huge catalogue of open models, one model loaded at a time.',
    suggestedModels: ['deepseek-ai/DeepSeek-V3-0324', 'Qwen/Qwen3-235B-A22B'],
  },
  {
    id: 'nous-research',
    name: 'Nous Research',
    defaultBaseUrl: 'https://inference-api.nousresearch.com/v1',
    protocol: 'openai-compatible',
    keyUrl: 'https://portal.nousresearch.com/',
    color: '#1a1a1a',
    initials: 'NR',
    icon: '/providers/nous-research.png',
    infoKey: 'cloud.info.nous-research',
    infoDefault: 'Nous Portal API for Hermes and other open models.',
    suggestedModels: ['Hermes-4-405B', 'Hermes-4-70B'],
  },
  {
    id: 'llm7',
    name: 'LLM7',
    defaultBaseUrl: 'https://api.llm7.io/v1',
    protocol: 'openai-compatible',
    keyUrl: 'https://token.llm7.io/',
    color: '#4b5563',
    initials: 'L7',
    freeTier: true,
    icon: '/providers/llm7.png',
    infoKey: 'cloud.info.llm7',
    infoDefault: 'Community gateway that forwards to many upstream models, including free ones.',
    suggestedModels: ['gpt-4o-mini', 'deepseek-chat'],
  },
  {
    id: 'morph',
    name: 'Morph',
    defaultBaseUrl: 'https://api.morphllm.com/v1',
    protocol: 'openai-compatible',
    keyUrl: 'https://morphllm.com/dashboard',
    color: '#7ee600',
    initials: 'M',
    icon: '/providers/morph.png',
    infoKey: 'cloud.info.morph',
    infoDefault: 'Fast apply/edit models for coding agents (morph-v3) plus chat models.',
    suggestedModels: ['morph-v3-large', 'morph-v3-fast'],
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    defaultBaseUrl: 'https://api.cerebras.ai/v1',
    protocol: 'openai-compatible',
    keyUrl: 'https://cloud.cerebras.ai/',
    color: '#f55036',
    initials: 'Ce',
    freeTier: true,
    icon: '/providers/cerebras.png',
    infoKey: 'cloud.info.cerebras',
    infoDefault: 'Wafer-scale inference: fastest token throughput on open models. Free tier available.',
    suggestedModels: ['llama3.1-8b', 'llama-3.3-70b', 'qwen-3-32b'],
  },
  {
    id: 'fireworks',
    name: 'Fireworks AI',
    defaultBaseUrl: 'https://api.fireworks.ai/inference/v1',
    protocol: 'openai-compatible',
    keyUrl: 'https://fireworks.ai/account/api-keys',
    color: '#ff5c35',
    initials: 'FW',
    icon: '/providers/fireworks.png',
    infoKey: 'cloud.info.fireworks',
    infoDefault: 'High-throughput serving of open models and fine-tunes.',
    suggestedModels: [
      'accounts/fireworks/models/deepseek-v3',
      'accounts/fireworks/models/llama-v3p3-70b-instruct',
    ],
  },
  {
    id: 'alibaba',
    name: 'Alibaba',
    defaultBaseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    protocol: 'openai-compatible',
    keyUrl: 'https://bailian.console.alibabacloud.com/',
    color: '#ff6a00',
    initials: 'Al',
    icon: '/providers/alibaba.png',
    infoKey: 'cloud.info.alibaba',
    infoDefault: 'DashScope (Model Studio) international endpoint: Qwen models via OpenAI-compatible API. Use dashscope.aliyuncs.com for the China region.',
    suggestedModels: ['qwen-max', 'qwen-plus', 'qwen-turbo', 'qwen3-coder-plus'],
  },
  {
    id: 'baidu-qianfan',
    name: 'Baidu Qianfan',
    defaultBaseUrl: 'https://qianfan.baidubce.com/v2',
    protocol: 'openai-compatible',
    keyUrl: 'https://console.bce.baidu.com/qianfan/ais/console/applicationConsole/application',
    color: '#2932e1',
    initials: 'BQ',
    icon: '/providers/baidu-qianfan.png',
    infoKey: 'cloud.info.baidu-qianfan',
    infoDefault: 'Baidu Qianfan v2 OpenAI-compatible endpoint: ERNIE and third-party models.',
    suggestedModels: ['ernie-4.5-turbo-128k', 'deepseek-v3'],
  },
  {
    id: 'tencent-hunyuan',
    name: 'Tencent Hunyuan',
    defaultBaseUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
    protocol: 'openai-compatible',
    keyUrl: 'https://console.cloud.tencent.com/hunyuan/api-key',
    color: '#0052d9',
    initials: 'TH',
    icon: '/providers/tencent-hunyuan.png',
    infoKey: 'cloud.info.tencent-hunyuan',
    infoDefault: 'Tencent Hunyuan OpenAI-compatible endpoint: hunyuan-turbos and hunyuan-t1.',
    suggestedModels: ['hunyuan-turbos-latest', 'hunyuan-t1-latest'],
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    defaultBaseUrl: 'https://api.minimax.io/v1',
    protocol: 'openai-compatible',
    keyUrl: 'https://platform.minimax.io/user-center/basic-information/interface-key',
    color: '#ff2d78',
    initials: 'MM',
    icon: '/providers/minimax.png',
    infoKey: 'cloud.info.minimax',
    infoDefault: 'MiniMax global platform: MiniMax-M2 and abab models. Use api.minimaxi.com for the China region.',
    suggestedModels: ['MiniMax-M2', 'abab6.5s-chat'],
  },
  {
    id: 'dahl',
    name: 'Dahl Inference',
    defaultBaseUrl: 'https://inference.dahl.global/v1',
    protocol: 'openai-compatible',
    keyUrl: 'https://dahl.global/',
    color: '#e11d48',
    initials: 'D',
    icon: '/providers/dahl.png',
    infoKey: 'cloud.info.dahl',
    infoDefault: 'Dahl Inference gateway: OpenAI-compatible access to open chat models. Model ids are fetched live.',
  },
  {
    id: 'cohere',
    name: 'Cohere',
    defaultBaseUrl: 'https://api.cohere.ai/compatibility/v1',
    protocol: 'openai-compatible',
    keyUrl: 'https://dashboard.cohere.com/api-keys',
    color: '#39594d',
    initials: 'Co',
    freeTier: true,
    icon: '/providers/cohere.png',
    infoKey: 'cloud.info.cohere',
    infoDefault: 'Cohere compatibility API (OpenAI-style) for Command models. Free trial keys available.',
    suggestedModels: ['command-a-03-2025', 'command-r-plus-08-2024', 'command-r7b-12-2024'],
  },
];
