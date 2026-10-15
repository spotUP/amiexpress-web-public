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

export async function testSeveralCardsOfOneValueGoDownTogether(): Promise<void> {
  /*
   * The board's house rule: "the user should be able to drop several cards of
   * the same value ... and get a new one from the deck so he always have 3 on
   * hand", and it "applies in game as well" (sysop, 2026-09-16).
   */
  const engine = playing(threeHanded());
  position(engine, { pile: cards('4S'), currentIndex: 0, stock: cards('QD', 'QH') });
  engine.state.players[0].hand = cards('7H', '7S', 'KC');

  const result = engine.playCards('u1', [0, 1]);

  assert.ok(result.success, result.message);
  assert.deepStrictEqual(ids(engine.state.pile), ['4S', '7H', '7S'], 'both sevens are on the pile');
  assert.strictEqual(engine.state.players[0].hand.length, 3,
    'and the hand is back up to three from the stock');
  assert.strictEqual(engine.currentPlayerId(), 'u2', 'play carries on');
}

export async function testCardsPlayedTogetherMustMatch(): Promise<void> {
  const engine = playing(threeHanded());
  position(engine, { pile: cards('4S'), currentIndex: 0, stock: [] });
  engine.state.players[0].hand = cards('7H', '9S', 'KC');

  const result = engine.playCards('u1', [0, 1]);

  assert.strictEqual(result.success, false, 'a seven and a nine are not a group');
  assert.ok(/same value/i.test(result.message), result.message);
  assert.deepStrictEqual(ids(engine.state.pile), ['4S'], 'and nothing was played');
}

export async function testEveryCardOfAGroupMustAnswerThePile(): Promise<void> {
  // They are the same rank, so if one answers the pile they all do - but a
  // group that cannot go is refused as a whole, with nothing half-played.
  const engine = playing(threeHanded());
  position(engine, { pile: cards('KS'), currentIndex: 0, stock: [] });
  engine.state.players[0].hand = cards('7H', '7S', 'KC');

  const result = engine.playCards('u1', [0, 1]);

  assert.strictEqual(result.success, false, 'sevens do not answer a king');
  assert.strictEqual(engine.state.players[0].hand.length, 3, 'the hand is untouched');
}

export async function testAGroupCanCompleteFourOfAKindAndBurn(): Promise<void> {
  // Three at once reaches the run sooner than one at a time - the rule did
  // not have to be taught about groups, because it reads the PILE.
  const engine = playing(threeHanded());
  position(engine, { pile: cards('5S', '7D'), currentIndex: 0, stock: [] });
  engine.state.players[0].hand = cards('7H', '7S', '7C');

  const result = engine.playCards('u1', [0, 1, 2]);

  assert.ok(result.success, result.message);
  assert.strictEqual(engine.state.pile.length, 0, 'four sevens turned the pile away');
  assert.strictEqual(engine.currentPlayerId(), 'u1', 'and the same player goes again');
  assert.ok(result.burned, 'the door is told what went away, to show it landing');
}

export async function testABlindCardIsTurnedOneAtATime(): Promise<void> {
  // You cannot choose a group you cannot see.
  const engine = playing(threeHanded());
  position(engine, { pile: cards('4S'), currentIndex: 0, stock: [] });
  const me = engine.state.players[0];
  me.hand = [];
  me.faceUp = [];
  me.faceDown = cards('7H', '7S', 'KC');

  const result = engine.playCards('u1', [0, 1]);

  assert.strictEqual(result.success, false, 'blind cards are turned singly');
  assert.ok(/one at a time/i.test(result.message), result.message);
}

/*
 * THE SAME HOUSE RULE, WHILE ARRANGING.
 *
 * "the user should be able to drop several cards of the same value on the
 * cards on the table when swapping cards and get a new one from the deck so
 * he always have 3 on hand" (sysop, 2026-09-16).
 */

