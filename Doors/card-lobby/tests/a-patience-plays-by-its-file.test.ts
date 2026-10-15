/**
 * A PATIENCE PLAYS BY ITS FILE.
 *
 * `parser.ts` reads csol's definitions; `engine.ts` plays them, and knows
 * nothing about Klondike in particular. These tests check that the rules a
 * FILE states are the rules the engine enforces - deal one game and a
 * different one comes out, which is the only thing that makes "another
 * solitaire is a text file" true rather than a slogan.
 */

import assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseGameDefinition } from '../lib/games/patience/parser';
import { PatienceEngine, type PatienceCard } from '../lib/games/patience/engine';

const GAMES = join(__dirname, '..', 'games');
const game = (name: string) => parseGameDefinition(readFileSync(join(GAMES, `${name}.game`), 'utf8'));
const deal = (name: string, seed = 'test') => new PatienceEngine(game(name), { seed });

const card = (id: string): PatienceCard => ({
  rank: id.slice(0, -1) as PatienceCard['rank'],
  suit: id.slice(-1) as PatienceCard['suit'],
  faceUp: true,
});

/** Put an exact position on the table; dealing to one is a coin flip. */
function setPile(engine: PatienceEngine, id: string, ...ids: string[]): void {
  const pile = engine.pile(id);
  if (!pile) throw new Error(`no pile ${id}`);
  pile.cards = ids.map(card);
}

export async function klondikeDealsItsStaircaseFaceDown(): Promise<void> {
  const engine = deal('klondike');
  const tableaus = engine.state.piles.filter((p) => p.type === 'tableau');

  assert.deepStrictEqual(tableaus.map((p) => p.cards.length), [1, 2, 3, 4, 5, 6, 7],
    'the staircase the file describes');
  for (const pile of tableaus) {
    const faceUp = pile.cards.filter((c) => c.faceUp);
    assert.strictEqual(faceUp.length, 1, 'with only the last card face up (hide -1)');
    assert.strictEqual(pile.cards[pile.cards.length - 1].faceUp, true, 'and it is the last one');
  }

  const stock = engine.pileOfType('stock');
  assert.strictEqual(stock?.cards.length, 52 - 28, 'the rest is the stock');
  assert.ok(stock?.cards.every((c) => !c.faceUp), 'face down');
}

export async function aFoundationTakesAnAceThenClimbsInSuit(): Promise<void> {
  // first_rank a, next_rank up, next_suit same - from the file, not from code.
  const engine = deal('klondike');
  setPile(engine, 'foundation:0');
  setPile(engine, 'tableau:0', 'AS');
  setPile(engine, 'tableau:1', '2S');
  setPile(engine, 'tableau:2', '2H');

  assert.ok(engine.canMove('tableau:0', 'foundation:0'), 'an ace starts a foundation');
  assert.ok(!engine.canMove('tableau:1', 'foundation:0'), 'a two does not');

  engine.move('tableau:0', 'foundation:0');
  assert.ok(engine.canMove('tableau:1', 'foundation:0'), 'the two of the same suit follows');
  assert.ok(!engine.canMove('tableau:2', 'foundation:0'), 'the two of another suit does not');
}

export async function aKlondikeColumnDescendsInAlternatingColours(): Promise<void> {
  const engine = deal('klondike');
  setPile(engine, 'tableau:0', '8H');
  setPile(engine, 'tableau:1', '7S');   // black on red, one lower
  setPile(engine, 'tableau:2', '7D');   // red on red
  setPile(engine, 'tableau:3', '6S');   // two lower

  assert.ok(engine.canMove('tableau:1', 'tableau:0'), 'black seven on red eight');
  assert.ok(!engine.canMove('tableau:2', 'tableau:0'), 'not red on red');
  assert.ok(!engine.canMove('tableau:3', 'tableau:0'), 'and not two below');
}

export async function anEmptyColumnTakesOnlyAKing(): Promise<void> {
  // first_rank k. Freecell's columns say `any`, and the same engine must
  // read both out of their files.
  const klondike = deal('klondike');
  setPile(klondike, 'tableau:0');
  setPile(klondike, 'tableau:1', 'KH');
  setPile(klondike, 'tableau:2', 'QH');
  assert.ok(klondike.canMove('tableau:1', 'tableau:0'), 'a king may take the empty column');
  assert.ok(!klondike.canMove('tableau:2', 'tableau:0'), 'a queen may not');

  const freecell = deal('freecell');
  setPile(freecell, 'tableau:0');
  setPile(freecell, 'tableau:1', 'QH');
  assert.ok(freecell.canMove('tableau:1', 'tableau:0'),
    'the same engine lets a queen into an empty Freecell column, because its file says any');
}

