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
import { doorScreenWidth, C64_COLUMNS } from '../amiga-emulation/xim/screen-width.util';

/** Uppercase-only ASCII: legible on a power-on C64 in up/gfx charset
 *  (same rule as ANSI_GRAPHICS_PROMPT, login-connect.service.ts:57). */
export const DOOR_NEEDS_80_NOTICE = '\r\nTHIS DOOR NEEDS AN 80 COLUMN SCREEN\r\n';

/**
 * The second half of a refusal that has nothing behind it.
 *
 * Emitted only when the DISPATCHER armed 'NO_EQUIVALENT' - i.e. a command was
 * typed at the menu, a door won it, the width gate refused it, and
 * INTERNAL_COMMAND_NAMES has no case for that name. Every other route into the
 * gate (the DOORS menu, a ~CC_ screen command, login-post) has no tier below
 * and gets DOOR_NEEDS_80_NOTICE alone, byte for byte as before.
 *
 * `columns` comes from `sessionColumns()` - the ONE width the gate itself
 * compared against - so the two sentences can never quote different numbers.
 * Uppercase ASCII and both lines under 40 characters, the same rule
 * DOOR_NEEDS_80_NOTICE follows: legible on a power-on C64.
 */
export function noWidthEquivalentNotice(command: string, columns: number): string {
  const name = String(command || '').trim().toUpperCase();
  const subject = name ? `${columns} COLUMN ${name}` : `${columns} COLUMN VERSION`;
  return `THE BOARD HAS NO ${subject}.\r\nUSE '?' FOR THE COMMAND LIST.\r\n`;
}

/** The browser cousin of the notice above, same rule and same shape: uppercase
 *  ASCII only, so a power-on C64 on the PETSCII telnet port can read it. */
export const DOOR_NEEDS_BROWSER_NOTICE = '\r\nTHIS DOOR NEEDS A WEB BROWSER\r\n';

export const DEFAULT_MIN_COLUMNS = 80;

/**
 * The width gate's fall-through channel (open backlog 11.1, sysop-decided
 * 2026-09-06).
 *
 * The bug: `Commands/BBSCmd/f.info`, `fr.info`, `scan.info` and `Z.info`
 * register 68K doors over commands the BBS also answers itself, and dispatch
 * asks BBSCMD before the internal switch (`command.handler.ts` processCommand,
 * express.e:28228). So a 40-column caller who typed FR was refused a door and
 * dropped back at the menu, while the board's own 40-column file listing sat
 * one tier below, unreachable. Three days of "I cannot list files on my C64".
 *
 * The fix is a REPORT, not a decision. `executeDoor`'s gate stays the single
 * predicate for "too narrow" and the single emitter of the notice; the
 * dispatcher - the only caller that has a next tier to fall to - ARMS this
 * field before the launch it initiates, and the gate answers REFUSED instead
 * of printing. Every other route into `executeDoor` (the DOORS menu, a ~CC_
 * screen command, login-post's chat-only launch) arms nothing and therefore
 * refuses exactly as it always did.
 *
 * Deliberately a session field rather than a fourth outcome threaded through
 * `runBbsCommand` -> `execBbsCommand` -> `runCommand` -> `executeDoor`: those
 * four signatures are shared with SYSCMD, PWFAIL and a door's RETURNCOMMAND,
 * and widening all of them would hand a case to call sites that cannot act on
 * it. The arm is read-and-cleared by the gate on EVERY launch so a door that
 * launches another door can never inherit it.
 *
 * A THIRD state, 'NO_EQUIVALENT', is the same report in the other direction:
 * the dispatcher looked for a tier below and there is none. It exists because
 * the notice alone cannot tell those two cases apart, and the sysop read the
 * wrong one out of it - "nsu says it needs an 80 column screen still", the day
 * after the fall-through landed, meaning "the fix missed NSU". It had not.
 *
 * NSU, CS and SCAN are `Doors:AquaScan/AquaScan.000` under three names
 * (`Commands/BBSCmd/{nsu,cs,scan}.info`), and AquaScan's own help calls all
 * three "Scan all confs since day of last call". express.e has no such
 * internal command: `processInternalCommand` (express.e:28285-28398) is a
 * closed list whose file commands are F, FR, FM, FS, N and Z, and a real /X
 * board without AquaScan answers NSU with "No such command!!". express.e has
 * the BEHAVIOUR, but only as a loop inside `confScan()` (express.e:28066-28114)
 * - per conference, `checkFileConfScan()` then `currentConf:=conf;
 * runSysCommand('N','S U')`, which is where the name comes from - and this
 * port already runs exactly that at logon (message-scan.handler.ts). Wiring
 * NSU to it on demand was rejected on evidence: that loop's `N` is
 * displayNewFiles, which reads the SQL `file_entries` mirror, and that mirror
 * is written only by database/file-repository.ts on a web upload. Nothing
 * imports the DIR files, so conferences whose DIR files are full of records
 * hold zero rows, and an internal NSU would answer "No new files found" for
 * them. A listing that omits the files is the same lie as a listing that
 * truncates their names.
 *
 * So the refusal stands and says so, in express.e's own words for a name the
 * board cannot answer ("Use '?' for command list.", express.e:28397).
 */
