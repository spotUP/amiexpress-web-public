/**
 * The board's own bulletin tier finds the board's own bulletins.
 *
 * express.e reads them out of `Conf<N>/Screens/Bulletins/`, and this board
 * does not use it: bull1..12 and BullHelp live in one `Bulletins/` directory
 * at the root, which is where the Bulls door reads them from as well -
 * `Conf1/Bulletins` is a 0-byte Amiga leftover from 2020.
 *
 * Nobody noticed, because the door won the B command. The moment a caller
 * reached the internal tier - a teletext caller, once teletext started
 * preferring the board's own screens - a board with twelve bulletins
 * answered "No bulletins are available in this conference!" (sysop,
 * 2026-09-14).
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  handleReadBulletinCommand,
  setDisplayFileCommandsDependencies,
} from '../../src/handlers/commands/display-file-commands.handler';
import { config } from '../../src/config';
import { resetAcsLoader } from '../../src/utils/acs-access-loader';

/** The sysop's access file, on the tmp board: checkSecurity reads ACS from boardRoot(). */
function seedAccess(board: string): void {
  fs.mkdirSync(path.join(board, 'Access'), { recursive: true });
  fs.copyFileSync(
    path.join(__dirname, '..', '..', '..', '..', 'Access', 'ACS.255.info'),
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

describe('where the bulletin tier looks', () => {
  const original = config.getConfig().dataDir;
  let board = '';
  beforeEach(() => resetAcsLoader());
  afterEach(() => {
    resetAcsLoader();
    config.set('dataDir', original);
    if (board) fs.rmSync(board, { recursive: true, force: true });
    board = '';
  });

  test('finds the board-level Bulletins when the conference has none', () => {
    board = makeBoard('root');
    config.set('dataDir', board);
    const shown = wire();
    const socket = makeSocket();

    handleReadBulletinCommand(socket, session(), '');

    expect(socket.out.join('')).not.toContain('No bulletins are available');
    expect(shown.some((s) => s.includes('BullHelp'))).toBe(true);
  });

  test('still prefers the conference\'s own, which is what express.e reads', () => {
    board = makeBoard('conference');
    config.set('dataDir', board);
    const shown = wire();
    const socket = makeSocket();

    handleReadBulletinCommand(socket, session(), '');

    expect(shown.some((s) => s.includes(path.join('Conf1', 'Screens', 'Bulletins')))).toBe(true);
  });

  test('a board with no bulletins anywhere still says so', () => {
    board = fs.mkdtempSync(path.join(os.tmpdir(), 'bulletins-none-'));
    seedAccess(board);
    config.set('dataDir', board);
    wire();
    const socket = makeSocket();

    handleReadBulletinCommand(socket, session(), '');

    expect(socket.out.join('')).toContain('No bulletins are available in this conference!');
  });
});
