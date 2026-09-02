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
 * The "how wide is this caller" half is NOT re-derived here: a PETSCII
 * session delegates to doorScreenWidth() (amiga-emulation/xim/screen-width.util.ts),
 * the one landed answer, so the gate can never disagree with BB_SCRWIDTH, the
 * launch-time lineWrap, or wrapForSession about a C64's width.
 *
 * ONE resolved value, not two lookups. The door-list marker and the gate must
 * never disagree, and they used to be able to: the menu row is formatted from
 * the entry displayDoorMenu built (which carries the installed 68K record as
 * `doorInfo`), while Enter re-dispatches BY COMMAND NAME through
 * command.handler's `getDoors().find(...)`, whose Door objects have no
 * `doorInfo` at all. A door marked MIN_COLUMNS=40 only in its installed
 * record therefore showed [40] and was then refused. initializeDoors() now
 * resolves MIN_COLUMNS ONCE, at registration, onto `Door.minColumns` - which
 * is the FIRST thing this resolver reads - so every later reader, marker and
 * gate alike, sees the same number on the same object.
 */
import { doorScreenWidth } from '../amiga-emulation/xim/screen-width.util';

/** Uppercase-only ASCII: legible on a power-on C64 in up/gfx charset
 *  (same rule as ANSI_GRAPHICS_PROMPT, login-connect.service.ts:57). */
export const DOOR_NEEDS_80_NOTICE = '\r\nTHIS DOOR NEEDS AN 80 COLUMN SCREEN\r\n';

export const DEFAULT_MIN_COLUMNS = 80;

export interface MinColumnsDoorShape {
  command?: string;
  id?: string;
  /** TYPE= as registered ('XIM', 'TS', ...). formatDoorLine's entries carry doorType too. */
  type?: string;
  doorType?: string;
  minColumns?: number;
  /** C64_ADAPT resolved once at registration, the way minColumns is. */
  c64Adapt?: number;
  toolTypes?: Record<string, string>;
  doorInfo?: {
    minColumns?: number;
    c64Adapt?: number;
    toolTypes?: Record<string, string>;
  };
}

/**
 * A column count, or null when the value is not one.
 *
 * STRICT: a tooltype is trusted only when the whole trimmed value is digits.
 * parseInt() would have read '40abc' as 40 and quietly opened a door on a
 * typo'd registration; the safe reading of a malformed MIN_COLUMNS is
 * "unclassified", which falls through to the closed default of 80.
 * Exported because amigaDoorManager's .info parse must apply the SAME rule -
 * a value this function rejects must not become DoorInfo.minColumns either.
 */
