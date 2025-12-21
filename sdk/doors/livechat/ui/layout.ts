import type { Screen } from '../../../engines/ui/blessed';

/** Layout configuration */
export interface LayoutConfig {
  screen: Screen;
  chatWidth: number;
  sidebarWidth: number;
  inputHeight: number;
}

/** Calculate layout dimensions */
export function calcLayout(screen: Screen): LayoutConfig {
  const w = (screen as any).width || 80;
  const sidebarWidth = Math.min(20, Math.floor(w * 0.25));
  return {
    screen,
    chatWidth: w - sidebarWidth - 1,
    sidebarWidth,
    inputHeight: 3
  };
}

/** Get chat panel bounds */
export function chatBounds(cfg: LayoutConfig) {
  return {
    top: 0,
    left: 0,
    width: cfg.chatWidth,
    height: '100%-' + cfg.inputHeight
  };
}

/** Get sidebar bounds */
export function sidebarBounds(cfg: LayoutConfig) {
  return {
    top: 0,
    right: 0,
    width: cfg.sidebarWidth,
    height: '100%-' + cfg.inputHeight
  };
}

/** Get input bounds */
export function inputBounds(cfg: LayoutConfig) {
  return {
    bottom: 0,
    left: 0,
    width: '100%',
    height: cfg.inputHeight
  };
}
