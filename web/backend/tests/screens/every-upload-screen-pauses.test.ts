/**
 * "add the ~SP to all upload screens in all themes" (sysop, 2026-09-29).
 *
 * The upload interface clears the screen, so an upload screen with no pause of
 * its own is gone the moment it is drawn. Every upload screen the image ships
 * ends in `~SP|`, and a file whose first line did not open MCI (express.e
 * 6800-6806: only a screen whose first byte is `~` has its codes read) opens
 * with `~D|`, which sets the code terminator to the one it already is.
 *
 * Each shipped file is displayed for real: the pause is armed and neither code
 * reaches the caller as text.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { config } from '../../src/config';

const REPO = path.resolve(__dirname, '../../../..');
const shipped = [
  'Screens/Conf/uploadmsg.txt',
  ...fs.readdirSync(path.join(REPO, 'board', 'Themes/tango/Conf')).map((n) => `Themes/tango/Conf/${n}/UploadMsg.txt`),
].filter((rel) => fs.existsSync(path.join(REPO, 'board', rel)));

let root: string;
let previousDataDir: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-pauses-'));
  previousDataDir = config.get('dataDir');
  config.set('dataDir', root);
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), '');
  fs.mkdirSync(path.join(root, 'Conf1'), { recursive: true });
});
afterEach(() => {
  config.set('dataDir', previousDataDir);
  fs.rmSync(root, { recursive: true, force: true });
});

describe('every shipped upload screen', () => {
  it('is more than none', () => {
    expect(shipped.length).toBeGreaterThanOrEqual(15);
  });

  it.each(shipped)('%s holds the caller on its art, and shows no code as text', async (rel) => {
    fs.copyFileSync(path.join(REPO, 'board', rel), path.join(root, 'Conf1', 'UploadMsg.txt'));
    const { displayScreen, continueAfterScreen } = require('../../src/handlers/screen.handler');
    const emits: Array<{ event: string; data: any }> = [];
    const socket = { id: `up-${Math.random()}`, emit: (event: string, data: any) => emits.push({ event, data }), on: () => {} } as any;
    const session: any = { nodeId: 1, relConfNum: 1, currentConf: 1, user: { id: 1, username: 'u', secLevel: 100, securityFlags: 'T'.repeat(64) } };

    expect(await displayScreen(socket, session, 'UPLOADMSG', true, true)).toBe(true);
    let ranOn = false;
    await continueAfterScreen(socket, session, () => { ranOn = true; }, 'test');

    const shown = emits.filter((e) => e.event === 'ansi-output').map((e) => String(e.data)).join('');
    expect(ranOn).toBe(false);
    expect(shown).toContain('Space To Resume');
    expect(shown).not.toMatch(/~D\||~SP/);
  });
});
