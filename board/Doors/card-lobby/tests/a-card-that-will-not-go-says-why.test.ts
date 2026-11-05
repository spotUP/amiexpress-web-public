/**
 * A CARD THAT WILL NOT GO SAYS WHY, AND WHAT WOULD.
 *
 * "if i can't throw a card in any cardgame try print an explanatory status
 * message" (sysop, 2026-09-16). Every game refused differently and none of
 * them offered a way out:
 *
 *   Skitgubbe  "7H does not answer KS."      the reason, and nothing else
 *   UNO        "Cannot play that card."       not even the reason
 *
 * A refusal a player cannot act on reads as a broken door. So a refusal is
 * the REASON - which only the game's rules can give - joined to the ADVICE,
 * the move that IS available. `explainRefusal` is the one place they are put
 * together and `TableGameModule.refusalAdvice` is where a game says the
 * second half.
 */

import assert from 'assert';
import { isolatedDataDir } from './isolated-data-dir';

isolatedDataDir('refusal');

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

export async function theReasonAndTheWayOutAreOneSentence(): Promise<void> {
  const { explainRefusal } = await import('../lib/games/refusal');

  assert.strictEqual(
    explainRefusal('7H does not answer KS', 'Press C to take the pile.'),
    '7H does not answer KS. Press C to take the pile.',
  );
  // A game that writes its own full stop must not produce "KS.. Press".
  assert.strictEqual(
    explainRefusal('7H does not answer KS.', 'Press C to take the pile.'),
    '7H does not answer KS. Press C to take the pile.',
  );
  // A game with no advice still says the reason, punctuated.
  assert.strictEqual(explainRefusal('Not your turn'), 'Not your turn.');
  assert.strictEqual(explainRefusal('', 'Press C.'), 'Press C.');
}

export async function skitgubbeSaysWhatWouldGoInstead(): Promise<void> {
  const app = await openApp();
  try {
    const me = app.currentProfile.userId;
    const table: any = {
      id: 210, gameId: 'skitgubbe', gameName: 'Skitgubbe', stakesLabel: 'Social',
      smallBlind: 0, bigBlind: 0, buyIn: 0, entryFee: 0,
      minPlayers: 2, maxPlayers: 2, status: 'open',
      createdAt: Date.now(), updatedAt: Date.now(), hostUserId: me,
      autoStart: false, isPrivate: false, observers: [],
      players: [{
        userId: me, username: 'sysop', seat: 0, stack: 0, buyIn: 0,
        role: 'player', joinedAt: Date.now(), isBot: false,
      }],
    };
    app.syncBotsForTable(table);
    app.lobby.tables.unshift(table);
    app.currentProfile.currentTableId = 210;
    app.currentProfile.status = 'table';
    await app.persistState();
    await app.dealHand();
    app.vandtia.primaryAction();                     // ready
    await new Promise((r) => setTimeout(r, 600));

    // A hand that cannot answer the pile, and my turn.
    const loaded = app.vandtia.load(app.findTableById(210));
    const engine = loaded.engine;
    engine.playerById(me).hand = [{ rank: '3', suit: 'C' }] as any;
    engine.state.pile = [{ rank: 'K', suit: 'S' }] as any;
    engine.state.currentIndex = engine.state.players.findIndex((p: any) => p.id === me);
    app.findTableById(210).hand.snapshot = engine.serialize();
    await app.persistState();

    app.notices.length = 0;
    app.vandtia.selectCard(0);
    await app.vandtia.primaryAction();
    await new Promise((r) => setTimeout(r, 400));

    const said = app.notices.join(' ');
    assert.ok(/3C/.test(said), `it names the card that will not go: ${said}`);
    assert.ok(/KS/.test(said), `and what it had to answer: ${said}`);
    assert.ok(/take the pile/i.test(said), `and the move that IS available: ${said}`);
  } finally { app.screen?.destroy?.(); }
}

export async function everyGameThatPicksACardOffersAWayOut(): Promise<void> {
  /*
   * The property, asked of the REGISTRY rather than of one game: a game the
   * caller picks a card in can refuse that card, so it has to be able to say
   * what to do instead. A game added later answers this test without anybody
   * remembering to write one.
   */
  const app = await openApp();
  try {
    for (const gameId of ['skitgubbe', 'skitgubbe-tricks']) {
      const module = app.gameModuleFor({ gameId });
      if (!module) continue;
      assert.strictEqual(typeof module.refusalAdvice, 'function',
        `${gameId} can say what to do when a card will not go`);
    }
  } finally { app.screen?.destroy?.(); }
}

