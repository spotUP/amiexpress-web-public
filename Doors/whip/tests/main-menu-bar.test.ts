/**
 * The main menu carries the SDK's grouped menu bar: six dropdowns over
 * the same nine actions (Task, Project, Board, Party, Stars, Quit).
 *
 * The first bar was a flat blessed.listbar - every new feature would
 * have squeezed another key onto one row. Groups are where features
 * land from here. The bar is mouse and keyboard driven; Escape hands
 * focus back to the list; below 60 columns there is no bar and the
 * hotkeys carry.
 *
 * Driven: the real menu. Group labels read off the paint; a Board >
 * Kanban action fires through the dropdown's own item list; narrow
 * screens keep hotkeys.
 */

import assert from 'assert';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { showMainMenu } from '../ui/main-menu';
import { WHIP_MENUS } from '../ui/menu';
import type { MenuSelection } from '../types/session';

const GROUPS = ['Task', 'Project', 'Board', 'Party', 'Stars', 'Me', 'Quit'];

export async function menuCoversEveryDestination(): Promise<void> {
  const seen = WHIP_MENUS.flatMap((g) => g.entries.map((e) => e.value));
  const all: MenuSelection[] = [
    'quick-task', 'new-project', 'view-projects', 'kanban', 'my-tasks',
    'parties', 'leaderboard', 'achievements', 'my-profile', 'quit',
  ];
  for (const dest of all) {
    assert.ok(seen.includes(dest), `WHIP_MENUS reaches ${dest}`);
  }
  assert.strictEqual(seen.length, all.length, 'no destination twice, none missing');
}

function open(width = 80): any {
  return new Screen({ title: 'whip', width, height: 25, focusKeys: false } as any);
}

const settle = () => new Promise((r) => setTimeout(r, 30));

const user: any = { userId: 'u1' };
const dataManager: any = {
  loadProjects: async () => [],
  loadTasks: async () => [],
  loadParties: async () => [],
};

function menuBarOf(screen: any): any {
  let found: any;
  const walk = (el: any): void => {
    if (Array.isArray(el.menuButtons) && el.menuButtons.length > 0) found = el;
    (el.children || []).forEach(walk);
  };
  walk(screen);
  return found;
}

export async function menuBarGroupsEveryAction(): Promise<void> {
  const screen = open();
  try {
    const done = showMainMenu(screen, user, dataManager);
    await settle();

    const bar = menuBarOf(screen);
    assert.ok(bar, 'the SDK menu bar is on screen');
    const labels = bar.menuButtons.map((b: any) =>
      String(b.options?.content ?? b.content ?? '').replace(/\{[^}]*\}/g, '').trim());
    for (const want of GROUPS) {
      assert.ok(labels.some((t: string) => t.includes(want)), `the bar carries ${want}`);
    }

    // Board > Kanban through the dropdown's own items.
    const boardMenu = bar.getMenu(2);
    assert.ok(boardMenu, 'the Board dropdown exists');
    const kanban = boardMenu.items.find((i: any) => String(i.label).includes('Kanban'));
    assert.ok(kanban, 'Kanban sits under Board');
    kanban.action();
    assert.strictEqual(await done, 'kanban', 'the action opens the board');
  } finally { screen.destroy(); }
}

export async function narrowScreensSkipTheBar(): Promise<void> {
  const screen = open(40);
  // Headless Screens clamp to 80 columns, so narrow is staged by
  // overriding the instance width - the door only ever reads it.
  Object.defineProperty(screen, 'width', { value: 40, configurable: true });
  try {
    const done = showMainMenu(screen, user, dataManager);
    await settle();

    assert.strictEqual(menuBarOf(screen), undefined, 'no menu bar below 60 columns');

    // The menu itself still works: hotkey K opens the board.
    screen.program.emit('keypress', 'k', { name: 'k', full: 'k' });
    assert.strictEqual(await done, 'kanban', 'hotkeys carry narrow screens');
  } finally { screen.destroy(); }
}
