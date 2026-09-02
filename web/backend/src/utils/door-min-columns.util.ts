/**
 * MIN_COLUMNS door gating (C64/40-col plan, Task 1).
 *
 * DEFAULT-CLOSED: a door with no MIN_COLUMNS tooltype anywhere gates at 80.
 * Rationale (recorded in the plan): zero existing doors carry the tooltype,
 * so a permissive absent-default would expose every needs-80 door (garbled
 * blessed UIs, 68K CON: output, arcade canvases) to 40-column callers on
 * day one. A door is 40-ok only when explicitly marked MIN_COLUMNS=40 -
 * which Task 6 does per door, as each is adapted and verified. This is the
 * numeric cousin of the "tooltype booleans cannot default to true" rule:
 * absent means unclassified, and unclassified is unsafe at 40.
 *
 * Both registries already deliver the tooltype map in memory
 * (CommandDefinition.toolTypes -> Door.toolTypes via initializeDoors;
 * DoorInfo.toolTypes via displayDoorMenu's doorInfo), so resolution is
 * pure - no disk reads at launch time. A sysop opt-in is one tooltype in
 * Commands/BBSCmd/<CMD>.info plus reloadDoors.
 *
 * The "how wide is this caller" half is NOT re-derived here: it delegates
 * to doorScreenWidth() (amiga-emulation/xim/screen-width.util.ts), the one
 * landed answer, so the gate can never disagree with BB_SCRWIDTH, the
 * launch-time lineWrap, or wrapForSession about a session's width.
 */
import { doorScreenWidth } from '../amiga-emulation/xim/screen-width.util';

/** Uppercase-only ASCII: legible on a power-on C64 in up/gfx charset
 *  (same rule as ANSI_GRAPHICS_PROMPT, login-connect.service.ts:57). */
export const DOOR_NEEDS_80_NOTICE = '\r\nTHIS DOOR NEEDS AN 80 COLUMN SCREEN\r\n';

export const DEFAULT_MIN_COLUMNS = 80;

export interface MinColumnsDoorShape {
  command?: string;
  id?: string;
  minColumns?: number;
  toolTypes?: Record<string, string>;
  doorInfo?: {
    minColumns?: number;
    toolTypes?: Record<string, string>;
  };
}

function validColumns(n: unknown): number | null {
  if (n === undefined || n === null) return null;
  const parsed = typeof n === 'number' ? n : parseInt(String(n), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function resolveDoorMinColumns(door: MinColumnsDoorShape): number {
  return (
    validColumns(door.minColumns) ??
    validColumns(door.toolTypes?.['MIN_COLUMNS']) ??
    validColumns(door.doorInfo?.minColumns) ??
    validColumns(door.doorInfo?.toolTypes?.['MIN_COLUMNS']) ??
    DEFAULT_MIN_COLUMNS
  );
}

/**
 * Columns the gate judges this session by.
 *
 * DEVIATION FROM THE PLAN TEXT, deliberate: the plan wrote this as
 * `session.screenWidth ?? (petsciiMode ? 40 : 80)`. That reads screenWidth
 * for NON-PETSCII sessions too, and socket-handlers.ts's terminal-size
 * handler writes a real xterm width onto every ordinary web session - a
 * phone in portrait reports well under 80. Under the plan's formula those
 * callers would have been locked out of every door on the board, which is
 * exactly the "non-C64 platforms never pay for C64 support" rule the
 * wrap-for-session choke point already had to learn (see its header). So
 * the gate uses the SAME single source of truth as door width does:
 * `petsciiMode === true` is the only thing that can make a session narrow.
 */
export function sessionColumns(session: { screenWidth?: number; petsciiMode?: boolean }): number {
  return doorScreenWidth(session, DEFAULT_MIN_COLUMNS);
}
