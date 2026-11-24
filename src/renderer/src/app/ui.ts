import { create } from 'zustand';

/** Which side panel is open. The timing editor has its own store (lyrics/editor-store.ts). */
interface UiState {
  lyricsPanel: boolean;
  toggleLyricsPanel(open?: boolean): void;
}

export const useUi = create<UiState>((set, get) => ({
  lyricsPanel: false,
  toggleLyricsPanel(open) {
    set({ lyricsPanel: open ?? !get().lyricsPanel });
  },
}));
