// src/store/useToastStore.ts
// Tiny global toast queue. Replaces the "copied!"-inside-the-button pattern so
// feedback is consistent everywhere and does not depend on a button staying
// mounted (modals, toolbars, streaming columns all share one channel).
import { create } from 'zustand';

export type ToastKind = 'info' | 'success' | 'error';

export interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

interface ToastState {
  toasts: Toast[];
  push: (message: string, kind?: ToastKind) => void;
  dismiss: (id: number) => void;
}

const TOAST_TTL_MS = 2600;

let nextId = 1;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (message, kind = 'info') => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, message, kind }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, TOAST_TTL_MS);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Convenience for non-React callers (services, event handlers). */
export const toast = (message: string, kind?: ToastKind): void =>
  useToastStore.getState().push(message, kind);
