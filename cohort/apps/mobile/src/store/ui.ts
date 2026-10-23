import { create } from 'zustand';

/** Local UI state (Zustand): create sheet, tab filters, FAB visibility. */
type UiState = {
  createSheetOpen: boolean;
  setCreateSheetOpen: (open: boolean) => void;
};

export const useUiStore = create<UiState>((set) => ({
  createSheetOpen: false,
  setCreateSheetOpen: (open) => set({ createSheetOpen: open }),
}));
