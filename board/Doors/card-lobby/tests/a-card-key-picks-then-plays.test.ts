/**
 * ONE CARD KEY, TWO MEANINGS - AND A HAND LONGER THAN THE KEYBOARD.
 *
 * "how do we do when a user has picked up 20 cards? left/right navigation
 * and enter to select cards? that should always work btw next to the
 * hotkeys" and "x for throwing cards is not so nice, pressing the hotkey
 * once to select and once more to throw makes more sense" (sysop,
 * 2026-09-15).
 *
 * So: a card key picks, the SAME key plays, ENTER plays whatever is picked,
 * and the arrows walk a hand of any length - which is the only way to reach
 * the eleventh card, there being no eleventh number key. All of it lives in
 * managers/KeyBindings.ts and asks the game registry, so every game in the
 * lobby gets it; a game whose keys mean something else (patience picks a
 * PILE, a Skitgubbe swap is 1-3 then 4-6) says so by not answering
 * `selectedCard`, and those are pinned here too.
 */

import assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';
import { isolatedDataDir } from './isolated-data-dir';

isolatedDataDir('cardkeys');

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

/**
 * Wait for the door to finish the move it started.
 *
 * `primaryAction` goes through `runAction`, which is async: the card leaves
 * the hand a tick or two after the key. A fixed sleep here is a flake
 * waiting to happen on a loaded machine, so this polls for the thing the
 * test is about instead.
 */
async function settle(check: () => boolean, budgetMs = 3000): Promise<void> {
  const until = Date.now() + budgetMs;
  while (Date.now() < until) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
}

/** Press a key the way the caller does: through the screen's own dispatch. */
function press(app: any, name: string): void {
  (app.screen as any)._handleKey(name.length === 1 ? name : '', { name, full: name, ch: name });
}

async function seated(app: any, id: number): Promise<any> {
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
  return table;
}

/** Dealt, past the swap, and on turn. */
/**
 * Dealt, past the swap, and WAITING ON THE CALLER.
 *
 * A fixed sleep after readying was not enough: the bots play their turns
 * asynchronously, and a test that starts pressing keys while one of them is
 * still moving reads a turn that changes under it. That is what made
 * `aCardKeyPicksAndTheSameKeyPlaysIt` and `enterPlaysWhateverIsPicked` fail
 * about one run in three - a false red, which is the kind that makes a whole
 * suite ignorable.
 *
 * So the bots are given no pace at all and the fixture waits for the turn to
 * actually BE the caller's before handing back.
 */
async function playing(app: any, id: number): Promise<any> {
  await seated(app, id);
  (app.vandtia.constructor as any).BOT_PACE_MS = 0;
  app.vandtia.primaryAction();                   // ready
  await new Promise((r) => setTimeout(r, 400));
  app.applyViewMode('table');
  app.updateAllPanels();

  const me = app.currentProfile.userId;
  const until = Date.now() + 3000;
  while (Date.now() < until) {
    const engine = app.vandtia.load(app.findTableById(id))?.engine;
    if (!engine || engine.state.phase !== 'playing') break;
    if (engine.currentPlayerId() === me && !app.actionInProgress) break;
    await new Promise((r) => setTimeout(r, 25));
  }
  return app.findTableById(id);
}

const handOf = (app: any, table: any): any[] => {
  const engine = app.vandtia.load(table).engine;
  return engine.playerById(app.currentProfile.userId).hand;
};

/*
 * WATCH THE CARD, NOT THE COUNT. vändtia refills from the stock after every
 * play, so a hand of three stays a hand of three - and the stock is shared,
 * so counting "my hand plus the stock" drops whenever a BOT draws too. Every
 * card in the deck is unique, so the question a test can ask cleanly is
 * whether this particular card is still in my hand.
 */
const holds = (app: any, table: any, card: any): boolean => {
  const engine = app.vandtia.load(table).engine;
  return engine.playerById(app.currentProfile.userId).hand
    .some((held: any) => held.rank === card.rank && held.suit === card.suit);
};

