/**
 * Security levels come from the files the BBS reads.
 *
 * The admin Security page wrote a `security_level_access` DATABASE table,
 * while the BBS reads Access/ACS.<level>.info from disk through
 * utils/acs-access-loader. Nothing bridged them, so nothing configured on that
 * page had any effect - "i tried to add one for users at 30, it didnt let me
 * pick a number it just added users at 100 and now i can't remove it".
 *
 * It also offered a hardcoded list of levels, [10, 20, 50, 100, 200, 255],
 * which matches neither the files on disk (10, 20, 50, 255) nor the users
 * (30 accounts sit at level 30).
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  listAcsLevels,
  acsLevelFilePath,
  flagsToTooltypes,
  tooltypesToFlags,
} from '../../src/services/config-services/acs-level-file.service';

function makeAccessDir(levels: number[]): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-'));
  const dir = path.join(root, 'Access');
  fs.mkdirSync(dir, { recursive: true });
  for (const l of levels) fs.writeFileSync(path.join(dir, `ACS.${l}.info`), 'x');
  // Files that are not ACS levels must be ignored.
  fs.writeFileSync(path.join(dir, 'AREA.Elite.info'), 'x');
  fs.writeFileSync(path.join(dir, 'Default.info'), 'x');
  return root;
}

describe('listAcsLevels', () => {
  it('reports the levels that exist on disk, in order', () => {
    expect(listAcsLevels(makeAccessDir([50, 10, 255, 20]))).toEqual([10, 20, 50, 255]);
  });

  it('ignores AREA and Default files', () => {
    const levels = listAcsLevels(makeAccessDir([10]));
    expect(levels).toEqual([10]);
  });

  it('returns nothing when there is no Access directory', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-'));
    expect(listAcsLevels(empty)).toEqual([]);
  });
});

describe('acsLevelFilePath', () => {
  it('names the file the loader looks for', () => {
    const root = makeAccessDir([20]);
    expect(acsLevelFilePath(root, 30)).toBe(path.join(root, 'Access', 'ACS.30.info'));
  });
});

describe('flags <-> tooltypes', () => {
  const tooltypes = [
    { key: 'ACS.DOWNLOAD', value: '', commented: false, prefix: '', originalLine: 'ACS.DOWNLOAD' },
    { key: 'ACS.LIST_NODES', value: '', commented: true, commentStyle: '()' as const, prefix: '', originalLine: '(ACS.LIST_NODES)' },
  ];

  it('reads an enabled flag as granted and a parenthesised one as denied', () => {
    expect(tooltypesToFlags(tooltypes)).toEqual({
      'ACS.DOWNLOAD': true,
      'ACS.LIST_NODES': false,
    });
  });

  it('treats value NO as denied, as the loader does', () => {
    const withNo = [{ key: 'ACS.UPLOAD', value: 'NO', commented: false, prefix: '', originalLine: '' }];
    expect(tooltypesToFlags(withNo)['ACS.UPLOAD']).toBe(false);
  });

  it('writes a denied flag in the Amiga parenthesised form', () => {
    const out = flagsToTooltypes(tooltypes, { 'ACS.DOWNLOAD': false });

    const download = out.find(t => t.key === 'ACS.DOWNLOAD')!;
    expect(download.commented).toBe(true);
    expect(download.commentStyle).toBe('()');
  });

  it('enables a flag that was denied', () => {
    const out = flagsToTooltypes(tooltypes, { 'ACS.LIST_NODES': true });

    expect(out.find(t => t.key === 'ACS.LIST_NODES')!.commented).toBe(false);
  });

  it('adds a flag the file did not carry', () => {
    const out = flagsToTooltypes(tooltypes, { 'ACS.PAGE_SYSOP': true });

    const added = out.find(t => t.key === 'ACS.PAGE_SYSOP');
    expect(added).toBeDefined();
    expect(added!.commented).toBe(false);
  });

  it('leaves flags it was not asked about alone', () => {
    const out = flagsToTooltypes(tooltypes, { 'ACS.DOWNLOAD': false });

    expect(out.find(t => t.key === 'ACS.LIST_NODES')!.commented).toBe(true);
    expect(out).toHaveLength(tooltypes.length);
  });
});
