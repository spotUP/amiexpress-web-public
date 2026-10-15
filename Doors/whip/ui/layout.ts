/**
 * WHERE WHIP'S PANES GO, as one decision per screen rather than fifteen.
 *
 * Every WHIP screen is built the same way: a framed header, a content pane
 * with the door's work in it, and a framed footer the chrome fills. Most of
 * them then put TWO boxes side by side inside the content - a list at
 * `width: '50%'` and a detail or stats panel at `width: '45%'` - and that is
 * the thing a C64 cannot have. Twenty columns do not hold a bordered list of
 * `[D] My Profile (Discord name)`, and a 45% panel beside it holds eighteen.
 *
 * The sysop, 2026-09-22: "some of our typescript doors dont have a 40 column
 * mode, whip for example". A door with no 40-column mode is not merely ugly
 * there - the gate REFUSES it to a PETSCII caller, because a TypeScript
 * door's output never crosses the frame adapter and nothing would fold it.
 *
 * SO THE GEOMETRY IS A FUNCTION, not a set of literals spread through the
 * screens. It takes the LIVE width and height - never a constant, which is
 * the defect this replaces - and answers where the two panes are. At forty
 * columns they stack: the list takes the full width and the panel sits under
 * it, short enough that the footer keeps its row.
 *
 * The 80-column answers are exactly what the screens had before, so an
 * eighty-column board sees no change; that is what the tests pin.
 */
import { isCompactWidth } from '@amiexpress/bbs-door-sdk';

/** One box's place inside the content pane, in blessed's own terms. */
export interface PanePlacement {
  top: number;
  left?: number;
  right?: number;
  width: string | number;
  height: number;
}

export interface WhipPanes {
  /** The list, the board, the table - whatever the screen is FOR. */
  main: PanePlacement;
  /** The stats/detail panel beside it at 80, under it at 40. */
  side: PanePlacement;
  /** True when the two are stacked rather than side by side. */
  stacked: boolean;
  /** Rows the side panel may use for content, borders excluded. */
  sideContentRows: number;
}

/**
 * The two panes of a WHIP screen.
 *
 * `rows` is the height of the CONTENT pane, not the screen: the caller has
 * already taken the menu bar, the header and the footer off it, and the sum
 * lives in one place per screen for the same reason this does.
 */
export function whipPanes(width: number, rows: number, mainRows = 13): WhipPanes {
  if (!isCompactWidth(width)) {
    // Eighty columns, unchanged: the list on the left, the panel on the
    // right, both a row down from the top of the content pane.
    return {
      main: { top: 1, left: 1, width: '50%', height: mainRows },
      side: { top: 1, right: 1, width: '45%', height: mainRows - 1 },
      stacked: false,
      sideContentRows: mainRows - 3,
    };
  }

  /*
   * Forty columns. The list keeps its border - a C64 draws one cleanly and
   * the label is where the screen says what it is - and takes the whole
   * width; the panel goes underneath with whatever rows are left.
   *
   * THE LIST WINS THE ROWS, and the panel gets the remainder. A first cut
   * reserved four rows for the panel whatever the screen had, so a short
   * content pane gave the menu four rows - one of them interior - and the
   * panel three. The menu is what the caller came for.
   *
   * A panel needs THREE rows to say anything: two of border and one of
   * content. Below that there is no panel and the menu takes everything.
   * The two sit FLUSH - a blank row between them is a luxury of a screen
   * with rows to spare, and a C64's sixteen interior rows are exactly the
   * menu's thirteen plus the smallest panel worth drawing.
   */
  const SMALLEST_PANEL = 3;
  const room = rows >= SMALLEST_PANEL + 5;
  const mainHeight = room
    ? Math.max(5, Math.min(mainRows, rows - SMALLEST_PANEL))
    : Math.max(3, Math.min(mainRows, rows));
  const sideTop = mainHeight;
  const sideHeight = room ? Math.max(0, rows - sideTop) : 0;
  return {
    main: { top: 0, left: 0, width: '100%', height: mainHeight },
    side: { top: sideTop, left: 0, width: '100%', height: sideHeight },
    stacked: true,
    // ALWAYS less its two border rows: the panel is drawn with a frame at
    // both tiers, and `profile.borders` is false at forty - reading it here
    // said a three-row box had three rows of content.
    sideContentRows: Math.max(0, sideHeight - 2),
  };
}