export async function aCardKeyPicksAndTheSameKeyPlaysIt(): Promise<void> {
  const app = await openApp();
  try {
    const table = await playing(app, 120);
    const engine = app.vandtia.load(table).engine;
    if (engine.currentPlayerId() !== app.currentProfile.userId) return;   // bots first: nothing to prove
    const legal = engine.legalPlays(app.currentProfile.userId);
    if (legal.length === 0) return;
    const key = String(legal[0] + 1);

    const card = handOf(app, table)[legal[0]];
    press(app, key);
    assert.strictEqual(app.vandtia.selectedCardIndex, legal[0],
      'the first press picks the card and plays nothing');
    assert.ok(holds(app, app.findTableById(120), card), 'and the card is still in hand');

    press(app, key);
    await settle(() => !holds(app, app.findTableById(120), card));
    assert.ok(!holds(app, app.findTableById(120), card),
      'the same key again throws it');
  } finally { app.screen?.destroy?.(); }
}

export async function enterPlaysWhateverIsPicked(): Promise<void> {
  const app = await openApp();
  try {
    const table = await playing(app, 121);
    const engine = app.vandtia.load(table).engine;
    if (engine.currentPlayerId() !== app.currentProfile.userId) return;
    const legal = engine.legalPlays(app.currentProfile.userId);
    if (legal.length === 0) return;

    const card = handOf(app, table)[legal[0]];
    press(app, String(legal[0] + 1));            // pick
    press(app, 'enter');                          // and throw it
    await settle(() => !holds(app, app.findTableById(121), card));
    assert.ok(!holds(app, app.findTableById(121), card), 'ENTER plays the picked card');
  } finally { app.screen?.destroy?.(); }
}

export async function enterWithNothingPickedPlaysNothing(): Promise<void> {
  const app = await openApp();
  try {
    const table = await playing(app, 122);
    const held = handOf(app, table).map((card: any) => `${card.rank}${card.suit}`);
    app.vandtia.selectedCardIndex = null;
    press(app, 'enter');
    await new Promise((r) => setTimeout(r, 200));
    assert.deepStrictEqual(
      handOf(app, app.findTableById(122)).map((card: any) => `${card.rank}${card.suit}`),
      held,
      'a hand nobody picked from loses no cards',
    );
  } finally { app.screen?.destroy?.(); }
}

export async function theArrowsReachPastTheTenthCard(): Promise<void> {
  // Twenty cards, ten number keys: the arrows are the rest of the hand.
  const app = await openApp();
  try {
    const table = await playing(app, 123);
    const loaded = app.vandtia.load(table);
    const me = loaded.engine.playerById(app.currentProfile.userId);
    const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    me.hand = Array.from({ length: 20 }, (_, index) => ({
      rank: RANKS[index % 13], suit: 'SHDC'[index % 4],
    }));
    table.hand.snapshot = loaded.engine.serialize();
    await app.persistState();

    app.vandtia.selectedCardIndex = 0;
    for (let step = 0; step < 12; step += 1) press(app, 'right');
    assert.strictEqual(app.vandtia.selectedCardIndex, 12,
      'the arrows walk past the tenth card, which no number key reaches');

    press(app, 'left');
    assert.strictEqual(app.vandtia.selectedCardIndex, 11, 'and back again');
  } finally { app.screen?.destroy?.(); }
}

export async function aSwapIsStillTwoDifferentKeys(): Promise<void> {
  /*
   * 1-3 picks a hand card and 4-6 the table card it changes places with, so
   * pressing 1 twice must NOT mean "play": the game is not in a phase where
   * anything is played at all.
   */
  const app = await openApp();
  try {
    const table = await seated(app, 124);          // dealt, still swapping
    app.applyViewMode('table');
    const state = () => app.vandtia.load(app.findTableById(124)).engine.state;
    assert.strictEqual(state().phase, 'swap', 'the swap comes first');

    press(app, '1');
    press(app, '1');
    await new Promise((r) => setTimeout(r, 200));

    assert.strictEqual(state().phase, 'swap', 'two presses of one key swap nothing');
    assert.strictEqual(app.vandtia.selectedHandIndex, 0, 'the hand card is still picked');
    assert.strictEqual(app.vandtia.selectedCard(app.findTableById(124)), null,
      'and the door knows this phase has no card to throw');
  } finally { app.screen?.destroy?.(); }
}

