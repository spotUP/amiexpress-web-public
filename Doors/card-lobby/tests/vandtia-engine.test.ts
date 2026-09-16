/**
 * SKITGUBBE (VÄNDTIA), BY THE RULES THE SYSOP PLAYS.
 *
 * Two Swedish games share the name. The pagat.com page is the trick-taking
 * one - that engine lives next door under `skitgubbe/`. THIS is the one the
 * sysop means, also called vändtia or finne, and internationally Shithead:
 *
 *   Three cards face DOWN in front of each player, three face UP on top of
 *   them, three in hand; you may swap hand cards with your face-up ones
 *   before play. Then one pile in the middle: play a card of EQUAL OR HIGHER
 *   value, or pick the whole pile up. A 2 goes on anything and takes the
 *   pile's value back down with it. A 10 turns the pile away entirely - the
 *   vändtia the game is named after - and so does a fourth card of the same
 *   value in a row; either way the same player plays again. Refill to three
 *   from the stock while it lasts. When your hand is gone you play the three
 *   face-up cards, and then the three face-down ones blind. The last player
 *   still holding cards is the Skitgubbe.
 *
 * The sysop's own text, 2026-09-15, is the spec; each test quotes the line
 * it protects.
 */

import assert from 'assert';
import { VandtiaEngine, type VandtiaCard } from '../lib/games/vandtia/engine';

function card(id: string): VandtiaCard {
  return { rank: id.slice(0, -1) as VandtiaCard['rank'], suit: id.slice(-1) as VandtiaCard['suit'] };
}
const cards = (...ids: string[]): VandtiaCard[] => ids.map(card);
const ids = (list: VandtiaCard[]): string[] => list.map((c) => `${c.rank}${c.suit}`);

function threeHanded(seed = 'vandtia-test'): VandtiaEngine {
  return new VandtiaEngine(['u1', 'u2', 'u3'], ['Ann', 'Bo', 'Cai'], [false, false, false], { seed });
}

/** Skip the swap and get to the pile, which is what most of these test. */
function playing(engine: VandtiaEngine): VandtiaEngine {
  for (const player of engine.state.players) engine.finishSwap(player.id);
  return engine;
}

function position(engine: VandtiaEngine, patch: Record<string, unknown>): void {
  Object.assign(engine.state, patch);
}

export async function testDealsThreeDownThreeUpAndThreeInHand(): Promise<void> {
  // "varje spelare får tre kort som läggs ut på bordet med framsidan nedåt.
  //  Ovanpå dessa läggs ytterligare tre kort med framsidan uppåt... får varje
  //  spelare ytterligare tre kort på handen."
  const engine = threeHanded();
  const state = engine.state;

  assert.strictEqual(state.phase, 'swap', 'the game opens with the swap');
  for (const player of state.players) {
    assert.strictEqual(player.faceDown.length, 3, `${player.name} has three face down`);
    assert.strictEqual(player.faceUp.length, 3, 'three face up on top of them');
    assert.strictEqual(player.hand.length, 3, 'and three in hand');
  }
  assert.strictEqual(state.stock.length, 52 - 9 * 3, 'the rest is the stock');
}

export async function testAPlayerMaySwapAHandCardForAFaceUpOne(): Promise<void> {
  // "Spelarna har möjlighet att byta sina kort på handen med de uppåtvända
  //  korten på bordet. Målet är att ha så starka kort som möjligt på bordet."
  const engine = threeHanded();
  engine.state.players[0].hand = cards('AS', '4H', '5D');
  engine.state.players[0].faceUp = cards('3C', '6S', '7H');

  const result = engine.swap('u1', 0, 0);   // the ace for the three

  assert.ok(result.success, result.message);
  assert.ok(ids(engine.state.players[0].faceUp).includes('AS'), 'the ace is on the table now');
  assert.ok(ids(engine.state.players[0].hand).includes('3C'), 'and the three is in hand');
  assert.strictEqual(engine.state.players[0].hand.length, 3, 'a swap is an exchange, not a gain');
  assert.strictEqual(engine.state.players[0].faceUp.length, 3);
}

