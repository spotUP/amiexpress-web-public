/**
 * The LEGACY panel source, ported from
 * common/compatibility/LegacyPanelSource.lua (@ c80668e).
 *
 * The supply side of the pre-048 engine, and the counterpart to
 * LegacyPanelGenerator. Replays from engine versions 045-047 need it or they
 * are simulated on a board they were never recorded on.
 *
 * FOUR DIFFERENCES from GeneratorSource, all of which move the RNG:
 *
 *  1. The generator is RESEEDED every time the buffer is extended, with
 *     `seed + panelGenCount`. It is not one continuous stream.
 *  2. Rows are generated a HUNDRED at a time, not one at a time.
 *  3. The buffer is topped up when it falls to 10 rows, not 2.
 *  4. assignMetalLocations is called on the starting board even though a
 *     starting board can never carry shock panels - purely to advance the RNG.
 *     Upstream's comment says exactly that, and dropping the call would shift
 *     every subsequent panel.
 *
 * It also carries a documented garbage-colour bug that upstream kept for
 * compatibility and calls out as part of why this source was replaced: the
 * garbage buffer is topped up in a way that makes ten rows of garbage repeat
 * the colours of the following ten.
 */

import { LegacyPanelGenerator } from './legacy-panel-generator';
import type { PanelSource, PanelSourceStack } from './generator-source';

const STARTING_BOARD_HEIGHT = 7;
/** Rows generated per top-up. */
const ROWS_PER_GENERATION = 100;
/** Rows of garbage colours generated per top-up. */
const GARBAGE_ROWS_PER_GENERATION = 20;

function isNumericChar(char: string): boolean {
  return char !== '' && !Number.isNaN(Number(char));
}

export class LegacyPanelSource implements PanelSource {
  readonly seed: number;
  readonly shockEnabled: boolean;
  panelBuffer = '';
  garbagePanelBuffer = '';
  /** How often the panel buffer has been extended; part of the reseed. */
  panelGenCount = 0;
  garbageGenCount = 0;
  allowAdjacentColors = false;
  allowAdjacentColorsOnStartingBoard = false;

  private readonly generator = new LegacyPanelGenerator();

  constructor(seed: number, shockEnabled: boolean) {
    this.seed = seed;
    this.shockEnabled = shockEnabled;
  }

  setAllowAdjacentColorsOnStartingBoard(allow: boolean): void {
    this.allowAdjacentColorsOnStartingBoard = allow;
  }

  getStartingBoardHeight(): number {
    return STARTING_BOARD_HEIGHT;
  }

  /**
   * The seven-row opening board, with twelve panels knocked out of it.
   *
   * Same "arcane magic" removal as the modern source - a dummy row prepended so
   * the indexing works, then sliced off - but reached through the legacy
   * generator and its reseeding.
   */
  generateStartingBoard(stack: PanelSourceStack): string {
    this.generator.setSeed(this.seed + this.panelGenCount);

    let ret = this.generator.generatePanels(
      STARTING_BOARD_HEIGHT,
      stack.width,
      stack.levelData.colors,
      this.panelBuffer,
      !this.allowAdjacentColorsOnStartingBoard,
    );
    // No shock can exist on a starting board; this call is here to advance the
    // RNG, and removing it would shift every panel that follows.
    ret = this.generator.assignMetalLocations(ret, stack.width);

    this.panelGenCount += 1;

    ret = '0'.repeat(stack.width) + ret;
    const cells = ret.split('');
    const height: number[] = new Array(stack.width + 1).fill(STARTING_BOARD_HEIGHT);
    let toRemove = 2 * stack.width;

    while (toRemove > 0) {
      const idx = this.generator.random(1, stack.width);
      if (height[idx] > 0) {
        cells[idx + stack.width * (-height[idx] + 8) - 1] = '0';
        height[idx] -= 1;
        toRemove -= 1;
      }
    }

    return cells.join('').slice(stack.width);
  }

