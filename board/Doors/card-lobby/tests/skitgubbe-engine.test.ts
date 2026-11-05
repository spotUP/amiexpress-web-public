/**
 * SKITGUBBE, BY THE RULES.
 *
 * The Swedish "dirty old man" game, as described at
 * https://www.pagat.com/beating/skitgubbe.html (the basic game). Every
 * assertion below quotes the rule it protects, because the two phases are
 * easy to half-remember: the first is a trick game whose whole purpose is to
 * WIN cards, and the second is a shedding game where the same cards are a
 * liability.
 *
 * The engine is pure - a deck, a state object and moves. The door's table,
 * bots and panels sit on top of it and are tested separately.
 */

import assert from 'assert';
import { SkitgubbeEngine, type SkitgubbeCard } from '../lib/games/skitgubbe/engine';

/** A named card, so a test can say what it means. */
function card(id: string): SkitgubbeCard {
  const rank = id.slice(0, -1);
  const suit = id.slice(-1);
  return { rank: rank as SkitgubbeCard['rank'], suit: suit as SkitgubbeCard['suit'] };
}

const cards = (...ids: string[]): SkitgubbeCard[] => ids.map(card);

/** Three players, a fixed deal, no shuffle surprises. */
function threeHanded(seed = 'test-seed'): SkitgubbeEngine {
  return new SkitgubbeEngine(
    ['u1', 'u2', 'u3'],
    ['Ann', 'Bo', 'Cai'],
    [false, false, false],
    { seed },
  );
}

/**
 * Put the engine into an exact position. The rules tests are about single
 * moves, and dealing fifty-two cards to reach one is not a test, it is a
 * coin flip.
 */
function position(engine: SkitgubbeEngine, patch: Record<string, unknown>): void {
  Object.assign(engine.state, patch);
}

export async function testDealsThreeCardsAndKeepsTheRestAsStock(): Promise<void> {
  const engine = threeHanded();
  const state = engine.state;

  assert.strictEqual(state.phase, 'tricks', 'a game opens in the trick-taking phase');
  for (const player of state.players) {
    assert.strictEqual(player.hand.length, 3, `${player.name} is dealt three cards`);
  }
  // 52 - 9 dealt
  assert.strictEqual(state.stock.length, 43, 'the rest of the pack is the stock');
  assert.strictEqual(state.players[0].id, 'u1');
  assert.strictEqual(engine.currentPlayerId(), state.players[state.leaderIndex].id,
    'the leader is on turn first');
}

export async function testHigherCardWinsTheTrickAndItsWinnerLeadsNext(): Promise<void> {
  // "Whoever played the higher card wins the trick, places the two cards
  //  face down in front of himself, and leads to the next trick."
  const engine = threeHanded();
  position(engine, {
    stock: cards('2C', '3C', '4C', '5C'),
    leaderIndex: 0,
    currentIndex: 0,
    table: [],
  });
  engine.state.players[0].hand = cards('9S', '4H', '6D');
  engine.state.players[1].hand = cards('KS', '2H', '7D');

  engine.playCard('u1', 0);   // Ann leads the 9 of spades
  engine.playCard('u2', 0);   // Bo answers with the king

  assert.strictEqual(engine.state.players[1].won.length, 2, 'the winner takes both cards');
  assert.deepStrictEqual(
    engine.state.players[1].won.map((c) => `${c.rank}${c.suit}`).sort(),
    ['9S', 'KS'],
    'and they are the two cards played',
  );
  assert.strictEqual(engine.state.table.length, 0, 'the table is clear');
  assert.strictEqual(engine.state.leaderIndex, 1, 'the winner leads the next trick');
  assert.strictEqual(engine.currentPlayerId(), 'u2');
}

export async function testOnlyTheTwoPlayersOfATrickDraw(): Promise<void> {
  // "Each player draws a card from the stock immediately after playing, so
  //  that each player always has a hand of three cards."  A trick is two
  //  cards, so the third player neither plays nor draws.
  const engine = threeHanded();
  position(engine, { stock: cards('2C', '3C', '4C', '5C'), leaderIndex: 0, currentIndex: 0, table: [] });
  engine.state.players[0].hand = cards('9S', '4H', '6D');
  engine.state.players[1].hand = cards('KS', '2H', '7D');
  engine.state.players[2].hand = cards('AS', '5H', '8D');

  engine.playCard('u1', 0);
  engine.playCard('u2', 0);

  assert.strictEqual(engine.state.players[0].hand.length, 3, 'the leader drew back up to three');
  assert.strictEqual(engine.state.players[1].hand.length, 3, 'so did the second player');
  assert.strictEqual(engine.state.players[2].hand.length, 3, 'the third player never played');
  assert.strictEqual(engine.state.stock.length, 2, 'exactly two cards left the stock');
}