export async function testPlayBeginsOnceEverybodyHasFinishedSwapping(): Promise<void> {
  const engine = threeHanded();
  engine.finishSwap('u1');
  assert.strictEqual(engine.state.phase, 'swap', 'one player is not everybody');
  engine.finishSwap('u2');
  engine.finishSwap('u3');
  assert.strictEqual(engine.state.phase, 'playing', 'now the pile is open');
  assert.strictEqual(engine.currentPlayerId(), 'u1', 'and the first player leads');

  const refused = engine.swap('u1', 0, 0);
  assert.strictEqual(refused.success, false, 'and swapping is over');
}

export async function testACardMustEqualOrBeatTheTopOfThePile(): Promise<void> {
  // "Spelarna måste lägga ett kort av samma eller högre värde än det
  //  föregående kortet."
  const engine = playing(threeHanded());
  position(engine, { pile: cards('8S'), currentIndex: 0, stock: [] });
  engine.state.players[0].hand = cards('7H', '8D', '9C');

  const legal = ids(engine.legalPlays('u1').map((i) => engine.state.players[0].hand[i]));
  assert.ok(!legal.includes('7H'), 'a seven does not answer an eight');
  assert.ok(legal.includes('8D'), 'an equal card does');
  assert.ok(legal.includes('9C'), 'and so does a higher one');
}

export async function testTheRankingRunsThreeLowToAceHigh(): Promise<void> {
  // "Tre: Det lägsta kortet... Knekt: Värd 11. Dam: 12. Kung: 13. Ess:
  //  Högsta värdet." (The two and the ten are special, and tested below.)
  const engine = playing(threeHanded());
  position(engine, { pile: cards('KS'), currentIndex: 0, stock: [] });
  engine.state.players[0].hand = cards('QH', 'KD', 'AC');

  const legal = ids(engine.legalPlays('u1').map((i) => engine.state.players[0].hand[i]));
  assert.deepStrictEqual(legal.sort(), ['AC', 'KD'], 'only the king and the ace answer a king');
}

export async function testATwoGoesOnAnythingAndTakesTheValueBackDown(): Promise<void> {
  // "Två: Kan spelas på vilket kort som helst och sänker värdet på högen."
  const engine = playing(threeHanded());
  position(engine, { pile: cards('AS'), currentIndex: 0, stock: [] });
  engine.state.players[0].hand = cards('2H', '4D', '5C');

  const legal = ids(engine.legalPlays('u1').map((i) => engine.state.players[0].hand[i]));
  assert.deepStrictEqual(legal, ['2H'], 'nothing but the two answers an ace');

  engine.playCard('u1', 0);

  /*
   * AND THE TURN COMES BACK. "2 can be thrown on anything as well and gives
   * the turn back to me but it does not remove the pile" (sysop,
   * 2026-09-16) - the board's own reading, which this test used to
   * contradict by asserting play carried on to the next seat.
   */
  assert.strictEqual(engine.currentPlayerId(), 'u1', 'the same player leads again');
  assert.deepStrictEqual(ids(engine.state.pile), ['AS', '2H'],
    'and the pile is still there - a two lowers it, it does not turn it away');

  engine.state.players[0].hand = cards('3S', '4H', '5D');
  const afterTwo = ids(engine.legalPlays('u1').map((i) => engine.state.players[0].hand[i]));
  assert.deepStrictEqual(afterTwo.sort(), ['3S', '4H', '5D'],
    'the pile is a two now, so the lowest card in the game answers it');
}

export async function testTwoAcesTurnThePileAwayAndTheSamePlayerGoesAgain(): Promise<void> {
  // "two aces should also remove the pile and give the turn back to me"
  // (sysop, 2026-09-16). Every other rank still needs four in a row.
  const engine = playing(threeHanded());
  position(engine, { pile: cards('4S', '9H', 'AD'), currentIndex: 0, stock: [] });
  engine.state.players[0].hand = cards('AH', '4D', '5C');

  const result = engine.playCard('u1', 0);

  assert.ok(result.success, result.message);
  assert.strictEqual(engine.state.pile.length, 0, 'two aces turn the pile away');
  assert.strictEqual(engine.state.burned.length, 4, 'burned out of the game, not picked up');
  assert.strictEqual(engine.currentPlayerId(), 'u1', 'and the same player plays again');
}

