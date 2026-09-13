/**
 * The party timeline repaints; it does not rebuild. And R actually refreshes.
 *
 * Three defects, one shape - the screen had no data/paint split:
 *
 *  (a) `render()` was async and called unawaited from four handlers, and it
 *      awaited INSIDE its per-party loop after reassigning `listBox`. Two
 *      quick arrows had two builds in flight and the older one wrote its
 *      content into the newer pane.
 *  (b) `upcomingParties` was const-captured at open. R called
 *      `refreshParties()` and reloaded `parties`, but nothing recomputed the
 *      list on screen, so the refresh the footer advertises changed nothing.
 *  (c) Every arrow key destroyed the pane, rebuilt it, re-read the projects
 *      and tasks ONCE PER PARTY and re-serialised everything - for a cursor
 *      that moved one row. ~198 bytes is one XIM message on 68K.
 *
 * Driven: a real Screen, the real timeline, real keys, with the stub
 * counting its own reads.
 */

import assert from 'assert';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { showPartyTimeline } from '../ui/party-timeline';

function party(i: number, name?: string): any {
  return {
    id: `p${i}`,
    name: name ?? `Party ${i}`,
    location: 'Somewhere',
    date: '2026-12-01',
    categories: ['demo'],
  };
}

function open(): any {
  return new Screen({ title: 'whip', width: 80, height: 25, focusKeys: false } as any);
}

function press(screen: any, ch: string, name: string, extra: any = {}): void {
  screen.program.emit('keypress', ch, { name, full: name, ...extra });
}

const settle = () => new Promise((r) => setTimeout(r, 40));

const user: any = { userId: 'u1' };
const partyCalendar = (onRefresh: () => void): any => ({
  getDaysUntilParty: () => 30,
  getPartyCountdownColor: () => 'green',
  refreshParties: async () => { onRefresh(); },
});

function listBoxOf(screen: any): any {
  let found: any;
  const walk = (el: any): void => {
    if (String(el.options?.label ?? '').includes('Parties')) found = el;
    (el.children || []).forEach(walk);
  };
  walk(screen);
  return found;
}

export async function refreshRedrawsTheTimelineWithWhatItFetched(): Promise<void> {
  const screen = open();
  let fetched = [party(0), party(1)];
  const dataManager: any = {
    loadParties: async () => fetched,
    loadProjects: async () => [],
    loadTasks: async () => [],
  };
  const calendar = partyCalendar(() => {
    // What refreshParties() does on the real board: it writes new parties,
    // and the next loadParties() hands them back.
    fetched = [party(0), party(1), party(2, 'Revision 2027')];
  });

  try {
    const done = showPartyTimeline(screen, user, dataManager, calendar);
    await settle();
    assert.ok(
      !String(listBoxOf(screen).getContent()).includes('Revision 2027'),
      'the new party is not there yet',
    );

    press(screen, 'r', 'r');
    await settle();
    await settle();

    assert.ok(
      String(listBoxOf(screen).getContent()).includes('Revision 2027'),
      'R put the freshly fetched party on screen',
    );

    press(screen, '\x1b', 'escape');
    await done;
  } finally { screen.destroy(); }
}

export async function anArrowKeyRepaintsThePaneInsteadOfRebuildingIt(): Promise<void> {
  const screen = open();
  let projectReads = 0;
  let taskReads = 0;
  const dataManager: any = {
    loadParties: async () => [0, 1, 2, 3].map((i) => party(i)),
    loadProjects: async () => { projectReads++; return []; },
    loadTasks: async () => { taskReads++; return []; },
  };

  try {
    const done = showPartyTimeline(screen, user, dataManager, partyCalendar(() => {}));
    await settle();

    const pane = listBoxOf(screen);
    assert.ok(pane, 'the parties pane exists');

    for (let i = 0; i < 3; i++) {
      press(screen, 'down', 'down');
      await settle();
    }

    assert.strictEqual(
      listBoxOf(screen), pane,
      'the same pane is still on screen - an arrow key repaints, it does not replace',
    );
    // A pane that is replaced is a pane a still-running build writes into,
    // and a pane that is rebound every time collects duplicate handlers.
    assert.strictEqual(
      pane.listeners('wheeldown').length, 1,
      'the wheel is bound once, not once per repaint',
    );
    assert.ok(projectReads >= 1, 'the data was read at least once');
    assert.strictEqual(projectReads, 1, 'three arrow keys re-read nothing');
    assert.strictEqual(taskReads, 1, 'nor the tasks');

    press(screen, '\x1b', 'escape');
    await done;
  } finally { screen.destroy(); }
}

/**
 * Exactly one party is marked, and it is the selected one: a stale paint
 * writing over a newer one shows up as two marks or as a mark on the wrong
 * block.
 */
export async function heldArrowsLeaveOneMarkOnTheRightParty(): Promise<void> {
  const screen = open();
  const dataManager: any = {
    loadParties: async () => [0, 1, 2, 3].map((i) => party(i)),
    loadProjects: async () => [],
    loadTasks: async () => [],
  };

  try {
    const done = showPartyTimeline(screen, user, dataManager, partyCalendar(() => {}));
    await settle();

    // Held, not paced: four Downs with no wait between them.
    for (let i = 0; i < 4; i++) press(screen, 'down', 'down');
    await settle();
    await settle();

    const content = String(listBoxOf(screen).getContent());
    const marks = content.split('{inverse}').length - 1;
    assert.strictEqual(marks, 1, `exactly one party is marked, found ${marks}`);
    // Blocks are eight rows each; the mark must sit on the LAST party.
    const markedBefore = content.slice(0, content.indexOf('{inverse}'));
    assert.ok(markedBefore.includes('Party 2'), 'the mark is past the earlier parties');
    assert.ok(!markedBefore.includes('Party 3'), 'and it is on the last one');

    press(screen, '\x1b', 'escape');
    await done;
  } finally { screen.destroy(); }
}


/** The reads, on their own: once for the screen, never once per party. */
export async function openingTheTimelineReadsTheBoardOnce(): Promise<void> {
  const screen = open();
  let projectReads = 0;
  let taskReads = 0;
  const dataManager: any = {
    loadParties: async () => [0, 1, 2, 3].map((i) => party(i)),
    loadProjects: async () => { projectReads++; return []; },
    loadTasks: async () => { taskReads++; return []; },
  };

  try {
    const done = showPartyTimeline(screen, user, dataManager, partyCalendar(() => {}));
    await settle();
    assert.strictEqual(projectReads, 1, 'the projects are read ONCE, not once per party');
    assert.strictEqual(taskReads, 1, 'and so are the tasks');

    press(screen, '\x1b', 'escape');
    await done;
  } finally { screen.destroy(); }
}
