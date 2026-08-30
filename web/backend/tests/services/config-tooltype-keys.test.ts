import { getConfigTooltypeKeys } from '../../src/services/bbs-config-file.service';

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

  it('keeps the one tooltype AmiExpress does not spell in upper case', () => {
    // LVL_CAPITOLS_in_FILE, exactly as declared in axcommon.e:53. It looks
    // like a typo and is not: "correcting" it here would stop the tooltype
    // matching the key in bbsConfig.info.
    expect(keys.capitalize_filenames).toBe('LVL_CAPITOLS_in_FILE');

    const oddballs = Object.values(keys).filter((tooltype) => tooltype !== tooltype.toUpperCase());
    expect(oddballs).toEqual(['LVL_CAPITOLS_in_FILE']);
  });
});
