// src/utils/codeLanguages.ts
// Language registry for the syntax highlighter.
//
// `react-syntax-highlighter`'s light build already ships one lazy chunk per
// Prism grammar — 1000+ of them in the bundle, ~3.6 MB of assets for languages
// nobody benchmarks. This app highlights model answers, so the useful set is
// the languages an LLM actually writes: ~15 grammars, statically imported so
// the bundler emits exactly those and nothing else.
//
// Anything outside the map falls back to plain text (no grammar), which is the
// same rendering the previous lazy loader produced when a grammar chunk failed
// to arrive — just without the failed request.

import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx';
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import markup from 'react-syntax-highlighter/dist/esm/languages/prism/markup';
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css';
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql';
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml';
import markdown from 'react-syntax-highlighter/dist/esm/languages/prism/markdown';
import rust from 'react-syntax-highlighter/dist/esm/languages/prism/rust';
import go from 'react-syntax-highlighter/dist/esm/languages/prism/go';
import java from 'react-syntax-highlighter/dist/esm/languages/prism/java';
import diff from 'react-syntax-highlighter/dist/esm/languages/prism/diff';

type Grammar = Parameters<
  typeof import('react-syntax-highlighter').PrismAsyncLight.registerLanguage
>[1];

/** Canonical grammar name → grammar module. */
export const CODE_LANGUAGES: Record<string, Grammar> = {
  javascript,
  typescript,
  jsx,
  tsx,
  python,
  bash,
  json,
  markup,
  css,
  sql,
  yaml,
  markdown,
  rust,
  go,
  java,
  diff,
};

/**
 * Aliases fence labels actually use in model output. `html`/`svg`/`xml` all
 * map to the `markup` grammar; `sh`/`zsh`/`shell` to `bash`; etc.
 */
const ALIASES: Record<string, string> = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  node: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  typescript: 'typescript',
  tsx: 'tsx',
  py: 'python',
  python3: 'python',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  console: 'bash',
  bash: 'bash',
  json: 'json',
  jsonc: 'json',
  html: 'markup',
  xml: 'markup',
  svg: 'markup',
  vue: 'markup',
  markup: 'markup',
  css: 'css',
  scss: 'css',
  sql: 'sql',
  yml: 'yaml',
  yaml: 'yaml',
  md: 'markdown',
  markdown: 'markdown',
  rs: 'rust',
  rust: 'rust',
  go: 'go',
  golang: 'go',
  java: 'java',
  diff: 'diff',
  patch: 'diff',
};

/**
 * Canonical grammar name for a fence label, or `null` when the label maps to
 * nothing we ship (the block renders as plain monospace text).
 */
export function resolveLanguage(label: string | undefined): string | null {
  const key = (label ?? '').trim().toLowerCase();
  if (!key) return null;
  return ALIASES[key] ?? (key in CODE_LANGUAGES ? key : null);
}