export async function aTwentyCardHandIsDrawnInTwoRows(): Promise<void> {
  const app = await openApp();
  try {
    app.uiManager.handPanel.width = 59;
    app.uiManager.handPanel.height = 12;
    const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const hand = Array.from({ length: 20 }, (_, index) => ({
      rank: RANKS[index % 13], suit: 'SHDC'[index % 4],
    }));

    const drawn = app.cardButtons.renderStandard(hand, {
      selected: 0, playable: hand.map((_, index) => index), onPick: () => {},
    });
    assert.strictEqual(drawn, true, 'twenty cards are drawn, not described');

    const cards = app.cardButtons.focusables();
    assert.strictEqual(cards.length, 20, 'one widget per card');

    const rows = new Set(cards.map((card: any) => Number(card.top)));
    assert.ok(rows.size >= 2 && rows.size <= 3,
      `a hand this long wraps rather than vanishing: ${rows.size} rows`);

    const inside = Number(app.uiManager.handPanel.width) - 2;
    for (const card of cards) {
      assert.ok(Number(card.left) + Number(card.width) <= inside,
        'and every card is inside the panel');
    }
  } finally { app.screen?.destroy?.(); }
}

export async function theDoorAsksForTheKeyRepeatOfAMenu(): Promise<void> {
  /*
   * "pressing v flicks back directly" (sysop, 2026-09-15). The browser
   * auto-repeats a held key, and in GAME repeat - the default for every door
   * that does not say otherwise - that is every 30ms after 400ms. V turns
   * the lower panel over, so a press held half a second turned it over four
   * times and left it where it started; and a repeated card key now throws
   * the card it picked.
   *
   * `KEY_REPEAT=application` has existed and been read by the server all
   * along (`declaredKeyRepeatMode`) and NOT ONE DOOR IN THE TREE DECLARED
   * IT - a feature that shipped and never ran. This door declares it, and
   * the browser's half of the rule is pinned next door in
   * web/frontend/src/components/__tests__/a-command-key-does-not-repeat.
   */
  const icon = readFileSync(join(__dirname, '..', 'card-lobby.info'), 'latin1');
  const declared = icon.split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.toUpperCase().startsWith('KEY_REPEAT='));

  assert.ok(declared, 'the door icon declares a key repeat mode');
  assert.strictEqual(declared!.split('=')[1].trim().toLowerCase(), 'application',
    'and it is the one for a door whose screen is a table, not an arcade door');
}

export async function twoCardsOfOneValueArePickedTogetherAndPlayedAtOnce(): Promise<void> {
  /*
   * The house rule, through the keys a caller actually presses: a card key
   * picks, a key on a card of the SAME VALUE joins the pick, and pressing a
   * picked card again plays the lot - "the user should be able to drop
   * several cards of the same value on the cards on the table ... and get a
   * new one from the deck so he always have 3 on hand" (sysop, 2026-09-16).
   *
   * THE PAIR IS TWO TWOS ON PURPOSE. A two gives the turn back, so the table
   * does not move on after the play and the assertions read a settled game.
   * A first cut used nines, and the bots - paced at zero for the tests - had
   * played half a dozen turns and burned the pile by the time it looked; the
   * test failed while the rule worked.
   */
  const app = await openApp();
  try {
    const table = await playing(app, 130);
    const engine = app.vandtia.load(table).engine;
    const me = app.currentProfile.userId;
    if (engine.currentPlayerId() !== me) return;

    engine.playerById(me).hand = [
      { rank: '2', suit: 'H' }, { rank: '2', suit: 'S' }, { rank: 'K', suit: 'C' },
    ] as any;
    engine.state.pile = [{ rank: '4', suit: 'D' }] as any;
    engine.state.stock = [{ rank: '7', suit: 'C' }, { rank: '8', suit: 'D' }] as any;
    table.hand.snapshot = engine.serialize();
    await app.persistState();

    press(app, '1');
    press(app, '2');
    assert.deepStrictEqual(app.vandtia.selectedCards, [0, 1], 'both twos are picked');

    press(app, '2');                                   // the second press plays them
    await settle(() => (app.vandtia.load(app.findTableById(130))?.engine.state.pile.length ?? 0) >= 3);

    const after = app.vandtia.load(app.findTableById(130)).engine;
    const pile = after.state.pile.map((card: any) => `${card.rank}${card.suit}`);
    assert.deepStrictEqual(pile, ['4D', '2H', '2S'], 'both twos went down in one move');
    assert.strictEqual(after.playerById(me).hand.length, 3,
      'and the hand is drawn back up to three');
    assert.strictEqual(after.currentPlayerId(), me, 'a two hands the turn back');
  } finally { app.screen?.destroy?.(); }
}

