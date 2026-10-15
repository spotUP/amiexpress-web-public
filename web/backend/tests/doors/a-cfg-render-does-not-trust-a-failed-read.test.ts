/**
 * A CFG RENDER THAT CANNOT READ THE FILE MUST NOT REWRITE IT.
 *
 * `renderAllDoorCfgs` runs at every boot, for every manifest with a
 * `cfgFile`, against the real `Doors/` tree. `mergeIntoCfg` reads the file
 * that is already there so it can keep the comments and the keys the manifest
 * does not model - and when that read threw, it fell back to writing the
 * rendered settings alone. That fallback is right for a door being configured
 * for the FIRST time, and wrong for every other reason a read can fail.
 *
 * It is not theoretical. The write is `writeFileSync(temp)` then
 * `renameSync(temp, target)`, so with several jest workers each booting a
 * server against the SAME tracked tree, one render's read lands in the window
 * where another's rename has the path swapped out. `readFileSync` throws
 * ENOENT for a file that plainly exists, the catch discards everything the
 * file said, and out comes a cfg with its settings intact and its comments
 * gone. That is exactly the diff measured on `Doors/GWall/GWALL.cfg` and
 * `Doors/glc/GLCViewer.cfg` on 2026-09-14: comment lines removed, zero lines
 * added, no setting value changed. Diagnosed by session_014HgB.
 *
 * So a read that FAILS is not a read that found nothing: the render bails and
 * the file keeps what it had. Only a genuinely absent file is rendered fresh.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { renderDoorCfg } from '../../src/doors/door-settings.service';

function doorWith(cfg: string | null): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doorcfg-race-'));
  fs.writeFileSync(
    path.join(dir, 'door.settings.json'),
    JSON.stringify({
      command: 'TESTDOOR',
      cfgFile: 'test.cfg',
      settings: [{ key: 'host', cfgKey: 'SERVERHOST', label: 'Host', type: 'string', default: 'a.example' }],
    }, null, 2),
  );
  if (cfg !== null) fs.writeFileSync(path.join(dir, 'test.cfg'), cfg);
  return dir;
}

const CFG = ';server details\nSERVERHOST=scenewall.bbs.io\n;timeout in seconds\nTIMEOUT=5\n';
const read = (dir: string) => fs.readFileSync(path.join(dir, 'test.cfg'), 'utf8');

describe('a cfg render that cannot read the file', () => {
  it('keeps everything the file said when the read fails', () => {
    // A REAL failing read, not a mocked one: Node's `fs` namespace resists
    // spyOn, and a test whose fake never fires proves nothing. Mode 000 gives
    // a genuine EACCES for a file that plainly exists - the same shape the
    // rename race produces, where the read fails on a file that IS there.
    const dir = doorWith(CFG);
    const target = path.join(dir, 'test.cfg');
    fs.chmodSync(target, 0o000);

    let readable = true;
    try { fs.readFileSync(target, 'utf8'); } catch { readable = false; }
    if (readable) {
      // Running as root (or a filesystem that ignores the mode): this test
      // cannot create the condition, and passing silently would be a lie.
      fs.chmodSync(target, 0o600);
      console.warn('skipped: this user can read a mode-000 file');
      return;
    }

    expect(() => renderDoorCfg(dir)).not.toThrow();

    fs.chmodSync(target, 0o600);
    // Byte for byte. Before the fix the catch rendered the manifest alone,
    // dropping both comments and TIMEOUT and resetting SERVERHOST.
    expect(read(dir)).toBe(CFG);
  });

  it('still renders a door being configured for the first time', () => {
    // The fallback's legitimate case: no cfg on disk at all.
    const dir = doorWith(null);
    renderDoorCfg(dir);
    expect(read(dir)).toContain('SERVERHOST=');
  });
});
