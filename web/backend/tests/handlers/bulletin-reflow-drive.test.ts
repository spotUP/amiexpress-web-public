/**
 * The bulletin step of a C64's walk, DRIVEN (whole-run review, I10).
 *
 * Binding rule (c) of the 40-column run names "reflowed bulletin" as one of
 * the nine steps a PETSCII caller takes. It was the only one proved by
 * shared-code inference rather than execution: `handleReadBulletinCommand`
 * appeared in tests only as a `jest.fn()`, and no test ran a real
 * `Bulletins/bull*.txt` through the display path.
 *
 * This drives the REAL chain with the REAL wiring server/initialization.ts
 * performs (setDisplayFileCommandsDependencies with the real displayScreen
 * and the real findSecurityScreen):
 *
 *   handleReadBulletinCommand -> _displayBulletin -> _displayScreen
 *     (= screen.handler.displayScreen) -> petsciiTextScreenPlan -> wrapForSession
 *
 * over the board's own bulletin files, copied into a temp BBS root:
 *  - bull8.txt: 76-column prose, no ANSI -> reflowed, every row <= 40.
 *  - bull1.txt: an 80-column ANSI table -> the art-skip token, not a smear.
 *  - an ANSI session on the same two files -> byte-identical.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/index', () => {
  const states = require('../../src/constants/bbs-states');
  return {
    BBSState: states.BBSState,
    LoggedOnSubState: states.LoggedOnSubState,
    BBSSession: {},
  };
});
jest.mock('../../src/utils/flag-pause.util', () => ({
  checkForPause: jest.fn().mockResolvedValue(true),
  flagPause: jest.fn().mockResolvedValue(true),
}));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { config } from '../../src/config';
import { printableLength } from '../../src/utils/wrap-for-session.util';
import { ANSI_ART_SKIPPED_NOTICE } from '../../src/utils/ansi-art-detect.util';
import {
  handleReadBulletinCommand,
  setDisplayFileCommandsDependencies,
} from '../../src/handlers/commands/display-file-commands.handler';
import { displayScreen } from '../../src/handlers/screen.handler';
import { findSecurityScreen } from '../../src/utils/screen-security.util';
import { flushOutput } from '../../src/utils/output.util';

const REPO_ROOT = path.resolve(__dirname, '../../../..');

let root: string;
const realConfigGet = config.get.bind(config);

/** Bulletin number -> the repo file whose bytes it is given. */
const PROSE_BULLETIN = 8;
const TABLE_BULLETIN = 1;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bulletin-drive-'));
  const bullDir = path.join(root, 'Conf1', 'Screens', 'Bulletins');
  fs.mkdirSync(bullDir, { recursive: true });
  // BullHelp.txt must exist or the command reports "no bulletins" and returns.
  fs.writeFileSync(path.join(bullDir, 'BullHelp.txt'), Buffer.from('Bulletins\r\n', 'latin1'));
  for (const n of [PROSE_BULLETIN, TABLE_BULLETIN]) {
    fs.writeFileSync(
      path.join(bullDir, `Bull${n}.txt`),
      fs.readFileSync(path.join(REPO_ROOT, 'Bulletins', `bull${n}.txt`))
    );
  }

  jest.spyOn(config, 'get').mockImplementation((key: any) =>
    key === 'dataDir' ? root : realConfigGet(key)
  );

  // server/initialization.ts:541-547, verbatim in shape: the REAL renderer
  // and the REAL screen resolver. Nothing between the command and the choke.
  setDisplayFileCommandsDependencies({
    displayScreen,
    findSecurityScreen,
    confScreenDir: path.join(root, 'Screens'),
    db: {} as any,
    hasKeysFile: () => false,
  } as any);
});