/**
 * Does the side panel fit at all?
 *
 * A screen with nothing left for it draws only the list rather than a
 * one-row box with a label and no content - and the caller loses nothing he
 * could have read.
 */
export function sideFits(panes: WhipPanes): boolean {
  return panes.side.height >= 3 && panes.sideContentRows >= 1;
}

/** One field of an editor modal, in blessed's terms. */
export interface FieldPlacement {
  top: number;
  height: number;
  left?: number | string;
  right?: number;
  width?: string | number;
}

export interface EditorLayout {
  /** The modal itself - never wider or taller than the screen. */
  modal: { width: number; height: number };
  title: FieldPlacement;
  category: FieldPlacement;
  priority: FieldPlacement;
  project: FieldPlacement;
  assignee: FieldPlacement;
  points: FieldPlacement;
  description: FieldPlacement;
  /** The row the OK/Cancel buttons sit on. */
  buttonsTop: number;
  /** Where the two buttons sit on it - both INSIDE the modal's border. */
  buttons: { ok: { left: number; width: number }; cancel: { left: number; width: number } };
}

/**
 * THE TASK EDITOR'S FIELDS, for the screen they are on.
 *
 * The modal was `width: 68, height: 24` - literals, which is why WHIP could
 * not open on a C64 at all: sixty-eight columns do not fit on forty, so the
 * caller's first keystroke went into a box he could not see the sides of.
 *
 * At forty the two WIDE pairs stack and shrink: Category and Priority are
 * five-row lists side by side at eighty, and at forty they are three-row
 * lists - one visible entry each, walked with up and down, which is the key
 * the caller already uses there. What does NOT stack is Assignee and Points:
 * a handle and a number fit eighteen columns each, and spending six rows to
 * give them forty would cost the Description its own.
 *
 * The sum at forty: title 3, category 3, priority 3, project 3, the
 * assignee/points pair 3, description 3, buttons 3 - twenty-one rows inside
 * a two-row border, which leaves two spare on a twenty-five row screen.
 */
export function taskEditorLayout(width: number, height: number): EditorLayout {
  if (!isCompactWidth(width)) {
    return {
      modal: { width: Math.min(68, width), height: Math.min(24, height) },
      title: { top: 1, left: 1, right: 1, height: 3 },
      category: { top: 4, left: 1, width: '48%', height: 5 },
      priority: { top: 4, left: '50%', right: 1, height: 5 },
      project: { top: 9, left: 1, right: 1, height: 4 },
      assignee: { top: 13, left: 1, width: '48%', height: 3 },
      points: { top: 13, left: '50%', right: 1, height: 3 },
      description: { top: 16, left: 1, right: 1, height: 3 },
      buttonsTop: 19,
      buttons: { ok: { left: 15, width: 14 }, cancel: { left: 38, width: 14 } },
    };
  }
  return {
    modal: { width: Math.min(68, width), height: Math.min(24, height) },
    title: { top: 1, left: 1, right: 1, height: 3 },
    category: { top: 4, left: 1, right: 1, height: 3 },
    priority: { top: 7, left: 1, right: 1, height: 3 },
    project: { top: 10, left: 1, right: 1, height: 3 },
    assignee: { top: 13, left: 1, width: '48%', height: 3 },
    points: { top: 13, left: '50%', right: 1, height: 3 },
    description: { top: 16, left: 1, right: 1, height: 3 },
    buttonsTop: 19,
    /*
     * BOTH BUTTONS INSIDE THE BORDER. At eighty they sit at 15 and 38; the
     * second of those is past the right edge of a forty-column modal, so the
     * caller could not see - or click - Cancel at all.
     */
    buttons: { ok: { left: 2, width: 14 }, cancel: { left: 20, width: 14 } },
  };
}

