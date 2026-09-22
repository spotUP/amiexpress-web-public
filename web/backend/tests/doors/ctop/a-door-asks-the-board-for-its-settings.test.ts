/**
 * WHAT A DOOR MAY ASK THE BOARD, and the two ways the asking goes wrong.
 *
 * `getConferencePath()` and `readTooltypes()` are what a TypeScript door has
 * instead of AEDoor's `BB_CONFLOCAL` and its own `GetDiskObject`. Both were
 * added for the CTOP port on 2026-09-22 and both have a failure mode that a
 * Mac hides:
 *
 *   The SPELLING. The live volume carries `Doors/Conftop.info` where the
 *   door asks for `Doors/conftop.info`. `fs.existsSync` answers yes on this
 *   machine and no on the Linux host, so the setting reads as absent in
 *   production and present in every test.
 *
 *   The DISABLED entry. `(ROWS=12)` and `!ROWS=12` are how an Amiga sysop
 *   switches a setting off. A scan for `ROWS=` reads them as on, which is
 *   why this goes through the board's parser rather than a regex in the door.
 */
/*
 * A CASE-SENSITIVE FILESYSTEM, WHICH THIS MACHINE IS NOT.
 *
 * macOS answers `existsSync('Doors/conftop.info')` with yes for a file
 * called `Conftop.info`, so the case rule below is invisible here and red
 * only on the Linux host - the shape that has shipped this class of bug
 * before. `existsSync` is replaced with one that compares the SPELLING
 * against the directory's real entries; everything else in `fs` is real, so
 * the fallback that finds the file is the board's own resolver doing the
 * work it does on the host.
 */
jest.mock('fs', () => {
  const real = jest.requireActual('fs');
  return {
    ...real,
    existsSync: (target: any) => {
      const asked = String(target);
      try {
        return real.readdirSync(require('path').dirname(asked)).includes(require('path').basename(asked));
      } catch {
        return false;
      }
    },
  };
});

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { doorConferencePath, doorTooltypes } from '../../../src/doors/conference-access';
import { applyTooltypes, parseInfoFile, writeInfoFile } from '../../../src/utils/info-file.util';

let root = '';

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'door-settings-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('an icon the sysop spelled his own way', () => {
  it('is found though the door asked for another case', () => {
    fs.mkdirSync(path.join(root, 'Doors'), { recursive: true });
    applyTooltypes(path.join(root, 'Doors', 'Conftop.info'), [['SHARE_DATA', 'BBS2:']]);

    expect(doorTooltypes(root, 'Doors/conftop.info')).toEqual({ SHARE_DATA: 'BBS2:' });
  });
});

describe('a setting the sysop switched off', () => {
  it('is not handed to the door', () => {
    const file = path.join(root, 'Conftop.info');
    applyTooltypes(file, [['ROWS', '12'], ['MAILUSER', 'eall']]);
    const info = parseInfoFile(file);
    const rows = info.tooltypes.find(tt => tt.key === 'ROWS')!;
    rows.commented = true;
    rows.commentStyle = '()';
    rows.originalLine = '(ROWS=12)';
    writeInfoFile(info);

    const tooltypes = doorTooltypes(root, 'Conftop.info');
    expect('ROWS' in tooltypes).toBe(false);
    expect(tooltypes.MAILUSER).toBe('eall');
  });

  it('keeps a flag with no value at all, which is how a flag is written', () => {
    applyTooltypes(path.join(root, 'Conftop.info'), [['SKIP_EMPTY_LINES', '']]);

    expect('SKIP_EMPTY_LINES' in doorTooltypes(root, 'Conftop.info')).toBe(true);
  });
});

describe('a path that tries to leave the board', () => {
  it('is refused rather than read', () => {
    expect(doorTooltypes(root, '../../etc/passwd')).toEqual({});
  });
});

describe('the conference directory', () => {
  it('comes from LOCATION.n, not from the number', () => {
    fs.writeFileSync(
      path.join(root, 'ConfConfig.info'),
      'NCONFS=1\nNAME.1=Amiga Warez!\nLOCATION.1=BBS:Conf2/\n',
    );
    fs.mkdirSync(path.join(root, 'Conf2'), { recursive: true });

    expect(doorConferencePath(root, 1)).toBe(path.join(root, 'Conf2'));
  });
});
