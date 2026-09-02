/**
 * Final review wave, Finding 5 (with-merge): silent env parse.
 *
 * index.ts's dedicated-PETSCII-port startup used to silently skip whenever
 * `parseInt(process.env.TELNET_PETSCII_PORT, 10)` produced a falsy value
 * (0 or NaN) - indistinguishable from the env var simply being unset (the
 * normal, opt-in-off case). A sysop who typo'd the port number got no
 * signal at all that their config was ignored.
 *
 * `resolveTelnetPetsciiPort` (web/backend/src/utils/
 * telnet-petscii-port.util.ts) is the extracted pure decision: "unset" vs
 * "set but invalid" vs "set and valid". index.ts itself can't safely be
 * `require()`d from a test process (its top-level IIFE starts real
 * HTTP/telnet/SSH servers as a side effect of module load - see
 * connection-emitter.ts's doc comment for the established reason this
 * class of logic gets extracted instead).
 */
import { resolveTelnetPetsciiPort } from '../../src/utils/telnet-petscii-port.util';

describe('resolveTelnetPetsciiPort', () => {
  it('unset env var: no port, no warning (opt-in feature, silently off)', () => {
    expect(resolveTelnetPetsciiPort(undefined)).toEqual({ port: undefined, warning: null });
    expect(resolveTelnetPetsciiPort('')).toEqual({ port: undefined, warning: null });
  });

  it('a valid port parses cleanly with no warning', () => {
    expect(resolveTelnetPetsciiPort('6400')).toEqual({ port: 6400, warning: null });
  });

  it('set but parses to 0 - warns instead of silently skipping (Finding 5)', () => {
    const result = resolveTelnetPetsciiPort('0');
    expect(result.port).toBeUndefined();
    expect(result.warning).toBe('TELNET_PETSCII_PORT set but not a valid port - PETSCII port disabled');
  });

  it('set but parses to NaN (garbage input) - warns instead of silently skipping (Finding 5)', () => {
    const result = resolveTelnetPetsciiPort('not-a-port');
    expect(result.port).toBeUndefined();
    expect(result.warning).toBe('TELNET_PETSCII_PORT set but not a valid port - PETSCII port disabled');
  });

  it('leading-numeric garbage still parses via parseInt semantics (documented parseInt behavior, not a regression)', () => {
    // parseInt('6400abc', 10) === 6400 - matches the pre-existing
    // parseInt(..., 10) call's semantics exactly; this fix only changes
    // what happens when that call yields a falsy/NaN result, not how it
    // parses otherwise-valid-looking input.
    expect(resolveTelnetPetsciiPort('6400abc')).toEqual({ port: 6400, warning: null });
  });
});