export async function testSeveralOfOneValueGoOntoATableCardOfThatValue(): Promise<void> {
  const engine = threeHanded();
  const me = engine.state.players[0];
  me.hand = cards('9C', '9D', 'KH');
  me.faceUp = cards('9H', '4S', '6D');
  engine.state.stock = cards('3C', '5D', '8H');

  const result = engine.dropOnTable('u1', [0, 1], 0);

  assert.ok(result.success, result.message);
  assert.deepStrictEqual(ids(me.faceUp), ['9H', '9C', '9D', '4S', '6D'],
    'they land beside the card they reinforce, not at the end of the row');
  assert.strictEqual(me.hand.length, 3, 'and the hand is drawn back up to three');
  assert.ok(!ids(me.hand).includes('9C'), 'the cards that went down are gone from it');
}

export async function testCardsOfAnotherValueDoNotGoOnThatCard(): Promise<void> {
  // The point of the move is a row where one value sits together.
  const engine = threeHanded();
  const me = engine.state.players[0];
  me.hand = cards('9C', '8D', 'KH');
  me.faceUp = cards('9H', '4S', '6D');

  const result = engine.dropOnTable('u1', [0, 1], 0);

  assert.strictEqual(result.success, false, 'a nine and an eight are not a group');
  assert.strictEqual(me.faceUp.length, 3, 'and nothing moved');
  assert.strictEqual(me.hand.length, 3);
}

export async function testAReinforcedRowIsPlayedAsAGroupLater(): Promise<void> {
  /*
   * The reason to do it at all: the row built during the swap is the burn
   * four cards later. This is the two halves of the house rule meeting.
   */
  const engine = threeHanded();
  const me = engine.state.players[0];
  me.hand = cards('7C', '7D', 'KH');
  me.faceUp = cards('7H', '4S', '6D');
  engine.state.stock = cards('3C', '5D');

  assert.ok(engine.dropOnTable('u1', [0, 1], 0).success);
  playing(engine);
  position(engine, { pile: cards('5S', '7S'), currentIndex: 0, stock: [] });
  me.hand = [];                                   // down to the table row

  const played = engine.playCards('u1', [0, 1, 2]);

  assert.ok(played.success, played.message);
  assert.deepStrictEqual(ids(engine.state.pile), [],
    'the three sevens built during the swap finish the run of four and burn the pile');
}

export async function testTheHandIsToppedUpOnlyAsFarAsTheStockGoes(): Promise<void> {
  // A stock that has run out is not an error, it is the end of the game's
  // draw pile - the hand is simply smaller.
  const engine = threeHanded();
  const me = engine.state.players[0];
  me.hand = cards('9C', '9D', 'KH');
  me.faceUp = cards('9H', '4S', '6D');
  engine.state.stock = [];

  assert.ok(engine.dropOnTable('u1', [0, 1], 0).success);
  assert.deepStrictEqual(ids(me.hand), ['KH'], 'nothing left to draw, so one card in hand');
}

export async function testNothingIsLaidDownOncePlayHasStarted(): Promise<void> {
  // In the game proper the same cards go on the PILE, which is `playCards`.
  const engine = playing(threeHanded());
  const result = engine.dropOnTable('u1', [0, 1], 0);
  assert.strictEqual(result.success, false, 'the arranging phase is over');
}

/*
 * FIFTY-TWO CARDS, ALL THE WAY DOWN.
 *
 * "the deck has 52 cards it felt like we played more than 52 cards" and "uh
 * i got more face down cards when i played out my 3 face down cards" (sysop,
 * 2026-09-16). Both are the same question asked twice: does a card ever get
 * copied? Every card in the game is in exactly one place - a hand, a row in
 * front of somebody, the pile, the stock or the burned heap - so the count
 * across all of them is 52 after every single move, and no card id appears
 * twice.
 */
function census(engine: VandtiaEngine): string[] {
  const all: VandtiaCard[] = [
    ...engine.state.stock,
    ...engine.state.pile,
    ...engine.state.burned,
  ];
  for (const player of engine.state.players) {
    all.push(...player.hand, ...player.faceUp, ...player.faceDown);
  }
  return ids(all);
}


