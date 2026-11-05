/**
 * Panel, ported from common/engine/Panel.lua (@ c80668e).
 *
 * A panel is a small state machine with ten states, and almost everything that
 * makes this game feel like this game lives in how those states hand off to one
 * another. The frame counts come from the level tables; the TRANSITIONS come
 * from here.
 *
 * The grid is Lua-indexed on purpose: `panels[row][column]` with rows starting
 * at 0 and columns at 1. Row 0 is the dimmed row below the floor - the one you
 * can see waiting at the bottom of the screen - and it exists so that no panel
 * in play ever has to bounds-check the panel below it. Renumbering to 0-based
 * would mean touching every comparison in the file, which is exactly how a port
 * like this acquires an off-by-one it never finds again.
 *
 * THREE ONE-FRAME SIGNALS carry all the chain behaviour, and they are reset at
 * the top of every update:
 *
 *   propagatesChaining  set by a panel that has just popped for good. Panels are
 *                       updated bottom to top, so the panel above reads it in
 *                       the same sweep and inherits `chaining`. This is the root
 *                       of every chain in the game.
 *   propagatesFalling   set by garbage that has just dropped out from under a
 *                       stack, so the panels above fall immediately instead of
 *                       hovering.
 *   matchAnyway         the one-frame window in which a freshly hovering panel
 *                       is still matchable. Hovering panels normally cannot
 *                       match; this flag is what makes the skill chains work.
 *
 * The asymmetry between how a SWAP and a FALL enter hover is deliberate and is
 * the difference between a chain continuing and dying:
 *   - a panel that finishes a swap over a gap gets FULL hover time and does NOT
 *     take the chaining flag, only propagates it
 *   - a falling panel inherits the hover time of the panel below and explicitly
 *     does not gain a chaining flag it did not already have
 */

import type { FrameConstants } from './level-data';

/** The ten states a panel can be in. */
export type PanelState =
  | 'normal'
  | 'swapping'
  | 'matched'
  | 'popping'
  | 'popped'
  | 'hovering'
  | 'falling'
  | 'landing'
  | 'dimmed'
  | 'dead';

/**
 * Colour indices, as the original numbers them.
 * 0 empty, 1-7 ordinary colours, 8 shock ([!]), 9 garbage/colourless.
 */
export const PANEL_COLORS = {
  EMPTY: 0,
  HEARTS: 1,
  CIRCLES: 2,
  TRIANGLES: 3,
  STARS: 4,
  DIAMONDS: 5,
  INVERSE_TRIANGLES: 6,
  SQUARES: 7,
  SHOCK: 8,
  GARBAGE: 9,
} as const;

/** The six colours the stock presets use. */
export function regularColorsArray(): number[] {
  return [1, 2, 3, 4, 5, 6];
}

/** The six, plus squares. */
export function extendedRegularColorsArray(): number[] {
  return [...regularColorsArray(), 7];
}

/** Everything, including shock and colourless. */
export function allPossibleColorsArray(): number[] {
  return [...extendedRegularColorsArray(), 8, 9];
}

/** `panels[row][column]`, rows from 0, columns from 1. */
export type PanelGrid = Panel[][];

/** Frames a landing panel bounces for, and the garbage-fall bounce. Animation only. */
const LANDING_FRAMES = 12;

/** Frames a swap takes. A flat constant upstream, not a level table entry. */
const SWAP_FRAMES = 4;

export class Panel {
  row: number;
  column: number;
  readonly id: number;
  frameTimes: FrameConstants;

  state: PanelState = 'normal';
  /** Did this panel change state on the previous update (or by an outside act)? */
  stateChanged = false;
  color = 0;
  /** Frames left in the current state; 0 in states with no fixed duration. */
  timer = 0;

  // --- per-frame flags, cleared at the top of update() ---
  matching = false;
  matchesMetal = false;
  matchesGarbage = false;
  propagatesFalling = false;
  propagatesChaining = false;
  /** A hovering panel that is matchable for this one frame. */
  matchAnyway = false;