  /** Top up the buffer by a hundred rows, reseeding as it goes. */
  generatePanels(stack: PanelSourceStack): string {
    this.generator.setSeed(this.seed + this.panelGenCount);
    let panelColors = this.generator.generatePanels(
      ROWS_PER_GENERATION,
      stack.width,
      stack.levelData.colors,
      this.panelBuffer,
      !this.allowAdjacentColors,
    );
    panelColors = this.generator.assignMetalLocations(panelColors, stack.width);
    this.panelGenCount += 1;
    return panelColors;
  }

  generateGarbagePanels(stack: PanelSourceStack): string {
    this.generator.setSeed(this.seed + this.garbageGenCount);
    this.garbageGenCount += 1;
    return this.generator.generatePanels(
      GARBAGE_ROWS_PER_GENERATION,
      stack.width,
      stack.levelData.colors,
      this.garbagePanelBuffer,
      !this.allowAdjacentColors,
    );
  }

  /**
   * The colours for the next row entering at the bottom.
   *
   * The very first call builds the starting board; later ones top the buffer up
   * once it falls to ten rows.
   */
  nextRowColors(stack: PanelSourceStack, metalPanelsQueued: number): {
    colors: number[];
    metalPanelsQueued: number;
  } {
    if (this.panelGenCount === 0) {
      this.panelBuffer = this.generateStartingBoard(stack);
    } else if (this.panelBuffer.length <= 10 * stack.width) {
      this.panelBuffer = this.generatePanels(stack);
    }

    let queued = metalPanelsQueued;
    let metalPanelsThisRow = 0;
    if (this.shockEnabled) {
      if (queued > 3) {
        queued -= 2;
        metalPanelsThisRow = 2;
      } else if (queued > 0) {
        queued -= 1;
        metalPanelsThisRow = 1;
      }
    }

    const colors: number[] = [];
    for (let col = 1; col <= stack.width; col++) {
      const colorString = this.panelBuffer.charAt(col - 1);
      let color = 0;
      if (isNumericChar(colorString)) {
        color = Number(colorString);
      } else if (colorString >= 'A' && colorString <= 'Z') {
        color = metalPanelsThisRow > 0 ? 8 : legacyColorToNumber(colorString);
      } else if (colorString >= 'a' && colorString <= 'z') {
        color = metalPanelsThisRow > 1 ? 8 : legacyColorToNumber(colorString);
      }
      colors[col - 1] = color;
    }

    this.panelBuffer = this.panelBuffer.slice(stack.width);
    return { colors, metalPanelsQueued: queued };
  }

  getGarbagePanelRowString(stack: PanelSourceStack): string {
    if (this.garbagePanelBuffer.length <= 10 * stack.width) {
      // generateGarbagePanels already appended to the buffer, and the result is
      // then appended to it AGAIN - which is the documented colour-repeat bug.
      this.garbagePanelBuffer += this.generateGarbagePanels(stack);
    }
    const row = this.garbagePanelBuffer.slice(0, stack.width);
    this.garbagePanelBuffer = this.garbagePanelBuffer.slice(stack.width);
    return row;
  }

  /**
   * A copy bound to this stack's level data.
   *
   * Unlike the modern source this does NOT build the starting board here - the
   * legacy path builds it on the first row request instead.
   */
  clone(stack: PanelSourceStack): LegacyPanelSource {
    const source = new LegacyPanelSource(this.seed, this.shockEnabled);
    source.panelBuffer = this.panelBuffer;
    source.garbagePanelBuffer = this.garbagePanelBuffer;
    source.panelGenCount = this.panelGenCount;
    source.garbageGenCount = this.garbageGenCount;
    source.allowAdjacentColors = stack.levelData.adjacentDenialFrequency === 0;
    source.allowAdjacentColorsOnStartingBoard = this.allowAdjacentColorsOnStartingBoard;
    return source;
  }
}

const LEGACY_COLOR_TO_NUMBER: Readonly<Record<string, number>> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, I: 9, J: 0,
  a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8, i: 9, j: 0,
};

function legacyColorToNumber(char: string): number {
  return LEGACY_COLOR_TO_NUMBER[char] ?? 0;
}