export type WidthGateFallThrough = 'ARMED' | 'REFUSED' | 'NO_EQUIVALENT';

export interface MinColumnsDoorShape {
  command?: string;
  id?: string;
  /** TYPE= as registered ('XIM', 'TS', ...). formatDoorLine's entries carry doorType too. */
  type?: string;
  doorType?: string;
  minColumns?: number;
  /** C64_ADAPT resolved once at registration, the way minColumns is. */
  c64Adapt?: number;
  /** CLIENT_ONLY resolved once at registration, the way minColumns is; and, for
   *  a DOORS-menu entry, folded together with the manifest's `runtime` so the
   *  [WEB] marker and the launch gate read ONE value on ONE object. */
  needsBrowser?: boolean;
  toolTypes?: Record<string, string>;
  doorInfo?: {
    minColumns?: number;
    c64Adapt?: number;
    needsBrowser?: boolean;
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
 *
 * AREXX IS NOT ON THIS LIST, AND MUST NOT BE ADDED. An AREXX door never
 * constructs an AmigaDoorSession, so its output never crosses the adapter's
 * seam and no amount of C64_ADAPT would reduce a single row of it; the caller
 * would be let in and then served 80-column bytes. (Its 40-column story is
 * BB_SCRWIDTH, fixed separately at 823825f39.) The list carried the string
 * 'AMI' until 2026-09-03, which looked like AREXX was covered and was in fact
 * dead - the enum spells that type 'AIM' (utils/amiga-command-parser.util.ts),
 * so 'AMI' matched no door at all. The dead string is gone rather than
 * corrected, and `adapted-door-types.test.ts` pins the membership so neither
 * the typo nor a well-meaning "fix" can come back.
 */
export const ADAPTED_DOOR_TYPES: ReadonlySet<string> = new Set(['XIM', 'DD', 'SIM', 'FIM']);

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
  if (session?.petsciiMode !== true) return false;
  const claim = adaptClaimFor(door);
  return claim !== null && sessionColumns(session) >= claim;
}

/**
 * The door half of doorOpensForC64(), on its own: the type is one the adapter
 * seam actually sees AND the claim parses. Null when either fails, so the two
 * readers below share these clauses instead of restating them - a copy is
 * precisely how the marker and the gate came to disagree.
 */
function adaptClaimFor(door: MinColumnsDoorShape | null | undefined): number | null {
  if (!door) return null;
  const type = String(door.type ?? door.doorType ?? '').toUpperCase();
  if (!ADAPTED_DOOR_TYPES.has(type)) return null;
  return resolveDoorAdaptColumns(door);
}

/**
 * Does this door earn the [C64] marker in the DOORS list?
 *
 * The marker is drawn per DOOR, from a row that is only ever built for a
 * caller the gate will judge at 40 columns, so it asks the same two door-side
 * questions doorOpensForC64() asks - the type is adaptable and the claim
 * parses - plus the caller-side one in its only meaningful form: the claim
 * must reach a C64's forty columns.
 *
 * It exists because `resolveDoorAdaptColumns(door) !== null` alone promised
 * what the gate then refused: a TS door tagged C64_ADAPT=40 (wrong type - the
 * adapter never sees a blessed screen) and any door tagged C64_ADAPT=64 (a
 * claim a 40-column caller cannot meet) were both marked and both bounced.
 */
export function doorShowsC64Mark(door: MinColumnsDoorShape | null | undefined): boolean {
  const claim = adaptClaimFor(door);
  return claim !== null && claim <= C64_COLUMNS;
}

/**
 * A CLIENT_ONLY tooltype, read the way every other boolean tooltype on this
 * board is read (`utils/amiga-command-parser.util.ts:747-755`,
 * `doors/amigaDoorManager.ts:301-307`): the literal string YES, and nothing
 * else.
 *
 * Default-CLOSED in the only direction that is safe here, which is the
 * OPPOSITE direction from MIN_COLUMNS: absent means "not browser-only", so an
 * unmarked door keeps the access it has today. A tooltype boolean cannot
 * default to true - every existing .info on every existing board would read it
 * as off - so the flag states the restriction, never the permission.
 */
function clientOnlyTooltype(value: string | undefined): boolean {
  return String(value ?? '').trim().toUpperCase() === 'YES';
}

/**
 * THE predicate: does this door require a browser the caller may not have?
 *
 * Two sources, in the order declaredMinColumns() uses so the two families can
 * never disagree about which registration object carries the truth:
 *  - manifest `runtime: 'client'` - the whole door IS a browser bundle. This is
 *    the primary source and is derived, never copied: the manifest on disk is
 *    the truth and nothing mirrors it into a second place.
 *  - `CLIENT_ONLY=YES` - a hybrid whose server half is RPC-only and cannot
 *    stand alone. `Doors/arkanoid` is the one such door today: its server half
 *    is RPC handlers (`Doors/arkanoid/server.ts`) and `executeDoor` then awaits
 *    `bridge.waitForSessionEnd` (`handlers/door.handler.ts`), a promise that on
 *    a byte transport can never resolve because `endSession`
 *    (`doors/client-door-bridge.ts:455`) is reachable only from
 *    `socket.once('disconnect')` (`:319`), and 'disconnect' is on the emitter's
 *    synthetic bus where nothing fires it.
 *
 * A hybrid WITHOUT the tooltype is NOT refused: fourteen of the fifteen export
 * a real SDK door and paint a usable blessed UI with no browser half at all.
 * They skip executeClientDoor and run their server half.
 *
 * `manifest` is the shape loadDoorManifestForExecution returns; only `runtime`
 * is read, so it is narrowed rather than typed `any`. Pass null where no
 * manifest has been loaded - the DOORS-menu marker does exactly that once the
 * runtime has already been folded onto the entry's `needsBrowser`.
 */
export function doorNeedsBrowser(
  door: MinColumnsDoorShape | null | undefined,
  manifest: { runtime?: string } | null | undefined,
): boolean {
  if (String(manifest?.runtime ?? '').trim().toLowerCase() === 'client') return true;
  if (!door) return false;
  return (
    door.needsBrowser === true ||
    clientOnlyTooltype(door.toolTypes?.['CLIENT_ONLY']) ||
    door.doorInfo?.needsBrowser === true ||
    clientOnlyTooltype(door.doorInfo?.toolTypes?.['CLIENT_ONLY'])
  );
}

/**
 * Does this door earn the [WEB] marker in the DOORS list?
 *
 * Deliberately the SAME function as the gate rather than a sibling of
 * doorShowsC64Mark(): the caller-side question here is identical on both sides
 * (does this transport carry a browser), so a second predicate would only be a
 * chance for marker and gate to disagree - which is precisely how a TS door
 * tagged C64_ADAPT=40 came to be marked [C64] and then refused.
 *
 * The row is MARKED, never hidden. Hiding would make a sysop's door invisible
 * with no explanation; the marker says why up front and the notice says it
 * again if the caller tries anyway.
 */
export const DOOR_NEEDS_BROWSER_MARK = ' [WEB]';
