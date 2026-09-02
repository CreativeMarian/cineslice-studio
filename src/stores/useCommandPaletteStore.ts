// 全局命令面板 / 快捷键帮助的开关状态
// v1.0

import { create } from 'zustand';

type PaletteView = 'commands' | 'help';

interface CommandPaletteState {
  open: boolean;
  view: PaletteView;
  openPalette: () => void;
  openHelp: () => void;
  close: () => void;
  toggle: () => void;
}

export const useCommandPaletteStore = create<CommandPaletteState>((set, get) => ({
  open: false,
  view: 'commands',
  openPalette: () => set({ open: true, view: 'commands' }),
  openHelp: () => set({ open: true, view: 'help' }),
  close: () => set({ open: false }),
  toggle: () => {
    const { open, view } = get();
    if (open && view === 'commands') set({ open: false });
    else set({ open: true, view: 'commands' });
  },
}));