export interface ProjectEditorLayout {
  modal: { width: number; height: number };
  name: FieldPlacement;
  type: FieldPlacement;
  status: FieldPlacement;
  party: FieldPlacement;
  description: FieldPlacement;
  buttonsTop: number;
  buttons: { ok: { left: number; width: number }; cancel: { left: number; width: number } };
}

/**
 * THE PROJECT EDITOR'S FIELDS, on the same rule as the task editor's.
 *
 * Its modal was `width: 70, height: 24`, two more columns than a C64 screen
 * has twice over. At forty everything stacks at three rows a field - Type is
 * a nine-row list at eighty and one visible entry here, walked with up and
 * down - which comes to eighteen rows inside the border and leaves five
 * spare.
 */
export function projectEditorLayout(width: number, height: number): ProjectEditorLayout {
  if (!isCompactWidth(width)) {
    return {
      modal: { width: Math.min(70, width), height: Math.min(24, height) },
      name: { top: 1, left: 1, right: 1, height: 3 },
      type: { top: 5, left: 1, width: '48%', height: 9 },
      status: { top: 5, left: '50%', right: 1, height: 5 },
      party: { top: 11, left: '50%', right: 1, height: 5 },
      description: { top: 15, left: 1, right: 1, height: 3 },
      buttonsTop: 19,
      buttons: { ok: { left: 17, width: 14 }, cancel: { left: 40, width: 14 } },
    };
  }
  return {
    modal: { width: Math.min(70, width), height: Math.min(24, height) },
    name: { top: 1, left: 1, right: 1, height: 3 },
    type: { top: 4, left: 1, right: 1, height: 3 },
    status: { top: 7, left: 1, right: 1, height: 3 },
    party: { top: 10, left: 1, right: 1, height: 3 },
    description: { top: 13, left: 1, right: 1, height: 3 },
    buttonsTop: 16,
    buttons: { ok: { left: 2, width: 14 }, cancel: { left: 20, width: 14 } },
  };
}

/**
 * A MODAL NEVER WIDER THAN THE SCREEN IT OPENS ON.
 *
 * WHIP's dialogs were sized with literals - 70x22 for the project picker,
 * 62x15 for the profile, 60x10 for the kanban's notice - and every one of
 * them is wider than a C64's forty columns. A modal wider than the screen
 * does not merely spill: its right border, and anything anchored to it, is
 * off the glass, so the caller types into a box he cannot see the edge of.
 */
export function modalSize(
  preferredWidth: number,
  preferredHeight: number,
  width: number,
  height: number,
): { width: number; height: number } {
  return {
    width: Math.max(10, Math.min(preferredWidth, width)),
    height: Math.max(3, Math.min(preferredHeight, height)),
  };
}

/**
 * A ROW OF BUTTONS, laid across the modal's interior or stacked down it.
 *
 * Three buttons of fourteen columns need forty-two and a C64's modal has
 * thirty-eight, so at the compact tier they go one to a row. `interior` is
 * the modal's width less its two border columns.
 */
export function buttonRow(
  count: number,
  interior: number,
  firstRow: number,
  buttonWidth = 14,
): Array<{ top: number; left: number; width: number }> {
  const across = count * buttonWidth + (count - 1) * 2 <= interior;
  if (across) {
    const gap = Math.floor((interior - count * buttonWidth) / (count + 1));
    return Array.from({ length: count }, (_, i) => ({
      top: firstRow,
      left: gap + i * (buttonWidth + gap),
      width: buttonWidth,
    }));
  }
  const fitted = Math.min(buttonWidth, interior);
  return Array.from({ length: count }, (_, i) => ({
    top: firstRow + i * 3,
    left: Math.max(0, Math.floor((interior - fitted) / 2)),
    width: fitted,
  }));
}
