import * as os from 'os';
import * as path from 'path';
import { getConfigTooltypeKeys, loadBBSConfig } from '../../src/services/bbs-config-file.service';

/**
 * The admin form shows the tooltype each field writes to, so a sysop can
 * cross-check a value against bbsConfig.info. That is only worth anything if
 * the map comes from the writer: a copy of it in the frontend would drift the
 * first time a tooltype was renamed, and the form would then be pointing at a
 * key that no longer exists.
 */
describe('config tooltype keys', () => {
  const keys = getConfigTooltypeKeys();

  it('names the tooltype behind a field', () => {
    expect(keys.sysop_name).toBe('SYSOP_NAME');
    expect(keys.bbs_name).toBe('BBS_NAME');
  });

  it('covers the whole map, not a hand-picked subset', () => {
    // Roughly one entry per configuration field; a map that has collapsed to
    // a handful means the export stopped following the writer.
    expect(Object.keys(keys).length).toBeGreaterThan(40);
  });

  it('gives each field exactly one tooltype', () => {
    const fields = Object.keys(keys);
    expect(new Set(fields).size).toBe(fields.length);
  });

  it('returns a copy, so a caller cannot edit the writer\'s map', () => {
    const first = getConfigTooltypeKeys();
    first.sysop_name = 'CHANGED';

    expect(getConfigTooltypeKeys().sysop_name).toBe('SYSOP_NAME');
  });

  it('spells each tooltype the way AmiExpress spells it', () => {
    for (const tooltype of Object.values(keys)) {
      expect(tooltype).toMatch(/^[A-Za-z0-9_]+$/);
    }
  });

  it('maps nothing to LVL_CAPITOLS_in_FILE, which is not a tooltype', () => {
    // This was mapped, and asserted here as correct, on the strength of its
    // odd spelling looking deliberate. axcommon.e:53 declares it as an ARRAY
    // INDEX - `EXPORT CONST LVL_CAPITOLS_in_FILE=23` - and the tooltype it
    // indexes is CAPITOL_FILES, read from the NODE icon (ACP.e:2651), which
    // the Nodes page already edits. So the setting has no place in
    // bbsConfig.info at all, and the key was never one AmiExpress read.
    expect(keys.capitalize_filenames).toBeUndefined();

    // Every tooltype AmiExpress reads is spelled in capitals.
    const oddballs = Object.values(keys).filter((tooltype) => tooltype !== tooltype.toUpperCase());
    expect(oddballs).toEqual([]);
  });

  it('names the keys express.e actually reads, not ones that look plausible', () => {
    // Each of these was wrong, and each is settled by a line in the sources.
    expect(keys.http_port).toBe('HTTPPORT');            // express.e:15707
    expect(keys.credit_by_kb).toBe('CREDIT_BY_KBYTES'); // ACP.e:3030
    // HTTPHOST is read from the PROTOCOL icon, per protocol (express.e:15002),
    // so there is no board-wide field for it.
    expect(keys.http_host).toBeUndefined();
  });
});

describe('every mapped field has a default', () => {
  it('so loadBBSConfig can tell a number from a boolean from a string', () => {
    // loadBBSConfig infers a field's TYPE from `typeof` its default. Without
    // one, a number comes back as a string (login-post.service.ts:351 tests
    // for a number and never matched) and a boolean comes back as '' or '1'.
    const defaults = loadBBSConfig(path.join(os.tmpdir(), 'no-such-bbs-root-for-defaults'));
    const missing = Object.keys(getConfigTooltypeKeys()).filter(
      (field) => (defaults as Record<string, unknown>)[field] === undefined
    );

    // Jest's expect takes no message, so the report goes in the value.
    expect(missing.join(', ')).toBe('');
  });
});
