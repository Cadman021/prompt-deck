// Stream-protocol tests with a mocked fetch: truncated streams, error
// payloads, split chunks, and aborts. These lock in the Batch-A finalize fix.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LLMService } from './llmService';
import type { BenchmarkMetrics } from '../types/ollama';

const enc = new TextEncoder();

function sseResponse(chunks: string[], status = 200): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
  return new Response(stream, { status, headers: { 'Content-Type': 'text/event-stream' } });
}

const sse = (obj: unknown): string => `data: ${JSON.stringify(obj)}\n\n`;
const delta = (content: string): string => sse({ choices: [{ delta: { content } }] });

interface Collected {
  chunks: string[];
  completed: { text: string; metrics: BenchmarkMetrics } | null;
  errors: Error[];
}

function collect(): { cbs: Parameters<typeof LLMService.generateStream>[2]; out: Collected } {
  const out: Collected = { chunks: [], completed: null, errors: [] };
  return {
    out,
    cbs: {
      onChunk: (_c, full) => {
        out.chunks.push(full);
      },
      onComplete: (text, metrics) => {
        out.completed = { text, metrics };
      },
      onError: (err) => {
        out.errors.push(err);
      },
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('openai-compatible streaming', () => {
  it('completes normally on [DONE] with server usage', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sseResponse([
          delta('Hello'),
          delta(' world'),
          sse({ usage: { completion_tokens: 2, prompt_tokens: 5 } }),
          'data: [DONE]\n\n',
        ])
      )
    );
    const { cbs, out } = collect();
    await LLMService.generateStream(
      { provider: 'openai-compatible', baseUrl: 'https://x/v1' },
      { model: 'm', prompt: 'hi' },
      cbs
    );
    expect(out.completed?.text).toBe('Hello world');
    expect(out.completed?.metrics.tokenSource).toBe('server');
    expect(out.completed?.metrics.completionTokens).toBe(2);
    expect(out.completed?.metrics.promptTokens).toBe(5);
    expect(out.errors).toHaveLength(0);
  });

  it('still completes when the server closes without [DONE]', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => sseResponse([delta('par'), delta('tial')]))
    );
    const { cbs, out } = collect();
    await LLMService.generateStream(
      { provider: 'openai-compatible', baseUrl: 'https://x/v1' },
      { model: 'm', prompt: 'hi' },
      cbs
    );
    expect(out.completed?.text).toBe('partial');
    expect(out.completed?.metrics.tpsEstimated).toBe(true);
  });

  it('surfaces server error payloads instead of hanging', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => sseResponse([delta('hi'), sse({ error: { message: 'out of quota' } })]))
    );
    const { cbs, out } = collect();
    await LLMService.generateStream(
      { provider: 'openai-compatible', baseUrl: 'https://x/v1' },
      { model: 'm', prompt: 'hi' },
      cbs
    );
    expect(out.completed).toBeNull();
    expect(out.errors.map((e) => e.message)).toContain('out of quota');
  });

  it('reassembles lines split across read boundaries', async () => {
    const full = delta('abcdef');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => sseResponse([full.slice(0, 7), full.slice(7), 'data: [DO', 'NE]\n\n']))
    );
    const { cbs, out } = collect();
    await LLMService.generateStream(
      { provider: 'openai-compatible', baseUrl: 'https://x/v1' },
      { model: 'm', prompt: 'hi' },
      cbs
    );
    expect(out.completed?.text).toBe('abcdef');
  });

  it('reports HTTP failures with the error path (not a hang)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(JSON.stringify({ error: { message: 'bad key' } }), { status: 401 })
      )
    );
    const { cbs, out } = collect();
    await LLMService.generateStream(
      { provider: 'openai-compatible', baseUrl: 'https://x/v1' },
      { model: 'm', prompt: 'hi' },
      cbs
    );
    expect(out.completed).toBeNull();
    expect(out.errors.join(' ')).toMatch(/bad key/);
  });

  it('notifies onError on abort', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError'))
            );
          })
      )
    );
    const controller = new AbortController();
    const { cbs, out } = collect();
    const p = LLMService.generateStream(
      { provider: 'openai-compatible', baseUrl: 'https://x/v1' },
      { model: 'm', prompt: 'hi' },
      cbs,
      controller.signal
    );
    controller.abort();
    await p;
    expect(out.completed).toBeNull();
    expect(out.errors).toHaveLength(1);
  });
});