export async function testEqualCardsLeaveAStunsaAndTheSamePlayerLeadsAgain(): Promise<void> {
  // "If the two cards played to a trick are equal it is called a stunsa
  //  (bounce); the cards are left on the table, the two players each draw a
  //  card from the stock and the same player leads again."
  const engine = threeHanded();
  position(engine, { stock: cards('2C', '3C', '4C', '5C'), leaderIndex: 0, currentIndex: 0, table: [] });
  engine.state.players[0].hand = cards('9S', '4H', '6D');
  engine.state.players[1].hand = cards('9H', '2H', '7D');

  engine.playCard('u1', 0);   // nine
  engine.playCard('u2', 0);   // nine

  assert.strictEqual(engine.state.table.length, 2, 'the tied cards stay on the table');
  assert.strictEqual(engine.state.players[0].won.length, 0, 'nobody has won them');
  assert.strictEqual(engine.state.players[1].won.length, 0);
  assert.strictEqual(engine.state.leaderIndex, 0, 'the same player leads again');
  assert.strictEqual(engine.currentPlayerId(), 'u1');

  // ...and whoever wins the replay takes the whole pile.
  engine.state.players[0].hand = cards('3S', '4H', '6D');
  engine.state.players[1].hand = cards('KH', '2H', '7D');
  engine.playCard('u1', 0);
  engine.playCard('u2', 0);
  assert.strictEqual(engine.state.players[1].won.length, 4,
    'the winner of the replay takes the bounced cards as well');
}

export async function testTheLastStockCardIsTheTrumpAndItsDrawerKeepsItBack(): Promise<void> {
  // "The last card from the stock determines the trump suit for the second
  //  phase. The player who has to draw this card takes it but does not add
  //  it to his hand but keeps it face down until the first phase is over."
  const engine = threeHanded();
  position(engine, { stock: cards('7C'), leaderIndex: 0, currentIndex: 0, table: [] });
  engine.state.players[0].hand = cards('9S', '4H', '6D');
  engine.state.players[1].hand = cards('KS', '2H', '7D');

  engine.playCard('u1', 0);   // Ann plays and draws the last card
  assert.strictEqual(engine.state.trump, 'C', 'its suit is trump');
  assert.strictEqual(engine.state.trumpHolderId, 'u1', 'the drawer holds it');
  assert.strictEqual(engine.state.players[0].hand.length, 2,
    'it is NOT in their hand - they played one and drew nothing they can use');
  assert.strictEqual(engine.state.stock.length, 0);
}

export async function testPhaseOneEndsWhenAPlayerCannotPlay(): Promise<void> {
  // "Play continues with the remaining cards in hand until someone is unable
  //  to play." An unfinished trick goes back to the player who played it.
  const engine = threeHanded();
  position(engine, { stock: [], trump: 'C', trumpHolderId: 'u3', trumpCard: card('7C'), leaderIndex: 0, currentIndex: 0, table: [] });
  engine.state.players[0].hand = cards('9S');
  engine.state.players[1].hand = [];
  engine.state.players[2].hand = cards('2D');

  engine.playCard('u1', 0);   // leads its last card; Bo has nothing to answer with

  assert.strictEqual(engine.state.phase, 'shedding', 'the first phase is over');
  assert.ok(
    engine.state.players[0].hand.concat(engine.state.players[0].won)
      .some((c) => `${c.rank}${c.suit}` === '9S'),
    'the card from the unfinished trick came back to the player who played it',
  );
  assert.strictEqual(engine.state.table.length, 0, 'nothing is left on the table');
}

export async function testPhaseTwoStartsWithTheTrumpDrawerHoldingEverythingWon(): Promise<void> {
  // "The player who drew the trump card leads" - and the cards won in the
  //  first phase are now the hand you have to get rid of.
  const engine = threeHanded();
  position(engine, { stock: [], trump: 'C', trumpHolderId: 'u2', trumpCard: card('7C'), leaderIndex: 0, currentIndex: 0, table: [] });
  engine.state.players[0].hand = cards('9S');
  engine.state.players[0].won = cards('2H', '3H');
  engine.state.players[1].hand = [];
  engine.state.players[1].won = cards('KD');
  engine.state.players[2].hand = cards('4D');

  engine.playCard('u1', 0);   // nobody can answer: phase one ends

  assert.strictEqual(engine.state.phase, 'shedding');
  assert.strictEqual(engine.currentPlayerId(), 'u2', 'the trump drawer leads the shedding phase');
  const bo = engine.state.players[1];
  assert.ok(bo.hand.some((c) => `${c.rank}${c.suit}` === 'KD'), 'won cards are in hand now');
  assert.ok(bo.hand.some((c) => `${c.rank}${c.suit}` === '7C'), 'and so is the trump card');
  assert.strictEqual(bo.won.length, 0, 'nothing is held back');
}

export async function testACardIsBeatenBySameSuitHigherOrByAnyTrump(): Promise<void> {
  // "A card may be beaten by a higher card of the same suit, and a non-trump
  //  may be beaten by any trump."
  const engine = threeHanded();
  position(engine, {
    phase: 'shedding', trump: 'C', table: [card('9S')],
    trickPlayers: 3, currentIndex: 1, leaderIndex: 0, stock: [],
  });
  engine.state.players[1].hand = cards('8S', '10S', '2C', '4D');

  const legal = engine.legalPlays('u2').map((i) => {
    const c = engine.state.players[1].hand[i];
    return `${c.rank}${c.suit}`;
  });

  assert.ok(legal.includes('10S'), 'a higher card of the same suit beats it');
  assert.ok(legal.includes('2C'), 'any trump beats a non-trump');
  assert.ok(!legal.includes('8S'), 'a lower card of the same suit does not');
  assert.ok(!legal.includes('4D'), 'nor does another suit');
}