export async function testTwoOfAnyOtherRankIsJustTwoCards(): Promise<void> {
  // The ace's run of two is the ace's alone: two kings burn nothing.
  const engine = playing(threeHanded());
  position(engine, { pile: cards('4S', 'KD'), currentIndex: 0, stock: [] });
  engine.state.players[0].hand = cards('KH', '4D', '5C');

  engine.playCard('u1', 0);

  assert.deepStrictEqual(ids(engine.state.pile), ['4S', 'KD', 'KH'],
    'two kings leave the pile where it is');
  assert.strictEqual(engine.currentPlayerId(), 'u2', 'and the turn moves on');
}

export async function testATenTurnsThePileAwayAndTheSamePlayerGoesAgain(): Promise<void> {
  // "Tio: Vänder bort hela högen och kallas därför vändtia."
  const engine = playing(threeHanded());
  position(engine, { pile: cards('4S', '9H', 'KD'), currentIndex: 0, stock: [] });
  engine.state.players[0].hand = cards('10H', '4D', '5C');

  const result = engine.playCard('u1', 0);

  assert.ok(result.success, result.message);
  assert.strictEqual(engine.state.pile.length, 0, 'the pile is gone');
  assert.strictEqual(engine.state.burned.length, 4, 'burned out of the game, not picked up');
  assert.strictEqual(engine.currentPlayerId(), 'u1', 'and the same player plays again');
}

export async function testAFourthCardOfTheSameValueBurnsThePileToo(): Promise<void> {
  // "Om en spelare lägger fyra kort av samma värde på rad, vänder det bort
  //  hela högen, och spelaren får lägga ett nytt kort."
  const engine = playing(threeHanded());
  position(engine, { pile: cards('2S', '7H', '7D', '7C'), currentIndex: 0, stock: [] });
  engine.state.players[0].hand = cards('7S', 'KD', '5C');

  engine.playCard('u1', 0);   // the fourth seven in a row

  assert.strictEqual(engine.state.pile.length, 0, 'four of a kind turns the pile away');
  assert.strictEqual(engine.currentPlayerId(), 'u1', 'and the player goes again');
}

export async function testAPlayerWhoCannotPlayTakesTheWholePile(): Promise<void> {
  // "Om en spelare inte kan lägga ett kort, måste denne ta upp hela högen."
  const engine = playing(threeHanded());
  position(engine, { pile: cards('4S', 'KH'), currentIndex: 0, stock: [] });
  engine.state.players[0].hand = cards('3D', '5C');

  assert.deepStrictEqual(engine.legalPlays('u1'), [], 'nothing in hand answers a king');
  const result = engine.takePile('u1');

  assert.ok(result.success, result.message);
  assert.strictEqual(engine.state.pile.length, 0, 'the pile is cleared');
  assert.deepStrictEqual(ids(engine.state.players[0].hand).sort(), ['3D', '4S', '5C', 'KH'],
    'and every card of it is in the hand');
  assert.strictEqual(engine.currentPlayerId(), 'u2', 'play passes on');
}

export async function testAHandRefillsToThreeWhileTheStockLasts(): Promise<void> {
  // "Efter varje kortläggning drar spelarna upp till tre kort från högen
  //  tills den tar slut."
  const engine = playing(threeHanded());
  position(engine, { pile: cards('4S'), currentIndex: 0, stock: cards('9H', '9D', '9C') });
  engine.state.players[0].hand = cards('5D', '6C', '7S');

  engine.playCard('u1', 0);

  assert.strictEqual(engine.state.players[0].hand.length, 3, 'back up to three');
  assert.strictEqual(engine.state.stock.length, 2, 'one card came off the stock');
}