/**
 * Put named cards in a player's hand by MOVING them, never by inventing them.
 *
 * A fixture that assigns `cards('9H','9S','9C')` straight into a hand leaves
 * the originals wherever they were dealt, and the deck then holds 55 cards -
 * which is a bug in the test, indistinguishable from the bug it is looking
 * for. Two of these tests said so before this helper existed.
 */
function give(engine: VandtiaEngine, playerId: string, wanted: string[]): void {
  const zones: VandtiaCard[][] = [engine.state.stock, engine.state.pile, engine.state.burned];
  for (const player of engine.state.players) zones.push(player.hand, player.faceUp, player.faceDown);

  const taken: VandtiaCard[] = [];
  for (const id of wanted) {
    for (const zone of zones) {
      const at = zone.findIndex((card) => `${card.rank}${card.suit}` === id);
      if (at >= 0) { taken.push(...zone.splice(at, 1)); break; }
    }
  }
  const me = engine.playerById(playerId);
  if (!me) throw new Error(`no player ${playerId}`);
  // Whatever was in the hand goes back to the stock, so the count still holds.
  engine.state.stock.push(...me.hand.splice(0, me.hand.length));
  me.hand.push(...taken);
}


/**
 * Take a named card out of the game, wherever it happens to be.
 *
 * `stock.splice(stock.findIndex(...), 1)` is a trap: a card that is NOT in
 * the stock gives -1, and `splice(-1, 1)` quietly removes the LAST card
 * instead. That is how a test asking for four nines built a pile of twos.
 */
function pull(engine: VandtiaEngine, match: (card: VandtiaCard) => boolean): VandtiaCard {
  const zones: VandtiaCard[][] = [engine.state.stock, engine.state.pile, engine.state.burned];
  for (const player of engine.state.players) zones.push(player.hand, player.faceUp, player.faceDown);
  for (const zone of zones) {
    const at = zone.findIndex(match);
    if (at >= 0) return zone.splice(at, 1)[0];
  }
  throw new Error('no such card left in the game');
}
const pullId = (engine: VandtiaEngine, id: string): VandtiaCard =>
  pull(engine, (card) => `${card.rank}${card.suit}` === id);
const pullRank = (engine: VandtiaEngine, rank: string): VandtiaCard =>
  pull(engine, (card) => card.rank === rank);

export async function testNoCardIsEverCopiedOrLost(): Promise<void> {
  const engine = playing(threeHanded('conservation'));

  const check = (when: string): void => {
    const seen = census(engine);
    assert.strictEqual(seen.length, 52, `${when}: ${seen.length} cards in play, not 52`);
    assert.strictEqual(new Set(seen).size, 52, `${when}: a card is in two places at once`);
  };

  check('at the start');

  // Play the game out the way the door does: whoever is on turn plays their
  // first legal card, or takes the pile when nothing goes.
  for (let move = 0; move < 400 && engine.state.phase === 'playing'; move += 1) {
    const id = engine.currentPlayerId();
    if (!id) break;
    const legal = engine.legalPlays(id);
    const result = legal.length > 0
      ? engine.playCard(id, legal[0])
      : engine.takePile(id);
    assert.ok(result.success, `move ${move}: ${result.message}`);
    check(`after move ${move}`);
  }
}

export async function testAGroupPlayCopiesNothingEither(): Promise<void> {
  // The house rule moves several cards at once, which is where a copy would
  // come from: a splice that shifts the indices still to be removed leaves a
  // played card in the hand AND puts it on the pile.
  const engine = playing(threeHanded('conservation-group'));
  const me = engine.state.players[0];
  position(engine, { currentIndex: 0 });
  give(engine, 'u1', ['9H', '9S', '9C']);
  // A pile they all answer, taken from the stock so the count still holds.
  engine.state.pile = [pullRank(engine, '4')];

  const before = census(engine).length;
  assert.ok(engine.playCards('u1', [0, 1, 2]).success);
  const after = census(engine);

  assert.strictEqual(after.length, before, 'the same cards, in different places');
  assert.strictEqual(new Set(after).size, after.length, 'and none of them twice');
  for (const id of ['9H', '9S', '9C']) {
    assert.ok(!ids(me.hand).includes(id), `${id} left the hand`);
    assert.ok(ids(engine.state.pile).includes(id), `${id} is on the pile`);
  }
}

