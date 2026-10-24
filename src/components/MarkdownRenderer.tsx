// src/components/MarkdownRenderer.tsx
import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';
import { Copy } from 'lucide-react';
import { openExternal } from '../utils/openExternal';
import { toast } from '../store/useToastStore';
import { CODE_LANGUAGES, resolveLanguage } from '../utils/codeLanguages';

interface MarkdownRendererProps {
  content: string;
  /** While true, fenced code stays plain (no highlighting) to protect the run. */
  streaming?: boolean;
}

// Above this size highlighting costs more than it's worth — keep it plain.
const MAX_HIGHLIGHT_CHARS = 20000;

type HighlighterComponent = React.ComponentType<Record<string, unknown>>;

/**
 * Fenced code block with a language label + one-click copy. Syntax highlighting
 * is code-split and only kicks in after the stream finishes (and for reasonably
 * sized blocks), so it never competes with local inference for CPU.
 */
const CodeBlock: React.FC<{
  language: string;
  code: string;
  className?: string;
  streaming?: boolean;
}> = ({ language, code, className, streaming }) => {
  const { t } = useTranslation();
  const [Highlighter, setHighlighter] = useState<HighlighterComponent | null>(null);
  const [theme, setTheme] = useState<Record<string, React.CSSProperties> | null>(null);
  const tooBig = code.length > MAX_HIGHLIGHT_CHARS;

  useEffect(() => {
    if (streaming || tooBig || Highlighter) return;
    let cancelled = false;
    void (async () => {
      try {
        // The library's own Prism entry point (`Prism` / `PrismAsyncLight`)
        // imports `refractor/all`, which pulls in ~450 grammars — the bundler
        // then emits one chunk per grammar (~3.6 MB of installer assets).
        // `highlight()` plus `refractor/core` gives the identical renderer
        // bound to a core with only the grammars registered below.
        const [highlightMod, styleMod] = await Promise.all([
          import('react-syntax-highlighter/dist/esm/highlight'),
          import('react-syntax-highlighter/dist/esm/styles/prism/one-dark'),
        ]);
        if (cancelled) return;
        const { refractor } = await import('refractor/core');
        for (const grammar of Object.values(CODE_LANGUAGES)) {
          // `register` keys the grammar by its own name; aliased fence labels
          // (`js`, `ts`, `sh`…) resolve through ALIASES before reaching here.
          refractor.register(grammar);
        }
        const Highlighter = highlightMod.default(
          refractor,
          styleMod.default as Record<string, React.CSSProperties>
        );
        setHighlighter(() => Highlighter);
        setTheme(styleMod.default as Record<string, React.CSSProperties>);
      } catch {
        // Offline or chunk load failed — plain code is a fine fallback.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [streaming, tooBig, Highlighter]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    toast(t('app.copyCodeDone', 'Code copied'), 'success');
  };

  return (
    <div
      dir="ltr"
      className="my-3 rounded-lg border border-slate-300 dark:border-slate-800 overflow-hidden"
    >
      <div className="flex items-center justify-between bg-slate-800 dark:bg-slate-900 px-3 py-1.5 border-b border-slate-700/60">
        <span className="text-nano font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {language || t('app.codePlain', 'text')}
        </span>
        <button
          onClick={() => void handleCopy()}
          title={t('app.copyCode', 'Copy code')}
          className="flex items-center gap-1 text-nano font-medium text-slate-300 hover:text-white transition"
        >
          <Copy className="w-3 h-3" />
          {t('app.copyCode', 'Copy code')}
        </button>
      </div>
      {Highlighter && theme ? (
        <Highlighter
          language={resolveLanguage(language) ?? 'text'}
          style={theme}
          PreTag="div"
          customStyle={{
            margin: 0,
            padding: '0.75rem',
            background: 'transparent',
            fontSize: '0.75rem',
          }}
        >
          {code}
        </Highlighter>
      ) : (
        <pre className="bg-slate-900 dark:bg-slate-950 p-3 overflow-x-auto text-xs font-mono text-emerald-400">
          <code className={className}>{code}</code>
        </pre>
      )}
    </div>
  );
};

/**
 * Remote images in model output are untrusted network requests (breaks the
 * local-first promise), so they never load automatically. The user sees the
 * URL with an explicit opt-in to fetch it once.
 */
const SafeImage: React.FC<{ src?: string; alt?: string }> = ({ src, alt }) => {
  const [loaded, setLoaded] = useState(false);
  if (!src) return null;
  if (!loaded) {
    return (
      <span
        dir="ltr"
        className="flex items-center gap-2 my-2 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800/60 border border-dashed border-slate-300 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400"
      >
        <span className="truncate flex-1 font-mono" title={src}>
          🖼 {alt || src}
        </span>
        <button
          onClick={() => setLoaded(true)}
          className="shrink-0 px-2 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition"
        >
          Load
        </button>
      </span>
    );
  }
  return <img src={src} alt={alt} className="rounded-lg my-2 max-w-full" loading="lazy" />;
};

// Memoized: re-parsing Markdown on every stream chunk is the dominant render
// cost, so skip renders unless the content string itself changed.
export const MarkdownRenderer = React.memo(function MarkdownRenderer({
  content,
  streaming,
}: MarkdownRendererProps) {
  return (
    <div className="markdown-body text-sm leading-relaxed text-slate-800 dark:text-slate-200 space-y-2">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Block code produces its own container in `code`, so flatten the
          // default <pre> wrapper to avoid double chrome.
          pre({ children }) {
            return <>{children}</>;
          },
          p({ children }) {
            return (
              <p dir="auto" className="my-1.5 leading-6 text-slate-700 dark:text-slate-300">
                {children}
              </p>
            );
          },

          h1({ children }) {
            return (
              <h1
                dir="auto"
                className="text-xl font-bold mt-4 mb-2 text-indigo-600 dark:text-indigo-300 border-b border-slate-200 dark:border-slate-800 pb-1"
              >
                {children}
              </h1>
            );
          },
          h2({ children }) {
            return (
              <h2
                dir="auto"
                className="text-lg font-bold mt-3 mb-1.5 text-indigo-600 dark:text-indigo-300"
              >
                {children}
              </h2>
            );
          },
          h3({ children }) {
            return (
              <h3
                dir="auto"
                className="text-base font-semibold mt-2 mb-1 text-slate-900 dark:text-slate-100"
              >
                {children}
              </h3>
            );
          },

          ul({ children }) {
            return (
              <ul
                dir="auto"
                className="list-disc list-inside my-2 space-y-1 text-slate-700 dark:text-slate-300"
              >
                {children}
              </ul>
            );
          },
          ol({ children }) {
            return (
              <ol
                dir="auto"
                className="list-decimal list-inside my-2 space-y-1 text-slate-700 dark:text-slate-300"
              >
                {children}
              </ol>
            );
          },
          li({ children }) {
            return (
              <li dir="auto" className="leading-6">
                {children}
              </li>
            );
          },

          code({ className, children }: { className?: string; children?: React.ReactNode }) {
            const match = /language-(\w+)/.exec(className || '');
            const isInline = !match && !String(children).includes('\n');

            if (isInline) {
              return (
                <code
                  dir="ltr"
                  className="bg-slate-200 text-amber-800 border border-slate-300 dark:bg-slate-800 dark:text-amber-300 dark:border-slate-700/60 px-1.5 py-0.5 rounded text-xs font-mono"
                >
                  {children}
                </code>
              );
            }

            return (
              <CodeBlock
                language={match ? match[1] : ''}
                code={String(children).replace(/\n$/, '')}
                className={className}
                streaming={streaming}
              />
            );
          },

          table({ children }) {
            return (
              <div
                dir="ltr"
                className="overflow-x-auto my-4 border border-slate-300 dark:border-slate-700/70 rounded-lg shadow-sm"
              >
                <table className="w-full text-left text-xs border-collapse">{children}</table>
              </div>
            );
          },
          thead({ children }) {
            return (
              <thead className="bg-slate-100 dark:bg-slate-800/90 text-slate-900 dark:text-slate-200 border-b border-slate-300 dark:border-slate-700">
                {children}
              </thead>
            );
          },
          th({ children }) {
            return (
              <th className="p-2.5 font-bold border-r border-slate-300 dark:border-slate-700/50 last:border-r-0 text-slate-800 dark:text-slate-200">
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td className="p-2.5 border-t border-slate-200 dark:border-slate-800 border-r border-slate-200 dark:border-slate-800/80 last:border-r-0 text-slate-700 dark:text-slate-300">
                {children}
              </td>
            );
          },

          blockquote({ children }) {
            return (
              <blockquote
                dir="auto"
                className="border-s-4 border-indigo-500 ps-3 my-2 text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/40 py-1.5 rounded-e"
              >
                {children}
              </blockquote>
            );
          },

          // Links must never navigate the app window away: open externally.
          a({ href, children }) {
            if (!href) return <span>{children}</span>;
            return (
              <button
                onClick={() => void openExternal(href)}
                title={href}
                className="text-indigo-600 dark:text-indigo-300 underline underline-offset-2 hover:text-indigo-500 transition"
              >
                {children}
              </button>
            );
          },

          img({ src, alt }) {
            return <SafeImage src={src} alt={alt} />;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