export async function testTheTableCardsComeIntoPlayWhenTheHandAndStockAreGone(): Promise<void> {
  // "När spelarna har blivit av med sina kort på handen, börjar de spela med
  //  korten på bordet. Först spelas de uppåtvända korten, sedan de nedåtvända."
  const engine = playing(threeHanded());
  position(engine, { pile: cards('4S'), currentIndex: 0, stock: [] });
  engine.state.players[0].hand = [];
  engine.state.players[0].faceUp = cards('9H', '10D', 'QC');

  assert.strictEqual(engine.sourceFor('u1'), 'faceUp', 'the face-up cards are the hand now');
  const legal = engine.legalPlays('u1');
  assert.ok(legal.length > 0, 'and they can be played');

  engine.playCard('u1', legal[0]);
  assert.strictEqual(engine.state.players[0].faceUp.length, 2, 'one of them went to the pile');

  engine.state.players[0].faceUp = [];
  assert.strictEqual(engine.sourceFor('u1'), 'faceDown', 'then the blind cards');
}

export async function testABlindCardThatDoesNotFitTakesThePileWithIt(): Promise<void> {
  // The face-down cards are played unseen: "sedan de nedåtvända". A card
  // that cannot go on the pile leaves its player holding the pile and it.
  const engine = playing(threeHanded());
  position(engine, { pile: cards('KS'), currentIndex: 0, stock: [] });
  engine.state.players[0].hand = [];
  engine.state.players[0].faceUp = [];
  engine.state.players[0].faceDown = cards('4D', '5C', '6H');

  const result = engine.playCard('u1', 0);   // turned over blind: a four on a king

  assert.strictEqual(result.success, true, 'the card is turned - that is the move');
  assert.ok(/pick|take/i.test(result.message), `the message says what happened: ${result.message}`);
  assert.strictEqual(engine.state.pile.length, 0, 'the pile is gone from the table');
  assert.ok(ids(engine.state.players[0].hand).includes('KS'), 'into the hand');
  assert.ok(ids(engine.state.players[0].hand).includes('4D'), 'along with the card that missed');
  assert.strictEqual(engine.state.players[0].faceDown.length, 2, 'and it is off the table');
}

export async function testTheLastPlayerHoldingCardsIsTheSkitgubbe(): Promise<void> {
  // "Den sista spelaren med kort kvar blir skitgubben och har förlorat."
  const engine = playing(threeHanded());
  position(engine, { pile: cards('4S'), currentIndex: 0, stock: [] });
  const [ann, bo, cai] = engine.state.players;
  ann.hand = cards('9H');
  ann.faceUp = [];
  ann.faceDown = [];
  bo.hand = []; bo.faceUp = []; bo.faceDown = []; bo.out = true;
  engine.state.finishedOrder = ['u2'];
  cai.hand = cards('3D', '4H');
  cai.faceUp = []; cai.faceDown = [];

  engine.playCard('u1', 0);   // Ann sheds her last card

  assert.strictEqual(engine.state.phase, 'over');
  assert.strictEqual(engine.state.loserId, 'u3', 'the one still holding cards');
  assert.deepStrictEqual(engine.state.finishedOrder, ['u2', 'u1'], 'in the order they got out');
}

export async function testASnapshotSurvivesARoundTrip(): Promise<void> {
  const engine = playing(threeHanded('round-trip'));
  engine.playCard('u1', engine.legalPlays('u1')[0] ?? 0);
  const before = JSON.stringify(engine.state);

  const restored = VandtiaEngine.deserialize(engine.serialize());

  assert.strictEqual(JSON.stringify(restored.state), before, 'the position is identical');
  assert.strictEqual(restored.currentPlayerId(), engine.currentPlayerId());
}