  /** Will this panel make a chain if it is matched right now? */
  chaining = false;

  // --- swap bookkeeping ---
  isSwappingFromLeft?: boolean;
  /** Set when a swap must not be taken back, because the panel is about to fall. */
  dontSwap?: boolean;
  /** Set when a panel is swapping above something that just popped. */
  queuedHover?: boolean;

  // --- garbage ---
  isGarbage = false;
  garbageId?: number;
  metal?: boolean;
  /** 0 at the garbage's left edge. */
  xOffset?: number;
  /** 0 at the garbage's bottom edge; -1 once the bottom row has been consumed. */
  yOffset?: number;
  width?: number;
  height?: number;
  initialTime?: number;
  popTime?: number;
  popIndex?: number;
  shakeTime?: number;

  // --- match bookkeeping ---
  comboSize?: number;
  comboIndex?: number;

  /** Bounce animation after dropping out of cleared garbage. */
  fellFromGarbage?: number;

  /** Assigned by the Stack; upstream errors if they are not implemented. */
  onPop: () => void = () => { throw new Error('Did not implement Panel.onPop()'); };
  onPopped: () => void = () => { throw new Error('Did not implement Panel.onPopped()'); };
  onLand: () => void = () => { throw new Error('Did not implement Panel.onLand()'); };

  constructor(row: number, column: number, id: number, frameTimes: FrameConstants) {
    this.row = row;
    this.column = column;
    this.id = id;
    this.frameTimes = frameTimes;
    clear(this, true, true);
  }

  toString(): string {
    return `row:${this.row},col:${this.column},color:${this.color},`
      + `state:${this.state},timer:${this.timer}`;
  }

  /** Reset to defaults. `clearColor` also empties the cell. */
  clear(clearChaining?: boolean, clearColor?: boolean): void {
    clear(this, clearChaining, clearColor);
  }

  setTimer(frames: number): void {
    this.timer = frames;
  }

  /**
   * May this panel take part in a swap at all?
   *
   * Garbage never can. Everything settled or in motion horizontally can;
   * everything mid-clear or hovering cannot. Stack.canSwap adds the rules that
   * depend on neighbours.
   */
  allowsSwap(): boolean {
    if (this.dontSwap) return false;
    if (this.isGarbage) return false;
    return this.state === 'normal'
      || this.state === 'swapping'
      || this.state === 'falling'
      || this.state === 'landing';
  }

  /**
   * Does this panel count as occupying its cell for the top-out check?
   *
   * Garbage still falling does not; anything else with a colour does.
   */
  dangerous(): boolean {
    if (this.isGarbage) return this.state !== 'falling';
    return this.color !== 0;
  }

  /** Begin a swap. The chaining flag deliberately survives it. */
  startSwap(isSwappingFromLeft: boolean): void {
    const chaining = this.chaining;
    clearFlags(this);
    this.stateChanged = true;
    this.state = 'swapping';
    this.chaining = chaining;
    this.timer = SWAP_FRAMES;
    this.isSwappingFromLeft = isSwappingFromLeft;
    // Once you start swapping it, it stops bouncing.
    this.fellFromGarbage = undefined;
  }

  /**
   * Put this panel into the matched state.
   *
   * The +1 on the timer is upstream's, and it is load-bearing: a match is
   * always found before the timer decrements on the same frame.
   */
  match(isChainLink: boolean, comboIndex: number, comboSize: number): void {
    this.state = 'matched';
    this.setTimer(this.frameTimes.FLASH + this.frameTimes.FACE + 1);
    if (isChainLink) this.chaining = true;
    this.fellFromGarbage = undefined;
    this.comboIndex = comboIndex;
    this.comboSize = comboSize;
  }