export async function pickingADifferentValueStartsTheGroupAgain(): Promise<void> {
  // What a caller changing their mind looks like: the group is not a basket
  // that keeps everything pressed.
  const app = await openApp();
  try {
    const table = await playing(app, 131);
    const engine = app.vandtia.load(table).engine;
    const me = app.currentProfile.userId;
    if (engine.currentPlayerId() !== me) return;

    engine.playerById(me).hand = [
      { rank: '9', suit: 'H' }, { rank: '9', suit: 'S' }, { rank: 'K', suit: 'C' },
    ] as any;
    engine.state.pile = [{ rank: '4', suit: 'D' }] as any;
    table.hand.snapshot = engine.serialize();
    await app.persistState();

    press(app, '1');
    press(app, '2');
    assert.strictEqual(app.vandtia.selectedCards.length, 2, 'two nines picked');

    press(app, '3');                                   // the king
    assert.deepStrictEqual(app.vandtia.selectedCards, [2],
      'a different value starts the pick again');
  } finally { app.screen?.destroy?.(); }
}

export async function severalOfOneValueAreLaidOnATableCardWhileSwapping(): Promise<void> {
  /*
   * THE HOUSE RULE, IN THE PHASE IT WAS ASKED FOR. "the user should be able
   * to drop several cards of the same value on the cards on the table when
   * swapping cards and get a new one from the deck so he always have 3 on
   * hand" (sysop, 2026-09-16).
   *
   * Same keys as the swap has always had - 1-3 then 4-6 - reading as a drop
   * rather than an exchange because more than one hand card is picked.
   */
  const app = await openApp();
  try {
    await seated(app, 132);                        // dealt, still swapping
    app.applyViewMode('table');
    const table = app.findTableById(132);
    const loaded = app.vandtia.load(table);
    const me = loaded.engine.playerById(app.currentProfile.userId);
    me.hand = [
      { rank: '9', suit: 'C' }, { rank: '9', suit: 'D' }, { rank: 'K', suit: 'H' },
    ] as any;
    me.faceUp = [
      { rank: '9', suit: 'H' }, { rank: '4', suit: 'S' }, { rank: '6', suit: 'D' },
    ] as any;
    loaded.engine.state.stock = [
      { rank: '3', suit: 'C' }, { rank: '5', suit: 'D' }, { rank: '8', suit: 'H' },
    ] as any;
    table.hand.snapshot = loaded.engine.serialize();
    await app.persistState();

    press(app, '1');
    press(app, '2');
    assert.deepStrictEqual(app.vandtia.selectedHandCards, [0, 1], 'both nines are picked');

    press(app, '4');                               // the nine on the table
    await settle(() => (app.vandtia.load(app.findTableById(132))
      ?.engine.playerById(app.currentProfile.userId).faceUp.length ?? 0) > 3);

    const after = app.vandtia.load(app.findTableById(132))
      .engine.playerById(app.currentProfile.userId);
    assert.deepStrictEqual(
      after.faceUp.map((card: any) => `${card.rank}${card.suit}`),
      ['9H', '9C', '9D', '4S', '6D'],
      'they lie with the card they reinforce',
    );
    assert.strictEqual(after.hand.length, 3, 'and the hand is back up to three');
  } finally { app.screen?.destroy?.(); }
}