export async function testBotsPlayAWholeGameToASkitgubbe(): Promise<void> {
  /*
   * The AI the sysop will actually play against, three bots, to a finished
   * game with exactly one Skitgubbe - the test that says the strategy can
   * find a move in every position this game reaches, including the blind
   * face-down endgame where a wrong card costs you the pile.
   *
   * The strategy directly rather than through CardGameAI, whose per-decision
   * "thinking" delay would make this run for minutes; and Math.random pinned,
   * because the strategy throws moves away on purpose and an unreproducible
   * failure is worse than none.
   */
  const { VandtiaAIStrategy, Difficulty, VandtiaActionType } = await import('@amiexpress/bbs-door-sdk');
  const strategy = new VandtiaAIStrategy();

  const realRandom = Math.random;
  const seededRandom = (seed: number) => {
    let state = seed >>> 0;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x100000000;
    };
  };

  try {
    for (const [index, seed] of ['v1', 'v2', 'v3'].entries()) {
      Math.random = seededRandom(index + 7);
      const engine = new VandtiaEngine(
        ['b1', 'b2', 'b3'], ['Ada', 'Bo', 'Cai'], [true, true, true], { seed },
      );

      // The swap, then the game.
      for (const player of engine.state.players) {
        for (let attempt = 0; attempt < 6 && !player.ready; attempt += 1) {
          const decision: any = await strategy.makeDecision({
            difficulty: Difficulty.MEDIUM, playerId: player.id, engine: engine as any,
          } as any);
          if (decision.action === VandtiaActionType.SWAP) {
            engine.swap(player.id, decision.handIndex, decision.faceUpIndex);
          } else {
            engine.finishSwap(player.id);
          }
        }
      }
      assert.strictEqual(engine.state.phase, 'playing', `${seed}: the swap ended`);

      let turns = 0;
      while (engine.state.phase === 'playing' && turns < 4000) {
        turns += 1;
        const playerId = engine.currentPlayerId() as string;
        const decision: any = await strategy.makeDecision({
          difficulty: Difficulty.MEDIUM, playerId, engine: engine as any,
        } as any);

        const result = decision.action === VandtiaActionType.TAKE_PILE
          ? engine.takePile(playerId)
          : engine.playCard(playerId, decision.cardIndex ?? 0);
        assert.ok(result.success,
          `${seed} turn ${turns}: the AI offered a move the rules refused - ${result.message}`);
      }

      assert.strictEqual(engine.state.phase, 'over', `${seed} finished inside the turn budget`);
      assert.ok(engine.state.loserId, `${seed} produced a Skitgubbe`);
      assert.strictEqual(engine.state.finishedOrder.length, 2,
        `${seed}: two got out, one was left holding cards`);
    }
  } finally {
    Math.random = realRandom;
  }
}

export async function testAHandSortsItselfIntoTheOrderTheGameIsReadIn(): Promise<void> {
  /*
   * "the cardlobby should autosort hands in the way that makes most sense for
   * the game played" (sysop, 2026-09-16). For vandtia that is by VALUE, low
   * to high: every turn asks "what have I got that beats the pile", and a
   * sorted hand answers it at a glance.
   *
   * The two wilds go last, together. A 2 and a 10 play on anything, so they
   * are never part of that question - and they are the cards worth keeping
   * track of, which is easier at a fixed end than wherever their number falls.
   */
  const engine = playing(threeHanded());
  const me = engine.state.players[0];

  me.hand = cards('KD', '2S', '4H', '10C', '7S');
  engine.sortHand(me);

  assert.deepStrictEqual(ids(me.hand), ['4H', '7S', 'KD', '2S', '10C'],
    'low to high, then the wilds');
}

export async function testAHandIsLeftAloneWhileItIsBeingArranged(): Promise<void> {
  // A caller arranging their own two rows must be able to leave a card where
  // they put it - sorting under them would undo the swap they just made.
  const engine = playing(threeHanded());
  engine.state.phase = 'swap';
  const me = engine.state.players[0];

  me.hand = cards('KD', '2S', '4H');
  engine.sortHand(me);

  assert.deepStrictEqual(ids(me.hand), ['KD', '2S', '4H'], 'untouched during the swap');
}

export async function testACardDrawnMidGameLandsInItsPlace(): Promise<void> {
  const engine = playing(threeHanded());
  position(engine, { pile: cards('3S'), currentIndex: 0, stock: cards('5H') });
  const me = engine.state.players[0];
  me.hand = cards('9D', 'KC');

  // Playing the nine refills from the stock, and the drawn five sorts in.
  engine.playCard('u1', 0);

  assert.deepStrictEqual(ids(engine.state.players[0].hand), ['5H', 'KC'],
    'the drawn card landed in order rather than on the end');
}
