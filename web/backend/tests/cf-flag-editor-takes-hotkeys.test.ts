/**
 * CF (conference flags) at the menu prompt, driven through the real
 * handleCommand the way a caller types it (sysop, 2026-10-17: "i cant do
 * anything here" at "Edit which flags [M]ailScan, ... >: ").
 *
 * express.e:24672-24841 internalCommandCF:
 *   - 24750 the flag choice is readChar(): ONE key, no RETURN, echoed (24763-24766)
 *   - any key but M/A/F/Z echoes and leaves CF (24759-24761)
 *   - 24770 the conference numbers are a lineInput, so they echo as typed;
 *     an empty line leaves CF (24773); otherwise the list loops back to the screen
 *   - 24735 each row is '[34m[[0m\r\d[5][34m] [36m\c \c \c \c [0m\l\s[23]':
 *     the number right-justified in 5, the title left-justified in 23, so
 *     both columns line up under the 40-column header (24691).
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../src/utils/message-pointers.util');

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { config } from '../src/config';
import { handleCommand } from '../src/handlers/command.handler';
import { setAdvancedCommandsDependencies } from '../src/handlers/commands/advanced-commands.handler';
import { BBSState, LoggedOnSubState } from '../src/index';
import { flushOutput } from '../src/utils/output.util';
import * as pointers from '../src/utils/message-pointers.util';
import { Database } from '../src/database';

const originalBases = Database.prototype.getMessageBases;

const flags = new Map<number, number>();
const MAIL_SCAN_MASK = 4;

let root: string;
let previousDataDir: string;

beforeEach(() => {
  // A board of its own: absolute conference numbers (no RELATIVE_CONFERENCES).
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-'));
  previousDataDir = config.get('dataDir');
  config.set('dataDir', root);
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), '');
  flags.clear();
  (pointers.getConferenceScanFlags as jest.Mock).mockImplementation(
    async (_u: string, conf: number) => flags.get(conf) ?? 0);
  (pointers.setConferenceScanFlags as jest.Mock).mockImplementation(
    async (_u: string, conf: number, _b: number, change: (f: number) => number) => {
      const next = change(flags.get(conf) ?? 0) & 0xff;
      flags.set(conf, next);
      return next;
    });
  (Database.prototype as any).getMessageBases = jest.fn(
    async (confId: number) => [{ id: confId, name: 'Main', conferenceid: confId }]);
  setAdvancedCommandsDependencies({
    conferences: [
      { id: 1, name: 'Amiga Demoscene!' },
      { id: 2, name: 'C64 Demoscene' },
      { id: 3, name: 'Console Demoscene' },
    ] as any,
    messageBases: [],
    messages: [],
    checkConfAccess: () => true,
  });
});

afterEach(() => {
  Database.prototype.getMessageBases = originalBases;
  config.set('dataDir', previousDataDir);
  fs.rmSync(root, { recursive: true, force: true });
});

function aCaller() {
  const bytes: string[] = [];
  const socket = {
    id: 'cf-caller',
    emit: (event: string, data: unknown) => {
      if (event === 'ansi-output' && typeof data === 'string') bytes.push(data);
      return true;
    },
    on: () => {}, off: () => {}, removeListener: () => {},
  } as any;
  const session: any = {
    state: BBSState.LOGGEDON,
    subState: LoggedOnSubState.READ_COMMAND,
    connectionType: 'web',
    nodeId: 1,
    currentConf: 1,
    relConfNum: 1,
    inputBuffer: '',
    commandHistory: [],
    user: { id: 1, username: 'spot', name: 'spot', secLevel: 255, securityFlags: 'T'.repeat(64), expert: 'X' },
    tempData: {},
  };
  const wire = () => { flushOutput(socket); const s = bytes.join(''); bytes.length = 0; return s; };
  return { socket, session, wire };
}

async function type(socket: any, session: any, keys: string) {
  for (const key of keys) await handleCommand(socket, session, key);
}

/** The menu dispatch is not awaited by handleCommand: let it land. */
async function settle(done: () => boolean) {
  for (let i = 0; i < 100 && !done(); i++) await new Promise(r => setTimeout(r, 20));
}

