/**
 * Parses `TELNET_PETSCII_PORT` (task 10's dedicated PETSCII telnet port,
 * opt-in via env var).
 *
 * Extracted from index.ts's startup IIFE (final review wave, Finding 5) so
 * the parse-vs-warn decision is unit-testable — index.ts itself starts real
 * HTTP/telnet/SSH servers as a side effect of module load and can't safely
 * be `require()`d from a test process (see connection-emitter.ts's doc
 * comment for the same reason `buildConnectionEmitter` was extracted).
 *
 * Distinguishes "not configured" (env var unset — the dedicated port is
 * opt-in, silently skip) from "configured wrong" (env var SET but
 * `parseInt` gives 0 or NaN) — the latter is almost certainly a typo the
 * sysop needs to know about, not a deliberate disable.
 */
export interface TelnetPetsciiPortResolution {
  /** The parsed port, or `undefined` if the dedicated port should stay off. */
  port: number | undefined;
  /**
   * Set only when the env var was present but did not parse to a usable
   * port — the caller should log this (index.ts uses `[WARNING] ...`, the
   * file's existing log style for a startup misconfiguration).
   */
  warning: string | null;
}

export function resolveTelnetPetsciiPort(envValue: string | undefined): TelnetPetsciiPortResolution {
  if (!envValue) {
    return { port: undefined, warning: null };
  }
  const parsed = parseInt(envValue, 10);
  if (!parsed || Number.isNaN(parsed)) {
    return {
      port: undefined,
      warning: 'TELNET_PETSCII_PORT set but not a valid port - PETSCII port disabled',
    };
  }
  return { port: parsed, warning: null };
}