export async function aTableWaitingOnABotPlaysItself(): Promise<void> {
  /*
   * "skitgubbe says not my turn and the game doesnt advance" (sysop,
   * 2026-09-16). The bots are pumped by `advance`, and the only caller was
   * the tail of the player's own successful play - so any way of arriving at
   * a bot's turn WITHOUT having just played (re-entering the door, a reload,
   * a refused play, a rule that hands the turn round differently) left the
   * table sitting on a bot for ever, answering every keypress with "Not your
   * turn."
   */
  const app = await openApp();
  try {
    const me = app.currentProfile.userId;
    const table: any = {
      id: 220, gameId: 'skitgubbe', gameName: 'Skitgubbe', stakesLabel: 'Social',
      smallBlind: 0, bigBlind: 0, buyIn: 0, entryFee: 0,
      minPlayers: 2, maxPlayers: 2, status: 'open',
      createdAt: Date.now(), updatedAt: Date.now(), hostUserId: me,
      autoStart: false, isPrivate: false, observers: [],
      players: [{
        userId: me, username: 'sysop', seat: 0, stack: 0, buyIn: 0,
        role: 'player', joinedAt: Date.now(), isBot: false,
      }],
    };
    app.syncBotsForTable(table);
    app.lobby.tables.unshift(table);
    app.currentProfile.currentTableId = 220;
    app.currentProfile.status = 'table';
    await app.persistState();
    await app.dealHand();
    (app.vandtia.constructor as any).BOT_PACE_MS = 0;
    app.vandtia.primaryAction();                     // ready
    await new Promise((r) => setTimeout(r, 600));

    // Put the turn on the bot, the way a reload or a re-entry leaves it,
    // with nobody having just played.
    const loaded = app.vandtia.load(app.findTableById(220));
    const engine = loaded.engine;
    const botIndex = engine.state.players.findIndex((p: any) => p.isBot);
    if (botIndex < 0) return;                        // no bots, nothing to prove
    engine.state.currentIndex = botIndex;
    app.findTableById(220).hand.snapshot = engine.serialize();
    await app.persistState();

    const before = app.vandtia.load(app.findTableById(220)).engine.currentPlayerId();
    assert.notStrictEqual(before, me, 'the bot holds the turn');

    app.notices.length = 0;
    await app.vandtia.primaryAction();               // the caller presses a key
    await new Promise((r) => setTimeout(r, 500));

    const after = app.vandtia.load(app.findTableById(220))?.engine;
    const moved = !after || after.currentPlayerId() === me || after.state.phase !== 'playing';
    assert.ok(moved,
      `the table plays itself on rather than sitting there: turn=${after?.currentPlayerId()}`);
    assert.ok(!app.notices.join(' ').includes('Not your turn'),
      `and it does not just refuse: ${app.notices.join(' ')}`);
  } finally { app.screen?.destroy?.(); }
}

