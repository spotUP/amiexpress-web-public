/**
 * Where a conference's file areas default to, and whether a stored path still
 * matches that default.
 *
 * conference-setup.service.ts has always written `<LOCATION>/Files` and
 * `<LOCATION>/Upload` when it creates a conference. Nothing else knew that
 * rule, so the admin form left the inputs blank and a sysop typed sixteen
 * paths by hand - or, more often, left fifteen of them empty.
 *
 * "Follows" is derived, never stored: a path follows when it equals the
 * default for that conference, and is custom when it does not. No flag to
 * drift, and fixing a path by hand makes it follow again.
 */
process.env.SKIP_DB_INIT = '1';

import {
  deriveConferencePaths, isFollowingDerived,
} from '../../src/conferences/derive-conference-paths';

describe('the default paths for a conference', () => {
  test('download is Files and upload is Upload, under the conference location', () => {
    const derived = deriveConferencePaths('BBS:Conf2/', 2);

    expect(derived.dlpaths).toEqual({ 1: 'BBS:Conf2/Files', 2: 'BBS:Conf2/Files' });
    expect(derived.ulpaths).toEqual({ 1: 'BBS:Conf2/Upload', 2: 'BBS:Conf2/Upload' });
  });

  test('a location without its trailing slash gives the same answer', () => {
    expect(deriveConferencePaths('BBS:Conf2', 1).dlpaths[1]).toBe('BBS:Conf2/Files');
  });

  test('it matches what conference creation has always written', () => {
    // conference-setup.service.ts:287 - `DLPATH.${i}=${location}/Files`
    const location = 'BBS:Conf7/';
    const derived = deriveConferencePaths(location, 1);

    expect(derived.dlpaths[1]).toBe(`${location.replace(/\/$/, '')}/Files`);
    expect(derived.ulpaths[1]).toBe(`${location.replace(/\/$/, '')}/Upload`);
  });

  test('no directories means no paths, not an empty string at index 1', () => {
    expect(deriveConferencePaths('BBS:Conf2/', 0).dlpaths).toEqual({});
  });
});

describe('whether a stored path is still following', () => {
  test('a path equal to the derived one follows', () => {
    expect(isFollowingDerived('BBS:Conf2/Files', 'BBS:Conf2/Files')).toBe(true);
  });

  test('a trailing slash is not a difference - the Amiga writes both', () => {
    expect(isFollowingDerived('BBS:Conf2/Files/', 'BBS:Conf2/Files')).toBe(true);
  });

  test('case is not a difference either, on an Amiga volume', () => {
    expect(isFollowingDerived('bbs:conf2/files', 'BBS:Conf2/Files')).toBe(true);
  });

  test('a genuinely different path is custom, and stays custom', () => {
    expect(isFollowingDerived('BBS:Archive/Best/', 'BBS:Conf2/Files')).toBe(false);
  });

  test('an empty path follows - it has never been set, so the default applies', () => {
    expect(isFollowingDerived('', 'BBS:Conf2/Files')).toBe(true);
  });
});