const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

describe('CF flag editor (express.e:24672-24841)', () => {
  test('cf at the menu prompt, then M as one key and "2" RETURN, toggles conference 2 mail scan', async () => {
    const { socket, session, wire } = aCaller();

    await type(socket, session, 'cf\r');
    await settle(() => session.subState === LoggedOnSubState.CF_FLAG_SELECT_INPUT);
    expect(plain(wire())).toContain('Edit which flags [M]ailScan, [A]ll Messages, [F]ileScan, [Z]oom >: ');
    expect(session.subState).toBe(LoggedOnSubState.CF_FLAG_SELECT_INPUT);

    // express.e:24750 readChar: the single key acts, and is echoed (24763-24766)
    await type(socket, session, 'M');
    const afterKey = plain(wire());
    expect(afterKey).toContain("M\r\nEnter Conference Numbers,'*' toggle all,'-' All off,'+' All on >: ");
    expect(session.subState).toBe(LoggedOnSubState.CF_CONF_SELECT_INPUT);

    // express.e:24770 lineInput echoes what is typed
    await type(socket, session, '2');
    expect(plain(wire())).toContain('2');
    await type(socket, session, '\r');
    expect(flags.get(2)).toBe(MAIL_SCAN_MASK);
    expect(flags.get(1) ?? 0).toBe(0);

    // the loop redraws (24840) with conference 2 starred, back on the flag prompt
    const redraw = plain(wire());
    expect(redraw).toContain('[    2] *       C64 Demoscene');
    expect(session.subState).toBe(LoggedOnSubState.CF_FLAG_SELECT_INPUT);

    // express.e:24759-24761 any other key echoes and leaves CF
    await type(socket, session, 'q');
    expect(plain(wire())).toContain('q\r\n');
    expect(session.subState).not.toBe(LoggedOnSubState.CF_FLAG_SELECT_INPUT);
    expect(session.subState).not.toBe(LoggedOnSubState.CF_CONF_SELECT_INPUT);
  });

  test('rows match express.e:24735: number right-justified in 5, title padded to 23, two per line under the header', async () => {
    const { socket, session, wire } = aCaller();
    await type(socket, session, 'cf\r');
    await settle(() => session.subState === LoggedOnSubState.CF_FLAG_SELECT_INPUT);
    const lines = plain(wire()).split('\r\n');
    const header = lines.find(l => l.includes('M A F Z Conference'))!;
    const row = lines.find(l => l.startsWith('[    1]'))!;
    expect(row).toBe('[    1]         Amiga Demoscene!        [    2]         C64 Demoscene          ');
    // second column's flags sit under the header's second "M"
    expect(row.indexOf('[    2]') + 8).toBe(header.lastIndexOf('M A F Z'));
    expect(lines.some(l => l.startsWith('[    3]         Console Demoscene      '))).toBe(true);
  });

  test("'*' alone on the conference line flips the picked flag on every accessible conference", async () => {
    const { socket, session, wire } = aCaller();
    flags.set(2, MAIL_SCAN_MASK); // already on: '*' must flip it OFF, the others ON
    await type(socket, session, 'cf\r');
    await settle(() => session.subState === LoggedOnSubState.CF_FLAG_SELECT_INPUT);
    wire();
    await type(socket, session, 'M');
    await type(socket, session, '*\r');
    expect(flags.get(1)).toBe(MAIL_SCAN_MASK);
    expect(flags.get(2) ?? 0).toBe(0);
    expect(flags.get(3)).toBe(MAIL_SCAN_MASK);
    const redraw = plain(wire());
    expect(redraw).toContain('[    1] *       Amiga Demoscene!');
    expect(redraw).toContain('[    3] *       Console Demoscene');
    expect(session.subState).toBe(LoggedOnSubState.CF_FLAG_SELECT_INPUT);
  });
});
