/**
 * SKITGUBBE IS REACHABLE, AND THE BOTS PLAY IT.
 *
 * The engine's rules are tested next door. This drives the DOOR: a table in
 * the lobby with the sysop in one seat and bots in the rest, dealt through
 * the app's own deal path, with the bots taking their turns through the
 * SDK's CardGameAI - "add support for ai players in skitgubbe so i can test
 * it" (sysop, 2026-09-15).
 *
 * It also pins the seam the game was added on. Skitgubbe cost no
 * `isUnoTable`-shaped branches anywhere: the registry (lib/games/registry.ts)
 * answers who paints, who deals and what the keys do. A test that only drove
 * the engine would pass with the game unreachable from the lobby, which is
 * precisely how a feature gets declared done and never runs.
 */

import assert from 'assert';
import { isolatedDataDir } from './isolated-data-dir';

isolatedDataDir('skitgubbe');

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

/** A three-seat Skitgubbe table: the sysop in seat 0, bots in the rest. */
async function seatedAtSkitgubbeTable(app: any, id: number): Promise<any> {
  const me = app.currentProfile.userId;
  const table: any = {
    id, gameId: 'skitgubbe-tricks', gameName: 'Skitgubbe (Tricks)', stakesLabel: 'Social',
    smallBlind: 0, bigBlind: 0, buyIn: 0, entryFee: 0,
    minPlayers: 2, maxPlayers: 3, status: 'open',
    createdAt: Date.now(), updatedAt: Date.now(), hostUserId: me,
    autoStart: false, isPrivate: false, observers: [],
    players: [{
      userId: me, username: 'sysop', seat: 0, stack: 200, buyIn: 200,
      role: 'player', joinedAt: Date.now(), isBot: false,
    }],
  };
  app.syncBotsForTable(table);          // the empty seats become bots
  app.lobby.tables.unshift(table);
  app.currentProfile.currentTableId = id;
  app.currentProfile.status = 'table';
  await app.persistState();
  return table;
}

export async function theLobbyOffersSkitgubbe(): Promise<void> {
  /*
   * TWO GAMES SHARE THE NAME. The board's "Skitgubbe" is the vandtia one the
   * sysop plays; this trick-taking game keeps its own entry beside it, which
   * is only affordable because the lobby has a registry rather than a chain
   * of branches (lib/games/registry.ts).
   */
  const { GAME_CATALOG } = await import('../lib/constants');

  const tricks = GAME_CATALOG.find((entry) => entry.id === 'skitgubbe-tricks');
  assert.ok(tricks, 'the catalogue has the trick game');
  assert.strictEqual(tricks?.enabled, true, 'and it is enabled, so a table can be created for it');
  assert.ok((tricks?.maxPlayers ?? 0) >= 3, 'three-handed is the game it is best at');

  const vandtia = GAME_CATALOG.find((entry) => entry.id === 'skitgubbe');
  assert.strictEqual(vandtia?.name, 'Skitgubbe', 'and plain "Skitgubbe" is the one the board means');
  assert.strictEqual(vandtia?.stakes[0].buyIn, 0, 'social, and free');
}

export async function theRegistryServesEveryEnabledGame(): Promise<void> {
  // The seam itself: an enabled catalogue entry with no module is a game the
  // lobby offers and then refuses to deal.
  const app = await openApp();
  try {
    const { GAME_CATALOG } = await import('../lib/constants');
    for (const game of GAME_CATALOG.filter((entry) => entry.enabled)) {
      const module = app.gameModuleFor({ gameId: game.id });
      assert.ok(module, `${game.name} has a module to deal it`);
    }
    // ...and the poker guard is answered by the module rather than by a
    // hard-coded list of UNO ids.
    assert.strictEqual(app.gameModuleFor({ gameId: 'holdem' }).usesPokerEngine, true);
    assert.strictEqual(app.gameModuleFor({ gameId: 'uno' }).usesPokerEngine, false);
    assert.strictEqual(app.gameModuleFor({ gameId: 'skitgubbe-tricks' }).usesPokerEngine, false);
  } finally { app.screen?.destroy?.(); }
}

