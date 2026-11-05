// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderDetailPage } from './ProviderDetailPage';
import { useCloudStore } from '../../store/useCloudStore';
import type { CloudProviderDef } from '../../data/cloudProviders';
import i18n from '../../i18n/config';

const provider: CloudProviderDef = {
  id: 'test-provider',
  name: 'Test provider',
  defaultBaseUrl: 'https://provider.invalid/v1',
  protocol: 'openai-compatible',
  keyUrl: '',
  color: '#6366f1',
  initials: 'TP',
};
const models = [
  'zeta/chat',
  'alpha/chat',
  'kilo/code',
  'bravo/chat',
  'omega/chat',
  'delta/code',
  'hotel/chat',
  'echo/chat',
  'juliet/code',
  'charlie/chat',
  'golf/chat',
  'foxtrot/chat',
];
let container: HTMLDivElement;
let root: Root;

function sortButton(): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find(
    (element) => element.getAttribute('aria-label') === i18n.t('cloud.enabledFirst')
  );
  if (!found) throw new Error('Enabled-first button not found');
  return found;
}

function visibleModels(): string[] {
  return [...container.querySelectorAll('div[title]')].map((card) => card.getAttribute('title')!);
}

async function render(known = models, enabled: string[] = []) {
  useCloudStore.setState({
    keys: [],
    knownModels: { [provider.id]: known },
    enabledModels: { [provider.id]: enabled },
  });
  await act(async () => {
    root.render(<ProviderDetailPage def={provider} isCustom={false} onBack={() => {}} />);
  });
}

async function click(element: HTMLElement) {
  await act(async () => element.click());
}

