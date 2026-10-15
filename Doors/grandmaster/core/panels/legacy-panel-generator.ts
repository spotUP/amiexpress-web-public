/**
 * The LEGACY panel generator, ported from
 * common/compatibility/LegacyPanelGenerator.lua (@ c80668e).
 *
 * WHY THIS EXISTS. Replays recorded on engine versions 045-047 were played on
 * an older generator, and most of panel-attack's committed replay fixtures are
 * from those versions. Reproducing such a replay with the modern generator
 * produces a different board and therefore a different game - which is exactly
 * what happened here before this file existed: the smallest endless fixture
 * died at frame 336 instead of 402 because it was being played on a board it
 * was never recorded on.
 *
 * HOW IT DIFFERS from the modern generator:
 *
 *  - it fills the WHOLE buffer in one call rather than a row at a time, and
 *    appends to whatever it was given
 *  - "no horizontally adjacent colours" is a flat boolean, not a frequency, so
 *    there is no running-ratio bookkeeping and no NaN bootstrap
 *  - there is NO reject-and-regenerate pass for perfectly paired rows, so it
 *    spends fewer random numbers per row
 *  - shock positions are assigned over the entire buffer at the end, not per
 *    row as it is generated
 *
 * THE SCIENTIFIC-NOTATION BUG IS LOAD-BEARING. assignMetalLocations decides
 * whether a row still needs shock markers by asking whether the row parses as a
 * NUMBER. A row like "4043E0" already carries a marker - the E - but Lua reads
 * it as 4043 in scientific notation, so it is reprocessed and burns extra
 * random numbers. Upstream's own comment concludes that "for compatibility with
 * seeds in replays, these rows being reprocessed for metal has to be considered
 * correct behaviour". JavaScript's Number() agrees with Lua on "4043E0", so the
 * bug ports for free - but ONLY if numeric-ness is tested with isNaN. Testing
 * truthiness instead would treat a row of "000000" as non-numeric, because 0 is
 * falsy in JS and truthy in Lua, and every seeded board would drift.
 */

import { RandomGenerator } from './prng';

const COLOR_TO_NUMBER: Readonly<Record<string, number>> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, I: 9, J: 0,
  a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8, i: 9, j: 0,
  '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '0': 0,
};

const NUMBER_TO_UPPER: Readonly<Record<number, string>> = {
  0: '0', 1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'E', 6: 'F', 7: 'G', 8: 'H', 9: 'I',
};

const NUMBER_TO_LOWER: Readonly<Record<number, string>> = {
  0: '0', 1: 'a', 2: 'b', 3: 'c', 4: 'd', 5: 'e', 6: 'f', 7: 'g', 8: 'h', 9: 'i',
};

/**
 * Lua's `tonumber`, as a value-or-null.
 *
 * Never collapse this into a truthiness test: "000000" is 0, which is truthy in
 * Lua and falsy in JavaScript, and the difference moves every board.
 */
function luaToNumber(text: string): number | null {
  if (text === '') return null;
  const value = Number(text);
  return Number.isNaN(value) ? null : value;
}

/** The colour number of a single character, or undefined. */
function colorOf(char: string): number | undefined {
  return COLOR_TO_NUMBER[char];
}

export class LegacyPanelGenerator {
  private readonly rng = new RandomGenerator();
  generatedCount = 0;
  seed = 0;

  setSeed(seed: number): void {
    this.generatedCount = 0;
    this.seed = seed;
    this.rng.setSeed(seed);
  }

  random(min: number, max: number): number {
    this.generatedCount += 1;
    return this.rng.randomRange(min, max);
  }

  /**
   * Generate `rowsToMake` rows, appended to `previousPanels`.
   *
   * Three rejection rules, all evaluated together as one condition: no three in
   * a row horizontally, never the same colour as the panel below, and - when
   * `disallowAdjacentColors` is set - no horizontally adjacent pair at all.
   */
  generatePanels(
    rowsToMake: number,
    rowWidth: number,
    ncolors: number,
    previousPanels: string,
    disallowAdjacentColors: boolean,
  ): string {
    if (ncolors < 2) {
      throw new Error(`Trying to generate panels with only ${ncolors} colors`);
    }

    let result = previousPanels;

    for (let x = 0; x < rowsToMake; x++) {
      for (let y = 0; y < rowWidth; y++) {
        const lastChar = () => result.charAt(result.length - 1);
        const secondLastChar = () => result.charAt(result.length - 2);

        // y is a zero-based column index, so this is the third cell onward.
        const previousTwoMatchOnThisRow =
          y > 1 && colorOf(lastChar()) === colorOf(secondLastChar());

        // The panel below is one row width back from the end. Lua's negative
        // string.sub returns "" when the buffer is shorter than that, and so
        // does charAt with a negative index.
        const belowColor = colorOf(result.charAt(result.length - rowWidth));

        let nogood = true;
        let color = 0;
        while (nogood) {
          color = this.random(1, ncolors);
          nogood =
            (previousTwoMatchOnThisRow && color === colorOf(lastChar()))
            || color === belowColor
            || (y > 0 && color === colorOf(lastChar()) && disallowAdjacentColors);
        }

        result += String(color);
      }
    }

    return result;
  }

  /**
   * Mark two cells per row as the potential shock positions.
   *
   * Works over the whole buffer, prepending a row of zeroes because the
   * algorithm needs a shock-free row beneath the first real one; that row is
   * sliced off again at the end.
   */
  assignMetalLocations(ret: string, rowWidth: number): string {
    let newRet = '0'.repeat(rowWidth);

    const rowCount = Math.floor(ret.length / rowWidth);
    for (let i = 1; i <= rowCount; i++) {
      const start = (i - 1) * rowWidth;
      const currentRow = ret.slice(start, start + rowWidth);
      let newRow: string;

      // See the header: a row that already holds a marker can still parse as a
      // number - "4043E0" is 4043 - and gets reprocessed, spending extra rolls.
      if (luaToNumber(currentRow) !== null) {
        const prevRow = newRet.slice(-rowWidth);

        let first: number | undefined;
        let second: number | undefined;
        // Reroll while the cell directly below is already a marker, so shock
        // panels cannot line up vertically with each other.
        while (first === undefined || luaToNumber(prevRow.charAt(first - 1)) === null) {
          first = this.random(1, rowWidth);
        }
        while (
          second === undefined
          || second === first
          || luaToNumber(prevRow.charAt(second - 1)) === null
        ) {
          second = this.random(1, rowWidth);
        }

        newRow = '';
        for (let j = 1; j <= rowWidth; j++) {
          const char = ret.charAt(start + j - 1);
          const num = luaToNumber(char);
          if (j === first) {
            newRow += (num === null ? undefined : NUMBER_TO_UPPER[num]) ?? char ?? '0';
          } else if (j === second) {
            newRow += (num === null ? undefined : NUMBER_TO_LOWER[num]) ?? char ?? '0';
          } else {
            newRow += char;
          }
        }
      } else {
        newRow = currentRow;
      }

      newRet += newRow;
    }

    return newRet.slice(rowWidth);
  }
}
