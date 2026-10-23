import { describe, it, expect } from 'vitest';
import { MODEL_PALETTE, modelColor, modelColors } from './modelColor';

describe('modelColor', () => {
  it('is stable for the same name', () => {
    expect(modelColor('llama3:8b')).toBe(modelColor('llama3:8b'));
  });

  it('always returns a palette entry', () => {
    for (const name of ['', 'a', 'llama3:70b', 'cloud:openai/gpt-4o', '🚀']) {
      expect(MODEL_PALETTE).toContain(modelColor(name));
    }
  });

  it('spreads names across more than one hue', () => {
    const names = Array.from({ length: 40 }, (_, i) => `model-${i}`);
    const hues = new Set(names.map((n) => modelColor(n).name));
    expect(hues.size).toBeGreaterThan(3);
  });
});

describe('modelColors', () => {
  it('never assigns the same color to two models shown together', () => {
    // More models than palette entries is the adversarial case; every slot
    // before the palette is exhausted must still be unique.
    const names = Array.from({ length: MODEL_PALETTE.length }, (_, i) => `m${i}`);
    const colors = modelColors(names);
    expect(colors.size).toBe(names.length);
    expect(new Set([...colors.values()].map((c) => c.name)).size).toBe(names.length);
  });

  it('keeps a model on the same color when its neighbours change', () => {
    const alone = modelColors(['llama3:8b']).get('llama3:8b');
    const withOthers = modelColors(['llama3:8b', 'qwen:7b', 'mistral:7b']);
    // The first name claims its hashed slot, so adding models later never
    // recolors the model the user was already watching.
    expect(withOthers.get('llama3:8b')).toBe(alone);
  });

  it('ignores duplicate names', () => {
    const colors = modelColors(['a', 'a', 'b']);
    expect(colors.size).toBe(2);
  });
});