export async function testTheBlindCardsRunOutRatherThanGrowing(): Promise<void> {
  /*
   * "uh i got more face down cards when i played out my 3 face down cards"
   * (sysop, 2026-09-16). Nothing in the game may ADD to the blind row: it is
   * dealt once and only ever shrinks.
   *
   * Note what a blind card that does not fit does - it goes into the HAND
   * along with the pile, and the player is back to playing from the hand.
   * That is the rule, and it is also the likeliest thing to be read as "more
   * cards": the row in front of you stops being what you play from.
   */
  const engine = playing(threeHanded('blind-row'));
  const blindAtStart = engine.state.players.map((player) => player.faceDown.length);

  for (let move = 0; move < 400 && engine.state.phase === 'playing'; move += 1) {
    const id = engine.currentPlayerId();
    if (!id) break;
    const legal = engine.legalPlays(id);
    const result = legal.length > 0 ? engine.playCard(id, legal[0]) : engine.takePile(id);
    assert.ok(result.success, `move ${move}: ${result.message}`);

    engine.state.players.forEach((player, seat) => {
      assert.ok(player.faceDown.length <= blindAtStart[seat],
        `${player.name} has ${player.faceDown.length} blind cards, more than the ${blindAtStart[seat]} dealt`);
    });
  }
}

/*
 * JUMPING IN, AND TAKING A CHANCE OFF THE STOCK.
 *
 * "the opponent instantly throws cards he should think before he does it so i
 * have a chanse to throw in cards of the same value that is on the pile" and
 * "when i cant make a move i should be able to pick a card from the deck on
 * chanse, a blind card" (sysop, 2026-09-16).
 */

export async function testACardOfThePilesOwnValueGoesOnOutOfTurn(): Promise<void> {
  const engine = playing(threeHanded('throw-in'));
  position(engine, { currentIndex: 0 });               // Ann to play, not Bo
  give(engine, 'u2', ['9C']);
  engine.state.pile = [pullRank(engine, '9')];

  const result = engine.playOutOfTurn('u2', [0]);

  assert.ok(result.success, result.message);
  assert.ok(ids(engine.state.pile).includes('9C'), 'the nine went on out of turn');
  assert.ok(/throws in/i.test(result.message), result.message);
  assert.strictEqual(engine.currentPlayerId(), 'u3',
    'and play carries on from the player who threw it in');
}

export async function testOnlyTheSameValueMayBeThrownIn(): Promise<void> {
  // A higher card is an ordinary move and waits its turn.
  const engine = playing(threeHanded('throw-in-higher'));
  position(engine, { currentIndex: 0 });
  give(engine, 'u2', ['KC']);
  engine.state.pile = [pullRank(engine, '9')];

  const result = engine.playOutOfTurn('u2', [0]);

  assert.strictEqual(result.success, false, 'a king is not another nine');
  assert.ok(/only another 9/i.test(result.message), result.message);
  assert.strictEqual(engine.currentPlayerId(), 'u1', 'and the turn has not moved');
}

export async function testThePlayerOnTurnJustPlays(): Promise<void> {
  const engine = playing(threeHanded('throw-in-self'));
  position(engine, { currentIndex: 0 });
  give(engine, 'u1', ['9C']);
  engine.state.pile = [pullRank(engine, '9')];

  const result = engine.playOutOfTurn('u1', [0]);
  assert.strictEqual(result.success, false, 'the player on turn has an ordinary move');
  assert.ok(/your turn/i.test(result.message), result.message);
}