afterAll(() => {
  jest.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

/** ACS: every flag on, so checkSecurity(READ_BULLETINS) passes. */
const BULLETIN_USER = {
  id: 'u1',
  username: 'SPOT',
  secLevel: 255,
  securityFlags: 'T'.repeat(64),
  confAccess: 'X',
};

let seq = 0;

async function readBulletin(bulletinNum: number, sessionOverrides: any): Promise<string> {
  const emitted: string[] = [];
  const session: any = {
    currentConf: 1,
    nodeId: 0,
    user: BULLETIN_USER,
    tempData: {},
    ...sessionOverrides,
  };
  const socket: any = {
    id: `bulletin-drive-${seq++}`,
    session,
    emit: (event: string, data: any) => {
      if (event === 'ansi-output') emitted.push(String(data));
      return true;
    },
    on: () => socket,
  };

  handleReadBulletinCommand(socket, session, String(bulletinNum));
  // _displayScreen is async under the hood; let its microtasks drain.
  await new Promise((resolve) => setTimeout(resolve, 30));
  flushOutput(socket);
  return emitted.join('');
}

/** Content rows, cursor wrapper and the trailing prompt dropped. */
function contentRows(out: string): string[] {
  return out
    .replace(/\x1b\[\?25[lh]/g, '')
    .split('\r\n')
    .filter((l) => l.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').trim().length > 0)
    .filter((l) => !l.includes('Which Bulletin'));
}

describe('handleReadBulletinCommand on a real Bulletins/bull*.txt', () => {
  it('reflows a prose bulletin to 40 columns for a PETSCII caller', async () => {
    const out = await readBulletin(PROSE_BULLETIN, { petsciiMode: true, screenWidth: 40 });

    expect(out).not.toContain(ANSI_ART_SKIPPED_NOTICE);
    for (const row of contentRows(out)) {
      expect(printableLength(row)).toBeLessThanOrEqual(40);
    }
    // The source rows are 76 columns and are GONE - they arrived folded.
    expect(out).not.toContain('This BBS is a PRIVATE SYSTEM. Only private citizens who are not');
    // ...with every word still on the wire, and none of them split.
    const flat = out.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/[\r\n]/g, ' ').replace(/\s+/g, ' ');
    expect(flat).toContain('This BBS is a PRIVATE SYSTEM.');
    expect(flat).toContain('are not violated.');
  });

  it('sends the ASCII skip token for an 80-column ANSI table bulletin, not a smear', async () => {
    const out = await readBulletin(TABLE_BULLETIN, { petsciiMode: true, screenWidth: 40 });

    expect(out).toContain(ANSI_ART_SKIPPED_NOTICE.trim());
    // The table's own rows never reach the wire.
    expect(out).not.toContain('No# Username (Handle)');
  });

  it('leaves an ANSI session byte-identical on the same prose bulletin', async () => {
    const out = await readBulletin(PROSE_BULLETIN, { screenWidth: 80 });
    expect(out).toContain('This BBS is a PRIVATE SYSTEM. Only private citizens who are not');
    expect(out).not.toContain(ANSI_ART_SKIPPED_NOTICE);
  });

  it('leaves an ANSI session byte-identical on the same table bulletin', async () => {
    const out = await readBulletin(TABLE_BULLETIN, { screenWidth: 80 });
    expect(out).toContain('No# Username (Handle)');
    expect(out).not.toContain(ANSI_ART_SKIPPED_NOTICE);
  });

  it('the caller lands in the interactive bulletin loop either way', async () => {
    const session: any = { currentConf: 1, nodeId: 0, user: BULLETIN_USER, petsciiMode: true, screenWidth: 40 };
    const socket: any = { id: `bulletin-drive-${seq++}`, session, emit: () => true, on: () => socket };
    handleReadBulletinCommand(socket, session, String(PROSE_BULLETIN));
    const { LoggedOnSubState } = require('../../src/constants/bbs-states');
    expect(session.subState).toBe(LoggedOnSubState.BULLETIN_INPUT);
  });
});

/**
 * ONE bulletin renderer (whole-run review, I11).
 *
 * `handlers/content/bulletin.handler.ts` held a SECOND displayBulletin that
 * emitted `socket.emit('ansi-output', content)` raw - no reflow, no art gate,
 * no width awareness. It had no production dispatcher (both `case 'B'` sites
 * route to handleReadBulletinCommand) and its exports were imported by
 * index.ts and command.handler.ts without ever being called, so it was dead
 * code that would have served 80-column bytes to a C64 the moment anything
 * routed to it. It is deleted; this stops it coming back unnoticed.
 */
describe('the board has exactly one bulletin renderer', () => {
  const SRC = path.resolve(__dirname, '../../src');

  function sourceFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return sourceFiles(full);
      return e.isFile() && e.name.endsWith('.ts') ? [full] : [];
    });
  }

  it('handlers/content/bulletin.handler.ts is gone', () => {
    expect(fs.existsSync(path.join(SRC, 'handlers/content/bulletin.handler.ts'))).toBe(false);
  });

  it('nothing in src still imports it', () => {
    const offenders = sourceFiles(SRC).filter((f) =>
      fs.readFileSync(f, 'utf8').includes('content/bulletin.handler')
    );
    expect(offenders).toEqual([]);
  });

  it('only display-file-commands.handler.ts declares a bulletin display helper', () => {
    const offenders = sourceFiles(SRC)
      .filter((f) => /function\s+_?displayBulletin\b/.test(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(SRC, f));
    expect(offenders).toEqual(['handlers/commands/display-file-commands.handler.ts']);
  });
});
