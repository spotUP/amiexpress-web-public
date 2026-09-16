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

export async function aHeldCardStaysWhereItWasPickedUp(): Promise<void> {
  /*
   * "when i click and hold the button on a card without moving the mouse the
   * card is drawn at the top of the screen not at the current position"
   * (sysop, 2026-09-16).
   *
   * Taking hold of a card reparents it to the SCREEN so nothing clips it -
   * and taking hold of it also repaints the panels, because the door lights
   * the card that was grabbed. The renderer then wrote the card's place in
   * the PANEL's coordinates at a widget whose parent was now the screen, and
   * row one of the panel is row one of the screen. A caller who moved the
   * mouse never saw it: the next mousemove overwrote the position first.
   */
  const app = await openApp();
  try {
    await swapping(app, 614);
    app.updateAllPanels();
    app.screen.render();

    const card: any = app.cardButtons.focusables()[0];
    const before = { left: Number(card.aleft), top: Number(card.atop) };
    assert.ok(before.top > 2, `the hand row is down the screen, not at the top (${before.top})`);

    card.emit('mousedown', { x: before.left + 2, y: before.top + 1 });
    assert.strictEqual(app.cardButtons.dragging, 0, 'the card is in flight');

    // The repaint that taking hold of a card causes.
    app.updateAllPanels();
    app.screen.render();

    assert.deepStrictEqual(
      { left: Number(card.aleft), top: Number(card.atop) },
      before,
      'a card nobody has moved yet is still where it was picked up',
    );
  } finally { app.screen?.destroy?.(); }
}

export async function aCardPutDownGoesBackToItsExactPlace(): Promise<void> {
  // Reading `left` measures from the panel's outer corner and writing it
  // counts from inside the border, so a drag that read one and wrote the
  // other walked the card a cell up and to the left each time.
  const app = await openApp();
  try {
    await swapping(app, 615);
    app.updateAllPanels();
    app.screen.render();

    const card: any = app.cardButtons.focusables()[0];
    const home: any = card.parent;
    const before = { left: Number(card.aleft), top: Number(card.atop) };

    card.emit('mousedown', { x: before.left + 2, y: before.top + 1 });
    app.screen.emit('mouse', { action: 'mousemove', x: before.left + 20, y: before.top - 6 });
    assert.notStrictEqual(Number(card.atop), before.top, 'it travels with the pointer');

    app.screen.emit('mouse', { action: 'mouseup', x: before.left + 20, y: before.top - 6 });
    await new Promise((r) => setTimeout(r, 150));

    assert.strictEqual(card.parent, home, 'and belongs to its own panel again');
    assert.strictEqual(app.cardButtons.dragging, null, 'nothing is in flight');
    assert.deepStrictEqual(
      { left: Number(card.aleft), top: Number(card.atop) },
      before,
      'put down exactly where the renderer had it',
    );
  } finally { app.screen?.destroy?.(); }
}

export async function aCardCarriedOntoThePileIsPlayed(): Promise<void> {
  /*
   * "the card drops before i let go of them when i drag them out to the pile"
   * (sysop, 2026-09-16).
   *
   * Two things were wrong. Dragging was wired for the SWAP only, so during
   * play a card could be picked up and carried and had nowhere to go - it
   * went home on release, which reads as the card dropping by itself. And
   * the card in flight is drawn in front of everything, so at the moment the
   * button came up it was the widget under the pointer and answered the drop
   * itself, before the pointer's coordinates were looked at.
   */
  const app = await openApp();
  try {
    await swapping(app, 616);
    // Past the arranging and on turn, which is when a card can be played.
    (app.vandtia.constructor as any).BOT_PACE_MS = 0;
    app.vandtia.primaryAction();
    await new Promise((r) => setTimeout(r, 400));

    const me = app.currentProfile.userId;
    const until = Date.now() + 3000;
    while (Date.now() < until) {
      const engine = app.vandtia.load(app.findTableById(616))?.engine;
      if (!engine || engine.state.phase !== 'playing') break;
      if (engine.currentPlayerId() === me && !app.actionInProgress) break;
      await new Promise((r) => setTimeout(r, 25));
    }

    const engine = app.vandtia.load(app.findTableById(616)).engine;
    if (engine.state.phase !== 'playing' || engine.currentPlayerId() !== me) return;
    const legal = engine.legalPlays(me);
    if (legal.length === 0) return;

    app.updateAllPanels();
    app.screen.render();

    const card = engine.cardsInPlay(me)[legal[0]];
    const id = `${card.rank}${card.suit}`;
    const held: any = app.cardButtons.focusables()[legal[0]];
    const from = { x: Number(held.aleft) + 2, y: Number(held.atop) + 1 };

    held.emit('mousedown', { x: from.x, y: from.y });
    assert.strictEqual(app.cardButtons.dragging, legal[0], 'the card is in flight');

    // Carried up onto the panel holding the pile, and let go there.
    const pile = app.tableCardButtons.panelBounds();
    const onto = { x: pile.left + Math.floor(pile.width / 2), y: pile.top + 2 };
    app.screen.emit('mouse', { action: 'mousemove', x: onto.x, y: onto.y });
    app.screen.emit('mouse', { action: 'mouseup', x: onto.x, y: onto.y });
    await new Promise((r) => setTimeout(r, 300));

    const after = app.vandtia.load(app.findTableById(616)).engine;
    const inHand = after.cardsInPlay(me).map((c: any) => `${c.rank}${c.suit}`);
    assert.ok(!inHand.includes(id), `${id} was played, not put back (${inHand.join(' ')})`);
  } finally { app.screen?.destroy?.(); }
}

export async function aCardLetGoOverNothingGoesBack(): Promise<void> {
  // The other half: a drag that ends nowhere in particular must not play the
  // card. Picking it up still picks it, so ENTER can finish the move.
  const app = await openApp();
  try {
    await swapping(app, 617);
    (app.vandtia.constructor as any).BOT_PACE_MS = 0;
    app.vandtia.primaryAction();
    await new Promise((r) => setTimeout(r, 400));

    const me = app.currentProfile.userId;
    const engine = app.vandtia.load(app.findTableById(617)).engine;
    if (engine.state.phase !== 'playing' || engine.currentPlayerId() !== me) return;

    app.updateAllPanels();
    app.screen.render();
    const before = engine.cardsInPlay(me).map((c: any) => `${c.rank}${c.suit}`);

    const held: any = app.cardButtons.focusables()[0];
    held.emit('mousedown', { x: Number(held.aleft) + 2, y: Number(held.atop) + 1 });
    app.screen.emit('mouse', { action: 'mousemove', x: 1, y: 1 });
    app.screen.emit('mouse', { action: 'mouseup', x: 1, y: 1 });
    await new Promise((r) => setTimeout(r, 250));

    const after = app.vandtia.load(app.findTableById(617)).engine
      .cardsInPlay(me).map((c: any) => `${c.rank}${c.suit}`);
    assert.deepStrictEqual(after, before, 'a card let go over nothing is still in hand');
  } finally { app.screen?.destroy?.(); }
}
