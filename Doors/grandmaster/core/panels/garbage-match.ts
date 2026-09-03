/**
 * Clearing garbage, and sending it.
 * Ports the garbage half of common/engine/checkMatches.lua (@ c80668e).
 *
 * A garbage block is matched by CONTACT, not by colour: any panel of a real
 * match that is orthogonally touching the block's bounding box clears it. The
 * clear then spreads transitively to touching blocks OF THE SAME KIND - normal
 * garbage chains to normal, shock to shock, and the two never mix.
 *
 * ONLY THE BOTTOM ROW OF A BLOCK CONVERTS. Each match strips one row, which
 * turns into real panels of freshly generated colours; the rows above go back
 * to being garbage and wait for the next match. That is why digging out a tall
 * block is a chain rather than a single clear.
 *
 * The off-screen rule is subtle and is upstream's, kept verbatim in spirit: a
 * block may only be matched if its lowest row is on screen OR it has been
 * matched before. Without the second half, a chain that pushes its own garbage
 * off the top would stop being clearable halfway through. Without the first, a
 * block that spawned above the playfield and was never seen could be cleared by
 * a match the player had no way to know would reach it.
 */

import { Panel, PanelGrid } from './panel';
import type { LevelData } from './level-data';
import type { GarbageQueue } from './garbage-queue';
import type { Coordinate } from './check-matches';
import { sortByPopOrder } from './check-matches';
import { comboGarbageFor } from './consts';

/** A garbage block reduced to its bounding box. */
interface AABBGarbage {
  left: number;
  right: number;
  top: number;
  bottom: number;
  metal: boolean;
}

/** What the garbage routines need of a stack. */
export interface GarbageStack {
  panels: PanelGrid;
  width: number;
  height: number;
  levelData: LevelData;
  stopWatch: number;
  /** The highest garbage id ever matched, which is how off-screen blocks stay clearable. */
  highestGarbageIdMatched: number;
  outgoingGarbage: GarbageQueue;
  panelSource: { getGarbagePanelRowString(stack: GarbageStack): string };
  onGarbageMatched?: (panelCount: number, onScreenCount: number) => void;
}

/**
 * Would these two blocks clear each other on contact?
 *
 * Only if they are the same kind - shock never spreads a clear into normal
 * garbage or the reverse - and only if their bounding boxes actually touch
 * edge-to-edge rather than merely overlapping in one axis.
 */
export function matchOnContact(a: AABBGarbage, b: AABBGarbage): boolean {
  if (a.metal !== b.metal) return false;

  if (a.top === b.bottom - 1 || a.bottom === b.top + 1) {
    // Vertically adjacent; check they overlap horizontally.
    return (a.left <= b.right && b.left <= a.left) || (b.left <= a.right && a.left <= b.left);
  }
  if (a.right === b.left - 1 || a.left === b.right + 1) {
    // Horizontally adjacent; check they overlap vertically.
    return (b.top >= a.bottom && b.top <= a.top) || (a.top >= b.bottom && a.top <= b.top);
  }
  return false;
}

/**
 * Every garbage panel cleared by this frame's match, or null if none.
 *
 * Three passes: reduce every eligible block to a bounding box, find the ones a
 * matching panel is touching, then spread transitively to blocks touching
 * those.
 */
export function getConnectedGarbagePanels(
  stack: GarbageStack, matchingPanels: Panel[],
): Panel[] | null {
  const garbageIds: number[] = [];
  const seenId = new Set<number>();
  const pieces: AABBGarbage[] = [];

  for (let row = 1; row < stack.panels.length; row++) {
    const rowPanels = stack.panels[row];
    if (!rowPanels) continue;
    for (let col = 1; col <= stack.width; col++) {
      const panel = rowPanels[col];
      if (!panel || !panel.isGarbage || panel.state !== 'normal') continue;
      if (panel.garbageId === undefined || seenId.has(panel.garbageId)) continue;

      // On screen now, or matched before. See the header for why both.
      const lowestRow = panel.row - (panel.yOffset ?? 0);
      const eligible = lowestRow <= stack.height
        || panel.garbageId <= stack.highestGarbageIdMatched;
      if (!eligible) continue;

      seenId.add(panel.garbageId);
      garbageIds.push(panel.garbageId);
      pieces.push({
        left: panel.column - (panel.xOffset ?? 0),
        right: panel.column - (panel.xOffset ?? 0) + (panel.width ?? 1) - 1,
        top: panel.row - (panel.yOffset ?? 0) + (panel.height ?? 1) - 1,
        bottom: panel.row - (panel.yOffset ?? 0),
        metal: !!panel.metal,
      });
    }
  }

  if (garbageIds.length === 0) return null;

  const matchedIds: number[] = [];
  const matchedById = new Set<number>();

  for (let i = 0; i < garbageIds.length; i++) {
    const piece = pieces[i];
    for (const panel of matchingPanels) {
      const touchesVertically = (panel.row === piece.bottom - 1 || panel.row === piece.top + 1)
        && panel.column >= piece.left && panel.column <= piece.right;
      const touchesHorizontally =
        (panel.column === piece.left - 1 || panel.column === piece.right + 1)
        && panel.row >= piece.bottom && panel.row <= piece.top;

      if (touchesVertically || touchesHorizontally) {
        if (!matchedById.has(garbageIds[i])) {
          matchedIds.push(garbageIds[i]);
          matchedById.add(garbageIds[i]);
        }
      }
    }
  }

  if (matchedIds.length === 0) return null;

  // Which blocks would spread a clear to which. Computed once, then walked.
  const spreadsTo = new Map<number, Map<number, boolean>>();
  for (let i = 0; i < garbageIds.length; i++) {
    const matching = new Map<number, boolean>();
    for (let j = 0; j < garbageIds.length; j++) {
      if (i === j) continue;
      if (j < i) {
        // Already computed the other way round; contact is symmetric.
        matching.set(garbageIds[j], spreadsTo.get(garbageIds[j])?.get(garbageIds[i]) ?? false);
      } else {
        matching.set(garbageIds[j], matchOnContact(pieces[i], pieces[j]));
      }
    }
    spreadsTo.set(garbageIds[i], matching);
  }

  // Self-extending walk: anything a matched block touches becomes matched too.
  for (let i = 0; i < matchedIds.length; i++) {
    const neighbours = spreadsTo.get(matchedIds[i]);
    if (!neighbours) continue;
    for (const [garbageId, touching] of neighbours) {
      if (touching && !matchedById.has(garbageId)) {
        matchedIds.push(garbageId);
        matchedById.add(garbageId);
      }
    }
  }

  const garbagePanels: Panel[] = [];
  for (let i = 0; i < garbageIds.length; i++) {
    if (!matchedById.has(garbageIds[i])) continue;
    const piece = pieces[i];
    for (let row = piece.bottom; row <= piece.top; row++) {
      if (!stack.panels[row]) continue;
      for (let col = piece.left; col <= piece.right; col++) {
        const panel = stack.panels[row][col];
        if (panel) garbagePanels.push(panel);
      }
    }
  }

  // Remember the highest id, so a block forced off-screen stays clearable.
  const highest = Math.max(...matchedIds);
  if (highest > stack.highestGarbageIdMatched) stack.highestGarbageIdMatched = highest;

  return garbagePanels;
}

