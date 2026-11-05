/**
 * The party timeline scrolls with the selection - and says so.
 *
 * The footer promises "Up/Down: Scroll" but the handler only moved
 * selectedIndex and re-rendered from the top: no scroll offset followed
 * the selection, no scrollbar was shown, no wheel handler existed, so
 * the selection moved below the fold invisibly (2026-09-10). The pane
 * now scrolls to the selection, shows a scrollbar, and answers the
 * mousewheel.
 *
 * Driven: a real Screen, the real timeline with six parties (each ~8
 * rows, the 19-row pane fits two), real keys and wheel events.
 */

import assert from 'assert';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { showPartyTimeline } from '../ui/party-timeline';

function party(i: number): any {
  return {
    id: `p${i}`,
    name: `Party ${i}`,
    location: 'Somewhere',
    date: '2026-12-01',
    categories: ['demo'],
  };
}

const PARTIES = [0, 1, 2, 3, 4, 5].map(party);

function open(): any {
  return new Screen({ title: 'whip', width: 80, height: 25, focusKeys: false } as any);
}

function press(screen: any, ch: string, name: string, extra: any = {}): void {
  screen.program.emit('keypress', ch, { name, full: name, ...extra });
}

const settle = () => new Promise((r) => setTimeout(r, 30));

const user: any = { userId: 'u1' };
const dataManager: any = {
  loadParties: async () => PARTIES,
  loadProjects: async () => [],
  loadTasks: async () => [],
};
const partyCalendar: any = {
  getDaysUntilParty: () => 30,
  getPartyCountdownColor: () => 'green',
  refreshParties: async () => {},
};

function listBoxOf(screen: any): any {
  let found: any;
  const walk = (el: any): void => {
    if (String(el.options?.label ?? '').includes('Parties')) found = el;
    (el.children || []).forEach(walk);
  };
  walk(screen);
  return found;
}

export async function selectionStaysOnScreen(): Promise<void> {
  const screen = open();
  try {
    const done = showPartyTimeline(screen, user, dataManager, partyCalendar);
    await settle();

    // The pane is built once and repainted (2026-09-13), so a held
    // reference would do - the lookup stays because it asks the SCREEN
    // what is on it rather than trusting a variable.
    const showing = () => listBoxOf(screen);
    assert.ok(showing(), 'the parties pane exists');
    assert.ok(showing().options?.scrollbar, 'the pane shows a scrollbar');
    assert.strictEqual(showing().getScroll(), 0, 'starts at the top');

    // Five downs: the selection is on party 5, deep below the fold.
    for (let i = 0; i < 5; i++) {
      press(screen, 'down', 'down');
      await settle();
    }
    assert.ok(showing().getScroll() > 0, 'the pane scrolled to follow the selection');

    press(screen, '\x1b', 'escape');
    await done;
  } finally { screen.destroy(); }
}

export async function wheelMovesTheSelection(): Promise<void> {
  const screen = open();
  try {
    const done = showPartyTimeline(screen, user, dataManager, partyCalendar);
    await settle();

    const showing = () => listBoxOf(screen);
    assert.ok(showing(), 'the parties pane exists');

    showing().emit('wheeldown');
    await settle();
    showing().emit('wheeldown');
    await settle();
    assert.ok(showing().getScroll() > 0, 'two wheel ticks scrolled down');

    const afterDown = showing().getScroll();
    showing().emit('wheelup');
    await settle();
    assert.ok(showing().getScroll() <= afterDown, 'wheel up scrolls back');

    showing().emit('wheelup');
    await settle();
    assert.strictEqual(showing().getScroll(), 0, 'back at the top');

    press(screen, '\x1b', 'escape');
    await done;
  } finally { screen.destroy(); }
}
