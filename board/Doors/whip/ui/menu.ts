import { MenuBar } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { MenuSelection } from '../types/session';
import { T } from '../door-theme';

/**
 * The one menu bar, on every WHIP screen (2026-09-10).
 *
 * It started on the main menu only, so every subpage answered the same
 * hotkeys with no visible map. Each screen calls this first, shifts its
 * header down by menuBarHeight(), and destroys the bar in cleanup.
 * Picks ride onNavigate out to the app loop (screens stay
 * single-purpose: they resolve as before, and the loop jumps).
 */

/**
 * The width at which the bar is worth its row. Below it the footer hints
 * carry the keys and the bar is not drawn at all.
 *
 * ONE copy of this number (2026-09-13): the `screen.width >= 60 ? 1 : 0`
 * expression was written out in all seven screens plus this file, so a
 * change of tier meant eight edits and seven chances to miss one.
 */
const MENU_BAR_MIN_WIDTH = 60;

/**
 * Rows the menu bar occupies: 1 when it is up, 0 below the tier.
 *
 * Every screen offsets its header, its content pane and its pane height by
 * this, and it has to be answerable BEFORE the bar exists - the layout is
 * built first - so it is a pure function of the width, not a field on the
 * handle.
 */
export function menuBarHeight(screenWidth: number): number {
  return screenWidth >= MENU_BAR_MIN_WIDTH ? 1 : 0;
}

/** One row of one dropdown. The hotkey is data, not part of the label. */
export interface WhipMenuEntry {
  /** The letter the row advertises in brackets, upper case. */
  hotkey: string;
  label: string;
  value: MenuSelection;
}

export interface WhipMenu {
  label: string;
  entries: WhipMenuEntry[];
}

export const WHIP_MENUS: WhipMenu[] = [
  { label: 'Task', entries: [
    { hotkey: 'T', label: 'Quick Task', value: 'quick-task' },
    { hotkey: 'M', label: 'My Tasks', value: 'my-tasks' },
  ] },
  { label: 'Project', entries: [
    { hotkey: 'N', label: 'New Project', value: 'new-project' },
    { hotkey: 'V', label: 'View All', value: 'view-projects' },
  ] },
  { label: 'Board', entries: [
    { hotkey: 'K', label: 'Kanban', value: 'kanban' },
  ] },
  { label: 'Party', entries: [
    { hotkey: 'P', label: 'Timeline', value: 'parties' },
  ] },
  { label: 'Stars', entries: [
    { hotkey: 'L', label: 'Leaderboard', value: 'leaderboard' },
    { hotkey: 'A', label: 'Achievements', value: 'achievements' },
  ] },
  { label: 'Me', entries: [
    { hotkey: 'D', label: 'Profile', value: 'my-profile' },
  ] },
  { label: 'Quit', entries: [
    { hotkey: 'Q', label: 'Quit', value: 'quit' },
  ] },
];

export interface WhipMenuBar {
  bar: MenuBar;
  destroy: () => void;
}

/** The element a screen hands focus back to - its list, or its scrolling pane. */
type FocusTarget = { focus?: () => void } | null | undefined;

export interface WhipMenuOptions {
  /**
   * Who answers the bracketed letters.
   *
   * 'bar' (the default) - this helper binds them, so a subpage's brackets
   * mean something. 'host' - the screen has its own table for exactly these
   * letters (the main menu's list), and a second binding would fire twice.
   */
  hotkeys?: 'bar' | 'host';
  /**
   * Letters the screen answers ITSELF, for something else: N is a new task
   * on the kanban board, not a new project. The bar neither binds nor
   * advertises these - a bracket nobody honours is worse than no bracket.
   */
  reserved?: readonly string[];
}

/**
 * Build the bar (or nothing on narrow screens) and wire picks, Tab, Escape
 * and the letter hotkeys.
 *
 * `focusHost` returns the element the screen nominates - usually its list.
 * It does three jobs: Escape off the menus hands focus back to it, Tab from
 * it steps ON to the bar, and it is the GATE for the letter hotkeys. That
 * last one is why it returns the element rather than focusing it: WHIP's
 * dialogs (task editor, project editor, confirm) live on the same screen
 * and their keys reach the screen's keypress listeners too, so the bar must
 * be able to ask "is the caller on the board, or typing in a dialog?"
 * before it acts on a letter.
 *
 * Keyboard reachability (2026-09-13): only the main menu used to wire Tab,
 * and WHIP runs every screen with focusKeys:false - so on the other six the
 * bar that each one draws could be reached with a MOUSE and by nothing else.
 */
export function attachWhipMenu(
  screen: Screen,
  onPick: (value: MenuSelection) => void,
  focusHost: () => FocusTarget,
  options: WhipMenuOptions = {}
): WhipMenuBar | null {
  if (menuBarHeight(screen.width) === 0) return null;

  const boundByBar = (options.hotkeys ?? 'bar') === 'bar';
  const reserved = new Set((options.reserved ?? []).map((k) => k.toUpperCase()));
  const advertised = (entry: WhipMenuEntry): boolean =>
    !boundByBar || !reserved.has(entry.hotkey);

  const bar = new MenuBar({
    screen,
    items: WHIP_MENUS.map((g) => ({
      label: g.label,
      items: g.entries.map((e) => ({
        label: advertised(e) ? `[${e.hotkey}] ${e.label}` : e.label,
        action: () => onPick(e.value),
      })),
    })),
    style: {
      bg: T.ground,
      fg: T.ink,
      hover: { bg: T.accent, fg: T.ground },
    },
  });

  const backToHost = (): void => {
    focusHost()?.focus?.();
  };
  bar.on('exit', backToHost);

  const entryFor = (hotkey: string): WhipMenuEntry | undefined => {
    for (const group of WHIP_MENUS) {
      for (const entry of group.entries) {
        if (entry.hotkey === hotkey) return entry;
      }
    }
    return undefined;
  };

  const keyHandler = (_ch: unknown, key: { name?: string; ctrl?: boolean; meta?: boolean }): void => {
    const stop = bar.getTabStop();
    if (!stop) return;
    const focused = screen.getFocused?.() as unknown;
    const onBar = focused === (stop as unknown);
    const onHost = focused !== undefined && focused !== null && focused === (focusHost() as unknown);

    if (key.name === 'tab') {
      // Tab is the way IN and the way back out. Anywhere else - a dialog
      // over the screen, a dropdown already open - Tab belongs to whoever
      // has focus, and this must not yank it away mid-edit.
      if (onBar) backToHost();
      else if (onHost) stop.focus();
      else return;
      screen.render();
      return;
    }

    if (!boundByBar || !onHost || key.ctrl || key.meta) return;
    const name = (key.name ?? '').toUpperCase();
    if (name.length !== 1 || reserved.has(name)) return;
    const entry = entryFor(name);
    if (entry) onPick(entry.value);
  };
  screen.on('keypress', keyHandler);

  return {
    bar,
    destroy: () => {
      screen.off('keypress', keyHandler);
      // Close before destroy: hide() releases the focus trap, and
      // destroy() alone would skip that release on a live trap.
      bar.closeAll();
      bar.destroy();
    },
  };
}
