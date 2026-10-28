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
const models = ['zeta/model', 'alpha/model', 'middle/model'];
let container: HTMLDivElement;
let root: Root;

function button(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find(
    (b) => b.getAttribute('aria-label') === label || b.textContent?.trim() === label
  );
  if (!found) throw new Error(`Button not found: ${label}`);
  return found;
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

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unexpected provider request')));
  vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
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
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ProviderDetailPage: copy enabled model IDs', () => {
  it.each([{ known: [] }, { known: models }])(
    'disables the icon button with no enabled models ($known)',
    async ({ known }) => {
      await render(known);
      const copy = button('Copy enabled IDs');
      expect(copy.disabled).toBe(true);
      expect(copy.title).toBe('Copy enabled IDs');
      expect(copy.textContent).toBe('');
      expect(copy.querySelector('.lucide-copy')).not.toBeNull();
      await click(copy);
      expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    }
  );

  it('copies all IDs in enable order and resets the success feedback', async () => {
    await render();
    for (const id of ['middle/model', 'zeta/model', 'alpha/model']) {
      const card = container.querySelector<HTMLElement>(`div[title="${id}"]`);
      if (!card) throw new Error(`Model card not found: ${id}`);
      await click(card);
    }
    await click(button('Copy enabled IDs'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledExactlyOnceWith(
      'middle/model\nzeta/model\nalpha/model'
    );
    expect(useCloudStore.getState().enabledModels[provider.id]).toEqual([
      'middle/model',
      'zeta/model',
      'alpha/model',
    ]);
    const copied = button('IDs copied!');
    expect(copied.title).toBe('IDs copied!');
    expect(copied.querySelector('.lucide-check')).not.toBeNull();
    await act(async () => vi.advanceTimersByTime(1500));
    expect(button('Copy enabled IDs').querySelector('.lucide-copy')).not.toBeNull();
  });

  it('copies enabled models hidden by the search filter', async () => {
    await render(models, ['middle/model', 'alpha/model']);
    const search = container.querySelector<HTMLInputElement>('input[placeholder="Search models…"]');
    if (!search) throw new Error('Model search not found');
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      setValue.call(search, 'alpha');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(container.querySelector('div[title="middle/model"]')).toBeNull();
    expect(container.querySelector('div[title="alpha/model"]')).not.toBeNull();
    await click(button('Copy enabled IDs'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledExactlyOnceWith(
      'middle/model\nalpha/model'
    );
  });

  it('follows Enable all and Disable all without changing provider order', async () => {
    await render();
    await click(button('Enable all'));
    await click(button('Copy enabled IDs'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledExactlyOnceWith(
      'zeta/model\nalpha/model\nmiddle/model'
    );
    await click(button('Disable all'));
    expect(button('IDs copied!').disabled).toBe(true);
  });

  it('keeps single-ID and bulk-copy feedback independent', async () => {
    await render(['enabled'], ['enabled']);
    await click(button('Copy model id'));
    expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith('enabled');
    expect(button('Copy enabled IDs').querySelector('.lucide-copy')).not.toBeNull();
    await click(button('Copy enabled IDs'));
    expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith('enabled');
    expect(button('IDs copied!').querySelector('.lucide-check')).not.toBeNull();
  });

  it('clears old success feedback and handles a rejected clipboard write', async () => {
    const error = new DOMException('Denied', 'NotAllowedError');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await render(models, ['alpha/model']);
    await click(button('Copy enabled IDs'));
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(error);
    await click(button('IDs copied!'));
    expect(button('Copy enabled IDs').querySelector('.lucide-copy')).not.toBeNull();
    expect(console.error).toHaveBeenCalledWith('Failed to copy model IDs:', error);
  });

  it.each(['de', 'en', 'fa', 'fr', 'ru', 'zh'])(
    'uses the %s locale for the tooltip and accessible feedback',
    async (language) => {
      await i18n.changeLanguage(language);
      const label = i18n.getResource(language, 'translation', 'cloud.copyIds');
      const success = i18n.getResource(language, 'translation', 'cloud.copiedIds');
      expect(label).toBeTypeOf('string');
      expect(success).toBeTypeOf('string');
      expect(label.length).toBeGreaterThan(0);
      expect(success.length).toBeGreaterThan(0);
      await render(models, ['alpha/model']);
      expect(button(label).title).toBe(label);
      await click(button(label));
      expect(button(success).title).toBe(success);
    }
  );
});