async function search(value: string) {
  const input = container.querySelector<HTMLInputElement>('input[placeholder="Search models…"]');
  if (!input) throw new Error('Model search not found');
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setValue.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unexpected provider request')));
  localStorage.clear();
  await i18n.changeLanguage('en');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

describe('ProviderDetailPage: enabled-first models', () => {
  it('defaults off, sorts each group by name, and restores provider order without changing state', async () => {
    const known = [...models];
    const enabled = ['omega/chat', 'bravo/chat'];
    Object.freeze(known);
    Object.freeze(enabled);
    await render(known, enabled);
    const persisted = localStorage.getItem('promptdeck-cloud');
    expect(sortButton().title).toBe('Enabled models first');
    expect(sortButton().textContent).toBe('');
    expect(sortButton().querySelector('.lucide-list-checks')).not.toBeNull();
    expect(sortButton().querySelector('.lucide-arrow-up')).not.toBeNull();
    expect(sortButton().getAttribute('aria-pressed')).toBe('false');
    expect(visibleModels()).toEqual(models);

    await click(sortButton());
    expect(sortButton().getAttribute('aria-pressed')).toBe('true');
    expect(visibleModels()).toEqual([
      'bravo/chat',
      'omega/chat',
      'alpha/chat',
      'charlie/chat',
      'delta/code',
      'echo/chat',
      'foxtrot/chat',
      'golf/chat',
      'hotel/chat',
      'juliet/code',
      'kilo/code',
      'zeta/chat',
    ]);
    expect(useCloudStore.getState().knownModels[provider.id]).toBe(known);
    expect(useCloudStore.getState().enabledModels[provider.id]).toBe(enabled);
    expect(localStorage.getItem('promptdeck-cloud')).toBe(persisted);

    await click(sortButton());
    expect(visibleModels()).toEqual(models);
  });

  it('combines trimmed, case-insensitive search with both ordering modes', async () => {
    await render(models, ['omega/chat', 'bravo/chat']);
    await search('  CHAT  ');
    const providerOrder = [
      'zeta/chat',
      'alpha/chat',
      'bravo/chat',
      'omega/chat',
      'hotel/chat',
      'echo/chat',
      'charlie/chat',
      'golf/chat',
      'foxtrot/chat',
    ];
    expect(visibleModels()).toEqual(providerOrder);
    await click(sortButton());
    expect(visibleModels()).toEqual([
      'bravo/chat',
      'omega/chat',
      'alpha/chat',
      'charlie/chat',
      'echo/chat',
      'foxtrot/chat',
      'golf/chat',
      'hotel/chat',
      'zeta/chat',
    ]);
    await search('  CODE  ');
    expect(visibleModels()).toEqual(['delta/code', 'juliet/code', 'kilo/code']);
    await click(sortButton());
    expect(visibleModels()).toEqual(['kilo/code', 'delta/code', 'juliet/code']);
    await search('no matching model');
    expect(visibleModels()).toEqual([]);
    await search('');
    expect(visibleModels()).toEqual(models);
  });

  it('moves a model immediately when its enabled state changes', async () => {
    await render(['zeta/model', 'alpha/model', 'middle/model'], ['zeta/model']);
    await click(sortButton());
    expect(visibleModels()).toEqual(['zeta/model', 'alpha/model', 'middle/model']);
    const middle = container.querySelector<HTMLElement>('div[title="middle/model"]');
    if (!middle) throw new Error('Middle model card not found');
    await click(middle);
    expect(visibleModels()).toEqual(['middle/model', 'zeta/model', 'alpha/model']);
    expect(useCloudStore.getState().enabledModels[provider.id]).toEqual([
      'zeta/model',
      'middle/model',
    ]);
    const zeta = container.querySelector<HTMLElement>('div[title="zeta/model"]');
    if (!zeta) throw new Error('Zeta model card not found');
    await click(zeta);
    expect(visibleModels()).toEqual(['middle/model', 'alpha/model', 'zeta/model']);
    expect(useCloudStore.getState().enabledModels[provider.id]).toEqual(['middle/model']);
  });

  it.each([
    { description: 'empty', known: [], enabled: [], expected: [] },
    {
      description: 'none enabled',
      known: ['zeta/model', 'alpha/model', 'middle/model'],
      enabled: [],
      expected: ['alpha/model', 'middle/model', 'zeta/model'],
    },
    {
      description: 'all enabled',
      known: ['zeta/model', 'alpha/model', 'middle/model'],
      enabled: ['zeta/model', 'middle/model', 'alpha/model'],
      expected: ['alpha/model', 'middle/model', 'zeta/model'],
    },
  ])('handles $description model lists', async ({ known, enabled, expected }) => {
    await render(known, enabled);
    await click(sortButton());
    expect(visibleModels()).toEqual(expected);
    await click(sortButton());
    expect(visibleModels()).toEqual(known);
    expect(useCloudStore.getState().enabledModels[provider.id]).toEqual(enabled);
  });

  it('sorts a refreshed model list and restores its new provider order', async () => {
    await render(models, ['omega/chat', 'bravo/chat']);
    await click(sortButton());
    const refreshed = ['new/zeta', 'new/alpha', 'new/middle'];
    Object.freeze(refreshed);
    await render(refreshed, ['new/middle', 'omega/chat']);
    expect(sortButton().getAttribute('aria-pressed')).toBe('true');
    expect(visibleModels()).toEqual(['new/middle', 'new/alpha', 'new/zeta']);
    await click(sortButton());
    expect(visibleModels()).toEqual(refreshed);
    expect(useCloudStore.getState().knownModels[provider.id]).toBe(refreshed);
  });

  it('resets the view preference when the page is mounted again', async () => {
    await render(models, ['omega/chat', 'bravo/chat']);
    await click(sortButton());
    expect(sortButton().getAttribute('aria-pressed')).toBe('true');
    await act(async () => root.unmount());
    root = createRoot(container);
    await render(models, ['omega/chat', 'bravo/chat']);
    expect(sortButton().getAttribute('aria-pressed')).toBe('false');
    expect(visibleModels()).toEqual(models);
  });

  it('keeps the localized accessible name and hover hint stable when pressed', async () => {
    await render(models, ['omega/chat', 'bravo/chat']);
    for (const language of ['de', 'en', 'fa', 'fr', 'ru', 'zh']) {
      await act(async () => {
        await i18n.changeLanguage(language);
      });
      const label = i18n.getResource(language, 'translation', 'cloud.enabledFirst');
      expect(label).toBeTypeOf('string');
      expect(label.length).toBeGreaterThan(0);
      const button = sortButton();
      expect(button.title).toBe(label);
      const wasPressed = button.getAttribute('aria-pressed') === 'true';
      await click(button);
      expect(button.getAttribute('aria-pressed')).toBe(String(!wasPressed));
      expect(button.getAttribute('aria-label')).toBe(label);
      expect(button.title).toBe(label);
    }
  });
});
