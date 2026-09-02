/**
 * The leaderboard is drawn from the terminal it is given, and follows it.
 *
 * Every box in render() carried the numbers of an 80x24 screen - width 70 and
 * 76, left 2, top 6 and 20 - and show() registered no resize listener at all.
 * So on a terminal Alt+Enter had widened, the whole leaderboard sat in the
 * top-left corner of a much larger screen and stayed there (2026-09-02).
 *
 * Driven, not read: these open a real Screen and a real LeaderboardScreen and
 * inspect the widgets show() actually built. A source pin proves a call
 * exists, not that it runs.
 */

import assert from 'assert';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { LeaderboardScreen } from '../ui/leaderboard-screen';

const sounds: any = { playSfx() {}, playMusic() {}, stop() {}, stopMusic() {} };

const highScores: any = {
  getTopScores: () => [],
  getPersonalBest: () => null,
};

async function open(width: number, height: number) {
  const screen: any = new Screen({
    title: 'leaderboard', responsive: width !== 80 || height !== 25, width, height,
  } as any);
  const leaderboard: any = new LeaderboardScreen(screen, highScores, sounds, 'sysop');
  void leaderboard.show();   // resolves on Q/ESC; we only need the widgets
  await new Promise(r => setTimeout(r, 50));
  const boxes = (): any[] => screen.children.filter((c: any) => !c.hidden);
  return { screen, boxes, destroy: () => screen.destroy() };
}

/** A bordered panel, by its label. */
function panel(h: any, label: string): any {
  return h.boxes().find((c: any) => String(c.options?.label ?? '').includes(label));
}

/** A text box, by a fragment of its content. */
function text(h: any, fragment: string): any {
  return h.boxes().find((c: any) => String(c.options?.content ?? '').includes(fragment));
}

export async function eightyColumnsIsExactlyWhereItAlwaysWas(): Promise<void> {
  const h = await open(80, 25);
  try {
    const scores = panel(h, 'Top 10');
    assert.ok(scores, 'the scores panel must exist');
    assert.strictEqual(scores.position.left, 2, 'two columns of margin, as before');
    assert.strictEqual(scores.position.width, 76, 'and the width it always had');
  } finally { h.destroy(); }
}

export async function aWideTerminalCentresTheTable(): Promise<void> {
  const h = await open(200, 60);
  try {
    const scores = panel(h, 'Top 10');
    assert.strictEqual(scores.position.width, 110,
      'the table widens with the room, up to its cap');
    assert.strictEqual(scores.position.left, Math.floor((200 - 110) / 2),
      'and is centred, not pinned to the corner');

    const personal = panel(h, 'Your Best');
    assert.strictEqual(personal.position.left, scores.position.left,
      'the personal best panel shares the left edge');
    assert.strictEqual(personal.position.top, scores.position.top + scores.position.height,
      'and sits directly under the table, however tall the table grew');
  } finally { h.destroy(); }
}

export async function aTallTerminalGivesTheTableItsRows(): Promise<void> {
  const h = await open(200, 60);
  try {
    const scores = panel(h, 'Top 10');
    assert.strictEqual(scores.position.height, 60 - 6 - 3 - 2,
      'the table takes the height left over, rather than a fixed 14 rows');
  } finally { h.destroy(); }
}

export async function itFollowsTheTerminalWhenAltEnterIsPressed(): Promise<void> {
  const h = await open(80, 25);
  try {
    assert.strictEqual(panel(h, 'Top 10').position.left, 2);

    h.screen.resize(200, 60);      // what Alt+Enter leads to

    const scores = panel(h, 'Top 10');
    assert.strictEqual(scores.position.width, 110,
      're-rendered for the new size rather than left at 76');
    assert.strictEqual(scores.position.left, Math.floor((200 - 110) / 2),
      'the leaderboard re-centres itself rather than staying in the corner');
  } finally { h.destroy(); }
}

export async function theTitleAndTabsAreTextNotBoxes(): Promise<void> {
  const h = await open(80, 25);
  try {
    const title = text(h, 'LEADERBOARDS');
    assert.ok(title, 'the title must exist');
    assert.ok(!title.border,
      'the title is a line of text; createBox would otherwise frame it');

    const hint = text(h, 'Change Mode');
    assert.ok(hint, 'the hint line must exist');
    assert.ok(!hint.border, 'so is the hint line');
  } finally { h.destroy(); }
}