export async function dealingSkitgubbeReachesTheHumansTurn(): Promise<void> {
  const app = await openApp();
  try {
    await seatedAtSkitgubbeTable(app, 71);
    await app.dealHand();               // the door's own deal path, not the module's

    const table = app.findTableById(71);
    assert.ok(table.hand, 'the game is dealt and saved on the table');
    assert.strictEqual(table.status, 'in-progress');

    const loaded = app.skitgubbe.load(table);
    assert.ok(loaded, 'and it restores through the Skitgubbe engine');
    assert.strictEqual(loaded.engine.state.players.length, 3);

    // The bots have taken whatever turns were theirs and stopped at the
    // human - or the hand has already run to its end, which is legal too.
    const onTurn = loaded.engine.currentPlayerId();
    if (loaded.engine.state.phase !== 'over') {
      assert.strictEqual(onTurn, app.currentProfile.userId,
        'play stops at the human, rather than waiting for a bot nobody drives');
    }
    assert.strictEqual(app.actionInProgress, false, 'and the door still accepts input');
  } finally { app.screen?.destroy?.(); }
}

export async function aPokerEngineNeverSeesASkitgubbeSnapshot(): Promise<void> {
  // The bug UNO hit on 2026-09-02, asked of the new game: `loadTableHand`
  // hands `table.hand.snapshot` to PokerEngine.restore(), and this snapshot
  // would throw on every repaint.
  const app = await openApp();
  try {
    await seatedAtSkitgubbeTable(app, 72);
    await app.dealHand();
    const table = app.findTableById(72);
    assert.strictEqual(app.loadTableHand(table), null,
      'the poker loader declines the table rather than throwing at the screen');
  } finally { app.screen?.destroy?.(); }
}

export async function botsPlayAWholeGameToAnEnd(): Promise<void> {
  /*
   * Every seat a bot, driven by the same AI the sysop will play against, to
   * a finished game with exactly one Skitgubbe. This is the test that says
   * the strategy is sane rather than merely present: a bot that could not
   * find a legal move would wedge the loop, and `advance()` would come back
   * with the hand unfinished and a player still on turn.
   */
  const { SkitgubbeEngine } = await import('../lib/games/skitgubbe/engine');
  const { SkitgubbeAIStrategy, Difficulty, SkitgubbeActionType } =
    await import('@amiexpress/bbs-door-sdk');

  /*
   * The STRATEGY directly, not CardGameAI: the orchestrator sleeps 0.8-2s
   * before every decision so a bot feels like it is thinking, which is right
   * at a table and useless in a loop of three hundred turns. The
   * orchestrator's own wiring is proved in the test below, with one call.
   */
  const strategy = new SkitgubbeAIStrategy();

  /*
   * And a pinned dice cup. The strategy throws a move away at a rate set by
   * the difficulty (40% at MEDIUM), so an unpinned run is a different game
   * every time and a failure here would be unreproducible - which is worse
   * than no test. A seeded generator keeps each of the three games fixed
   * while still exercising the mistake path.
   */
  const realRandom = Math.random;
  const seededRandom = (seed: number) => {
    let state = seed >>> 0;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x100000000;
    };
  };

  for (const [index, seed] of ['bot-game-1', 'bot-game-2', 'bot-game-3'].entries()) {
    Math.random = seededRandom(index + 1);
    const engine = new SkitgubbeEngine(
      ['b1', 'b2', 'b3'], ['Ada', 'Bo', 'Cai'], [true, true, true], { seed },
    );

    let turns = 0;
    while (engine.state.phase !== 'over' && turns < 600) {
      turns += 1;
      const playerId = engine.currentPlayerId();
      assert.ok(playerId, 'somebody is always on turn until the game ends');

      const decision: any = await strategy.makeDecision({
        difficulty: Difficulty.MEDIUM,
        playerId: playerId as string,
        engine: engine as any,
      } as any);

      const result = decision.action === SkitgubbeActionType.TAKE_CARD
        ? engine.takeCard(playerId as string)
        : engine.playCard(playerId as string, decision.cardIndex ?? 0);

      assert.ok(result.success,
        `the AI offered a move the rules refused (${seed}, turn ${turns}): ${result.message}`);
    }

    assert.strictEqual(engine.state.phase, 'over', `${seed} finished inside the turn budget`);
    assert.ok(engine.state.loserId, `${seed} produced a Skitgubbe`);
    assert.strictEqual(engine.state.finishedOrder.length, 2,
      `${seed}: two players got out and one was left holding the cards`);
  }
  Math.random = realRandom;
}

