import { create } from 'zustand';

export type ToastTone = 'info' | 'success' | 'warning' | 'error';

interface ToastState {
  id: number;
  text: string | null;
  detail: string | null;
  tone: ToastTone;
}

export const useToast = create<ToastState>(() => ({
  id: 0,
  text: null,
  detail: null,
  tone: 'info',
}));

/** Show a short message at the top of the window. */
export function toast(text: string, tone: ToastTone = 'info', detail: string | null = null): void {
  useToast.setState((s) => ({ id: s.id + 1, text, detail, tone }));
}
