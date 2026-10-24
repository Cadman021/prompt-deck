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

describe('DETECT_CANDIDATES', () => {
  it('probes the common local servers on their documented ports', () => {
    const urls = DETECT_CANDIDATES.map((c) => `${c.baseUrl}${c.path}`);
    // Ordered: the two stable addresses first, the best-effort ones after, so
    // an unreachable extra never delays the servers most people run.
    expect(urls[0]).toBe('http://localhost:11434/api/tags');
    expect(urls[1]).toBe('http://localhost:1234/v1/models');
    expect(urls[2]).toBe('http://localhost:8080/v1/models');
    expect(urls).toContain('http://localhost:5001/api/v1/models'); // KoboldCpp
    expect(urls).toContain('http://localhost:1337/v1/models'); // Jan
  });

  it('only ever uses the two providers the app can talk to', () => {
    for (const c of DETECT_CANDIDATES) {
      expect(['ollama', 'openai-compatible']).toContain(c.provider);
    }
  });

  it('has no duplicate base URLs', () => {
    const urls = DETECT_CANDIDATES.map((c) => c.baseUrl);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('finds KoboldCpp through its /api/v1 path', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('5001')) return jsonResponse({ data: [{ id: 'koboldcpp/model' }] });
      throw new Error('refused');
    });
    const found = await detectLocalServers(600, fetchImpl as unknown as typeof fetch);
    expect(found).toEqual([
      {
        provider: 'openai-compatible',
        baseUrl: 'http://localhost:5001/api/v1',
        models: ['koboldcpp/model'],
      },
    ]);
  });

  it('finds Jan on 1337', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('1337')) return jsonResponse({ data: [{ id: 'llama3-8b' }] });
      throw new Error('refused');
    });
    const found = await detectLocalServers(600, fetchImpl as unknown as typeof fetch);
    expect(found.map((f) => f.baseUrl)).toEqual(['http://localhost:1337/v1']);
  });
});

describe('probeServer', () => {
  it('rejects a 200 response whose body has no model list', async () => {
    // Another service on a probed port can answer 200 with unrelated JSON.
    // Reporting it would surface a phantom server with zero selectable models.
    const fetchImpl = vi.fn(async () => jsonResponse({ status: 'ok' }));
    const found = await probeServer(
      { provider: 'openai-compatible', baseUrl: 'http://localhost:5001/api/v1', path: '/models' },
      600,
      fetchImpl as unknown as typeof fetch
    );
    expect(found).toBeNull();
  });

  it('accepts a response with at least one model', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: [{ id: 'm' }] }));
    const found = await probeServer(
      { provider: 'openai-compatible', baseUrl: 'http://localhost:5001/api/v1', path: '/models' },
      600,
      fetchImpl as unknown as typeof fetch
    );
    expect(found).toEqual({
      provider: 'openai-compatible',
      baseUrl: 'http://localhost:5001/api/v1',
      models: ['m'],
    });
  });
});