export async function theOrchestratorKnowsHowToPlaySkitgubbe(): Promise<void> {
  // The registration itself: the door builds one CardGameAI for every game,
  // and a missing strategy is an exception at the table rather than a bad
  // move. One decision only - the orchestrator pauses to "think".
  const { SkitgubbeEngine } = await import('../lib/games/skitgubbe/engine');
  const { CardGameAI, SkitgubbeAIStrategy, Difficulty } = await import('@amiexpress/bbs-door-sdk');

  const ai = new CardGameAI();
  ai.registerStrategy(new SkitgubbeAIStrategy());
  assert.ok(ai.hasStrategy('skitgubbe'), 'the game type is registered');

  const engine = new SkitgubbeEngine(['b1', 'b2'], ['Ada', 'Bo'], [true, true], { seed: 'orchestrator' });
  const decision: any = await ai.makeDecision('skitgubbe', {
    difficulty: Difficulty.EASY,
    playerId: engine.currentPlayerId() as string,
    engine: engine as any,
  });
  assert.strictEqual(decision.type, 'skitgubbe');
  assert.ok(engine.playCard(engine.currentPlayerId() as string, decision.cardIndex ?? 0).success,
    'and what it offers is a move the rules accept');
}

export async function theAiPrefersTheCheapestCardThatBeats(): Promise<void> {
  // The judgement that makes a bot worth playing against: hold the ace back
  // and answer with the smallest card that does the job.
  const { SkitgubbeEngine } = await import('../lib/games/skitgubbe/engine');
  const { SkitgubbeAIStrategy, Difficulty } = await import('@amiexpress/bbs-door-sdk');

  const engine = new SkitgubbeEngine(['b1', 'b2'], ['Ada', 'Bo'], [true, true], { seed: 'cheapest' });
  Object.assign(engine.state, {
    phase: 'shedding', trump: 'C', stock: [],
    table: [{ rank: '9', suit: 'S' }],
    tableOwners: ['b1'], trickPlayers: 2, leaderIndex: 0, currentIndex: 1,
  });
  engine.state.players[1].hand = [
    { rank: 'A', suit: 'S' } as any,
    { rank: '10', suit: 'S' } as any,
    { rank: '2', suit: 'C' } as any,
  ];

  /*
   * No dice: even an expert throws a move away now and then
   * (`shouldMakeMistake` rolls against the skill level, 5% at EXPERT), and a
   * test of JUDGEMENT must not fail one run in twenty on the strategy's own
   * deliberate randomness. Pinning Math.random to 0 keeps the mistake path
   * shut for the length of the call.
   */
  const realRandom = Math.random;
  Math.random = () => 0;
  let decision: any;
  try {
    decision = await new SkitgubbeAIStrategy().makeDecision({
      difficulty: Difficulty.EXPERT,
      playerId: 'b2',
      engine: engine as any,
    } as any);
  } finally {
    Math.random = realRandom;
  }

  const chosen = engine.state.players[1].hand[decision.cardIndex];
  assert.strictEqual(`${chosen.rank}${chosen.suit}`, '10S',
    'the ten beats the nine; the ace is kept and the trump is not burned');
}

export async function aSocialTableCostsNothingAndMovesNoChips(): Promise<void> {
  /*
   * "skitgubbe is a social game, it requires no buy in" (sysop, 2026-09-15).
   * The catalogue says so, the entry fee has to agree - it used to floor at
   * one chip, so a free table still charged - and when the game ends, the
   * only thing anybody loses is the title.
   */
  const { GAME_CATALOG, calculateEntryFee } = await import('../lib');
  const game = GAME_CATALOG.find((entry) => entry.id === 'skitgubbe');
  assert.strictEqual(game?.stakes.length, 1, 'one stake, so the create dialog never asks');
  assert.strictEqual(game?.stakes[0].buyIn, 0, 'and it is free');
  assert.strictEqual(calculateEntryFee(0), 0, 'a free table charges no entry fee either');

  const app = await openApp();
  try {
    await seatedAtSkitgubbeTable(app, 73);
    const before = app.findTableById(73).players.map((p: any) => p.stack);

    // Run the hand to its end with bots in every seat.
    const table = app.findTableById(73);
    table.players = table.players.map((p: any) => ({ ...p, isBot: true }));
    await app.dealHand();
    for (let i = 0; i < 50 && app.findTableById(73).hand; i += 1) {
      await app.skitgubbe.advance(app.findTableById(73));
    }

    const after = app.findTableById(73).players.map((p: any) => p.stack);
    assert.deepStrictEqual(after, before, 'nobody won or lost a chip at a social table');
  } finally { app.screen?.destroy?.(); }
}
