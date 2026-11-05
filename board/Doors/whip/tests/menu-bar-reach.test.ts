/**
 * The menu bar every WHIP screen draws is reachable from the keyboard.
 *
 * Only the main menu ever wired Tab. The other six screens - kanban,
 * project list, party timeline, leaderboard, achievements, my tasks - drew
 * the bar, ran with focusKeys:false (so the screen's own Tab navigation is
 * off), registered no Tab handler and no hotkey. A caller with a keyboard
 * and no mouse could see the bar and could not reach it (2026-09-13).
 *
 * The brackets in the dropdown labels were the other half: [T] [N] [V] [K]
 * [P] [L] [A] [D] were honoured on the main menu ONLY, so on every subpage
 * they advertised keys that did nothing. The bar answers them now, except
 * where the screen has claimed the letter for itself - and there the
 * bracket is not drawn at all, because a bracket nobody honours is worse
 * than no bracket.
 *
 * Driven: each real screen, a real Tab, a real letter, the focused element
 * and the navigation the door reports as the oracle.
 */

import assert from 'assert';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { showKanbanBoard } from '../ui/kanban-board';
import { showProjectList } from '../ui/project-list';
import { showPartyTimeline } from '../ui/party-timeline';
import { showLeaderboard } from '../ui/leaderboard';
import { showAchievements } from '../ui/achievements';
import { showMyTasks } from '../ui/my-tasks';
import { showMainMenu } from '../ui/main-menu';
import { WHIP_MENUS, menuBarHeight } from '../ui/menu';
import type { MenuSelection } from '../types/session';

function open(): any {
  return new Screen({ title: 'whip', width: 80, height: 25, focusKeys: false } as any);
}

function press(screen: any, ch: string, name: string, extra: any = {}): void {
  screen.program.emit('keypress', ch, { name, full: name, ...extra });
}

const settle = () => new Promise((r) => setTimeout(r, 40));

const USER: any = { userId: 'u1', handle: 'tester' };
const PROJECT: any = { id: 'p1', name: 'Demo', type: 'demo', status: 'active' };

