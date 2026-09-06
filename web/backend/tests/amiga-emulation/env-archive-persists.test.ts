/**
 * A door's config lands beside the door - or, for a setting a door archives
 * the AmigaOS way, in the BBS env archive. Never loose in the BBS root.
 *
 * THE SYSOP'S REPORT (2026-09-06): "GLOBAL LAST CALLERS asks for the BBS
 * acronym on EVERY start." The prompt is GWall's, not GLC's (glcviewer has no
 * such string in it at all), and the cause is the missing half of the AmigaOS
 * environment:
 *
 *   ENV:    RAM:Env                volatile - /tmp/ram/ENV here, which on the
 *                                  live board is the container's writable
 *                                  layer and is gone after every deploy.
 *   ENVARC: SYS:Prefs/Env-Archive  on disk - and we had NO assign for it.
 *
 * GWall does the standard Amiga thing: saveSettings() writes both
 * (`Global Wall/gwall.e:1697`) and readSettings() reads ENV: back. With no
 * ENVARC: assign the archive write fell through PathManager's unknown-volume
 * fallback and became "<bbsRoot>/gwall.cfg" - lowercased, because the
 * fallback read the remainder off the LOWERCASED copy of the path - which
 * nothing ever reads. So the only surviving copy lived in /tmp, and the door
 * re-ran its "Enter the 3 digit code to use for your bbs" setup whenever that
 * went away.
 *
 * Captured before the fix:
 *   [PathManager] Volume fallback: "ENVARC:GWall.cfg"
 *       => "~/Code/amiexpress-web/gwall.cfg"
 *
 * The end-to-end proof, driving the real 68K binary, is in
 * `tests/doors/gwall-asks-for-the-acronym-once.test.ts`. This file pins the
 * two pieces it rests on.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PathManager } from '../../src/amiga-emulation/api/PathManager';
import { initializeENVFiles } from '../../src/amiga-emulation/utils/env-initializer';
import { amigaEnvArchiveDir } from '../../src/amiga-emulation/utils/env-paths';

describe("a door's archived config lands in the BBS env archive", () => {
  let root: string;

  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'envarc-')));
    fs.mkdirSync(path.join(root, 'Doors'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('ENVARC: resolves into <bbsRoot>/System/Prefs/Env-Archive, not the BBS root', () => {
    const pm = new PathManager(root);

    expect(pm.amiToSysPath('ENVARC:GWall.cfg')).toBe(
      path.join(root, 'System', 'Prefs', 'Env-Archive', 'GWall.cfg'),
    );
    // The defect, spelled out: the archive write must not become a loose
    // file at the top of the BBS.
    expect(pm.amiToSysPath('ENVARC:GWall.cfg')).not.toBe(path.join(root, 'gwall.cfg'));
    expect(pm.amiToSysPath('ENVARC:GWall.cfg')).not.toBe(path.join(root, 'GWall.cfg'));
  });

  it('ENV: stays volatile and separate from the archive', () => {
    const pm = new PathManager(root);
    const env = pm.amiToSysPath('ENV:GWall.cfg');
    const arc = pm.amiToSysPath('ENVARC:GWall.cfg');

    expect(env).not.toBe(arc);
    // ENV: must NOT start resolving into the archive: STATS@<n> and the other
    // per-node status files live there and must die with the machine.
    expect(env).not.toContain('Env-Archive');
  });

  it('an unknown volume keeps the case it was given', () => {
    const pm = new PathManager(root);

    // The fallback for volumes we do not model (DH0:, DayDream:, ...) used to
    // read its remainder off the lowercased path, silently renaming every
    // file written through it. On a case-sensitive filesystem that is a
    // different file.
    expect(pm.amiToSysPath('DayDream:Configs/PoolDir.Config')).toBe(
      path.join(root, 'Configs', 'PoolDir.Config'),
    );
    expect(pm.amiToSysPath('DH0:Some/MixedCase.CFG')).toBe(
      path.join(root, 'Some', 'MixedCase.CFG'),
    );
  });

  it('a new file keeps its case but lands inside the directory that already exists', () => {
    // AmigaDOS looks up case-insensitively and creates case-preservingly.
    // The board really does carry a lowercase "configs/" that the DayDream
    // doors reach as "DayDream:Configs/..." - a create must go INTO it, not
    // mint a "Configs/" twin beside it on a case-sensitive filesystem.
    fs.mkdirSync(path.join(root, 'configs'));
    const pm = new PathManager(root);

    const resolved = pm.amiToSysPath('DayDream:Configs/DreamScan.CFG') as string;

    // The leaf keeps the door's spelling on every platform...
    expect(path.basename(resolved)).toBe('DreamScan.CFG');
    // ...and the parent is the directory that exists. macOS answers
    // existsSync for any case, so only the case-insensitive identity of the
    // parent is assertable here; on Linux this is literally "configs".
    expect(path.dirname(resolved).toLowerCase()).toBe(path.join(root, 'configs').toLowerCase());
    expect(fs.existsSync(path.dirname(resolved))).toBe(true);
  });
});

describe('ENV: is seeded from ENVARC: at boot', () => {
  let root: string;
  let envDir: string;

  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'envseed-')));
    envDir = path.join(root, 'ram', 'ENV');
    fs.mkdirSync(envDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const seed = () =>
    initializeENVFiles(envDir, { nodeId: 1, envArcPath: amigaEnvArchiveDir(root) });

  it('an archived variable reappears in ENV: after the RAM disk is wiped', () => {
    const arc = amigaEnvArchiveDir(root);
    fs.mkdirSync(arc, { recursive: true });
    fs.writeFileSync(path.join(arc, 'GWall.cfg'), '4\nUPT\n42626717772363\n');

    seed();

    expect(fs.readFileSync(path.join(envDir, 'GWall.cfg'), 'utf8')).toBe(
      '4\nUPT\n42626717772363\n',
    );
  });

  it('a live ENV: value wins over the archive, the way a boot-time copy does', () => {
    const arc = amigaEnvArchiveDir(root);
    fs.mkdirSync(arc, { recursive: true });
    fs.writeFileSync(path.join(arc, 'GWall.cfg'), 'stale\n');
    fs.writeFileSync(path.join(envDir, 'GWall.cfg'), 'live\n');

    seed();

    expect(fs.readFileSync(path.join(envDir, 'GWall.cfg'), 'utf8')).toBe('live\n');
  });

  it('creates the archive directory so a door can write to ENVARC: at all', () => {
    // Open(..., MODE_NEWFILE) fails when the parent is missing, which is how
    // the persistent half stayed empty.
    expect(fs.existsSync(amigaEnvArchiveDir(root))).toBe(false);
    seed();
    expect(fs.existsSync(amigaEnvArchiveDir(root))).toBe(true);
  });

  it('carries archived subdirectories through, the way `Copy ENVARC: ENV: ALL` does', () => {
    const arc = amigaEnvArchiveDir(root);
    fs.mkdirSync(path.join(arc, 'Sys'), { recursive: true });
    fs.writeFileSync(path.join(arc, 'Sys', 'nested'), 'kept\n');

    seed();

    expect(fs.readFileSync(path.join(envDir, 'Sys', 'nested'), 'utf8')).toBe('kept\n');
  });
});