export async function aRunMovesTogetherAndABrokenOneDoesNot(): Promise<void> {
  // move_group group: as many cards as form a run by the column's own rules.
  const engine = deal('klondike');
  setPile(engine, 'tableau:0', '9S');
  setPile(engine, 'tableau:1', '8H', '7S');       // a proper run
  setPile(engine, 'tableau:2', '8D', '6S');       // not a run

  assert.ok(engine.canMove('tableau:1', 'tableau:0', 2), 'the run goes as one');
  assert.ok(!engine.canMove('tableau:2', 'tableau:0', 2), 'a broken pair does not');
}

export async function aFreecellCellHoldsExactlyOneCard(): Promise<void> {
  const engine = deal('freecell');
  setPile(engine, 'cell:0');
  setPile(engine, 'tableau:0', 'KS', '4D');
  setPile(engine, 'tableau:1', '9C');

  assert.ok(engine.canMove('tableau:0', 'cell:0'), 'a cell takes a card');
  engine.move('tableau:0', 'cell:0');
  assert.ok(!engine.canMove('tableau:1', 'cell:0'), 'and then it is full');
}

export async function turningTheStockFeedsTheWaste(): Promise<void> {
  const engine = deal('klondike');
  const before = engine.pileOfType('stock')?.cards.length ?? 0;

  const result = engine.turnStock();
  assert.ok(result.success, result.message);
  assert.strictEqual(engine.pileOfType('stock')?.cards.length, before - 1);
  assert.strictEqual(engine.pileOfType('waste')?.cards.length, 1);
  assert.strictEqual(engine.pileOfType('waste')?.cards[0].faceUp, true, 'and it is face up');
}

export async function anEmptyStockTakesTheWasteBack(): Promise<void> {
  const engine = deal('klondike');
  const stock = engine.pileOfType('stock');
  const waste = engine.pileOfType('waste');
  if (!stock || !waste) throw new Error('klondike has a stock and a waste');

  waste.cards = stock.cards.splice(0, stock.cards.length);
  for (const c of waste.cards) c.faceUp = true;

  const result = engine.turnStock();
  assert.ok(result.success, result.message);
  assert.strictEqual(waste.cards.length, 0, 'the waste is empty');
  assert.ok(stock.cards.length > 0, 'and the stock is full again');
  assert.ok(stock.cards.every((c) => !c.faceUp), 'face down');
  assert.strictEqual(engine.state.redeals, 1, 'and the redeal is counted');
}

export async function theCardUnderAMovedOneTurnsOver(): Promise<void> {
  // The whole reward for clearing a column down in Klondike.
  const engine = deal('klondike');
  const pile = engine.pile('tableau:2');
  if (!pile) throw new Error('no column');
  pile.cards = [card('KS'), card('4D'), card('AH')];
  pile.cards[1].faceUp = false;
  setPile(engine, 'foundation:0');

  engine.move('tableau:2', 'foundation:0');
  assert.strictEqual(pile.cards[pile.cards.length - 1].faceUp, true,
    'the card left on top is turned face up');
}

export async function theGameIsOutWhenEveryCardIsHome(): Promise<void> {
  const engine = deal('klondike');
  for (const pile of engine.state.piles) pile.cards = [];
  const foundation = engine.pile('foundation:0');
  if (!foundation) throw new Error('no foundation');
  foundation.cards = ['AS', '2S', '3S'].map(card);

  assert.strictEqual(engine.checkWon(), true, 'nothing left anywhere else');
  assert.strictEqual(engine.state.won, true);
}

export async function aSnapshotSurvivesARoundTrip(): Promise<void> {
  const definition = game('klondike');
  const engine = new PatienceEngine(definition, { seed: 'round-trip' });
  engine.turnStock();
  const before = JSON.stringify(engine.state.piles.map((p) => p.cards));

  const restored = PatienceEngine.deserialize(definition, engine.serialize());

  assert.strictEqual(JSON.stringify(restored.state.piles.map((p) => p.cards)), before,
    'every pile comes back, face-down cards included');
  assert.strictEqual(restored.state.moves, engine.state.moves);
}

export async function spiderDealsEightSuitsOfOneAndOnlyRunsMove(): Promise<void> {
  // The file says decks 8, deck_suits s, and same_class rules that let any
  // card sit on any card but only a run travel. All of it from the text.
  const engine = deal('spider1');
  const all = engine.state.piles.reduce((sum, p) => sum + p.cards.length, 0);
  assert.strictEqual(all, 104, 'eight packs of thirteen');
  assert.ok(engine.state.piles.every((p) => p.cards.every((c) => c.suit === 'S')),
    'all spades');

  setPile(engine, 'tableau:0', '9S');
  setPile(engine, 'tableau:1', '8S', '7S');
  setPile(engine, 'tableau:2', '8S', '3S');

  assert.ok(engine.canMove('tableau:1', 'tableau:0', 2), 'a run moves');
  assert.ok(!engine.canMove('tableau:2', 'tableau:0', 2), 'a broken pair does not');
}
