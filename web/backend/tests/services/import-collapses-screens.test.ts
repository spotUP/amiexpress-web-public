/**
 * An imported board arrives maintainable, through the real write path.
 *
 * The planner is unit-tested in screen-collapse.test.ts; this is the part that
 * matters to a sysop - the files that end up on disk, and the tooltype that
 * makes the board read them. A plan nothing acts on is the failure mode this
 * project keeps finding.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readTooltypeMap } from '../../src/utils/info-file.util';

const ART = Buffer.from([0x1b, 0x5b, 0x33, 0x31, 0x6d, 0xa1, 0xb0, 0xdb]);

let sandbox: string;

/** The private importScreens, driven with a board of our own making. */
async function importInto(board: string, screens: { relPath: string; content: Buffer }[]) {
  process.env.BBS_DATA_DIR = board;
  jest.resetModules();

  const { ImportTransactionService } = require('../../src/services/import-transaction.service');
  const service = new ImportTransactionService(null, null, null, null);

  await (service as unknown as {
    importScreens(s: unknown[]): Promise<void>;
  }).importScreens(screens);
}

beforeEach(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'import-collapse-'));
});

afterEach(() => fs.rmSync(sandbox, { recursive: true, force: true }));

test('identical node screens land once, in the shared directory', async () => {
  await importInto(sandbox, [1, 2, 3].map(n => ({
    relPath: path.join(`Node${n}`, 'LOGON.TXT'), content: ART,
  })));

  expect(fs.existsSync(path.join(sandbox, 'Screens', 'Node', 'LOGON.TXT'))).toBe(true);
  expect(fs.existsSync(path.join(sandbox, 'Node1', 'LOGON.TXT'))).toBe(false);
});

test('the nodes are pointed at it with AmiExpress\'s own tooltype', async () => {
  await importInto(sandbox, [1, 2].map(n => ({
    relPath: path.join(`Node${n}`, 'LOGON.TXT'), content: ART,
  })));

  // ACP.e:2666-2673 - SCREENS on Node<n>.info, or the node reads Node<n>/.
  expect(readTooltypeMap(path.join(sandbox, 'Node1.info')).get('SCREENS'))
    .toBe('BBS:Screens/Node/');
  expect(readTooltypeMap(path.join(sandbox, 'Node2.info')).get('SCREENS'))
    .toBe('BBS:Screens/Node/');
});

test('the art is the art, byte for byte', async () => {
  await importInto(sandbox, [1, 2].map(n => ({
    relPath: path.join(`Node${n}`, 'LOGON.TXT'), content: ART,
  })));

  const written = fs.readFileSync(path.join(sandbox, 'Screens', 'Node', 'LOGON.TXT'));
  expect(written.equals(ART)).toBe(true);
});

test('a node with its own version keeps it, and is not pointed away from it', async () => {
  const own = Buffer.from('NODE 3', 'latin1');

  await importInto(sandbox, [
    { relPath: path.join('Node1', 'LOGON.TXT'), content: ART },
    { relPath: path.join('Node2', 'LOGON.TXT'), content: ART },
    { relPath: path.join('Node3', 'LOGON.TXT'), content: own },
  ]);

  expect(fs.readFileSync(path.join(sandbox, 'Node3', 'LOGON.TXT')).equals(own)).toBe(true);
  // No tooltype: Node3 goes on reading Node3/, which is where its screen is.
  expect(fs.existsSync(path.join(sandbox, 'Node3.info'))).toBe(false);
});

test('conference screens keep their own scope', async () => {
  await importInto(sandbox, [
    { relPath: path.join('Conf2', 'Screens', 'Menu.txt'), content: ART },
  ]);

  expect(fs.existsSync(path.join(sandbox, 'Conf2', 'Screens', 'Menu.txt'))).toBe(true);
  expect(fs.existsSync(path.join(sandbox, 'Screens', 'Node', 'Menu.txt'))).toBe(false);
});

test('a screen whose path escapes the board is refused', async () => {
  await importInto(sandbox, [
    { relPath: path.join('..', 'escaped.txt'), content: ART },
  ]);

  expect(fs.existsSync(path.join(path.dirname(sandbox), 'escaped.txt'))).toBe(false);
});
