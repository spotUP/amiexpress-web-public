import { MenuBar } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { MenuSelection } from '../types/session';
import { T } from '../door-theme';

/**
 * The one menu bar, on every WHIP screen (2026-09-10).
 *
 * It started on the main menu only, so every subpage answered the same
 * hotkeys with no visible map. Each screen calls this first, shifts its
 * header down by the returned barH, and destroys the bar in cleanup.
 * Picks ride onNavigate out to the app loop (screens stay
 * single-purpose: they resolve as before, and the loop jumps).
 */
export interface WhipMenu {
  label: string;
  entries: Array<{ label: string; value: MenuSelection }>;
}

export const WHIP_MENUS: WhipMenu[] = [
  { label: 'Task', entries: [
    { label: '[T] Quick Task', value: 'quick-task' },
    { label: '[M] My Tasks', value: 'my-tasks' },
  ] },
  { label: 'Project', entries: [
    { label: '[N] New Project', value: 'new-project' },
    { label: '[V] View All', value: 'view-projects' },
  ] },
  { label: 'Board', entries: [
    { label: '[K] Kanban', value: 'kanban' },
  ] },
  { label: 'Party', entries: [
    { label: '[P] Timeline', value: 'parties' },
  ] },
  { label: 'Stars', entries: [
    { label: '[L] Leaderboard', value: 'leaderboard' },
    { label: '[A] Achievements', value: 'achievements' },
  ] },
  { label: 'Me', entries: [
    { label: '[D] Profile', value: 'my-profile' },
  ] },
  { label: 'Quit', entries: [
    { label: '[Q] Quit', value: 'quit' },
  ] },
];

export interface WhipMenuBar {
  bar: MenuBar;
  /** 1 when the bar is up, 0 below 60 columns (footer hints cover it). */
  barH: number;
  destroy: () => void;
}

/**
 * Build the bar (or nothing on narrow screens) and wire picks + Escape.
 * onExit refocuses whatever the screen nominates - usually its list -
 * so Escape off the menus never strands focus on the bar.
 */
export function attachWhipMenu(
  screen: Screen,
  onPick: (value: MenuSelection) => void,
  onExit: () => void
): WhipMenuBar | null {
  if (screen.width < 60) return null;
  const bar = new MenuBar({
    screen,
    items: WHIP_MENUS.map((g) => ({
      label: g.label,
      items: g.entries.map((e) => ({
        label: e.label,
        action: () => onPick(e.value),
      })),
    })),
    style: {
      bg: T.ground,
      fg: T.ink,
      hover: { bg: T.accent, fg: T.ground },
    },
  });
  bar.on('exit', onExit);
  return {
    bar,
    barH: 1,
    destroy: () => {
      // Close before destroy: hide() releases the focus trap, and
      // destroy() alone would skip that release on a live trap.
      bar.closeAll();
      bar.destroy();
    },
  };
}