const dataManager: any = {
  getTasksForProject: async () => [],
  loadParties: async () => [],
  loadUsers: async () => ({}),
  loadProjects: async () => [PROJECT],
  loadTasks: async () => [],
  loadAchievements: async () => ({}),
  getUser: async () => USER,
  updateTask: async () => {},
  updateRankings: async () => {},
};
const achievementManager: any = {
  checkAchievements: async () => [],
  getUnlockedAchievements: async () => [],
};
const partyCalendar: any = {
  getDaysUntilParty: () => 30,
  getPartyCountdownColor: () => 'green',
  refreshParties: async () => {},
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

/** Every screen that draws the bar, and the key that closes it. */
type ScreenCase = {
  name: string;
  /** Opens the screen; `nav` records what a menu pick asked the app loop for. */
  open: (screen: any, nav: (sel: MenuSelection) => void) => Promise<unknown>;
  /** A hotkey the screen does NOT claim, and where it should take the caller. */
  hotkey: { key: string; goes: MenuSelection };
  /** A letter the screen claims for itself, so the bar must leave it alone. */
  reserved?: string;
  quit: string;
};

const CASES: ScreenCase[] = [
  {
    name: 'kanban',
    open: (s, nav) => showKanbanBoard(s, PROJECT, USER, dataManager, achievementManager, {}, nav),
    hotkey: { key: 'l', goes: 'leaderboard' },
    reserved: 'n',
    quit: 'q',
  },
  {
    name: 'project-list',
    open: (s, nav) => showProjectList(s, USER, dataManager, achievementManager, {}, nav),
    hotkey: { key: 'p', goes: 'parties' },
    reserved: 'n',
    quit: 'q',
  },
  {
    name: 'party-timeline',
    open: (s, nav) => showPartyTimeline(s, USER, dataManager, partyCalendar, nav),
    hotkey: { key: 'k', goes: 'kanban' },
    reserved: 'r',
    quit: 'q',
  },
  {
    name: 'leaderboard',
    open: (s, nav) => showLeaderboard(s, USER, dataManager, nav),
    hotkey: { key: 'k', goes: 'kanban' },
    quit: 'q',
  },
  {
    name: 'achievements',
    open: (s, nav) => showAchievements(s, USER, dataManager, nav),
    hotkey: { key: 'k', goes: 'kanban' },
    quit: 'q',
  },
  {
    name: 'my-tasks',
    open: (s, nav) => showMyTasks(s, USER, dataManager, achievementManager, {}, nav),
    hotkey: { key: 'k', goes: 'kanban' },
    quit: 'q',
  },
];

export async function tabReachesTheMenuBarOnEveryScreen(): Promise<void> {
  for (const one of CASES) {
    const screen = open();
    try {
      const done = one.open(screen, () => {});
      await settle();

      const bar = menuBarOf(screen);
      assert.ok(bar, `${one.name}: the bar is drawn`);
      const stop = bar.getTabStop();
      assert.ok(stop, `${one.name}: the bar names a tab stop`);
      assert.notStrictEqual(screen.getFocused(), stop, `${one.name}: focus starts on the screen`);

      press(screen, '\t', 'tab');
      await settle();
      assert.strictEqual(screen.getFocused(), stop, `${one.name}: Tab lands on the bar`);

      press(screen, '\t', 'tab');
      await settle();
      assert.notStrictEqual(screen.getFocused(), stop, `${one.name}: Tab again leaves the bar`);

      press(screen, one.quit, one.quit);
      await done;
    } finally { screen.destroy(); }
  }
}

export async function theBracketedLettersWorkOnEveryScreen(): Promise<void> {
  for (const one of CASES) {
    const screen = open();
    try {
      let went: MenuSelection | null = null;
      const done = one.open(screen, (sel) => { went = sel; });
      await settle();

      press(screen, one.hotkey.key, one.hotkey.key);
      await settle();

      assert.strictEqual(
        went, one.hotkey.goes,
        `${one.name}: [${one.hotkey.key.toUpperCase()}] goes to ${one.hotkey.goes}`,
      );
      await done;
    } finally { screen.destroy(); }
  }
}

/**
 * A letter the screen owns stays the screen's: N on the kanban board is a
 * new TASK, not a new project, so the bar must neither steal it nor
 * advertise it.
 */
export async function aScreensOwnKeysAreNeverStolenOrAdvertised(): Promise<void> {
  for (const one of CASES) {
    if (!one.reserved) continue;
    const screen = open();
    try {
      let went: MenuSelection | null = null;
      const done = one.open(screen, (sel) => { went = sel; });
      await settle();

      const bar = menuBarOf(screen);
      const labels: string[] = [];
      for (let i = 0; i < WHIP_MENUS.length; i++) {
        const menu = bar.getMenu(i);
        for (const item of menu.items) labels.push(String(item.label));
      }
      const bracket = `[${one.reserved.toUpperCase()}]`;
      assert.ok(
        !labels.some((l) => l.includes(bracket)),
        `${one.name}: ${bracket} is not advertised - the screen answers it`,
      );
      // And the other brackets ARE there, so this is not "no brackets at all".
      assert.ok(labels.some((l) => l.includes('[K]') || l.includes('[L]')),
        `${one.name}: the letters the bar DOES answer keep their brackets`);

      press(screen, one.reserved, one.reserved);
      await settle();
      assert.strictEqual(went, null, `${one.name}: the bar did not steal ${bracket}`);

      press(screen, '\x1b', 'escape');
      await settle();
      press(screen, one.quit, one.quit);
      await done;
    } finally { screen.destroy(); }
  }
}

/** The main menu keeps its own table, so the bar must not fire twice. */
export async function theMainMenuStillAnswersItsOwnLetters(): Promise<void> {
  const screen = open();
  try {
    const done = showMainMenu(screen, USER, dataManager);
    await settle();
    press(screen, 'k', 'k');
    assert.strictEqual(await done, 'kanban', 'K opens the board from the main menu');
  } finally { screen.destroy(); }
}

export async function theBarTierIsOneNumber(): Promise<void> {
  assert.strictEqual(menuBarHeight(80), 1, 'the bar is up at 80');
  assert.strictEqual(menuBarHeight(60), 1, 'and at the tier itself');
  assert.strictEqual(menuBarHeight(59), 0, 'and gone below it');
  assert.strictEqual(menuBarHeight(40), 0, 'no bar on the C64 tier');
}
