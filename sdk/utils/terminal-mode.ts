/**
 * The 80x25 / responsive switch, for any door with a layout worth resizing.
 *
 * Three things have to happen together, and every door that got this wrong
 * got it wrong by doing only some of them:
 *
 *   1. ASK THE TERMINAL. The browser terminal starts fixed at 80x25 and
 *      stays there until a door calls enableWideMode() - BBSTerminal says so
 *      in its own source ("DON'T auto-fit on mount"). A door that only sizes
 *      its own widgets to 100% fills a terminal that never grew, which is
 *      exactly what the sprite studio did, twice, before this existed.
 *   2. FOLLOW THE RESIZE. Laying out once answers "what size am I now"; the
 *      screen's resize event answers "what size did I just become". The
 *      livechat door learned that twice and wrote it down.
 *   3. PUT IT BACK. A caller returning to the BBS should get its 80 columns
 *      back, not the door's wide terminal.
 *
 * Doors differ only in what re-layout MEANS for them - some recompute
 * percentages, some rebuild a widget that took its geometry at construction
 * - so that is the one thing the caller supplies.
 */

export type TerminalMode = 'fixed' | 'wide';

export interface TerminalModeSwitchOptions {
  /** The door's BBS API - carries enableWideMode/disableWideMode. */
  bbs: any;
  /** The door's screen, for the resize event. */
  screen: any;
  /** What the door does when the size changes. May be async. */
  onRelayout: () => void | Promise<void>;
  /** Where to start. Defaults to 'wide': a door asking for this wants it. */
  start?: TerminalMode;
}

export interface TerminalModeSwitch {
  mode(): TerminalMode;
  set(mode: TerminalMode): void;
  toggle(): void;
  /** A ready-made menu entry, so every door labels it the same way. */
  menuItem(): { label: string; action: () => void };
  /** Restores fixed 80 columns and stops listening. Call from door teardown. */
  dispose(): void;
}

export const TERMINAL_MODE_MENU_LABEL = '80x25 / Responsive';

export function createTerminalModeSwitch(options: TerminalModeSwitchOptions): TerminalModeSwitch {
  const { bbs, screen, onRelayout } = options;
  let mode: TerminalMode = options.start ?? 'wide';
  let disposed = false;

  const askTerminal = (): void => {
    if (mode === 'wide') bbs?.enableWideMode?.();
    else bbs?.disableWideMode?.();
  };

  const relayout = (): void => {
    if (disposed) return;
    void onRelayout();
  };

  askTerminal();
  screen?.on?.('resize', relayout);

  return {
    mode: () => mode,

    set(next: TerminalMode): void {
      if (next === mode) return;
      mode = next;
      askTerminal();
      relayout();
    },

    toggle(): void {
      this.set(mode === 'wide' ? 'fixed' : 'wide');
    },

    menuItem() {
      return { label: TERMINAL_MODE_MENU_LABEL, action: () => this.toggle() };
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      screen?.removeListener?.('resize', relayout);
      // Always fixed on the way out, whatever the door was showing.
      bbs?.disableWideMode?.();
    },
  };
}
