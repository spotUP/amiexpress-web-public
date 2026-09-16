/**
 * THE CARDS ARE SEEN ARRIVING, AND THE PILE IS SEEN LEAVING.
 *
 * "at the start of all card games animate the cards when they are given to
 * the player one by one", "when i add a card that empties the pile my card is
 * not shown on the pile before emptying and we need an empty pile animation
 * as well", and then - of the first attempt - "the animations needs more
 * frames so we can see the cards animate in not just pop up" (sysop,
 * 2026-09-16).
 *
 * That last one is what this file exists to hold on to. A card that appears
 * in its final place is a state change; an animation is the FRAMES IN
 * BETWEEN. So the assertions are about positions observed while it runs, not
 * about where things end up - the end state was never the part that broke.
 */

import assert from 'assert';
import { isolatedDataDir } from './isolated-data-dir';

isolatedDataDir('animate');

async function openApp(): Promise<any> {
  const { CardLobbyApp } = await import('../index');
  const bbs: any = {
    write: () => {}, writeLine: () => {}, on: () => {},
    getTerminalSize: () => ({ width: 106, height: 30 }),
    enableWideMode: () => {}, disableWideMode: () => {},
    getModemSpeed: () => 0, disableModemEmulation: () => {}, setModemSpeed: () => {},
    connectionType: 'web', unicodeCapable: true,
  };
  const socket: any = { on: () => {}, emit: () => {}, off: () => {}, removeAllListeners: () => {} };
  const app: any = new CardLobbyApp({
    bbs, socket, params: [],
    bbsSession: { userId: 1, username: 'sysop', nodeId: 1, secLevel: 255, screenHeight: 30, socket },
    user: { id: 1, username: 'sysop', name: 'sysop', accessLevel: 255 },
  } as any);
  void app.run();
  await new Promise((r) => setTimeout(r, 1500));
  return app;
}

const HAND = [
  { rank: '9', suit: 'S' }, { rank: 'K', suit: 'H' }, { rank: '2', suit: 'D' },
];
const entries = (cards: any[]) => cards.map((card) => ({ kind: 'standard' as const, card }));

/**
 * Watch every position a card widget is drawn at.
 *
 * `screen.render` is the only honest place to sample from: it is what puts a
 * frame in front of the caller, so a position the test never sees here is a
 * position the caller never saw either.
 */
function recordFrames(app: any, row: any): number[][] {
  const frames: number[][] = [];
  const realRender = app.screen.render.bind(app.screen);
  app.screen.render = () => {
    frames.push(row.focusables().map((card: any) => Number(card.left)));
    return realRender();
  };
  return frames;
}

export async function aDealtCardTravelsRatherThanAppearing(): Promise<void> {
  const app = await openApp();
  try {
    app.uiManager.handPanel.width = 59;
    app.uiManager.handPanel.height = 12;

    const frames = recordFrames(app, app.cardButtons);
    await app.cardAnimator.deal(entries(HAND));

    assert.ok(frames.length > HAND.length,
      `more frames than cards - otherwise each card simply appeared: ${frames.length}`);

    // The first card is seen at several DIFFERENT places on its way in.
    const firstCardSeenAt = new Set(
      frames.filter((f) => f.length > 0).map((f) => f[0]),
    );
    assert.ok(firstCardSeenAt.size > 2,
      `a card is drawn at several places as it travels: ${[...firstCardSeenAt].join(', ')}`);

    // It comes IN - from the right edge of the panel towards its place.
    const firstSeen = Math.max(...firstCardSeenAt);
    const settled = Number(app.cardButtons.focusables()[0].left);
    assert.ok(firstSeen > settled,
      `it starts off to the right and travels left: from ${firstSeen} to ${settled}`);
    // Where it LANDS is the renderer's business, and is asserted against the
    // renderer itself in the next test rather than against a number here.
    assert.ok(settled >= 0, `and lands on the panel: ${settled}`);
  } finally { app.screen?.destroy?.(); }
}

export async function everyCardEndsWhereTheRendererPutIt(): Promise<void> {
  // An animation that leaves a card out of place is worse than none.
  const app = await openApp();
  try {
    app.uiManager.handPanel.width = 59;
    app.uiManager.handPanel.height = 12;

    await app.cardAnimator.deal(entries(HAND));
    const animated = app.cardButtons.focusables().map((c: any) => [Number(c.left), Number(c.top)]);

    app.cardButtons.render(entries(HAND), {
      selected: null, playable: [], labels: false, onPick: () => {},
    });
    const plain = app.cardButtons.focusables().map((c: any) => [Number(c.left), Number(c.top)]);

    assert.deepStrictEqual(animated, plain,
      'the hand after the animation is the hand the renderer draws');
  } finally { app.screen?.destroy?.(); }
}

export async function aBurningPileIsSeenLeaving(): Promise<void> {
  const app = await openApp();
  try {
    app.uiManager.flopPanel.width = 59;
    app.uiManager.flopPanel.height = 12;

    const pile = [
      { rank: '4', suit: 'C' }, { rank: '7', suit: 'H' }, { rank: '10', suit: 'S' },
    ];
    const frames = recordFrames(app, app.tableCardButtons);
    await app.cardAnimator.burn(entries(pile));

    const withCards = frames.filter((f) => f.length > 0);
    assert.ok(withCards.length > 1, 'the pile is drawn more than once on its way out');

    // The card that did it is on screen BEFORE the pile goes - the whole
    // complaint was that it never was.
    assert.ok(withCards[0].length === pile.length,
      `the full pile, the burning card on it, is shown first: ${withCards[0].length}`);

    // And the cards travel to the right, off the panel.
    const firstLeft = withCards[0][0];
    const lastLeft = withCards[withCards.length - 1][0];
    assert.ok(lastLeft > firstLeft,
      `the pile slides away rather than blinking out: ${firstLeft} -> ${lastLeft}`);
  } finally { app.screen?.destroy?.(); }
}

export async function aFortyColumnCallerIsNotAnimatedAt(): Promise<void> {
  /*
   * A 40-column PETSCII screen has no cells to spare for decoration, and the
   * SDK already says so (`effectsAllowed`). The cards simply appear there,
   * which is the behaviour every game had before any of this.
   */
  const app = await openApp();
  try {
    app.uiManager.handPanel.width = 38;
    app.uiManager.handPanel.height = 10;
    const wide = app.screen.width;
    app.screen.width = 40;

    const frames = recordFrames(app, app.cardButtons);
    await app.cardAnimator.deal(entries(HAND));
    app.screen.width = wide;

    assert.strictEqual(frames.length, 0, 'nothing is animated at forty columns');
  } finally { app.screen?.destroy?.(); }
}