  /** Advance one frame. */
  update(panels: PanelGrid): void {
    // Every one-frame signal dies here and must be set again this frame.
    this.stateChanged = false;
    this.propagatesChaining = false;
    this.propagatesFalling = false;
    this.matching = false;
    this.matchesMetal = false;
    this.matchesGarbage = false;

    switch (this.state) {
      case 'normal': normalState.update(this, panels); break;
      case 'swapping': swappingState.update(this, panels); break;
      case 'matched': matchedState.update(this, panels); break;
      case 'popping': poppingState.update(this, panels); break;
      case 'popped': poppedState.update(this); break;
      case 'hovering': hoverState.update(this, panels); break;
      case 'falling': fallingState.update(this, panels); break;
      case 'landing': landingState.update(this, panels); break;
      case 'dimmed': dimmedState.update(this); break;
      case 'dead': break;
    }
  }

  /**
   * Exchange the positions of two adjacent panels.
   *
   * A switch is not a swap: it is the mechanical act of moving two panels past
   * each other, used by falling as well as by swapping.
   */
  static switch(panel1: Panel, panel2: Panel, panels: PanelGrid): void {
    const rowDiff = panel1.row - panel2.row;
    const colDiff = panel1.column - panel2.column;
    if (Math.abs(rowDiff + colDiff) !== 1) {
      throw new Error('Panel.switch: panels are not adjacent');
    }

    const p1row = panel1.row;
    const p1col = panel1.column;

    panel1.row = panel2.row;
    panel1.column = panel2.column;
    panel2.row = p1row;
    panel2.column = p1col;

    panels[panel2.row][panel2.column] = panel2;
    panels[panel1.row][panel1.column] = panel1;
  }
}

/** Clear state/match/swap bookkeeping. Chaining only when asked. */
function clearFlags(panel: Panel, clearChaining?: boolean): void {
  panel.state = 'normal';
  panel.comboIndex = undefined;
  panel.comboSize = undefined;
  panel.isSwappingFromLeft = undefined;
  panel.dontSwap = undefined;
  panel.queuedHover = undefined;
  if (clearChaining) panel.chaining = false;
  panel.fellFromGarbage = undefined;
  panel.stateChanged = false;
  panel.propagatesChaining = false;
  panel.matchAnyway = false;
}

/** Full reset, including the garbage fields. */
function clear(panel: Panel, clearChaining?: boolean, clearColor?: boolean): void {
  if (clearColor) panel.color = 0;
  panel.timer = 0;
  panel.initialTime = undefined;
  panel.popTime = undefined;
  panel.popIndex = undefined;
  panel.xOffset = undefined;
  panel.yOffset = undefined;
  panel.width = undefined;
  panel.height = undefined;
  panel.metal = undefined;
  panel.shakeTime = undefined;
  panel.isGarbage = false;
  clearFlags(panel, clearChaining);
}

function getPanelBelow(panel: Panel, panels: PanelGrid): Panel {
  // Row 0 always exists, so this never needs a bounds check.
  return panels[panel.row - 1][panel.column];
}

/**
 * Is there anything solid holding this panel up?
 *
 * A garbage block is held up if ANY column across its whole width is supported,
 * and panels of the same garbage block at the same height do not count as
 * supporting it - otherwise every block would hold itself up.
 */
function supportedFromBelow(panel: Panel, panels: PanelGrid): boolean {
  if (panel.row <= 1) return true;

  if (panel.isGarbage) {
    const startColumn = panel.column - (panel.xOffset ?? 0);
    const endColumn = startColumn + (panel.width ?? 1) - 1;
    for (let column = startColumn; column <= endColumn; column++) {
      const panelBelow = panels[panel.row - 1][column];
      if (panelBelow.color !== 0) {
        if (!panelBelow.isGarbage) return true;
        if (panel.garbageId === panelBelow.garbageId) {
          return panel.yOffset !== panelBelow.yOffset;
        }
        return true;
      }
    }
    return false;
  }

  return panels[panel.row - 1][panel.column].color !== 0;
}

