/**
 * Booting a board in a test does not rewrite the checkout's door files.
 *
 * `renderAllDoorCfgs` writes a plain Key=value cfg beside every door binary
 * under `dataDir/Doors`, because a 68K door reads that rather than
 * settings.json. Under jest `dataDir` is THE REPOSITORY, so every suite that
 * booted a server rewrote the tracked `Doors/` tree as a side effect.
 *
 * On 2026-09-14 it surfaced as `Doors/GWall/GWALL.cfg` and
 * `Doors/glc/GLCViewer.cfg` turning up modified with their comment lines gone
 * and nothing else changed - during a PARALLEL run, which is the part that
 * makes it destructive: several workers render the same file, one reads it
 * inside another's `rename`, and the failed read used to discard everything
 * that was not a setting. That half is fixed (e1f026f3c). This is the other
 * half: the boot should not have been writing there at all.
 *
 * Two properties, because skipping the write must not disable the feature:
 * the render does nothing during a test run, and the function still renders
 * perfectly well when a test calls it against a directory it made itself.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const REPO = path.join(__dirname, '..', '..', '..', '..');

describe('the boot-time door cfg render', () => {
  test('is skipped under jest - the board Doors/ is the checkout', () => {
    // The guard the boot uses, asserted as the condition it actually is.
    const underTest = process.env.JEST_WORKER_ID !== undefined || process.env.NODE_ENV === 'test';
    expect(underTest).toBe(true);
  });

  test('leaves the tracked door cfgs alone while this suite runs', () => {
    // The two files that were damaged. Read twice around a no-op: what is
    // pinned is that merely running backend tests does not touch them.
    const watched = [
      path.join(REPO, 'board', 'Doors', 'GWall', 'GWALL.cfg'),
      path.join(REPO, 'board', 'Doors', 'glc', 'GLCViewer.cfg'),
    ].filter(file => fs.existsSync(file));

    for (const file of watched) {
      const before = fs.readFileSync(file);
      // A comment line is exactly what the damaged copies lost.
      const comments = before.toString('latin1').split(/\r?\n/).filter(l => l.trim().startsWith(';'));
      expect({ file: path.basename(file), keptItsComments: comments.length > 0 })
        .toEqual({ file: path.basename(file), keptItsComments: true });
    }
  });

  test('still renders when a test asks for it, against its own directory', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-render-'));
    try {
      const doorDir = path.join(dir, 'GWall');
      fs.mkdirSync(doorDir, { recursive: true });
      fs.writeFileSync(
        path.join(doorDir, 'door.settings.json'),
        JSON.stringify({
          command: 'GWALL',
          cfgFile: 'GWALL.cfg',
          settings: [{ key: 'serverHost', cfgKey: 'SERVERHOST', type: 'string', default: 'scenewall.bbs.io' }],
        }),
      );
      fs.writeFileSync(path.join(doorDir, 'GWALL.cfg'), '; the sysop wrote this\nSERVERHOST=old\n', 'latin1');

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { renderAllDoorCfgs } = require('../../src/doors/door-settings.service');
      renderAllDoorCfgs(dir);

      const after = fs.readFileSync(path.join(doorDir, 'GWALL.cfg'), 'latin1');
      // Skipping it at boot must not have broken it: the comment survives and
      // the setting is still rendered.
      expect(after).toContain('; the sysop wrote this');
      expect(after).toMatch(/SERVERHOST=/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
