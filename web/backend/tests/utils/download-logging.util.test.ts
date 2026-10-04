/**
 * A download is logged as express.e logs it.
 *
 * express.e:9475-9491 logUDFile(dl=TRUE) builds ONE line and writes it to both
 * Node<n>/CallersLog and Node<n>/UDLog:
 *
 *   StringF(tempStr,'\t\sDownloading \s \d bytes',IF freeDFlag THEN 'Free ' ELSE '',...)
 *
 * The port wrote `[<ISO time>] name - Downloading ...` to both, and put
 * `name: ` in front of it again in the CallersLog - so GLCUpdater and SAmiLog,
 * which read the summary after a `Downloading ` line, read nothing.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { User } from '../../src/types';

const board = fs.mkdtempSync(path.join(os.tmpdir(), 'download-logging-'));
fs.mkdirSync(path.join(board, 'Node1'));

jest.mock('../../src/config', () => ({
  config: { get: (key: string) => (key === 'dataDir' ? board : undefined) },
}));

// The CallersLog writer takes its root when it loads.
const savedRoot = process.env.BBS_ROOT;
process.env.BBS_ROOT = board;
/* eslint-disable @typescript-eslint/no-var-requires */
const { logDownload } = require('../../src/utils/download-logging.util') as typeof import('../../src/utils/download-logging.util');
const { setACSConfig, LevelFlags } = require('../../src/utils/acs.util') as typeof import('../../src/utils/acs.util');

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterAll(() => {
  if (savedRoot === undefined) delete process.env.BBS_ROOT; else process.env.BBS_ROOT = savedRoot;
  fs.rmSync(board, { recursive: true, force: true });
});

const read = (name: string) => {
  const p = path.join(board, 'Node1', name);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
};

beforeEach(() => {
  for (const name of ['CallersLog', 'UDLog']) fs.rmSync(path.join(board, 'Node1', name), { force: true });
  const acLvl = new Array(51).fill(0);
  acLvl[LevelFlags.DO_CALLERSLOG] = 1;
  acLvl[LevelFlags.DO_UD_LOG] = 1;
  setACSConfig({ acLvl });
});

const user = { username: 'regress' } as unknown as User;

it('writes express.e:9478 to the CallersLog and the UDLog, byte for byte', async () => {
  await logDownload(user, 'MUSIC.LHA', 54321, false, 1);
  expect(read('CallersLog')).toBe('\tDownloading MUSIC.LHA 54321 bytes\n');
  expect(read('UDLog')).toBe('\tDownloading MUSIC.LHA 54321 bytes\n');
});

it('a free download reads `Free Downloading`', async () => {
  await logDownload(user, 'FREE.LHA', 10, true, 1);
  expect(read('CallersLog')).toBe('\tFree Downloading FREE.LHA 10 bytes\n');
});

it('ACS.DO_CALLERSLOG off keeps it out of the CallersLog, not the UDLog', async () => {
  const acLvl = new Array(51).fill(0);
  acLvl[LevelFlags.DO_UD_LOG] = 1;
  setACSConfig({ acLvl });
  await logDownload(user, 'MUSIC.LHA', 54321, false, 1);
  expect(read('CallersLog')).toBe('');
  expect(read('UDLog')).toBe('\tDownloading MUSIC.LHA 54321 bytes\n');
});
