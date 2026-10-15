/**
 * Regression: FAME doors call GetDiskObject("<COMMAND>") to read their BBS
 * command icon's tooltypes. IconLibrary only searched bbsRoot and the door
 * directory — never Commands/BBSCmd/ where command .info files live — so
 * 5D_Page (installed as 5DPAGER) printed "cAN'T oPEN iCON" and exited.
 */
import * as path from 'path';
import { buildIconCandidates } from '../src/amiga-emulation/api/IconLibrary';

describe('IconLibrary.buildIconCandidates', () => {
  const root = '/bbs';
  const doorDir = '/bbs/Doors/5DPAGER/Doors/5D/5D_Page';

  it('bare command name searches Commands/BBSCmd after root and door dir', () => {
    expect(buildIconCandidates('5DPAGER', false, root, doorDir)).toEqual([
      path.join(root, '5DPAGER'),
      path.join(doorDir, '5DPAGER'),
      path.join(root, 'Commands', 'BBSCmd', '5DPAGER'),
    ]);
  });

  it('includes BBSCmd even without a door directory', () => {
    expect(buildIconCandidates('WHO', false, root, null)).toContain(
      path.join(root, 'Commands', 'BBSCmd', 'WHO'),
    );
  });

  it('device-prefixed names do not get the BBSCmd fallback', () => {
    expect(buildIconCandidates('Doors/X/cfg', true, root, doorDir)).toEqual([
      path.join(root, 'Doors/X/cfg'),
    ]);
  });

  it('absolute paths pass through untouched', () => {
    expect(buildIconCandidates('/abs/icon', false, root, doorDir)).toEqual(['/abs/icon']);
  });
});