export async function aTurnWithNoChoiceInItIsTakenForYou(): Promise<void> {
  /*
   * "skitgubbe can autopick cards if i cant play any" (sysop, 2026-09-16).
   * When nothing in hand answers the pile the rules leave exactly one move -
   * "Om en spelare inte kan lägga ett kort, måste denne ta upp hela högen" -
   * so asking the caller to find C and press it is asking them to confirm a
   * decision they were never given.
   */
  const app = await openApp();
  try {
    const me = app.currentProfile.userId;
    const table: any = {
      id: 230, gameId: 'skitgubbe', gameName: 'Skitgubbe', stakesLabel: 'Social',
      smallBlind: 0, bigBlind: 0, buyIn: 0, entryFee: 0,
      minPlayers: 2, maxPlayers: 2, status: 'open',
      createdAt: Date.now(), updatedAt: Date.now(), hostUserId: me,
      autoStart: false, isPrivate: false, observers: [],
      players: [{
        userId: me, username: 'sysop', seat: 0, stack: 0, buyIn: 0,
        role: 'player', joinedAt: Date.now(), isBot: false,
      }],
    };
    app.syncBotsForTable(table);
    app.lobby.tables.unshift(table);
    app.currentProfile.currentTableId = 230;
    app.currentProfile.status = 'table';
    await app.persistState();
    await app.dealHand();
    (app.vandtia.constructor as any).BOT_PACE_MS = 0;
    app.vandtia.primaryAction();
    await new Promise((r) => setTimeout(r, 600));

    // A hand that cannot answer a king, and the stock empty so nothing is
    // drawn back in to muddy the count.
    const loaded = app.vandtia.load(app.findTableById(230));
    const engine = loaded.engine;
    engine.state.stock = [] as any;
    engine.playerById(me).hand = [{ rank: '3', suit: 'C' }, { rank: '4', suit: 'D' }] as any;
    engine.state.pile = [{ rank: 'K', suit: 'S' }, { rank: 'K', suit: 'H' }] as any;
    engine.state.currentIndex = engine.state.players.findIndex((p: any) => p.id === me);
    app.findTableById(230).hand.snapshot = engine.serialize();
    await app.persistState();

    assert.deepStrictEqual(
      app.vandtia.load(app.findTableById(230)).engine.legalPlays(me), [],
      'nothing in hand answers the pile',
    );

    app.notices.length = 0;
    await app.vandtia.advance(app.findTableById(230));
    await new Promise((r) => setTimeout(r, 300));

    /*
     * The pile went to the caller. NOT asserted by the pile being empty
     * afterwards: taking it passes the turn, the bot leads the empty pile
     * immediately, and by the time this reads the state there is a card on it
     * again. What is true either way is where the kings went.
     */
    const after = app.vandtia.load(app.findTableById(230)).engine;
    const mine = after.playerById(me).hand.map((card: any) => `${card.rank}${card.suit}`);
    assert.ok(mine.includes('KS') && mine.includes('KH'),
      `the pile was taken without being asked: ${mine.join(' ')}`);
    assert.strictEqual(mine.length, 4, 'and all of it went into the hand');
    assert.ok(/take it/i.test(app.notices.join(' ')),
      `and the caller is told why: ${app.notices.join(' ')}`);
  } finally { app.screen?.destroy?.(); }
}

export async function aHandWithOneLegalCardIsStillTheCallersChoice(): Promise<void> {
  // Holding a card and taking the pile can be the better play, so a turn
  // with even one legal move is never taken for the caller.
  const app = await openApp();
  try {
    const me = app.currentProfile.userId;
    const table: any = {
      id: 231, gameId: 'skitgubbe', gameName: 'Skitgubbe', stakesLabel: 'Social',
      smallBlind: 0, bigBlind: 0, buyIn: 0, entryFee: 0,
      minPlayers: 2, maxPlayers: 2, status: 'open',
      createdAt: Date.now(), updatedAt: Date.now(), hostUserId: me,
      autoStart: false, isPrivate: false, observers: [],
      players: [{
        userId: me, username: 'sysop', seat: 0, stack: 0, buyIn: 0,
        role: 'player', joinedAt: Date.now(), isBot: false,
      }],
    };
    app.syncBotsForTable(table);
    app.lobby.tables.unshift(table);
    app.currentProfile.currentTableId = 231;
    app.currentProfile.status = 'table';
    await app.persistState();
    await app.dealHand();
    (app.vandtia.constructor as any).BOT_PACE_MS = 0;
    app.vandtia.primaryAction();
    await new Promise((r) => setTimeout(r, 600));

    const loaded = app.vandtia.load(app.findTableById(231));
    const engine = loaded.engine;
    engine.state.stock = [] as any;
    engine.playerById(me).hand = [{ rank: 'A', suit: 'C' }, { rank: '3', suit: 'D' }] as any;
    engine.state.pile = [{ rank: 'K', suit: 'S' }] as any;
    engine.state.currentIndex = engine.state.players.findIndex((p: any) => p.id === me);
    app.findTableById(231).hand.snapshot = engine.serialize();
    await app.persistState();

    await app.vandtia.advance(app.findTableById(231));
    await new Promise((r) => setTimeout(r, 200));

    const after = app.vandtia.load(app.findTableById(231)).engine;
    assert.strictEqual(after.state.pile.length, 1, 'the pile is left where it is');
    assert.strictEqual(after.currentPlayerId(), me, 'and the turn is still the caller\'s');
  } finally { app.screen?.destroy?.(); }
}
