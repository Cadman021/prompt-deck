// src/components/MarkdownRenderer.tsx
import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { openExternal } from '../utils/openExternal';

interface MarkdownRendererProps {
  content: string;
}

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
  return (
    // eslint-disable-next-line jsx-a11y/alt-text
    <img src={src} alt={alt} className="rounded-lg my-2 max-w-full" loading="lazy" />
  );
};

// Memoized: re-parsing Markdown on every stream chunk is the dominant render
// cost, so skip renders unless the content string itself changed.
export const MarkdownRenderer = React.memo(function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="markdown-body text-sm leading-relaxed text-slate-800 dark:text-slate-200 space-y-2">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{

          p({ children }) {
            return (
              <p dir="auto" className="my-1.5 leading-6 text-slate-700 dark:text-slate-300">
                {children}
              </p>
            );
          },
          
          h1({ children }) {
            return (
              <h1 dir="auto" className="text-xl font-bold mt-4 mb-2 text-indigo-600 dark:text-indigo-300 border-b border-slate-200 dark:border-slate-800 pb-1">
                {children}
              </h1>
            );
          },
          h2({ children }) {
            return (
              <h2 dir="auto" className="text-lg font-bold mt-3 mb-1.5 text-indigo-600 dark:text-indigo-300">
                {children}
              </h2>
            );
          },
          h3({ children }) {
            return (
              <h3 dir="auto" className="text-base font-semibold mt-2 mb-1 text-slate-900 dark:text-slate-100">
                {children}
              </h3>
            );
          },
          
          ul({ children }) {
            return <ul dir="auto" className="list-disc list-inside my-2 space-y-1 text-slate-700 dark:text-slate-300">{children}</ul>;
          },
          ol({ children }) {
            return <ol dir="auto" className="list-decimal list-inside my-2 space-y-1 text-slate-700 dark:text-slate-300">{children}</ol>;
          },
          li({ children }) {
            return <li dir="auto" className="leading-6">{children}</li>;
          },
          
          code({ node, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '');
            const isInline = !match && !String(children).includes('\n');

            if (isInline) {
              return (
                <code
                  dir="ltr"
                  className="bg-slate-200 text-amber-800 border border-slate-300 dark:bg-slate-800 dark:text-amber-300 dark:border-slate-700/60 px-1.5 py-0.5 rounded text-xs font-mono"
                  {...props}
                >
                  {children}
                </code>
              );
            }

            return (
              <pre dir="ltr" className="bg-slate-900 dark:bg-slate-950 p-3 rounded-lg border border-slate-300 dark:border-slate-800 overflow-x-auto text-xs font-mono my-3 text-emerald-400">
                <code className={className} {...props}>
                  {children}
                </code>
              </pre>
            );
          },
          
          table({ children }) {
            return (
              <div dir="ltr" className="overflow-x-auto my-4 border border-slate-300 dark:border-slate-700/70 rounded-lg shadow-sm">
                <table className="w-full text-left text-xs border-collapse">{children}</table>
              </div>
            );
          },
          thead({ children }) {
            return <thead className="bg-slate-100 dark:bg-slate-800/90 text-slate-900 dark:text-slate-200 border-b border-slate-300 dark:border-slate-700">{children}</thead>;
          },
          th({ children }) {
            return <th className="p-2.5 font-bold border-r border-slate-300 dark:border-slate-700/50 last:border-r-0 text-slate-800 dark:text-slate-200">{children}</th>;
          },
          td({ children }) {
            return <td className="p-2.5 border-t border-slate-200 dark:border-slate-800 border-r border-slate-200 dark:border-slate-800/80 last:border-r-0 text-slate-700 dark:text-slate-300">{children}</td>;
          },
          
          blockquote({ children }) {
            return (
              <blockquote dir="auto" className="border-s-4 border-indigo-500 ps-3 my-2 text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/40 py-1.5 rounded-e">
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