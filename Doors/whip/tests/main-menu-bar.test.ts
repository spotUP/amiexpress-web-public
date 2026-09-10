/**
 * The main menu carries a menu bar: every action, one row, clickable.
 *
 * Nine actions lived behind single-key hotkeys only; the bar maps them
 * all (Task, Project, Boards, Kanban, Mine, Parties, Stars, Medals,
 * Quit) for the mouse. It never takes focus - the list keeps the
 * arrows - and it hides below 60 columns where the footer hints carry
 * the same keys.
 *
 * Driven: the real menu, a real click (button press) on Kanban.
 */

import assert from 'assert';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { showMainMenu } from '../ui/main-menu';

const EXPECTED = ['Task', 'Project', 'Boards', 'Kanban', 'Mine', 'Parties', 'Stars', 'Medals', 'Quit'];

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

function buttonsOf(screen: any): any[] {
  const out: any[] = [];
  const walk = (el: any): void => {
    if (String(el.type ?? '') === 'button') out.push(el);
    (el.children || []).forEach(walk);
  };
  walk(screen);
  return out;
}

const textOf = (el: any): string =>
  String(el.options?.content ?? el.content ?? '').replace(/\{[^}]*\}/g, '').trim();

export async function menuBarMapsEveryAction(): Promise<void> {
  const screen = open();
  try {
    const done = showMainMenu(screen, user, dataManager);
    await settle();

    const labels = buttonsOf(screen).map(textOf).filter((t) => t.length > 0);
    for (const want of EXPECTED) {
      assert.ok(labels.some((t) => t.includes(want)), `the bar carries ${want} (saw: ${labels.join('|')})`);
    }

    const kanban = buttonsOf(screen).find((b) => textOf(b).includes('Kanban'));
    assert.ok(kanban, 'the Kanban button exists');
    kanban.emit('press');
    assert.strictEqual(await done, 'kanban', 'clicking Kanban opens the board');
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

    assert.strictEqual(buttonsOf(screen).length, 0, 'no menu buttons below 60 columns');

    // The menu itself still works: hotkey K opens the board.
    screen.program.emit('keypress', 'k', { name: 'k', full: 'k' });
    assert.strictEqual(await done, 'kanban', 'hotkeys carry narrow screens');
  } finally { screen.destroy(); }
}