/**
 * Put matched garbage panels into their clear.
 *
 * Each loses a row from the BOTTOM - yOffset and height both drop - so the row
 * that reaches -1 is the one that converts to real panels. Garbage pops bottom
 * to top and right to left, the opposite of an ordinary match.
 */
export function matchGarbagePanels(
  stack: GarbageStack,
  garbagePanels: Panel[],
  garbageMatchTime: number,
  isChain: boolean,
  onScreenCount: number,
): void {
  const ordered = sortByPopOrder(garbagePanels, true);

  stack.onGarbageMatched?.(ordered.length, onScreenCount);

  for (let i = 0; i < ordered.length; i++) {
    const panel = ordered[i];
    panel.yOffset = (panel.yOffset ?? 0) - 1;
    panel.height = (panel.height ?? 1) - 1;
    panel.state = 'matched';
    // +1 for the same reason an ordinary match gets one: the match happens
    // before the timer decrements on this frame.
    panel.setTimer(garbageMatchTime + 1);
    panel.initialTime = garbageMatchTime;
    // These can be nonsense for off-screen garbage, which does not matter -
    // nothing draws it.
    panel.popTime = stack.levelData.frameConstants.POP * (onScreenCount - (i + 1));
    panel.popIndex = Math.min(i + 1, 10);
  }

  convertGarbagePanels(stack, isChain);
}

/**
 * Give the about-to-convert row its colours.
 *
 * Colours come from the garbage generator, one row string at a time, so a block
 * converts into the same colours on both players' screens. Panels out of a
 * chain's garbage always carry the chaining flag - which is what lets digging
 * one out continue the chain.
 */
export function convertGarbagePanels(stack: GarbageStack, isChain: boolean): void {
  for (let row = 1; row < stack.panels.length; row++) {
    const rowPanels = stack.panels[row];
    if (!rowPanels) continue;
    let garbagePanelRow: string | null = null;

    for (let column = 1; column <= stack.width; column++) {
      const panel = rowPanels[column];
      if (!panel) continue;
      if (panel.yOffset === -1 && panel.color === 9) {
        if (garbagePanelRow === null) {
          garbagePanelRow = stack.panelSource.getGarbagePanelRowString(stack);
        }
        panel.color = Number(garbagePanelRow.charAt(column - 1));
        if (isChain) panel.chaining = true;
      }
    }
  }
}

/**
 * Send garbage for a match.
 *
 * Shock garbage first: three matched shock panels send one 6-wide block, four
 * send two, and so on. Combo garbage is sent IN ADDITION, never instead - a
 * combo full of shock panels sends both.
 */
export function pushGarbage(
  stack: GarbageStack,
  origin: Coordinate,
  isChain: boolean,
  comboSize: number,
  metalCount: number,
): void {
  for (let i = 3; i <= metalCount; i++) {
    stack.outgoingGarbage.push({
      width: 6,
      height: 1,
      isMetal: true,
      isChain: false,
      frameEarned: stack.stopWatch,
      rowEarned: origin.row,
      colEarned: origin.column,
    });
  }

  const comboPieces = comboGarbageFor(comboSize);
  for (const width of comboPieces) {
    stack.outgoingGarbage.push({
      width,
      height: 1,
      isMetal: false,
      isChain: false,
      frameEarned: stack.stopWatch,
      rowEarned: origin.row,
      colEarned: origin.column,
    });
  }

  if (isChain) {
    // If a combo was sent too, the chain card sits one row higher.
    const rowOffset = comboPieces.length > 0 ? 1 : 0;
    // NOTE: upstream passes (column, row) to a function declared (row, column).
    // It only moves the attack graphic's origin, and it is reproduced here so
    // the two engines agree; fixing it would be a visible difference.
    stack.outgoingGarbage.addChainLink(
      stack.stopWatch, origin.column, origin.row + rowOffset,
    );
  }
}