export async function testAThrownInGroupCanCompleteTheBurn(): Promise<void> {
  // The reason the rule matters: the fourth of a rank ends the pile.
  const engine = playing(threeHanded('throw-in-burn'));
  position(engine, { currentIndex: 0 });
  give(engine, 'u2', ['9C', '9D']);
  engine.state.pile = ['9H', '9S'].map((id) => pullId(engine, id));

  const result = engine.playOutOfTurn('u2', [0, 1]);

  assert.ok(result.success, result.message);
  assert.strictEqual(engine.state.pile.length, 0, 'four nines turned the pile away');
  assert.strictEqual(engine.currentPlayerId(), 'u2', 'and the thrower leads again');
}

export async function testABlindCardIsNeverThrownIn(): Promise<void> {
  const engine = playing(threeHanded('throw-in-blind'));
  position(engine, { currentIndex: 0 });
  const bo = engine.state.players[1];
  engine.state.stock.push(...bo.hand.splice(0, bo.hand.length));
  engine.state.stock.push(...bo.faceUp.splice(0, bo.faceUp.length));
  engine.state.pile = [pullRank(engine, '9')];

  const result = engine.playOutOfTurn('u2', [0]);
  assert.strictEqual(result.success, false, 'you cannot claim a value you have not seen');
  assert.ok(/blind/i.test(result.message), result.message);
}

export async function testADrawnCardIsPlayedBlindWhenNothingGoes(): Promise<void> {
  const engine = playing(threeHanded('draw-chance'));
  position(engine, { currentIndex: 0 });
  const me = engine.state.players[0];
  // A hand that cannot answer a king, and a stock whose next card can.
  engine.state.stock.push(...me.hand.splice(0, me.hand.length));
  me.hand = [pullRank(engine, '3')];
  engine.state.pile = [pullRank(engine, 'K')];
  const ace = pullRank(engine, 'A');
  engine.state.stock.push(ace);                        // the next one drawn

  const before = census(engine).length;
  const result = engine.drawAndPlay('u1');

  assert.ok(result.success, result.message);
  assert.ok(ids(engine.state.pile).includes('AS') || ids(engine.state.pile).some((id) => id.startsWith('A')),
    `the drawn ace went on the pile: ${ids(engine.state.pile).join(' ')}`);
  assert.strictEqual(census(engine).length, before, 'and no card was invented');
}

export async function testADrawnCardThatDoesNotFitCostsYouThePile(): Promise<void> {
  // The gamble, lost: the card and the pile both come to you.
  const engine = playing(threeHanded('draw-chance-bad'));
  position(engine, { currentIndex: 0 });
  const me = engine.state.players[0];
  engine.state.stock.push(...me.hand.splice(0, me.hand.length));
  me.hand = [pullRank(engine, '3')];
  engine.state.pile = [pullRank(engine, 'K')];
  const four = pullRank(engine, '4');
  engine.state.stock.push(four);

  const before = census(engine).length;
  const result = engine.drawAndPlay('u1');

  assert.ok(result.success, result.message);
  assert.strictEqual(engine.state.pile.length, 0, 'the pile came to the player');
  assert.ok(ids(me.hand).includes(`${four.rank}${four.suit}`), 'along with the card drawn');
  assert.strictEqual(census(engine).length, before, 'and nothing was copied');
  assert.strictEqual(engine.currentPlayerId(), 'u2', 'the turn passes on');
}

export async function testYouMayNotDrawWhenACardWillGo(): Promise<void> {
  // Otherwise it is a way to duck a bad hand, not a chance taken.
  const engine = playing(threeHanded('draw-refused'));
  position(engine, { currentIndex: 0 });
  give(engine, 'u1', ['AS']);
  engine.state.pile = [pullRank(engine, '4')];

  const result = engine.drawAndPlay('u1');
  assert.strictEqual(result.success, false, 'the ace answers the four');
  assert.ok(/will go/i.test(result.message), result.message);
}