export async function testAPlayerWhoWillNotBeatTakesOnlyTheLastCard(): Promise<void> {
  // "If you cannot or do not wish to beat the card in front of you, you must
  //  take it up into your hand... it is only this last card which you must
  //  take up." The next player then faces the card underneath.
  const engine = threeHanded();
  position(engine, {
    phase: 'shedding', trump: 'C', table: cards('9S', '10S'),
    trickPlayers: 3, currentIndex: 2, leaderIndex: 0, stock: [],
  });
  engine.state.players[2].hand = cards('4D');

  engine.takeCard('u3');

  assert.deepStrictEqual(
    engine.state.players[2].hand.map((c) => `${c.rank}${c.suit}`).sort(),
    ['10S', '4D'].sort(),
    'only the last card played went into the hand',
  );
  assert.deepStrictEqual(
    engine.state.table.map((c) => `${c.rank}${c.suit}`),
    ['9S'],
    'the card underneath is still on the table',
  );
  assert.strictEqual(engine.currentPlayerId(), 'u1',
    'and the next player has to deal with it');
}

export async function testATrickEndsWhenItHoldsOneCardPerPlayer(): Promise<void> {
  // "When the number of cards in the trick is equal to the number of players
  //  the trick is complete (avstick)... the player who played last (and
  //  therefore highest) leads to the next trick."
  const engine = threeHanded();
  position(engine, {
    phase: 'shedding', trump: 'C', table: cards('9S', '10S'),
    trickPlayers: 3, currentIndex: 2, leaderIndex: 0, stock: [],
  });
  engine.state.players[0].hand = cards('2H');
  engine.state.players[1].hand = cards('3H');
  engine.state.players[2].hand = cards('QS', '4D');

  engine.playCard('u3', 0);   // the third card of a three-player trick

  assert.strictEqual(engine.state.table.length, 0, 'the trick is set aside');
  assert.strictEqual(engine.currentPlayerId(), 'u3', 'whoever played last leads');
  assert.strictEqual(
    engine.state.players.reduce((n, p) => n + p.hand.length, 0),
    3,
    'the cards of a completed trick are out of the game, not picked up',
  );
}

export async function testTheLastPlayerHoldingCardsIsTheSkitgubbe(): Promise<void> {
  // "A player who runs out of cards is safe. The loser is the player who is
  //  left with the last cards in his hand, and is called Skitgubbe."
  const engine = threeHanded();
  position(engine, {
    phase: 'shedding', trump: 'C', table: [card('9S')],
    trickPlayers: 2, currentIndex: 1, leaderIndex: 0, stock: [],
    finishedOrder: ['u1'],
  });
  engine.state.players[0].hand = [];
  engine.state.players[0].out = true;
  engine.state.players[1].hand = cards('10S');
  engine.state.players[2].hand = cards('4D', '5D');

  engine.playCard('u2', 0);   // Bo sheds their last card

  assert.strictEqual(engine.state.phase, 'over', 'with one player left holding cards the game is done');
  assert.strictEqual(engine.state.loserId, 'u3', 'the player still holding cards is the skitgubbe');
  assert.deepStrictEqual(engine.state.finishedOrder, ['u1', 'u2'], 'in the order they went out');
}

export async function testASnapshotSurvivesARoundTrip(): Promise<void> {
  // The lobby keeps a game in table.hand.snapshot and rebuilds it on every
  // repaint, on every node. A game that cannot be rebuilt is a game that
  // ends the moment the player redraws the screen.
  const engine = threeHanded('round-trip');
  engine.playCard('u1', 0);
  const before = JSON.stringify(engine.state);

  const restored = SkitgubbeEngine.deserialize(engine.serialize());

  assert.strictEqual(JSON.stringify(restored.state), before, 'the position is identical');
  assert.strictEqual(restored.currentPlayerId(), engine.currentPlayerId());
}

export async function testAnIllegalMoveIsRefusedRatherThanApplied(): Promise<void> {
  const engine = threeHanded();
  position(engine, {
    phase: 'shedding', trump: 'C', table: [card('10S')],
    trickPlayers: 3, currentIndex: 1, leaderIndex: 0, stock: [],
  });
  engine.state.players[1].hand = cards('8S');

  const result = engine.playCard('u2', 0);
  assert.strictEqual(result.success, false, 'an eight does not beat a ten');
  assert.strictEqual(engine.state.players[1].hand.length, 1, 'and the card stays in hand');

  const outOfTurn = engine.playCard('u3', 0);
  assert.strictEqual(outOfTurn.success, false, 'nor may a player move out of turn');
}
