/**
 * V as express.e's viewAFile (20388-20550). The port searched Conf<n>/Dir1..20
 * instead of the conference's DLPATH.n, coloured its answers, named the file
 * in "not found", printed an invented "Viewing:" header, logged nothing for a
 * restricted file, and judged "not text" from the file's first three bytes
 * only. express.e judges each line: a byte above 128 among a line's first
 * three ends the view - so a line opening `G\xE5rd` is "not text" too.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { config } from '../../src/config';
import { flushOutput } from '../../src/utils/output.util';
import { callersLogManager } from '../../src/services/CallersLogManager';
import { ViewFileHandler } from '../../src/handlers/content/view-file.handler';
import { buildDirEntryLine } from '../../src/utils/dir-file.util';

let root = '';
let previous = '';
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'v-express-'));
  previous = config.get('dataDir');
  config.set('dataDir', root);
  fs.mkdirSync(path.join(root, 'Conf1', 'Uploads'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Conf1.info'), 'NDIRS=1\nDLPATH.1=BBS:Conf1/Uploads/\n');
  fs.writeFileSync(path.join(root, 'Conf1', 'Uploads', 'READ.ME'), 'first line\nfrom Sk\xE5ne\n', 'latin1');
  fs.writeFileSync(path.join(root, 'Conf1', 'Uploads', 'HALF.BIN'), Buffer.from('text line\n\xFF\xFE\xFDbinary\nnever shown\n', 'latin1'));
  fs.writeFileSync(path.join(root, 'Conf1', 'DIR1'), buildDirEntryLine('SECRET.TXT', 11, new Date(), 'Restricted notes', 'P') + '\n', 'latin1');
  fs.writeFileSync(path.join(root, 'Conf1', 'Uploads', 'SECRET.TXT'), 'top secret\n');
});
afterEach(() => {
  config.set('dataDir', previous);
  jest.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

async function view(name: string): Promise<string> {
  const wire: string[] = [];
  const socket: any = {
    id: `v-express-${Math.random().toString(36).slice(2)}`,
    emit: (event: string, data: unknown) => { if (event === 'ansi-output') wire.push(String(data)); return true; },
    on: () => socket,
  };
  const session: any = { nodeId: 1, currentConf: 1, user: { id: 1, username: 'viewer', secLevel: 100, securityFlags: 'T'.repeat(64) } };
  await ViewFileHandler.handleViewFileCommand(socket, session, name);
  flushOutput(socket);
  return wire.join('');
}

test('a file on the conference DLPATH is shown as it is, Latin-1 included, with no header', async () => {
  const out = await view('READ.ME');
  expect(out).toBe('\r\nfirst line\r\nfrom Sk\u00E5ne\r\n\r\n\r\n');
});

test('a name on no DLPATH is "File not found." with no name and no colour', async () => {
  expect(await view('NOPE.TXT')).toBe('\r\nFile not found.\r\n\r\n');
});

test('a line that is not text ends the view there', async () => {
  const out = await view('HALF.BIN');
  expect(out).toContain('text line\r\n');
  expect(out).toContain('\r\nThis file is not a text file.\r\n\r\n');
  expect(out).not.toContain('never shown');
});

test('a restricted file is refused and both CallersLog lines are written', async () => {
  const log = jest.spyOn(callersLogManager, 'logActivity').mockImplementation(() => undefined as never);
  const out = await view('SECRET.TXT');
  expect(out).not.toContain('top secret');
  expect(out).toContain('BBS:Conf1/Uploads/SECRET.TXT\r\n >>Restricted File<< Updating CallersLog\r\n');
  expect(out).toContain('\r\nAttempt to read RESTRICTED file denied\r\nUpdating Callerslog\r\n');
  expect(log.mock.calls.map((c) => c[1])).toEqual([
    '\tAttempt to examine RESTRICTED file BBS:Conf1/Uploads/SECRET.TXT',
    '\t\tAttempt to read RESTRICTED file [SECRET.TXT]',
  ]);
});
