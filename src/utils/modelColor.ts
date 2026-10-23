// src/utils/modelColor.ts
// One stable color per model, shared by every view that shows a model.
//
// Before this, each surface kept its own positional palette
// (`COLUMN_COLORS[index]`, `MODEL_COLORS[i]`, `COLORS[i]`) — so a model changed
// color when a column was added, and blind mode's column shuffle re-colored
// everything mid-comparison. Deriving the color from the model name instead
// means "the cyan one" is the same model in the columns, the chart, the
// scoreboard, the diff header and the history chips.

/**
 * Six hues, spaced around the wheel so neighbours stay distinguishable and
 * none of them collides with the indigo primary action or the rose danger
 * state. Values are Tailwind's 500 step, which reads on both light and dark.
 */
export const MODEL_PALETTE = [
  { name: 'indigo', hex: '#6366f1', text: 'text-indigo-500' },
  { name: 'cyan', hex: '#06b6d4', text: 'text-cyan-500' },
  { name: 'emerald', hex: '#10b981', text: 'text-emerald-500' },
  { name: 'amber', hex: '#f59e0b', text: 'text-amber-500' },
  { name: 'rose', hex: '#f43f5e', text: 'text-rose-500' },
  { name: 'violet', hex: '#8b5cf6', text: 'text-violet-500' },
] as const;

export type ModelColor = (typeof MODEL_PALETTE)[number];

/**
 * FNV-1a. Small, fast, and stable across runs and machines — unlike
 * `Math.random` or an index, it makes the assignment reproducible, so a model
 * keeps its color between sessions and across screenshots.
 */
function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // >>> 0 keeps it an unsigned 32-bit int; Math.abs is unnecessary then.
  return h >>> 0;
}

/**
 * The model's color. Pass the *qualified* name (`provider/model` for cloud,
 * plain id for local) so two providers serving the same model id don't
 * collapse onto one color.
 */
export function modelColor(qualified: string): ModelColor {
  if (!qualified) return MODEL_PALETTE[0];
  return MODEL_PALETTE[hash(qualified) % MODEL_PALETTE.length];
}

/** Convenience for the common `style={{ background }}` case. */
export function modelColorHex(qualified: string): string {
  return modelColor(qualified).hex;
}

/**
 * Colors for a set of models that are shown together, guaranteed distinct.
 *
 * Hashing alone can put two models on the same hue, which is worse than the
 * old positional palette in the common 2-model case — the whole point is
 * telling them apart. So each model takes its hashed slot when free, and
 * otherwise walks forward to the next unclaimed one. Assignment follows the
 * caller's order, which keeps it stable for a given set of columns.
 */
export function modelColors(qualifiedNames: string[]): Map<string, ModelColor> {
  const used = new Set<number>();
  const out = new Map<string, ModelColor>();
  for (const name of qualifiedNames) {
    if (out.has(name)) continue;
    const start = hash(name) % MODEL_PALETTE.length;
    let slot = start;
    for (let step = 0; step < MODEL_PALETTE.length; step++) {
      const candidate = (start + step) % MODEL_PALETTE.length;
      if (!used.has(candidate)) {
        slot = candidate;
        break;
      }
    }
    used.add(slot);
    out.set(name, MODEL_PALETTE[slot]);
  }
  return out;
}