/** Drop one row. Garbage tells the panels above to fall rather than hover. */
function fall(panel: Panel, panels: PanelGrid): void {
  const panelBelow = getPanelBelow(panel, panels);
  Panel.switch(panel, panelBelow, panels);
  // panelBelow is now the panel ABOVE, having been switched past.
  if (panel.isGarbage) {
    panelBelow.propagatesFalling = true;
    panelBelow.stateChanged = true;
  }
  if (panel.state !== 'falling') {
    panel.state = 'falling';
    panel.timer = 0;
    panel.stateChanged = true;
  }
}

/** Come to rest. Garbage lands straight into normal; panels bounce first. */
function land(panel: Panel): void {
  panel.onLand();
  if (panel.isGarbage) {
    panel.state = 'normal';
  } else {
    panel.fellFromGarbage = undefined;
    panel.state = 'landing';
    panel.timer = LANDING_FRAMES;
  }
  panel.stateChanged = true;
}

function decrementTimer(panel: Panel): void {
  if (panel.timer > 0) panel.timer -= 1;
}

const normalState = {
  update(panel: Panel, panels: PanelGrid): void {
    if (panel.isGarbage) {
      if (!supportedFromBelow(panel, panels)) {
        // Garbage falls with no hover time at all.
        fall(panel, panels);
      }
      return;
    }

    // An empty cell can only be normal or swapping; it never enters other states.
    if (panel.color === 0) return;

    const panelBelow = getPanelBelow(panel, panels);
    if (!panelBelow.stateChanged) return;

    if (panelBelow.state === 'hovering') {
      // Inherit the hover time of the panel below, so a column lands together.
      normalState.enterHoverState(panel, panelBelow, panelBelow.timer, panels);
    } else if (panelBelow.color === 0) {
      if (panelBelow.propagatesFalling) {
        // Garbage dropped out from under us: fall with it, do not hover.
        fall(panel, panels);
      } else if (panelBelow.state === 'normal') {
        normalState.enterHoverState(panel, panelBelow, panel.frameTimes.HOVER, panels);
      }
      // An empty cell that is neither: it is mid-swap. Wait for it to finish.
    } else if (
      panelBelow.queuedHover === true
      && panelBelow.propagatesChaining
      && panelBelow.state === 'swapping'
    ) {
      // Panels below are swapping but a pop further down is propagating, so the
      // hover time is every remaining swap plus the hover of the first hovering
      // panel we find underneath them.
      let hoverTime = panelBelow.timer;
      let hoverPanel: Panel = getPanelBelow(panelBelow, panels);
      while (hoverPanel && hoverPanel.state === 'swapping') {
        hoverTime += hoverPanel.timer;
        hoverPanel = getPanelBelow(hoverPanel, panels);
      }
      if (hoverPanel.state === 'hovering') {
        // Could be a normal hover or a garbage hover; take whatever it has.
        hoverTime += hoverPanel.timer;
      } else {
        // No hovering panel below: the swap sits directly on panels that just
        // popped, so no garbage is involved and normal hover time applies.
        hoverTime += panel.frameTimes.HOVER;
      }
      normalState.enterHoverState(panel, panelBelow, hoverTime, panels);
    }
    // Every other exit from normal is driven by the stack: swap, match, death.
  },

  enterHoverState(panel: Panel, panelBelow: Panel, hoverTime: number, panels: PanelGrid): void {
    clearFlags(panel, false);
    panel.state = 'hovering';

    if (panelBelow.propagatesChaining) {
      panel.propagatesChaining = true;
      panel.chaining = true;

      if (panelBelow.color === 0 || panelBelow.matchAnyway) {
        // Panels above a match that just popped are matchable for one frame.
        // Panels above cleared GARBAGE are deliberately not.
        panel.matchAnyway = true;
      } else {
        // Swapping panels never carry matchAnyway, so drill down past them (and
        // past panels newly hovering over a garbage hover) to the real source.
        let below = panelBelow;
        while (
          below.state === 'swapping'
          || (below.stateChanged && below.propagatesChaining
              && !below.matchAnyway && below.state === 'hovering')
        ) {
          below = getPanelBelow(below, panels);
        }
        // If the hover came from a garbage hover, what we land on does not
        // propagate chaining, and so we do not match anyway.
        if (below.propagatesChaining) {
          panel.matchAnyway = below.color === 0 || below.matchAnyway;
        }
      }
    }

    panel.timer = hoverTime;
    panel.stateChanged = true;
  },
};

