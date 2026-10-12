/**
 * ^C typed while Z searches or V shows a file stops it with **Break.
 *
 * express.e asks checkInput() before each DIR line zippy reads
 * (27551-27567) and after each line viewAFile shows (20524-20537): readChar(1)
 * takes the key, ^C prints **Break and returns RESULT_FAILURE, ^W waits for
 * another key. The port never looked: a ^C typed mid-search or mid-file went
 * to the sub-state branches and the whole listing ran to its end.
 *
 * Driven from the commands' handlers with the key through the real
 * handleCommand, which hands it to the input the procedure holds
 * (utils/await-input holdInput).
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { config } from '../../src/config';
import { handleCommand } from '../../src/handlers/command.handler';
import { ZippySearchHandler } from '../../src/handlers/content/zippy-search.handler';
import { ViewFileHandler } from '../../src/handlers/content/view-file.handler';
import { LoggedOnSubState } from '../../src/constants/bbs-states';
import { flushOutput } from '../../src/utils/output.util';

let root = '';
let previous = '';
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctrl-c-zv-'));
  previous = config.get('dataDir');
  config.set('dataDir', root);
  fs.mkdirSync(path.join(root, 'Conf1', 'Uploads'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Conf1.info'), 'NDIRS=1\nDLPATH.1=BBS:Conf1/Uploads/\n');
  // A long listing whose only match is its last entry, and a long text file.
  const entries = Array.from({ length: 3000 }, (_, i) => `F${i}.LHA`.padEnd(13) + 'P    12345 01-02-95 filler');
  entries.push('LAST.LHA     P    12345 01-02-95 the WOMBAT effect');
  fs.writeFileSync(path.join(root, 'Conf1', 'DIR1'), entries.join('\n') + '\n');
  const lines = Array.from({ length: 3000 }, (_, i) => `line ${i}`);
  lines.push('THE END');
  fs.writeFileSync(path.join(root, 'Conf1', 'Uploads', 'BIG.TXT'), lines.join('\n') + '\n');
});
afterEach(() => {
  config.set('dataDir', previous);
  fs.rmSync(root, { recursive: true, force: true });
});

function caller() {
  const wire: string[] = [];
  const socket: any = {
    id: `ctrl-c-zv-${Math.random().toString(36).slice(2)}`,
    emit: (event: string, data: unknown) => { if (event === 'ansi-output') wire.push(String(data)); return true; },
    on: () => socket,
  };
  const session: any = {
    state: 'loggedon', subState: LoggedOnSubState.PROCESS_COMMAND, nodeId: 1, currentConf: 1, tempData: {},
    user: { id: 1, username: 'caller', secLevel: 255, securityFlags: 'T'.repeat(100), confAccess: 'XX' },
  };
  return { socket, session, wire };
}

/** Run `start`, and type ^C once the procedure holds the input. */
async function breakWhileRunning(c: ReturnType<typeof caller>, held: LoggedOnSubState, start: () => Promise<unknown>) {
  const running = start();
  for (let i = 0; i < 1000 && !(c.session.subState === held && c.session.typeAhead); i++) {
    await new Promise((r) => setImmediate(r));
  }
  expect(c.session.subState).toBe(held);
  await handleCommand(c.socket, c.session, '\x03');
  await running;
  flushOutput(c.socket);
  return c.wire.join('');
}

test('^C typed while Z searches prints **Break and stops the search (express.e:27551-27567)', async () => {
  const c = caller();
  const out = await breakWhileRunning(c, LoggedOnSubState.ZIPPY_SCAN,
    () => ZippySearchHandler.handleZippySearchCommand(c.socket, c.session, 'WOMBAT 1 NS'));
  expect(out).toContain('Scanning directory 1\r\n');
  expect(out).toContain('**Break\r\n\r\n'); // 27563, then the caller's '\b\n' (26205)
  expect(out).not.toContain('LAST.LHA');
  expect(c.session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
  expect(c.session.typeAhead).toBeUndefined();
});

test('^C typed while V shows a file prints **Break and ends the file (express.e:20524-20537)', async () => {
  const c = caller();
  const out = await breakWhileRunning(c, LoggedOnSubState.VIEW_FILE_SHOW,
    () => ViewFileHandler.handleViewFileCommand(c.socket, c.session, 'BIG.TXT NS'));
  expect(out).toContain('line 0\r\n');
  expect(out).toMatch(/\r\n\*\*Break\r\n\r\n$/); // 20534, and nothing after it
  expect(out).not.toContain('THE END');
  expect(c.session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
  expect(c.session.typeAhead).toBeUndefined();
});
