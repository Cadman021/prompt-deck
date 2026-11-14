// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudProvidersView } from './CloudProvidersView';
import { CLOUD_CATALOG } from '../../data/cloudProviders';
import i18n from '../../i18n/config';
import { useCloudStore, type CloudApiKey } from '../../store/useCloudStore';

const provider = CLOUD_CATALOG.find((def) => def.id === 'openai')!;
const primary: CloudApiKey = {
  id: 'latency-primary',
  providerId: provider.id,
  label: 'Primary key',
  apiKey: 'test-primary-1234',
  enabled: true,
  status: 'ok',
  lastTested: '2026-01-01T00:00:00.000Z',
};
const secondary: CloudApiKey = {
  ...primary,
  id: 'latency-secondary',
  label: 'Secondary key',
  apiKey: 'test-secondary-5678',
  latencyMs: 45,
};

const fetchMock = vi.fn<typeof fetch>();
let container: HTMLDivElement;
let root: Root;
let now: number;

function button(name: string, scope: ParentNode = container) {
  const button = [...scope.querySelectorAll('button')].find(
    (element) => (element.getAttribute('aria-label') ?? element.textContent?.trim()) === name
  );
  if (!button) throw new Error(`Missing button: ${name}`);
  return button;
}

function primaryRow() {
  const row = [...container.querySelectorAll('li')].find((li) =>
    li.textContent?.includes(primary.label)
  );
  if (!row) throw new Error('Primary key row missing');
  return row;
}

async function click(button: HTMLElement) {
  await act(async () => button.click());
}

async function openProvider() {
  const name = [...container.querySelectorAll('button span')].find(
    (span) => span.textContent === provider.name
  );
  const card = name?.closest('button');
  if (!card) throw new Error('Provider card missing');
  await click(card);
}

async function testPrimary() {
  await click(button(i18n.t('cloud.testKey'), primaryRow()));
}

function respondAfter(ms: number, response: Response) {
  fetchMock.mockImplementationOnce(async () => {
    now += ms;
    return response;
  });
}

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  fetchMock.mockReset().mockRejectedValue(new Error('Unexpected provider request'));
  vi.stubGlobal('fetch', fetchMock);
  now = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  localStorage.clear();
  useCloudStore.setState({
    keys: [primary, secondary],
    customProviders: [],
    knownModels: {},
    enabledModels: {},
    modelPricing: {},
  });
  await i18n.changeLanguage('en');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<CloudProvidersView />));
  await openProvider();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('cloud connection test timing', () => {
  it('replaces the row timing on retest and clears it when fetch fails', async () => {
    expect(primaryRow().textContent).not.toMatch(/\d+ms/);
    const response = new Response();
    vi.spyOn(response, 'json').mockImplementation(async () => {
      now += 1000;
      return { data: [{ id: 'test-model', pricing: { prompt: '0.01', completion: '0.02' } }] };
    });
    respondAfter(229.6, response);
    await testPrimary();
    expect(primaryRow().textContent).toMatch(/••••1234\s*· 230ms/);
    expect(useCloudStore.getState().knownModels[provider.id]).toEqual(['test-model']);
    expect(useCloudStore.getState().modelPricing[provider.id]['test-model']).toEqual({
      prompt: 0.01,
      completion: 0.02,
    });

    respondAfter(85, new Response('{"data":[]}'));
    await testPrimary();
    expect(primaryRow().textContent).toContain('· 85ms');
    expect(primaryRow().textContent).not.toContain('230ms');

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await testPrimary();
    expect(primaryRow().textContent).toContain('Network unreachable');
    expect(primaryRow().textContent).not.toMatch(/\d+ms/);
    expect(container.textContent).toContain('· 45ms');
  });

  it('shows only the fallback probe timing, including a duration that rounds to zero', async () => {
    respondAfter(180, new Response(null, { status: 404 }));
    respondAfter(0.2, new Response(null, { status: 400 }));
    await testPrimary();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      `${provider.defaultBaseUrl}/models`,
      `${provider.defaultBaseUrl}/chat/completions`,
    ]);
    expect(primaryRow().textContent).toMatch(/••••1234\s*· 0ms/);

    respondAfter(180, new Response(null, { status: 404 }));
    respondAfter(30, new Response(null, { status: 401 }));
    await testPrimary();
    expect(primaryRow().textContent).toContain('Unauthorized');
    expect(primaryRow().textContent).not.toMatch(/\d+ms/);
  });

  it('drops a previous timing when Test All replaces the row result', async () => {
    respondAfter(230, new Response('{"data":[]}'));
    await testPrimary();
    expect(primaryRow().textContent).toContain('· 230ms');
    await click(button(i18n.t('cloud.back')));
    const testAll = [...container.querySelectorAll('button')].find(
      (element) => !element.disabled && element.textContent?.includes(i18n.t('cloud.testAll'))
    );
    if (!testAll) throw new Error('Enabled Test All button missing');
    respondAfter(140, new Response('{"data":[]}'));
    await click(testAll);
    await openProvider();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(primaryRow().textContent).not.toMatch(/\d+ms/);
    expect(container.textContent).toContain('· 45ms');
  });
});
