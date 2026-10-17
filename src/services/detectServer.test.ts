// Tests for local-server detection: candidate probing, body-shape tolerance,
// timeout/error handling, and the parallel aggregate.
import { describe, expect, it, vi } from 'vitest';
import {
  DETECT_CANDIDATES,
  detectLocalServers,
  extractModelNames,
  probeServer,
  type DetectCandidate,
} from './detectServer';

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

const ollama: DetectCandidate = {
  provider: 'ollama',
  baseUrl: 'http://localhost:11434',
  path: '/api/tags',
};

describe('extractModelNames', () => {
  it('reads Ollama /api/tags shape', () => {
    expect(extractModelNames({ models: [{ name: 'llama3' }, { name: 'qwen2' }] })).toEqual([
      'llama3',
      'qwen2',
    ]);
  });

  it('reads OpenAI /models shape', () => {
    expect(extractModelNames({ data: [{ id: 'a' }, { id: 'b' }] })).toEqual(['a', 'b']);
  });

  it('ignores malformed entries and non-objects', () => {
    expect(extractModelNames({ models: [{ name: 'ok' }, { foo: 1 }, 'nope', null] })).toEqual([
      'ok',
    ]);
    expect(extractModelNames(null)).toEqual([]);
    expect(extractModelNames({ data: 'nope' })).toEqual([]);
  });
});

describe('probeServer', () => {
  it('returns the server with models on a 200', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ models: [{ name: 'llama3' }] }));
    const found = await probeServer(ollama, 600, fetchImpl as unknown as typeof fetch);
    expect(found).toEqual({
      provider: 'ollama',
      baseUrl: 'http://localhost:11434',
      models: ['llama3'],
    });
    expect(fetchImpl).toHaveBeenCalledWith('http://localhost:11434/api/tags', expect.anything());
  });

  it('returns null on a non-ok response', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, false));
    expect(await probeServer(ollama, 600, fetchImpl as unknown as typeof fetch)).toBeNull();
  });

  it('returns null when the fetch rejects (offline / CORS)', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network');
    });
    expect(await probeServer(ollama, 600, fetchImpl as unknown as typeof fetch)).toBeNull();
  });

  it('aborts once the timeout elapses', async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        })
    );
    const found = await probeServer(ollama, 10, fetchImpl as unknown as typeof fetch);
    expect(found).toBeNull();
    expect(fetchImpl).toHaveBeenCalled();
  });
});

describe('detectLocalServers', () => {
  it('keeps only the candidates that answered', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('11434')) return jsonResponse({ models: [{ name: 'llama3' }] });
      throw new Error('refused');
    });
    const found = await detectLocalServers(600, fetchImpl as unknown as typeof fetch);
    expect(found).toEqual([
      { provider: 'ollama', baseUrl: 'http://localhost:11434', models: ['llama3'] },
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(DETECT_CANDIDATES.length);
  });

  it('returns an empty list when nothing is running', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('refused');
    });
    expect(await detectLocalServers(600, fetchImpl as unknown as typeof fetch)).toEqual([]);
  });
});
