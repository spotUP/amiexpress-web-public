/**
 * The board's copy of each caller's screen (plan 2026-10-17 menu styles, K1 / P9).
 *
 * A cell grid per connection, fed with every string the board sends the
 * caller (server/session-observers.ts observeOutput: web and telnet/SSH alike,
 * before the PETSCII transducer, always on). It exists so a door can put an
 * overlay over the screen and take it away again: AEW_SCREEN `SAVE` copies a
 * region of this grid, `RESTORE` repaints it (xim/board-screen.ts). The
 * terminal's alternate screen cannot do that - it is blank, and C64 telnet
 * clients do not have one.
 *
 * The step itself is the wipe engine's (utils/screen-wipe.util.ts AnsiGrid),
 * run as a terminal: the caller's size, scrolling, erases in the current
 * background. Raw PETSCII bytes (`.seq` screens) are not modelled.
 */
import { AnsiGrid, renderGridAt, type GridCell } from '../../utils/screen-wipe.util';
import { responsiveDoorGeometry } from '../../amiga-emulation/xim/screen-width.util';

/** What the screen model needs to know of a session: its size. */
export type ScreenModelSession = Parameters<typeof responsiveDoorGeometry>[0];

/** A saved region, with the SGR and cursor that were in force when it was saved. */
export interface ScreenSnapshot {
  /** 1-based screen row and column of the region's top-left cell. */
  top: number;
  left: number;
  rows: number;
  cols: number;
  cells: GridCell[][];
  ansi: string;
  /** 0-based cursor position at SAVE. */
  cursorRow: number;
  cursorCol: number;
}

interface SessionScreen {
  grid: AnsiGrid;
  snapshot: ScreenSnapshot | null;
}

const screens = new Map<string, SessionScreen>();

/** Text the board sent this caller: run it against the caller's grid (created on first output). */
export function feedScreenModel(connectionId: string, session: ScreenModelSession, text: string): void {
  // The size the board draws this caller at - the same geometry AEW_SCREEN SIZE answers.
  const { cols, rows } = responsiveDoorGeometry(session);
  let screen = screens.get(connectionId);
  if (!screen) {
    screen = { grid: new AnsiGrid(cols, rows), snapshot: null };
    screens.set(connectionId, screen);
  } else {
    screen.grid.resize(cols, rows);
  }
  screen.grid.feed(text);
}

/** The connection closed: its screen goes with it. */
export function dropScreenModel(connectionId: string): void {
  screens.delete(connectionId);
}

/** The caller's grid, or undefined when the board has sent him nothing yet. */
export function screenModelFor(connectionId: string): AnsiGrid | undefined {
  return screens.get(connectionId)?.grid;
}

/** The caller's rows top..top+rows-1 (1-based), `cols` wide, blank past what the board drew; [] when it has no screen for him. */
export function screenRows(connectionId: string, top: number, rows: number, cols: number): GridCell[][] {
  const grid = screenModelFor(connectionId);
  if (!grid) return [];
  return Array.from({ length: rows }, (_, y) => Array.from({ length: cols }, (_, x) => grid.cellAt(top - 1 + y, x)));
}

/** Copy a region (1-based, inside the screen) out of a grid; null when it leaves the screen. */
export function snapshotRegion(grid: AnsiGrid, top: number, left: number, rows: number, cols: number): ScreenSnapshot | null {
  const height = grid.height ?? 0;
  if (![top, left, rows, cols].every(n => Number.isInteger(n) && n >= 1)) return null;
  if (top + rows - 1 > height || left + cols - 1 > grid.columns) return null;
  const cells: GridCell[][] = [];
  for (let y = 0; y < rows; y++) {
    const row: GridCell[] = [];
    for (let x = 0; x < cols; x++) row.push(grid.cellAt(top - 1 + y, left - 1 + x));
    cells.push(row);
  }
  return { top, left, rows, cols, cells, ansi: grid.ansi, cursorRow: grid.row, cursorCol: grid.col };
}

/** The bytes that put a saved region back: every cell of it, then the saved cursor and SGR. */
export function renderSnapshot(snap: ScreenSnapshot, columns: number): string {
  const col = Math.min(snap.cursorCol, columns - 1);
  return renderGridAt(snap.cells, snap.top, snap.left, snap.rows, snap.cols, { opaque: true })
    + `\x1b[${snap.cursorRow + 1};${col + 1}H` + snap.ansi;
}

/** SAVE: hold a region of this caller's screen. False when there is no screen yet or the region leaves it. */
export function saveScreenRegion(connectionId: string, top: number, left: number, rows: number, cols: number): boolean {
  const screen = screens.get(connectionId);
  if (!screen) return false;
  const snap = snapshotRegion(screen.grid, top, left, rows, cols);
  if (!snap) return false;
  screen.snapshot = snap;
  return true;
}

/** RESTORE: the bytes that repaint the held region (the hold is released), or null when nothing is held. */
export function takeScreenRestore(connectionId: string): string | null {
  const screen = screens.get(connectionId);
  const snap = screen?.snapshot;
  if (!screen || !snap) return null;
  screen.snapshot = null;
  return renderSnapshot(snap, screen.grid.columns);
}

/*
 * The whole-screen hold: the board covers EVERYTHING the caller sees (the
 * command palette over a running door) and must give it back exactly. A slot
 * of its own, apart from `snapshot`, because what runs on top (the palette's
 * own AEW_SCREEN SAVE/RESTORE) uses that one.
 */
const held = new Map<string, ScreenSnapshot>();

/** Hold the caller's whole screen. False when there is no screen yet. */
export function holdWholeScreen(connectionId: string): boolean {
  const screen = screens.get(connectionId);
  if (!screen || screen.grid.height === undefined) return false;
  const snap = snapshotRegion(screen.grid, 1, 1, screen.grid.height, screen.grid.columns);
  if (!snap) return false;
  held.set(connectionId, snap);
  return true;
}

/** The bytes that repaint the held whole screen (the hold is released), or null when nothing is held. */
export function takeHeldScreen(connectionId: string): string | null {
  const snap = held.get(connectionId);
  if (!snap) return null;
  held.delete(connectionId);
  const screen = screens.get(connectionId);
  return renderSnapshot(snap, screen?.grid.columns ?? snap.cols);
}

/**
 * The caller moved to another socket (a resume, or a move from another
 * window): the same screen now belongs to `toId`. Mirrors
 * nodeManager.rekeySession. Without it the old id's stopObserving drops the
 * model with the old socket and the new terminal has nothing to repaint from.
 */
export function rekeyScreenModel(fromId: string, toId: string): void {
  if (fromId === toId) return;
  const screen = screens.get(fromId);
  if (!screen) return;
  screens.delete(fromId);
  screens.set(toId, screen);
  const heldScreen = held.get(fromId);
  if (heldScreen) {
    held.delete(fromId);
    held.set(toId, heldScreen);
  }
}

/**
 * The bytes that repaint this caller's whole screen on a blank terminal
 * (every cell, then cursor and SGR), without releasing any hold. Null when the
 * board has drawn nothing visible for him.
 */
export function renderWholeScreen(connectionId: string): string | null {
  const screen = screens.get(connectionId);
  if (!screen || screen.grid.height === undefined) return null;
  const snap = snapshotRegion(screen.grid, 1, 1, screen.grid.height, screen.grid.columns);
  if (!snap) return null;
  if (!snap.cells.some(row => row.some(cell => cell.char.trim() !== ''))) return null;
  return renderSnapshot(snap, screen.grid.columns);
}
