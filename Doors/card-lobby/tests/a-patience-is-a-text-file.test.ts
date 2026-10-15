/**
 * A PATIENCE IS A TEXT FILE.
 *
 * csol (https://github.com/nielssp/csol, MIT) describes its eleven solitaires
 * declaratively, and the lobby reads that same format - so another patience
 * costs a `.game` file rather than a module. The sysop pointed at csol and
 * asked what we could learn from it (2026-09-15); this is the part worth
 * taking.
 *
 * These tests read the files csol itself ships, unmodified, because a parser
 * that only handles definitions I wrote for it proves nothing.
 */

import assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseGameDefinition, type GameDefinition } from '../lib/games/patience/parser';

const GAMES = join(__dirname, '..', 'games');
const load = (name: string): GameDefinition =>
  parseGameDefinition(readFileSync(join(GAMES, `${name}.game`), 'utf8'));

export async function klondikeParsesIntoThePilesItIsMadeOf(): Promise<void> {
  const game = load('klondike');

  assert.strictEqual(game.name, 'klondike');
  assert.strictEqual(game.title, 'Klondike');

  const foundations = game.piles.filter((p) => p.type === 'foundation');
  const tableaus = game.piles.filter((p) => p.type === 'tableau');
  assert.strictEqual(foundations.length, 4, 'four foundations, one per suit');
  assert.strictEqual(tableaus.length, 7, 'seven tableau columns');
  assert.strictEqual(game.piles.filter((p) => p.type === 'stock').length, 1);
  assert.strictEqual(game.piles.filter((p) => p.type === 'waste').length, 1);
}

export async function aCountingValueWalksAcrossTheRepetitions(): Promise<void> {
  // `x 0+` over seven tableaus is columns zero to six, and `deal 1+` is the
  // staircase Klondike deals. Getting this wrong stacks every pile in one
  // column, which is the first thing a reader of this format must get right.
  const tableaus = load('klondike').piles.filter((p) => p.type === 'tableau');

  assert.deepStrictEqual(tableaus.map((p) => p.x), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepStrictEqual(tableaus.map((p) => p.deal), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepStrictEqual(tableaus.map((p) => p.y), [1, 1, 1, 1, 1, 1, 1],
    'a value without the plus does not count');

  const foundations = load('klondike').piles.filter((p) => p.type === 'foundation');
  assert.deepStrictEqual(foundations.map((p) => p.x), [3, 4, 5, 6]);
}

export async function theRulesOfAPileSurviveTheRead(): Promise<void> {
  const klondike = load('klondike');
  const foundation = klondike.piles.find((p) => p.type === 'foundation');
  const tableau = klondike.piles.find((p) => p.type === 'tableau');
  const waste = klondike.piles.find((p) => p.type === 'waste');

  assert.strictEqual(foundation?.firstRank, 'a', 'a foundation starts on an ace');
  assert.strictEqual(foundation?.nextRank, 'up', 'and climbs');
  assert.strictEqual(foundation?.nextSuit, 'same', 'in one suit');

  assert.strictEqual(tableau?.firstRank, 'k', 'an empty column takes a king');
  assert.strictEqual(tableau?.nextRank, 'down', 'and descends');
  assert.strictEqual(tableau?.nextSuit, 'diff_color', 'in alternating colours');
  assert.strictEqual(tableau?.moveGroup, 'group', 'a run moves together');
  assert.strictEqual(tableau?.hide, -1, 'all but the top card are face down');

  assert.deepStrictEqual(waste?.from, ['stock'], 'the waste is fed by the stock');
}

export async function freecellsCellsAndTwoTableauRowsBothArrive(): Promise<void> {
  // Freecell writes its tableaus as TWO repeat blocks - four of seven cards
  // and four of six - so a parser that only keeps the last block loses half
  // the game.
  const game = load('freecell');
  const tableaus = game.piles.filter((p) => p.type === 'tableau');

  assert.strictEqual(game.piles.filter((p) => p.type === 'cell').length, 4, 'four free cells');
  assert.strictEqual(tableaus.length, 8, 'eight columns in two blocks of four');
  assert.deepStrictEqual(tableaus.map((p) => p.deal), [7, 7, 7, 7, 6, 6, 6, 6]);
  assert.strictEqual(
    tableaus.reduce((sum, p) => sum + (p.deal as number), 0), 52,
    'and the whole pack is dealt',
  );
}

export async function spiderCarriesItsClassRulesAndItsDecks(): Promise<void> {
  // Spider is the awkward one: eight decks of a single suit, and tableau
  // rules that only apply when the source and destination share a class.
  const game = load('spider1');

  assert.strictEqual(game.decks, 8, 'eight packs');
  assert.strictEqual(game.deckSuits, 's', 'all spades');

  const tableau = game.piles.find((p) => p.type === 'tableau');
  assert.strictEqual(tableau?.class, 1);
  assert.ok(tableau?.sameClass, 'the same-class rules are kept');
  assert.strictEqual(tableau?.sameClass?.nextRank, 'down');
  assert.strictEqual(tableau?.sameClass?.moveGroup, 'group');
  assert.ok(tableau?.sameClass?.validGroup, 'and the run rules inside them');
  assert.strictEqual(tableau?.sameClass?.validGroup?.nextSuit, 'same');

  const stock = game.piles.find((p) => p.type === 'stock');
  assert.strictEqual(stock?.deal, 'rest', 'the stock takes everything left');
  assert.strictEqual(stock?.turn, 10, 'and turns ten at a time');
  assert.deepStrictEqual(stock?.to, ['tableau'], 'onto the tableaus, not a waste');
}

export async function everyShippedGameParses(): Promise<void> {
  // The point of the format: adding a game is adding a file. If one of them
  // will not read, the door must say so here rather than at a caller's table.
  for (const name of ['klondike', 'freecell', 'yukon', 'golf', 'spider1']) {
    const game = load(name);
    assert.ok(game.name, `${name} has a name`);
    assert.ok(game.piles.length > 0, `${name} has piles`);
  }
}

export async function aBrokenDefinitionSaysWhatIsWrong(): Promise<void> {
  assert.throws(
    () => parseGameDefinition('game { title Nameless }'),
    /needs a name/,
    'a game with no name is refused, rather than loading as an unnamed table',
  );
  assert.throws(
    () => parseGameDefinition('game { name x  cellar { } }'),
    /Unknown pile type|Expected/,
    'and so is a pile type nothing can deal',
  );
}