export function validColumns(n: unknown): number | null {
  if (n === undefined || n === null) return null;
  if (typeof n === 'number') {
    return Number.isInteger(n) && n > 0 ? n : null;
  }
  const text = String(n).trim();
  if (!/^\d+$/.test(text)) return null;
  const parsed = parseInt(text, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * The width this door DECLARED, or null when it declared nothing.
 *
 * Kept separate from resolveDoorMinColumns() so registration can tell
 * "unclassified" from "explicitly 80": initializeDoors() writes
 * Door.minColumns only when a declaration actually exists, so an unmarked
 * door stays undefined and the closed default is applied at the gate, once.
 */
export function declaredMinColumns(door: MinColumnsDoorShape): number | null {
  return (
    validColumns(door.minColumns) ??
    validColumns(door.toolTypes?.['MIN_COLUMNS']) ??
    validColumns(door.doorInfo?.minColumns) ??
    validColumns(door.doorInfo?.toolTypes?.['MIN_COLUMNS'])
  );
}

export function resolveDoorMinColumns(door: MinColumnsDoorShape): number {
  return declaredMinColumns(door) ?? DEFAULT_MIN_COLUMNS;
}

/**
 * Columns the gate judges this session by.
 *
 * A PETSCII session is ALWAYS 40 (a C64 has no other width; doorScreenWidth()
 * is the shared authority, so BB_SCRWIDTH, lineWrap, wrapForSession and this
 * gate can never disagree about one).
 *
 * Any other session is `max(80, reported width)`. Two properties come out of
 * that, both deliberate:
 *  - it NEVER narrows anyone. Every ordinary web socket carries its real
 *    xterm width (socket-handlers.ts 'terminal-size'), so a phone in portrait
 *    reports far fewer than 80 columns - and must keep the door access it has
 *    always had. The plan's original `session.screenWidth ?? 80` would have
 *    locked those callers out of every door on the board.
 *  - a genuinely wide terminal can satisfy a door that asks for MORE than 80.
 *    A real 132-column xterm opens a MIN_COLUMNS=132 door; an 80-column one
 *    is refused, which is the honest answer rather than a garbled screen.
 */
export function sessionColumns(session: { screenWidth?: number; petsciiMode?: boolean } | null | undefined): number {
  if (session?.petsciiMode === true) return doorScreenWidth(session, DEFAULT_MIN_COLUMNS);
  const reported = validColumns(session?.screenWidth);
  return reported === null ? DEFAULT_MIN_COLUMNS : Math.max(DEFAULT_MIN_COLUMNS, reported);
}

/**
 * The C64 door adapter (Phase 3, server/c64-door-adapter.ts) is the one way a
 * gated 80-column door may still open for a 40-column caller: it replays the
 * door's ANSI onto a virtual 80x25 grid and reduces each finished frame to the
 * caller's width. That only works for output the adapter's seam actually sees
 * - the socket handed to AmigaDoorSession - so the claim is meaningful for the
 * 68K types that route to executeAmigaDoor and for nothing else. A TS door
 * paints its own blessed UI and would be untouched by the adapter, so marking
 * one C64_ADAPT must not open it.
 */
export const ADAPTED_DOOR_TYPES: ReadonlySet<string> = new Set(['XIM', 'DD', 'AMI', 'SIM', 'FIM']);

/**
 * The columns this door claims it reaches THROUGH the adapter, or null.
 *
 * A SEPARATE declaration from MIN_COLUMNS on purpose: MIN_COLUMNS=40 asserts
 * "this door already fits 40", which is false of an unmodified 80-column 68K
 * binary - reusing it would put a lie in the registry. C64_ADAPT=<columns>
 * asserts "usable at N columns through the adapter". Same strict validColumns
 * parser, same default-closed reading of anything malformed or absent, and the
 * same source order as declaredMinColumns() so the two can never disagree
 * about which registration object carries the truth.
 */
export function resolveDoorAdaptColumns(door: MinColumnsDoorShape): number | null {
  return (
    validColumns(door.c64Adapt) ??
    validColumns(door.toolTypes?.['C64_ADAPT']) ??
    validColumns(door.doorInfo?.c64Adapt) ??
    validColumns(door.doorInfo?.toolTypes?.['C64_ADAPT'])
  );
}

/**
 * THE predicate: may this session enter this door through the C64 adapter?
 *
 * ONE answer, two readers - executeDoor's gate clause asks it whether a door
 * the MIN_COLUMNS gate would refuse may open anyway, and executeAmigaDoor asks
 * it whether to install the adapter on the socket. A second, separately-worded
 * check at the install site is exactly how a door could be let in and then run
 * unadapted (80-column bytes at a C64), so there is deliberately only one.
 *
 * Every clause is load-bearing:
 *  - petsciiMode: an ANSI caller must never be routed through the
 *    reconstructor, whatever the door declares. Its bytes stay byte-identical.
 *  - ADAPTED_DOOR_TYPES: only doors whose output crosses the adapter's seam.
 *  - a parsed claim: absent/malformed is unclassified, and unclassified is
 *    closed (the same rule MIN_COLUMNS follows).
 *  - have >= claim: a door that only reaches 64 columns is still refused to a
 *    40-column caller rather than served a screen it cannot hold.
 */
export function doorOpensForC64(
  door: MinColumnsDoorShape | null | undefined,
  session: { screenWidth?: number; petsciiMode?: boolean } | null | undefined,
): boolean {
  if (!door || session?.petsciiMode !== true) return false;
  const type = String(door.type ?? door.doorType ?? '').toUpperCase();
  if (!ADAPTED_DOOR_TYPES.has(type)) return false;
  const claim = resolveDoorAdaptColumns(door);
  return claim !== null && sessionColumns(session) >= claim;
}
