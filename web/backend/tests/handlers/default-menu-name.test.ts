/**
 * P3-3: SYS_DEFAULT_MENU (express.e:31823-31824 DEFAULT_MENUNAME) - the
 * fallback screen express.e loads for SCREEN_MENU when there is no
 * per-conference/`~SM_` override, falling back to the literal 'MENU' only
 * when the tooltype itself is blank or absent.
 *
 * Before this fix, `loadScreenFile` always searched for a file literally
 * named MENU regardless of what the sysop configured, so a board using
 * DEFAULT_MENUNAME=LOBBY (the axSetupTool "Default Menu" field) never saw
 * its own menu screen - the caller got "screen not found" every time
 * `displayMainMenu` (handlers/command-handler/menu.ts) asked for it.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

process.env.SKIP_DB_INIT = '1';

import { loadScreenFile } from '../../src/handlers/screen.handler';
import { config } from '../../src/config';

describe('SCREEN_MENU resolves SYS_DEFAULT_MENU (P3-3)', () => {
  let dataDir: string;
  let spy: jest.SpyInstance;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'default-menu-'));
    fs.mkdirSync(path.join(dataDir, 'Conf1'), { recursive: true });

    const original = config.getConfig.bind(config);
    spy = jest
      .spyOn(config, 'getConfig')
      .mockImplementation(() => ({ ...original(), dataDir }));
  });

  afterEach(() => {
    spy.mockRestore();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('falls back to the literal MENU when SYS_DEFAULT_MENU is unset (express.e:31824)', () => {
    fs.writeFileSync(path.join(dataDir, 'Conf1', 'MENU.txt'), 'stock menu content\n');

    const result = loadScreenFile('MENU', 1, 0, { relConfNum: 1 } as any);

    expect(result).not.toBeNull();
    expect(result?.content).toContain('stock menu content');
  });

  it('loads the sysop-configured SYS_DEFAULT_MENU screen instead of the hardcoded MENU (express.e:31823)', () => {
    fs.writeFileSync(path.join(dataDir, 'bbsConfig.info.txt'), 'DEFAULT_MENUNAME=LOBBY\n');
    fs.writeFileSync(path.join(dataDir, 'Conf1', 'LOBBY.txt'), 'custom lobby menu\n');
    // No MENU.txt on disk at all - a board relying only on its configured
    // name must not fall back to a file that was never there.

    const result = loadScreenFile('MENU', 1, 0, { relConfNum: 1 } as any);

    expect(result).not.toBeNull();
    expect(result?.content).toContain('custom lobby menu');
  });
});
