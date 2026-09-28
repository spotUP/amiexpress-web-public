/**
 * Regression tests for C-V: V command uses ViewFileHandler (canonical impl).
 *
 * express.e:25675-25687 internalCommandV:
 *   - setEnvStat(ENV_VIEWING)
 *   - IF ripMode THEN aePuts('[1!')
 *   - viewAFile(cmdcode, params)
 *   - IF ripMode THEN aePuts('[2!')
 *
 * The canonical V impl is ViewFileHandler in content/view-file.handler.ts:
 *   - searches BBS file areas (Dir1..DirN) via DLPATH, NOT a flat TEXT/ subdir
 *   - emits the RIP graphics-mode brackets when session.ripMode is set
 *   - validates filename, checks restricted paths, refuses binary files
 *
 * The legacy export `handleViewFileCommand` in commands/utility-commands.handler.ts
 * used to reimplement V badly (TEXT/ search, no RIP brackets). It is now a
 * forwarder so the export contract is preserved while behavior is canonical.
 *
 * Driven on a temp board: a text file in Conf1/Dir2, another only in a
 * TEXT/ directory, the canonical handler and both legacy exports called
 * for real, and the caller's screen read.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { config } from '../src/config';
import { ViewFileHandler } from '../src/handlers/content/view-file.handler';
import { handleViewFileCommand, handleViewFileInput } from '../src/handlers/commands/utility-commands.handler';

let root: string;
let previousDataDir: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'view-file-'));
  previousDataDir = config.get('dataDir');
  config.set('dataDir', root);
  fs.mkdirSync(path.join(root, 'Conf1', 'Dir1'), { recursive: true });
  fs.mkdirSync(path.join(root, 'Conf1', 'Dir2'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Conf1', 'Dir2', 'NOTES.TXT'), 'THE NOTES BODY\r\n');
  for (const text of [path.join(root, 'Conf1', 'TEXT'), path.join(root, 'TEXT')]) {
    fs.mkdirSync(text, { recursive: true });
    fs.writeFileSync(path.join(text, 'ONLYTEXT.TXT'), 'SHOULD NOT BE FOUND\r\n');
  }
});

afterEach(() => {
  config.set('dataDir', previousDataDir);
  fs.rmSync(root, { recursive: true, force: true });
});

function aCaller(over: Record<string, unknown> = {}) {
  const lines: string[] = [];
  const socket: any = {
    id: `view-file-${Math.random().toString(36).slice(2)}`,
    emit: (event: string, payload: unknown) => { if (event === 'ansi-output') lines.push(String(payload)); return true; },
    on: () => socket,
  };
  const session: any = {
    nodeId: 1,
    currentConf: 1,
    user: { id: 1, username: 'viewer', secLevel: 100, securityFlags: 'T'.repeat(64) },
    ...over,
  };
  return { socket, session, said: () => lines.join('') };
}

describe('V command uses canonical ViewFileHandler (C-V, express.e:25675-25687)', () => {
  test('ViewFileHandler brackets the view with RIP [1! / [2! in RIP mode, and not otherwise', async () => {
    const rip = aCaller({ ripMode: true });
    await ViewFileHandler.handleViewFileCommand(rip.socket, rip.session, 'NOTES.TXT');
    const out = rip.said();
    expect(out.startsWith('\x1b[1!')).toBe(true);
    expect(out.endsWith('\x1b[2!')).toBe(true);
    expect(out).toContain('THE NOTES BODY');

    const plain = aCaller();
    await ViewFileHandler.handleViewFileCommand(plain.socket, plain.session, 'NOTES.TXT');
    expect(plain.said()).not.toContain('\x1b[1!');
    expect(plain.said()).not.toContain('\x1b[2!');
  });

  test('ViewFileHandler searches Dir1..DirN (BBS file areas), not a flat TEXT/ dir', async () => {
    const found = aCaller();
    await ViewFileHandler.handleViewFileCommand(found.socket, found.session, 'NOTES.TXT');
    expect(found.said()).toContain('Viewing: NOTES.TXT');

    const textOnly = aCaller();
    await ViewFileHandler.handleViewFileCommand(textOnly.socket, textOnly.session, 'ONLYTEXT.TXT');
    expect(textOnly.said()).toContain('File ONLYTEXT.TXT not found.');
    expect(textOnly.said()).not.toContain('SHOULD NOT BE FOUND');
  });

  test('legacy utility-commands handleViewFileCommand behaves as the canonical handler', async () => {
    const legacy = aCaller({ ripMode: true });
    await handleViewFileCommand(legacy.socket, legacy.session, 'NOTES.TXT');
    expect(legacy.said()).toContain('THE NOTES BODY');
    expect(legacy.said().startsWith('\x1b[1!')).toBe(true);

    const textOnly = aCaller();
    await handleViewFileCommand(textOnly.socket, textOnly.session, 'ONLYTEXT.TXT');
    expect(textOnly.said()).not.toContain('SHOULD NOT BE FOUND');
  });

  test('legacy utility-commands handleViewFileInput answers the canonical filename prompt', async () => {
    // The state ViewFileHandler.viewAFile leaves when it asks for a name.
    const c = aCaller({ tempData: { waitingForViewFilename: true, nonStopDisplay: false } });

    await handleViewFileInput(c.socket, c.session, 'NOTES.TXT');
    expect(c.said()).toContain('THE NOTES BODY');
  });
});
