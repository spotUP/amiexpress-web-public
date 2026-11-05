process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  showBulletin,
  setDisplayFileCommandsDependencies,
} from '../../src/handlers/commands/display-file-commands.handler';
import { config } from '../../src/config';
import { resetAcsLoader } from '../../src/utils/acs-access-loader';

/** The sysop's access file, on the tmp board: checkSecurity reads ACS from boardRoot(). */
function seedAccess(board: string): void {
  fs.mkdirSync(path.join(board, 'Access'), { recursive: true });
  fs.copyFileSync(
    path.join(__dirname, '..', '..', '..', '..', 'board', 'Access', 'ACS.255.info'),
    path.join(board, 'Access', 'ACS.255.info'),
  );
}

function makeBoard(where: 'root' | 'conference'): string {
  const board = fs.mkdtempSync(path.join(os.tmpdir(), 'bulletins-'));
  const dir = where === 'root'
    ? path.join(board, 'Bulletins')
    : path.join(board, 'Conf1', 'Screens', 'Bulletins');
  fs.mkdirSync(dir, { recursive: true });
  seedAccess(board);
  fs.writeFileSync(path.join(dir, 'BullHelp.txt'), 'THE BULLETINS\n#1 One\n');
  fs.writeFileSync(path.join(dir, 'Bull1.txt'), 'the first bulletin\n');
  if (where === 'root') {
    // The leftover this board really has: a FILE where a directory would go.
    fs.mkdirSync(path.join(board, 'Conf1'), { recursive: true });
    fs.writeFileSync(path.join(board, 'Conf1', 'Bulletins'), '');
  }
  return board;
}

function wire() {
  const shown: string[] = [];
  setDisplayFileCommandsDependencies({
    displayScreen: (_s: any, _sess: any, name: string) => { shown.push(name); },
    findSecurityScreen: (base: string) => {
      for (const ext of ['.txt', '.ttx']) {
        if (fs.existsSync(base + ext)) return base + ext;
      }
      return null;
    },
    confScreenDir: '',
    db: {},
    hasKeysFile: () => false,
  } as any);
  return shown;
}

function session(): any {
  return {
    user: { id: 1, username: 'SYSOP', secLevel: 255 },
    currentConf: 1,
    nodeId: 1,
    texttvMode: true,
    tempData: {},
  };
}

function makeSocket() {
  const out: string[] = [];
  return {
    out,
    emit(event: string, data?: unknown) { if (event === 'ansi-output') out.push(String(data ?? '')); return true; },
    on() { return this; },
  } as any;
}


describe('a picked bulletin with nothing in it', () => {
  const original = config.getConfig().dataDir;
  let board = '';
  beforeEach(() => resetAcsLoader());
  afterEach(() => {
    resetAcsLoader();
    config.set('dataDir', original);
    if (board) fs.rmSync(board, { recursive: true, force: true });
    board = '';
  });

  test('an empty or blank file says what a missing one says, and shows nothing', async () => {
    board = makeBoard('root');
    fs.writeFileSync(path.join(board, 'Bulletins', 'bull2.txt'), '');
    fs.writeFileSync(path.join(board, 'Bulletins', 'bull3.txt'), ' \r\n \r\n');
    config.set('dataDir', board);
    const shown = wire();
    for (const n of [2, 3, 9]) {
      const socket = makeSocket();
      expect(await showBulletin(socket, session(), n, '')).toBe(false);
      expect(socket.out.join('')).toContain(`Sorry there is no bulletin #${n}`);
    }
    expect(shown).toEqual([]);
    const ok = makeSocket();
    expect(await showBulletin(ok, session(), 1, '')).toBe(true);
    expect(shown.length).toBe(1);
  });
});
