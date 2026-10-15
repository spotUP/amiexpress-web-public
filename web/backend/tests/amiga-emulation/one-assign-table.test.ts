/**
 * C:, L: and T: mean what an AmigaOS board means by them, and the BBS side
 * and the emulator mean the same directory by the same name.
 *
 * mULTI-cHECK, the board's LHA/LZX/ZIP checker, runs PACKER=C:LHA. The
 * emulator's C: was System/C (Avail, Date, Info) while the board's archivers
 * live in the board's C/; path-util's C: was Commands/. LZX needs
 * L:LZX.Keyfile, which is in the board's L/. And T: was /tmp on one table and
 * RAM:T on another.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PathManager } from '../../src/amiga-emulation/api/PathManager';
import { amigaTempDir } from '../../src/amiga-emulation/api/dos/standard-assigns';
import { findAssign, resolveAssignPath } from '../../src/utils/path-util';
import { setBoardRoot } from '../helpers/board-root';

describe('one assign table', () => {
  let root: string;
  let restoreBoard: () => void;
  const savedEnv = { ...process.env };

  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'assigns-')));
    for (const dir of ['C', 'L', 'System/C', 'System/L', 'Doors']) {
      fs.mkdirSync(path.join(root, dir), { recursive: true });
    }
    fs.writeFileSync(path.join(root, 'C', 'LhA'), 'lha');
    fs.writeFileSync(path.join(root, 'System', 'C', 'Avail'), 'avail');
    fs.writeFileSync(path.join(root, 'L', 'LZX.Keyfile'), 'key');
    process.env.BBS_DATA_DIR = root;
    restoreBoard = setBoardRoot(root);
    process.env.RAM_DIR = path.join(root, 'ram');
  });

  afterEach(() => {
    restoreBoard();
    process.env = { ...savedEnv };
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('C: finds the board archiver in C/ and the system command in System/C', () => {
    const pm = new PathManager(root);
    // Case-insensitive lookup (macOS answers in the caller's case).
    expect(pm.amiToSysPath('C:LHA')!.toLowerCase()).toBe(path.join(root, 'C', 'LhA').toLowerCase());
    expect(pm.amiToSysPath('C:Avail')).toBe(path.join(root, 'System', 'C', 'Avail'));
    // A name in neither is created in the first directory.
    expect(pm.amiToSysPath('C:NewTool')).toBe(path.join(root, 'C', 'NewTool'));
  });

  it('L: finds LZX.Keyfile in the board L/', () => {
    const pm = new PathManager(root);
    expect(pm.amiToSysPath('L:LZX.Keyfile')).toBe(path.join(root, 'L', 'LZX.Keyfile'));
  });

  it('T: is RAM:T and exists, so a program can write there', () => {
    const pm = new PathManager(root);
    const t = pm.amiToSysPath('T:adv.txt');
    expect(t).toBe(path.join(amigaTempDir(), 'adv.txt'));
    expect(amigaTempDir()).toBe(path.join(root, 'ram', 'T'));
    expect(fs.statSync(amigaTempDir()).isDirectory()).toBe(true);
  });

  it('the BBS side answers from the same table', () => {
    const pm = new PathManager(root);
    for (const name of ['BBS:', 'DOORS:', 'C:', 'L:', 'SYS:', 'LIBS:', 'T:', 'ENV:', 'ENVARC:']) {
      expect(findAssign(name)).toBe(pm.getAssigns().get(name.toLowerCase())!.replace(/\/$/, ''));
    }
    expect(resolveAssignPath('C:LhA')).toBe(path.join(root, 'C', 'LhA'));
    expect(resolveAssignPath('C:Avail')).toBe(path.join(root, 'System', 'C', 'Avail'));
  });
});
