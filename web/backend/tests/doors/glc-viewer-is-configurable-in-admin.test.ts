/**
 * The door's settings reach the admin, and its art reaches the Studio.
 *
 * The sysop asked whether the config was wired into the web admin. It is - by
 * declaring a manifest, which is all the board needs - but declaring one
 * exposed a mismatch worth a test of its own.
 *
 * THE COMMAND IS THE KEY. `door-art-routes.ts` files a narrow drawing under
 * `Screens/doors/<CMD>/`, keyed by the command the ADMIN asked about, which is
 * the registered one. This door is registered as `GL`. Its manifest said
 * `GLC` and it read its variants from `Screens/doors/GLC/`, so a logo drawn in
 * the Studio would have been saved where the door never looked.
 */
import * as fs from 'fs';
import * as path from 'path';

const REPO = path.join(__dirname, '../../../..');
const DOOR = path.join(REPO, 'board', 'Doors/glc-viewer');

const manifest = () => JSON.parse(fs.readFileSync(path.join(DOOR, 'door.settings.json'), 'utf8'));

describe('what the admin will show', () => {
  it('has a manifest at all, which is what marks a door configurable', () => {
    // `config-routes.ts` sets `has_settings` from exactly this file existing.
    expect(fs.existsSync(path.join(DOOR, 'door.settings.json'))).toBe(true);
  });

  it('offers every key the door actually reads', () => {
    const declared = manifest().settings.map((s: { cfgKey?: string }) => s.cfgKey).filter(Boolean);
    expect(declared).toEqual(expect.arrayContaining([
      'SERVERHOST', 'SERVERPORT', 'TIMEOUT', 'RETRIES', 'TEMPFILE',
      'LINES', 'SCREENCLEAR', 'STYLE', 'ANIMATE', 'CENTRENAME', 'TIMEZONE',
    ]));
  });

  it('offers the four logos as drawable slots for the Studio', () => {
    const drawable = manifest().settings.filter((s: { art?: boolean }) => s.art);
    expect(drawable.map((s: { key: string }) => s.key)).toEqual(['logo1', 'logo2', 'logo3', 'logo4']);
  });

  it('explains each setting, since the form is all a sysop sees of it', () => {
    for (const setting of manifest().settings) {
      expect({ key: setting.key, hasLabel: !!setting.label }).toEqual({ key: setting.key, hasLabel: true });
    }
  });
});

describe('the command the board files art under', () => {
  it('is the one the manifest claims', () => {
    expect(manifest().command).toBe('GL');
  });

  it('is the one the board registered - or the Studio and the door disagree', () => {
    // `gl.info` is the registration; its LOCATION is what makes this door GL.
    const icon = fs.readFileSync(path.join(REPO, 'board', 'Commands/BBSCmd/gl.info'), 'latin1');
    expect(icon).toContain('LOCATION=Doors/glc-viewer');
    expect(icon).toContain('TYPE=TS');
  });

  it('is asked of the session, so the Studio and the door agree', () => {
    /*
     * Asserted through `logoFor`, which is where the command is USED: a
     * variant filed under the launching command must be the one the door
     * reads. A door that named itself could not survive being registered
     * under a second name, which is exactly the shape of the bug this fixes.
     */
    const { logoFor } = require('../../../../board/Doors/glc-viewer/src/logo');
    const os = require('os');

    const board = fs.mkdtempSync(path.join(os.tmpdir(), 'glc-cmd-'));
    const drawnForGl = ['\x1b[36mDRAWN FOR GL'];
    const dir = path.join(board, 'Screens', 'doors', 'GL');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'setting:logo3.c64.ans'), drawnForGl.join('\r\n') + '\r\n', 'latin1');

    const ask = (command: string) => logoFor({
      style: 3, doorDir: DOOR, bbsRoot: board, columns: 40, values: {}, command,
    });

    // Filed under GL, found under GL...
    expect(ask('GL')).toEqual(drawnForGl);
    // ...and not found under the name the door used to assume.
    expect(ask('GLC')).not.toEqual(drawnForGl);
  });
});
