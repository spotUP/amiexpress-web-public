/**
 * ARRANGING THE TWO ROWS BY CARRYING A CARD.
 *
 * "in the swap card view it would be nice to press enter to hold a card and
 * swap with the arrow keys, swap left right for the cards next to the card
 * and up/down for table vs hand cards etc" (sysop, 2026-09-16).
 *
 * Which is a drag, done with the keyboard: ENTER picks the card under the
 * cursor up, the arrows carry it - sideways along its own row, up or down
 * between the hand and the table - and ENTER puts it down. The card the
 * caller is carrying MOVES WITH THE CURSOR, so a run of arrows is one
 * continuous gesture rather than a series of separate swaps.
 *
 * The number keys still work; somebody who knows 1-3 then 4-6 should not have
 * to learn this.
 */

import assert from 'assert';
import { isolatedDataDir } from './isolated-data-dir';

isolatedDataDir('carry');

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

/** A dealt table, sitting in the swap, with the door on screen. */
async function swapping(app: any, id: number): Promise<void> {
  const me = app.currentProfile.userId;
  const table: any = {
    id, gameId: 'skitgubbe', gameName: 'Skitgubbe', stakesLabel: 'Social',
    smallBlind: 0, bigBlind: 0, buyIn: 0, entryFee: 0,
    minPlayers: 2, maxPlayers: 3, status: 'open',
    createdAt: Date.now(), updatedAt: Date.now(), hostUserId: me,
    autoStart: false, isPrivate: false, observers: [],
    players: [{
      userId: me, username: 'sysop', seat: 0, stack: 0, buyIn: 0,
      role: 'player', joinedAt: Date.now(), isBot: false,
    }],
  };
  app.syncBotsForTable(table);
  app.lobby.tables.unshift(table);
  app.currentProfile.currentTableId = id;
  app.currentProfile.status = 'table';
  await app.persistState();
  await app.dealHand();
  app.applyViewMode('table');
  app.updateAllPanels();
}

const press = (app: any, name: string): void => {
  (app.screen as any)._handleKey(name.length === 1 ? name : '', { name, full: name, ch: name });
};

const rowsOf = (app: any, id: number) => {
  const me = app.currentProfile.userId;
  const player = app.vandtia.load(app.findTableById(id)).engine.playerById(me);
  return {
    hand: player.hand.map((card: any) => `${card.rank}${card.suit}`),
    table: player.faceUp.map((card: any) => `${card.rank}${card.suit}`),
  };
};

export async function enterPicksACardUpAndPutsItDown(): Promise<void> {
  const app = await openApp();
  try {
    await swapping(app, 600);
    assert.strictEqual(app.vandtia.heldCard, null, 'nothing is held to begin with');

    press(app, 'enter');
    await new Promise((r) => setTimeout(r, 80));
    assert.deepStrictEqual(app.vandtia.heldCard, { row: 'hand', index: 0 },
      'ENTER picks up the card under the cursor');

    press(app, 'enter');
    await new Promise((r) => setTimeout(r, 80));
    assert.strictEqual(app.vandtia.heldCard, null, 'and ENTER again puts it down');
  } finally { app.screen?.destroy?.(); }
}

export async function anArrowWalksTheCursorWhenNothingIsHeld(): Promise<void> {
  const app = await openApp();
  try {
    await swapping(app, 601);
    const before = rowsOf(app, 601);

    press(app, 'right');
    await new Promise((r) => setTimeout(r, 80));
    assert.deepStrictEqual(app.vandtia.swapCursor, { row: 'hand', index: 1 },
      'the cursor moves along the row');

    press(app, 'down');
    await new Promise((r) => setTimeout(r, 80));
    assert.strictEqual(app.vandtia.swapCursor.row, 'table',
      'and down crosses to the table cards');

    assert.deepStrictEqual(rowsOf(app, 601), before,
      'and nothing was moved, because nothing was being carried');
  } finally { app.screen?.destroy?.(); }
}

export async function acarriedCardTravelsAlongItsOwnRow(): Promise<void> {
  const app = await openApp();
  try {
    await swapping(app, 602);
    const before = rowsOf(app, 602);

    press(app, 'enter');                       // hold the first hand card
    press(app, 'right');
    await new Promise((r) => setTimeout(r, 150));

    const after = rowsOf(app, 602);
    assert.deepStrictEqual(after.hand, [before.hand[1], before.hand[0], before.hand[2]],
      'it changed places with its neighbour');
    assert.deepStrictEqual(after.table, before.table, 'and the table is untouched');
    assert.deepStrictEqual(app.vandtia.heldCard, { row: 'hand', index: 1 },
      'the hold follows the card, so the gesture can carry on');
  } finally { app.screen?.destroy?.(); }
}

export async function aCarriedCardCrossesBetweenTheRows(): Promise<void> {
  // This is the swap the phase exists for, done as one gesture.
  const app = await openApp();
  try {
    await swapping(app, 603);
    const before = rowsOf(app, 603);

    press(app, 'enter');                       // hold hand[0]
    press(app, 'down');                        // carry it to the table
    await new Promise((r) => setTimeout(r, 200));

    const after = rowsOf(app, 603);
    assert.strictEqual(after.table[0], before.hand[0], 'the carried card is on the table');
    assert.strictEqual(after.hand[0], before.table[0], 'and the table card came to the hand');
    assert.deepStrictEqual(app.vandtia.heldCard, { row: 'table', index: 0 },
      'still carrying it, now on the other row');
  } finally { app.screen?.destroy?.(); }
}

