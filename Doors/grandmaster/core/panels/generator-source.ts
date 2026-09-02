/**
 * GeneratorSource, ported from common/engine/GeneratorSource.lua (@ c80668e).
 *
 * The seeded supply of panels: it keeps a buffer of generated rows, hands the
 * front of it to the stack as each new row enters at the bottom, and holds a
 * second, independently seeded generator for the colours that come out of
 * cleared garbage.
 *
 * Determinism lives here as much as in the PRNG. Three things consume random
 * numbers in ways that are easy to get subtly wrong, and each would silently
 * shift every later panel:
 *
 *   - `isBadRow` REGENERATES a row whose colours all appear exactly twice.
 *     The rejected row's rolls are still spent.
 *   - `assignMetalLocations` rerolls its two positions against the row below.
 *   - The starting board deletes 12 panels by repeatedly picking a random
 *     column; picks that land on an already-empty column are discarded but
 *     still advance the generator.
 *
 * The buffer's FRONT is the row that enters the stack next, and rows enter at
 * the bottom and push everything up - so the front of the string is the TOP of
 * the starting stack. The starting-board removal indexes accordingly.
 */

import { PanelGenerator, PANEL_COLOR_TO_NUMBER } from './panel-generator';
import type { LevelData } from './level-data';

/** What a panel source needs to know about the stack it is feeding. */
export interface PanelSourceStack {
  width: number;
  levelData: LevelData;
}

/**
 * The supply of panels a stack draws from.
 *
 * Two implementations exist and they are NOT interchangeable for a given game:
 * GeneratorSource is the modern one, LegacyPanelSource reproduces engine
 * versions 045-047 so replays from that era play on the board they were
 * recorded on.
 */
export interface PanelSource {
  clone(stack: PanelSourceStack): PanelSource;
  nextRowColors(stack: PanelSourceStack, metalPanelsQueued: number): {
    colors: number[];
    metalPanelsQueued: number;
  };
  getGarbagePanelRowString(stack: PanelSourceStack): string;
  getStartingBoardHeight?(): number;
}

/** The starting stack is seven rows tall before panels are removed from it. */
const STARTING_BOARD_HEIGHT = 7;

/**
 * Is every colour present in this row present exactly twice?
 *
 * Such a row is rejected and regenerated. Upstream iterates its count table
 * with `ipairs`, which starts at index 1 - so colour 0 (an empty cell) is not
 * considered, and a row of all empties is "bad". Kept as-is.
 */
export function isBadRow(rowString: string): boolean {
  const counts = new Array<number>(10).fill(0);

  for (let i = 0; i < rowString.length; i++) {
    const color = Number(rowString.charAt(i));
    counts[color] += 1;
  }

  // ipairs: colours 1..9 only, colour 0 skipped.
  for (let color = 1; color <= 9; color++) {
    const count = counts[color];
    if (count !== 0 && count !== 2) return false;
  }

  return true;
}

/**
 * Resolve a row's markers into colour numbers, promoting to shock where the
 * stack has shock panels queued.
 *
 * Uppercase is the first shock slot, lowercase the second; a marker that is
 * not promoted falls back to the colour it stands for.
 */
export function convertMetalPanels(rowString: string, metalPanelCount: number): number[] {
  const colors: number[] = [];

  for (let i = 0; i < rowString.length; i++) {
    const colorString = rowString.charAt(i);
    let color = 0;

    if (/^[0-9]$/.test(colorString)) {
      color = Number(colorString);
    } else if (colorString >= 'A' && colorString <= 'Z') {
      color = metalPanelCount > 0 ? 8 : PANEL_COLOR_TO_NUMBER[colorString];
    } else if (colorString >= 'a' && colorString <= 'z') {
      color = metalPanelCount > 1 ? 8 : PANEL_COLOR_TO_NUMBER[colorString];
    }

    colors[i] = color;
  }

  return colors;
}

export class GeneratorSource {
  readonly seed: number;
  readonly shockEnabled: boolean;
  panelBuffer = '';
  garbagePanelBuffer = '';
  /** Created by clone(), not by the constructor - as upstream does. */
  panelGenerator!: PanelGenerator;
  garbagePanelGenerator!: PanelGenerator;

  constructor(seed: number, shockEnabled: boolean) {
    this.seed = seed;
    this.shockEnabled = shockEnabled;
  }

