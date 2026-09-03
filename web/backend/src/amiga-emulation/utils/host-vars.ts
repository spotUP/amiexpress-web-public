/**
 * Telling a 68K door where it is running.
 *
 * "the 68k door can't display petscii unless they run in amiexpress-web so
 * they need to detect where they are running" (sysop, 2026-09-02).
 *
 * PETSCII on this board is a TRANSDUCER in the backend: a door writes ANSI
 * and the board turns it into PETSCII for a C64 caller
 * (server/connection-emitter.ts, server/c64-door-adapter.ts). A door running
 * under real AmiExpress on real hardware has none of that behind it, so the
 * same binary has to behave differently depending on its host - and it
 * cannot find out by guessing.
 *
 * So the board says. These variables are published into the door's
 * environment, readable with GetVar() or by reading ENV: as a file, which is
 * the one door-facing interface that already works on both sides: real
 * AmigaDOS has GetVar, and a classic AmiExpress simply has no AE_HOST in it.
 *
 * THE CONTRACT, for a door author:
 *
 *   AE_HOST          'amiexpress-web'. ABSENT means classic AmiExpress, and
 *                    absent is the case a door must be safe in: 80x25 ANSI,
 *                    no PETSCII, no mouse, no wide terminal.
 *   AE_HOST_VERSION  the board's version, for a door that wants to require
 *                    a floor. Compare as a string; it is not a number.
 *   AE_CONNECTION    'web' | 'telnet' | 'ssh' - how the CALLER is attached.
 *   AE_CLIENT        'ansi' | 'petscii' - what the caller's terminal reads.
 *   AE_CAPS          comma-separated, no spaces. A door tests for membership
 *                    and must not assume order or count: new capabilities
 *                    will be appended.
 *
 * A door asks for a capability by name, never by inferring one from another:
 * a PETSCII caller on telnet says `petscii`, and that is the only thing that
 * makes PETSCII safe to emit.
 */

/** What this board answers to. A door tests `AE_HOST == AE_HOST_ID`. */
export const AE_HOST_ID = 'amiexpress-web';

/** The variable names, in one place, so the door docs and the code agree. */
export const AE_HOST_VAR = 'AE_HOST';
export const AE_HOST_VERSION_VAR = 'AE_HOST_VERSION';
export const AE_CONNECTION_VAR = 'AE_CONNECTION';
export const AE_CLIENT_VAR = 'AE_CLIENT';
export const AE_CAPS_VAR = 'AE_CAPS';

/**
 * What a door may ask for.
 *
 * Each is something the BOARD does for the door, which is why the list is
 * short: a capability nobody implements is a promise a door would believe.
 */
export const AE_CAPABILITIES = {
  /** ANSI colour and cursor control reach the caller. True everywhere. */
  ansi: 'ansi',
  /** The caller's terminal is a C64: the board transduces ANSI to PETSCII. */
  petscii: 'petscii',
  /** The board reduces the door's 80x25 frames to the C64's 40 columns. */
  c64adapt: 'c64adapt',
  /** The caller can be sent more than 80 columns. */
  wide: 'wide',
  /** Mouse reports reach the door. */
  mouse: 'mouse',
} as const;

/** How the caller is attached to the board. */
export type AeConnection = 'web' | 'telnet' | 'ssh';

/** What the caller's terminal reads. */
export type AeClient = 'ansi' | 'petscii';

/**
 * The board's version, as a door sees it.
 *
 * Read from the backend's package.json rather than written down twice; a
 * door comparing against a floor should not be told a number nobody bumps.
 * Falls back to '0' rather than throwing: a door start must not depend on
 * this file being readable.
 */
export const BOARD_VERSION: string = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require('../../../package.json');
    return String(pkg.version ?? '0');
  } catch {
    return '0';
  }
})();

/** The facts about one caller that decide what a door may do. */
export interface HostFacts {
  connection: AeConnection;
  client: AeClient;
  /** The board's own version string. */
  version: string;
}

/**
 * Read the facts off a live session.
 *
 * Deliberately tolerant: a session shape that has drifted, or a test double,
 * still yields a usable answer rather than throwing inside door startup. The
 * PETSCII test is the same one the emitter uses (connection-emitter.ts) -
 * `terminalType === 'c64'` or an explicit `petsciiMode` - because a door and
 * the byte stream behind it must not disagree about what the caller reads.
 */
export function factsFromSession(session: unknown, version: string): HostFacts {
  const s = (session ?? {}) as {
    connectionType?: string;
    terminalType?: string;
    petsciiMode?: boolean;
  };

  const connection: AeConnection =
    s.connectionType === 'telnet' || s.connectionType === 'ssh' ? s.connectionType : 'web';
  const client: AeClient =
    s.terminalType === 'c64' || s.petsciiMode === true ? 'petscii' : 'ansi';

  return { connection, client, version };
}

/**
 * What this host can carry for this caller.
 *
 * A PETSCII caller gets `petscii` and `c64adapt` because both are real for
 * them: the transducer converts what the door writes, and the C64 door
 * adapter reduces its frames to 40 columns. A web caller gets `wide` and
 * `mouse`, which telnet and SSH callers do not - the browser terminal is the
 * only one this board can resize or take mouse reports from.
 */
export function capabilitiesFor(facts: HostFacts): string[] {
  const caps: string[] = [AE_CAPABILITIES.ansi];
  if (facts.client === 'petscii') {
    caps.push(AE_CAPABILITIES.petscii, AE_CAPABILITIES.c64adapt);
  }
  if (facts.connection === 'web') {
    caps.push(AE_CAPABILITIES.wide, AE_CAPABILITIES.mouse);
  }
  return caps;
}

/** The variables to publish, ready to set one by one. */
export function hostVars(facts: HostFacts): Record<string, string> {
  return {
    [AE_HOST_VAR]: AE_HOST_ID,
    [AE_HOST_VERSION_VAR]: facts.version,
    [AE_CONNECTION_VAR]: facts.connection,
    [AE_CLIENT_VAR]: facts.client,
    [AE_CAPS_VAR]: capabilitiesFor(facts).join(','),
  };
}

/**
 * Whether a capability is in an AE_CAPS value.
 *
 * Here so the board's own tests read a value the way a door does, rather
 * than by looking at the array it came from - a door only ever sees the
 * string.
 */
export function capsInclude(caps: string | undefined | null, capability: string): boolean {
  if (!caps) return false;
  return caps.split(',').some((entry) => entry.trim() === capability);
}