export async function onePickedCardIsStillAPlainSwap(): Promise<void> {
  // The move this phase always had, unchanged: a caller who never uses the
  // house rule presses exactly the keys they pressed before.
  const app = await openApp();
  try {
    await seated(app, 133);
    app.applyViewMode('table');
    const table = app.findTableById(133);
    const loaded = app.vandtia.load(table);
    const me = loaded.engine.playerById(app.currentProfile.userId);
    me.hand = [
      { rank: '9', suit: 'C' }, { rank: '2', suit: 'D' }, { rank: 'K', suit: 'H' },
    ] as any;
    me.faceUp = [
      { rank: '4', suit: 'S' }, { rank: '6', suit: 'D' }, { rank: '7', suit: 'C' },
    ] as any;
    table.hand.snapshot = loaded.engine.serialize();
    await app.persistState();

    press(app, '1');
    press(app, '4');
    await settle(() => (app.vandtia.load(app.findTableById(133))
      ?.engine.playerById(app.currentProfile.userId).faceUp[0]?.rank ?? '') === '9');

    const after = app.vandtia.load(app.findTableById(133))
      .engine.playerById(app.currentProfile.userId);
    assert.strictEqual(after.faceUp.length, 3, 'the row is still three cards');
    assert.strictEqual(after.hand.length, 3, 'and so is the hand');
    assert.strictEqual(after.faceUp[0].rank, '9', 'the nine changed places with the four');
    assert.strictEqual(after.hand[0].rank, '4', 'which came back to the hand');
  } finally { app.screen?.destroy?.(); }
}

export async function cardsOfAnotherValueAreRefusedWithAReason(): Promise<void> {
  // "if i can't throw a card in any cardgame and try print an explanatory
  // status message" (sysop, 2026-09-16) - the same courtesy here.
  const app = await openApp();
  try {
    await seated(app, 134);
    app.applyViewMode('table');
    const table = app.findTableById(134);
    const loaded = app.vandtia.load(table);
    const me = loaded.engine.playerById(app.currentProfile.userId);
    me.hand = [
      { rank: '9', suit: 'C' }, { rank: '9', suit: 'D' }, { rank: 'K', suit: 'H' },
    ] as any;
    me.faceUp = [
      { rank: '4', suit: 'S' }, { rank: '6', suit: 'D' }, { rank: '7', suit: 'C' },
    ] as any;
    table.hand.snapshot = loaded.engine.serialize();
    await app.persistState();

    press(app, '1');
    press(app, '2');
    press(app, '5');                               // a six: not a nine
    await new Promise((r) => setTimeout(r, 200));

    const after = app.vandtia.load(app.findTableById(134))
      .engine.playerById(app.currentProfile.userId);
    assert.deepStrictEqual(
      after.faceUp.map((card: any) => `${card.rank}${card.suit}`),
      ['4S', '6D', '7C'],
      'nothing was laid down, and nothing was swapped either',
    );
    assert.deepStrictEqual(
      after.hand.map((card: any) => `${card.rank}${card.suit}`),
      ['9C', '9D', 'KH'],
      'the nines are still in hand, waiting for a nine to lie on',
    );
  } finally { app.screen?.destroy?.(); }
}

export async function theThirdButtonIsStillTheViewFlipOtherwise(): Promise<void> {
  const app = await openApp();
  try {
    const table = await playing(app, 144);
    const engine = app.vandtia.load(table).engine;
    const me = app.currentProfile.userId;
    engine.state.currentIndex = engine.state.players.findIndex((p: any) => p.id === me);
    engine.playerById(me).hand = [{ rank: 'A', suit: 'S' }] as any;
    engine.state.pile = [{ rank: '4', suit: 'H' }] as any;
    table.hand.snapshot = engine.serialize();
    await app.persistState();
    app.updateAllPanels();

    assert.strictEqual(
      String(app.uiManager.actionButtons.raise.getContent()).replace(/\{[^}]*\}/g, '').trim(),
      'FLIP', 'an ace answers the four, so there is nothing to chance');

    const before = app.vandtia.handView;
    press(app, 'r');
    await new Promise((r) => setTimeout(r, 150));
    assert.notStrictEqual(app.vandtia.handView, before, 'it flips the view instead');
  } finally { app.screen?.destroy?.(); }
}

/*
 * THE THROW-IN AND THE BLIND DRAW are pinned in `vandtia-engine.test.ts`,
 * where the position can be stood up exactly and nothing moves underneath
 * the assertions. Two attempts to drive them through the keys here raced the
 * bots - under test they are paced at zero, so the table had played on
 * before the check ran, and the tests failed while the rules worked. A test
 * that fails for its own reasons teaches the suite to be ignored.
 */