  /** Append one freshly generated row to the buffer, rejecting bad rows. */
  growPanelBuffer(stack: PanelSourceStack): void {
    const lastRow = this.panelBuffer.slice(-stack.width);
    let newPanels: string | null = null;

    while (newPanels === null || isBadRow(newPanels)) {
      newPanels = this.panelGenerator.generatePanels(
        stack.width, stack.levelData.colors, lastRow,
      );
    }

    if (this.shockEnabled) {
      newPanels = this.panelGenerator.assignMetalLocations(newPanels, lastRow);
    }

    this.panelBuffer += newPanels;
  }

  /**
   * Build the seven-row opening stack, then knock 12 panels out of it.
   *
   * Upstream calls the removal "arcane magic" and notes that it depends on a
   * dummy row being prepended - which is then sliced off - so the row indexing
   * works out. That crutch is reproduced exactly; without it the removal hits
   * different cells.
   */
  generateStartingBoard(stack: PanelSourceStack): string {
    for (let i = 1; i <= STARTING_BOARD_HEIGHT; i++) {
      this.growPanelBuffer(stack);
    }

    const startingBoard = '0'.repeat(stack.width) + this.panelBuffer;
    this.panelBuffer = '';

    const cells = startingBoard.split('');
    // Every column starts at the full height; `height` is 1-based like Lua's.
    const height: number[] = new Array(stack.width + 1).fill(STARTING_BOARD_HEIGHT);
    let toRemove = 2 * stack.width;

    while (toRemove > 0) {
      const idx = this.panelGenerator.random(1, stack.width); // pick a random column
      if (height[idx] > 0) {
        // delete the topmost panel in this column (Lua index -> 0-based)
        cells[idx + stack.width * (-height[idx] + 8) - 1] = '0';
        height[idx] -= 1;
        toRemove -= 1;
      }
    }

    return cells.join('').slice(stack.width);
  }

  /** Twenty rows of colours for garbage clears, from the second generator. */
  generateGarbagePanels(stack: PanelSourceStack): string {
    let lastRow = this.garbagePanelBuffer.slice(-stack.width);
    let newPanels = '';

    for (let i = 1; i <= 20; i++) {
      const newRow = this.garbagePanelGenerator.generatePanels(
        stack.width, stack.levelData.colors, lastRow,
      );
      newPanels += newRow;
      lastRow = newRow;
    }

    return newPanels;
  }

  /** One row of colours for a garbage block that is turning into panels. */
  getGarbagePanelRowString(stack: PanelSourceStack): string {
    if (this.garbagePanelBuffer.length <= 10 * stack.width) {
      this.garbagePanelBuffer += this.generateGarbagePanels(stack);
    }
    const row = this.garbagePanelBuffer.slice(0, stack.width);
    this.garbagePanelBuffer = this.garbagePanelBuffer.slice(stack.width);
    return row;
  }

  /**
   * Take the next row's colours off the front of the buffer.
   *
   * `metalPanelsQueued` is the stack's; it is decremented here, by two if more
   * than three are waiting, otherwise by one. Returns the colour numbers for
   * the caller to place - panel construction is the stack's job, not ours.
   */
  nextRowColors(stack: PanelSourceStack, metalPanelsQueued: number): {
    colors: number[];
    metalPanelsQueued: number;
  } {
    if (this.panelBuffer.length <= 2 * stack.width) {
      this.growPanelBuffer(stack);
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

    const colors = convertMetalPanels(this.panelBuffer.slice(0, stack.width), metalPanelsThisRow);
    this.panelBuffer = this.panelBuffer.slice(stack.width);

    return { colors, metalPanelsQueued: queued };
  }

  /**
   * A standalone copy bound to this stack's level data.
   *
   * This is where the two generators come into existence, and where the second
   * one's derived seed is set: `floor((seed + 5) / 2)`, with adjacent denial
   * forced to 1 so garbage colours never come out in horizontal pairs.
   */
  clone(stack: PanelSourceStack): GeneratorSource {
    const source = new GeneratorSource(this.seed, this.shockEnabled);
    source.panelGenerator = new PanelGenerator(
      this.seed, stack.levelData.adjacentDenialFrequency,
    );
    source.garbagePanelGenerator = new PanelGenerator(Math.floor((this.seed + 5) / 2), 1);

    if (this.panelGenerator) source.panelGenerator.setState(this.panelGenerator.getState());
    if (this.garbagePanelGenerator) {
      source.garbagePanelGenerator.setState(this.garbagePanelGenerator.getState());
    }

    if (this.panelBuffer.length > 0) {
      source.panelBuffer = this.panelBuffer;
    } else {
      source.panelBuffer = source.generateStartingBoard(stack);
    }

    source.garbagePanelBuffer = this.garbagePanelBuffer;
    return source;
  }
}
