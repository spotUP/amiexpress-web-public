/**
 * A teletext page is drawn for the teletext caller: it is not folded or
 * adapted like an 80-column ANSI screen. 792730ea5 gave teletext callers the
 * forty-column plan, and a .ttx page scored as art went through the ANSI
 * adapter - colours rewritten, mosaic shifts dropped, codes skipped. J
 * printed `~DT| ~TM|` and `~CL.` raw (sysop, 2026-10-05).
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/index', () => {
  const states = require('../../src/constants/bbs-states');
  return { BBSState: states.BBSState, LoggedOnSubState: states.LoggedOnSubState, BBSSession: {} };
});

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { displayScreen } from '../../src/handlers/screen.handler';
import { config } from '../../src/config';
import { flushOutput } from '../../src/utils/output.util';
import { invalidateScreenIndex } from '../../src/screens/screen-index.service';

/** Live's Screens/Node/JoinConf.ttx, byte for byte. */
const PAGE = [
  "~SMO1|",
  "\x1b[2J\x1b[H",
  "\x1b[0;36m  300 UP ROUGH\x1b[0m\x1b[0;37m         ~DT| ~TM|\x1b[0m",
  "\x1b[0;36m\x0essssssssssssssssssssssssssssssssssssssss\x0f\x1b[0m",
  "",
  "\x1b[0;33m\x0e :#$`'ijej 7#!7#!j#k 7#!?05`')j## 7#  \x0f\x1b[0m",
  "\x1b[0;33m\x0e 5  j jj\"z 7# 7# jk# 7# 5a5j  j#! ##0 \x0f\x1b[0m",
  "\x1b[0;33m\x0e *,! -&* + %  -,$* ) -,$%\"% -&*,, ,,! \x0f\x1b[0m",
  "",
  "\x1b[0;37m  Pick a conference by number.\x1b[0m",
  "",
  "~CL.",
  "",
].join('\n');

test('a teletext page reaches a teletext caller with its codes run and its mosaics intact', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ttx-page-'));
  fs.mkdirSync(path.join(root, 'Screens', 'Node'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Screens', 'Node', 'JoinConf.ttx'), PAGE, 'latin1');
  const saved = config.get('dataDir');
  config.set('dataDir', root);
  invalidateScreenIndex();
  try {
    const out: string[] = [];
    const socket: any = { id: `ttx-${Math.random()}`, emit: (e: string, d: unknown) => { if (e === 'ansi-output') out.push(String(d)); return true; }, on() {} };
    const session: any = { nodeId: 1, texttvMode: true, screenWidth: 40, screenHeight: 25, user: { secLevel: 255, username: 'spot' }, currentConf: 1, state: 'loggedon' };

    await displayScreen(socket, session, 'JOINCONF');
    await new Promise((r) => setTimeout(r, 100));
    flushOutput(socket);
    const said = out.join('');

    expect(said).toContain('Pick a conference by number.');
    expect(said).not.toContain('~DT|');
    expect(said).not.toContain('~TM|');
    expect(said).not.toContain('~CL.');
    expect(said).toContain('\x0e' + 's'.repeat(40) + '\x0f');
  } finally {
    config.set('dataDir', saved);
  }
});