const swappingState = {
  update(panel: Panel, panels: PanelGrid): void {
    decrementTimer(panel);
    if (panel.timer === 0) {
      swappingState.changeState(panel, panels);
    } else {
      swappingState.propagateChaining(panel, panels);
    }
  },

  finishSwap(panel: Panel): void {
    panel.state = 'normal';
    panel.dontSwap = undefined;
    panel.isSwappingFromLeft = undefined;
    panel.stateChanged = true;
  },

  changeState(panel: Panel, panels: PanelGrid): void {
    const panelBelow = getPanelBelow(panel, panels);

    if (panel.color === 0) {
      swappingState.finishSwap(panel);
      return;
    }

    if (panelBelow
      && (panelBelow.color === 0 || panelBelow.state === 'hovering' || panel.queuedHover)) {
      swappingState.enterHoverState(panel, panelBelow);
    } else {
      swappingState.finishSwap(panel);
    }
  },

  /**
   * A pop finishing below a swap still has to reach the panels above it, or a
   * chain would die simply because the player was mid-swap when it landed.
   */
  propagateChaining(panel: Panel, panels: PanelGrid): void {
    const panelBelow = getPanelBelow(panel, panels);
    if (panelBelow && panelBelow.stateChanged && panelBelow.propagatesChaining) {
      panel.queuedHover = panel.color !== 0;
      panel.stateChanged = true;
      panel.propagatesChaining = true;
    }
  },

  enterHoverState(panel: Panel, panelBelow: Panel): void {
    clearFlags(panel, false);
    panel.state = 'hovering';
    // A swapping panel does NOT take the chaining flag when the panel below is
    // propagating - it only passes it on. Panels above may still chain.
    panel.propagatesChaining = panelBelow.propagatesChaining;
    if (panelBelow.color !== 0 && panelBelow.state === 'hovering') {
      panel.matchAnyway = panelBelow.matchAnyway;
    } else {
      panel.matchAnyway = false;
    }
    // A panel that just finished a swap always gets FULL hover time.
    panel.timer = panel.frameTimes.HOVER;
    panel.stateChanged = true;
  },
};

const matchedState = {
  update(panel: Panel, panels: PanelGrid): void {
    decrementTimer(panel);
    if (panel.isGarbage && panel.timer === panel.popTime) {
      // Upstream calls this criminal - garbage should enter popping state too -
      // but its pop is driven off popTime rather than the state machine.
      panel.onPop();
    }
    if (panel.timer === 0) {
      matchedState.changeState(panel, panels);
    }
  },

  changeState(panel: Panel, _panels: PanelGrid): void {
    if (panel.isGarbage) {
      if (panel.yOffset === -1) {
        // The bottom row of the block: it becomes a real panel and hovers.
        matchedState.enterHoverState(panel);
      } else {
        // Rows above simply go back to being unmatched garbage.
        panel.state = 'normal';
      }
      return;
    }
    // Done flashing and looking distressed; pop in match order.
    panel.state = 'popping';
    panel.timer = (panel.comboIndex ?? 0) * panel.frameTimes.POP;
    panel.stateChanged = true;
  },

  /** Garbage becoming a panel. `clear` resets isGarbage, which is the conversion. */
  enterHoverState(panel: Panel): void {
    clear(panel, false, false);
    panel.chaining = true;
    panel.propagatesChaining = true;
    if (panel.frameTimes.GARBAGE_HOVER === undefined) {
      throw new Error(
        'Trying to set garbage hover on a panel not having garbage hover: '
        + panel.toString(),
      );
    }
    panel.timer = panel.frameTimes.GARBAGE_HOVER;
    panel.fellFromGarbage = LANDING_FRAMES;
    panel.state = 'hovering';
    panel.stateChanged = true;
  },
};

