/**
 * A Rexx door's file names resolve through the board's one assign table
 * (standard-assigns.ts, via PathManager) - the table a 68K door's
 * dos.library uses. arexx-file-io kept its own small map: T: and RAM: went
 * to <tmpdir>/aex-rexx, so a file a Rexx door wrote to T: was not the file a
 * 68K door (or the board) opened as T: (RAM:T, shared as on AmigaOS).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AREXXFileIO } from '../../src/services/arexx-file-io';
import { PathManager } from '../../src/amiga-emulation/api/PathManager';

describe('Rexx door file names use the board assign table', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'arexx-assigns-'));
    fs.mkdirSync(path.join(root, 'System'), { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it("a Rexx door's T: file is the file a 68K door opens as T:", () => {
    const rexx = new AREXXFileIO(root);
    const dos = new PathManager(root);
    expect(rexx.resolveAmigaPath('T:scores.tmp')).toBe(dos.amiToSysPath('T:scores.tmp'));
    expect(rexx.resolveAmigaPath('RAM:T/scores.tmp')).toBe(dos.amiToSysPath('RAM:T/scores.tmp'));
  });

  it('every assign resolves where dos.library resolves it', () => {
    const rexx = new AREXXFileIO(root);
    const dos = new PathManager(root);
    for (const name of ['BBS:Node1/x', 'DOORS:STNG/hiscores', 'SYS:Libs/a.library', 'S:startup', 'ENV:AE_HOST']) {
      expect(rexx.resolveAmigaPath(name)).toBe(dos.amiToSysPath(name));
    }
  });

  it('a bare name still follows pragma(directory), from the BBS root', () => {
    fs.mkdirSync(path.join(root, 'Doors', 'STNG'), { recursive: true });
    const rexx = new AREXXFileIO(root);
    expect(rexx.resolveAmigaPath('hiscores')).toBe(path.join(root, 'hiscores'));
    rexx.pragma('directory', 'DOORS:STNG/');
    expect(rexx.resolveAmigaPath('hiscores')).toBe(path.join(root, 'Doors', 'STNG', 'hiscores'));
  });
});