export async function aCardIsNeverCarriedOffTheEndOfARow(): Promise<void> {
  const app = await openApp();
  try {
    await swapping(app, 604);
    const before = rowsOf(app, 604);

    press(app, 'enter');                       // hold hand[0]
    press(app, 'left');                        // there is nothing to its left
    await new Promise((r) => setTimeout(r, 150));

    assert.deepStrictEqual(rowsOf(app, 604), before, 'nothing moved');
    assert.deepStrictEqual(app.vandtia.heldCard, { row: 'hand', index: 0 },
      'and it is still in hand, where it was');
  } finally { app.screen?.destroy?.(); }
}

export async function theNumberKeysStillSwapTheOldWay(): Promise<void> {
  // Somebody who knows 1-3 then 4-6 should not have to learn the new gesture.
  const app = await openApp();
  try {
    await swapping(app, 605);
    const before = rowsOf(app, 605);

    press(app, '1');
    press(app, '4');
    await new Promise((r) => setTimeout(r, 200));

    const after = rowsOf(app, 605);
    assert.strictEqual(after.table[0], before.hand[0], 'the hand card went to the table');
    assert.strictEqual(after.hand[0], before.table[0], 'and the table card came back');
  } finally { app.screen?.destroy?.(); }
}

export async function theCarriedCardIsLetGoWhenPlayStarts(): Promise<void> {
  const app = await openApp();
  try {
    await swapping(app, 606);
    (app.vandtia.constructor as any).BOT_PACE_MS = 0;

    press(app, 'enter');
    assert.ok(app.vandtia.heldCard, 'carrying one');

    app.vandtia.primaryAction();               // X: ready
    await new Promise((r) => setTimeout(r, 600));

    assert.strictEqual(app.vandtia.heldCard, null, 'nothing is carried into the play');
    assert.deepStrictEqual(app.vandtia.swapCursor, { row: 'hand', index: 0 },
      'and the cursor is back where a fresh swap would start it');
  } finally { app.screen?.destroy?.(); }
}

/**
 * The same move, made with the mouse.
 *
 * "clicking works nice now but drag n drop is an obvious feature in a card
 * game as well" (sysop, 2026-09-16). A card is a widget, so a drag is the two
 * events it already emits: `mousedown` where the gesture starts, `mouseup`
 * where it ends. Both land on the same `carryTo` the arrows use - one
 * implementation, because "swap this card with that one" is one move however
 * the caller expressed it.
 */
export async function aCardCanBeDraggedFromTheHandToTheTable(): Promise<void> {
  const app = await openApp();
  try {
    await swapping(app, 610);
    const before = rowsOf(app, 610);

    // Down on the first hand card, up on the second table card.
    app.cardButtons.focusables()[0].emit('mousedown');
    assert.deepStrictEqual(app.vandtia.heldCard, { row: 'hand', index: 0 },
      'the mouse picks the card up');

    app.tableCardButtons.focusables()[1].emit('mouseup');
    await new Promise((r) => setTimeout(r, 200));

    const after = rowsOf(app, 610);
    assert.strictEqual(after.table[1], before.hand[0], 'the dragged card landed on the table');
    assert.strictEqual(after.hand[0], before.table[1], 'and the one it displaced came back');
    assert.strictEqual(app.vandtia.heldCard, null, 'the card was let go where it was dropped');
  } finally { app.screen?.destroy?.(); }
}

export async function aCardCanBeDraggedAlongItsOwnRow(): Promise<void> {
  const app = await openApp();
  try {
    await swapping(app, 611);
    const before = rowsOf(app, 611);

    app.cardButtons.focusables()[0].emit('mousedown');
    app.cardButtons.focusables()[2].emit('mouseup');
    await new Promise((r) => setTimeout(r, 200));

    const after = rowsOf(app, 611);
    assert.deepStrictEqual(after.hand, [before.hand[2], before.hand[1], before.hand[0]],
      'the two changed places');
    assert.deepStrictEqual(after.table, before.table, 'and the table is untouched');
  } finally { app.screen?.destroy?.(); }
}

export async function aDragStartedWithTheMouseCanBeFinishedWithTheArrows(): Promise<void> {
  // The mouse and the keyboard set the SAME hold, so the two gestures are one.
  const app = await openApp();
  try {
    await swapping(app, 612);
    const before = rowsOf(app, 612);

    app.cardButtons.focusables()[0].emit('mousedown');
    press(app, 'down');
    await new Promise((r) => setTimeout(r, 200));

    const after = rowsOf(app, 612);
    assert.strictEqual(after.table[0], before.hand[0],
      'picked up with the mouse, carried with an arrow');
  } finally { app.screen?.destroy?.(); }
}

export async function droppingWhereNothingWasPickedUpDoesNothing(): Promise<void> {
  const app = await openApp();
  try {
    await swapping(app, 613);
    const before = rowsOf(app, 613);

    app.tableCardButtons.focusables()[0].emit('mouseup');
    await new Promise((r) => setTimeout(r, 150));

    assert.deepStrictEqual(rowsOf(app, 613), before, 'a drop with nothing held moves nothing');
  } finally { app.screen?.destroy?.(); }
}