const poppingState = {
  update(panel: Panel, panels: PanelGrid): void {
    decrementTimer(panel);
    if (panel.timer === 0) poppingState.changeState(panel, panels);
  },

  changeState(panel: Panel, _panels: PanelGrid): void {
    panel.onPop();
    if (panel.comboSize === panel.comboIndex) {
      // The last panel of the match skips popped state entirely.
      poppedState.changeState(panel);
    } else {
      panel.state = 'popped';
      panel.timer = ((panel.comboSize ?? 0) - (panel.comboIndex ?? 0)) * panel.frameTimes.POP;
      panel.stateChanged = true;
    }
  },
};

const poppedState = {
  update(panel: Panel): void {
    decrementTimer(panel);
    if (panel.timer === 0) poppedState.changeState(panel);
  },

  changeState(panel: Panel): void {
    panel.onPopped();
    clear(panel, true, true);
    // THE root of every chain: the panel above reads this in the same sweep.
    panel.propagatesChaining = true;
    panel.stateChanged = true;
  },
};

const hoverState = {
  update(panel: Panel, panels: PanelGrid): void {
    decrementTimer(panel);
    // The one-frame matchable window is spent the moment it is looked at.
    if (panel.matchAnyway) panel.matchAnyway = false;
    if (panel.timer === 0) hoverState.changeState(panel, panels);

    if (!panel.stateChanged && panel.fellFromGarbage) {
      panel.fellFromGarbage -= 1;
    }
  },

  changeState(panel: Panel, panels: PanelGrid): void {
    const panelBelow = getPanelBelow(panel, panels);
    if (!panelBelow) {
      throw new Error('Hovering panel in row 1 detected, commencing self-destruction sequence');
    }

    if (panelBelow.state === 'hovering') {
      // Match the hover below, so the column resolves together.
      panel.timer = panelBelow.timer;
    } else if (panelBelow.color !== 0) {
      // Common for panels that just came out of garbage.
      land(panel);
    } else {
      fall(panel, panels);
    }
  },
};

const fallingState = {
  update(panel: Panel, panels: PanelGrid): void {
    if (panel.row === 1) {
      land(panel);
    } else if (supportedFromBelow(panel, panels)) {
      if (panel.isGarbage) {
        land(panel);
      } else {
        const panelBelow = getPanelBelow(panel, panels);
        if (panelBelow.state === 'hovering') {
          fallingState.enterHoverState(panel, panelBelow);
        } else {
          land(panel);
        }
      }
    } else {
      fall(panel, panels);
    }

    if (!panel.stateChanged && panel.fellFromGarbage) {
      panel.fellFromGarbage -= 1;
    }
  },

  enterHoverState(panel: Panel, panelBelow: Panel): void {
    clearFlags(panel, false);
    panel.state = 'hovering';
    panel.stateChanged = true;
    // Deliberately does NOT add `chaining` if we do not already have it: the
    // fall had not finished when the hover began.
    panel.propagatesChaining = panelBelow.propagatesChaining;
    panel.timer = panelBelow.timer;
  },
};

const landingState = {
  update(panel: Panel, panels: PanelGrid): void {
    // A landing panel behaves like a normal one first - it can be matched, and
    // it can be pulled back into hovering if the ground moves.
    normalState.update(panel, panels);

    if (!panel.stateChanged) {
      decrementTimer(panel);
      if (panel.timer === 0) landingState.changeState(panel);
    }
  },

  changeState(panel: Panel): void {
    panel.state = 'normal';
    panel.stateChanged = true;
  },
};

const dimmedState = {
  // Upstream notes these are correct but currently unused: the stack turns row 0
  // into row 1 itself. Kept so the state is not a hole in the machine.
  update(panel: Panel): void {
    if (panel.row >= 1) dimmedState.changeState(panel);
  },

  changeState(panel: Panel): void {
    panel.state = 'normal';
    panel.stateChanged = true;
  },
};
