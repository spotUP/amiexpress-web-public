/**
 * The C64 switches a sysop can set without knowing a tooltype's name.
 *
 * The generic .info table has always been able to set these - the problem was
 * that you had to know they existed and spell them exactly.
 * `door-edit-offers-tooltypes.test.tsx` records the cost: "Twice this year a
 * door flag has been hand-edited on the live volume for want of that route:
 * C64_ADAPT, and then C64_DROP_OLDEST."
 *
 * THE ONE THAT MATTERS: these flags are NOT the command flags above them.
 * `runCommand()` reads its flags as "the key is on the icon", whatever the
 * value; the C64 flags are read with `/^(1|yes|true)$/i`
 * (`utils/door-min-columns.util.ts`), so a bare key with no value is OFF. A
 * checkbox that wrote only the key would tick, save, and do nothing.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = readFileSync(join(__dirname, '..', 'src', 'pages', 'DoorsPage.tsx'), 'utf8');
const BACKEND = join(__dirname, '..', '..', 'backend', 'src', 'utils', 'door-min-columns.util.ts');
const UTIL = readFileSync(BACKEND, 'utf8');

describe('the C64 section offers what the backend actually reads', () => {
  it('offers every boolean flag the adapter honours', () => {
    for (const key of ['C64_VIEWPORT', 'C64_DROP_OLDEST', 'C64_DROP_LAST']) {
      expect(SRC).toContain(`key: '${key}'`);
      // and the backend really reads it, so the form is not offering fiction
      expect(UTIL).toContain(`'${key}'`);
    }
  });

  it('offers every numeric setting the adapter honours', () => {
    for (const key of ['C64_ADAPT', 'MIN_COLUMNS', 'REDACTED']) {
      expect(SRC).toContain(`key: '${key}'`);
      expect(UTIL).toContain(`'${key}'`);
    }
    // OVERCLOCK is read elsewhere (the emulator), not by the columns util
    expect(SRC).toContain(`key: 'OVERCLOCK'`);
  });

  it('writes a TRUTHY value for the flags, never a bare key', () => {
    // The whole defect this guards. `setTruthyFlag` must write '1'.
    expect(SRC).toMatch(/setTruthyFlag\s*=\s*\(key: string, on: boolean\)\s*=>\s*setCommandFlagValue\(key, on \? '1' : ''\)/);
  });

  it('reads them back with the same rule the backend applies', () => {
    // If the form tested presence while the backend tests truthiness, a
    // hand-written `C64_VIEWPORT=0` would show as ticked.
    expect(SRC).toMatch(/isTruthyFlagSet[\s\S]{0,200}\/\^\(1\|yes\|true\)\$\/i/);
    expect(UTIL).toContain('/^(1|yes|true)$/i');
  });

  it('uses the checkbox handler that writes values, not the presence one', () => {
    const section = SRC.slice(SRC.indexOf('C64_FLAG_TOOLTYPES.map'));
    const box = section.slice(0, section.indexOf('</label>'));
    expect(box).toContain('setTruthyFlag(');
    expect(box).not.toContain('setCommandFlag(');
  });

  it('keeps the command flags on their own, presence-based handler', () => {
    // The round trip: the two groups must not converge on one rule.
    const section = SRC.slice(SRC.indexOf('COMMAND_FLAG_TOOLTYPES.map'));
    const box = section.slice(0, section.indexOf('</label>'));
    expect(box).toContain('setCommandFlag(');
    expect(box).not.toContain('setTruthyFlag(');
  });
});
