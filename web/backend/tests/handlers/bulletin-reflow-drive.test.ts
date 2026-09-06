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
 * over two bulletins copied into a temp BBS root:
 *  - a 76-column prose bulletin, no ANSI -> reflowed, every row <= 40.
 *  - the board's own bull1.txt, an 80-column ANSI table -> the art-skip
 *    token, not a smear.
 *  - an ANSI session on the same two files -> byte-identical.
 *
 * The prose bulletin is BUILT HERE, not read from `Bulletins/`. It used to be
 * `bull8.txt`, which git does not track: bulletins are MultiTop-II output,
 * regenerated at every logoff, so they are board DATA and committing one to
 * feed a test would be committing a generated file. Only bull1..bull6 are
 * tracked, bull8 was not among them and is not even on the author's disk any
 * more, so the whole file was red in every checkout. The prose is what the
 * case is about - 76 columns, no ANSI - and the test can state it exactly.
 * bull1.txt stays real because it IS tracked and because a hand-written ANSI
 * table would not prove the art detector sees the board's own art.
 * See `tests/repo/tracked-fixtures.test.ts`.
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

const PROSE_BULLETIN = 8;
/** Read from `Bulletins/bull1.txt`, which git tracks. */
const TABLE_BULLETIN = 1;

/**
 * The prose bulletin, at the board's 76-column measure and in plain ASCII.
 *
 * Every property the three prose cases assert is here on purpose: rows longer
 * than 40 columns so a PETSCII caller MUST see them folded, not one escape
 * byte so the art detector has nothing to skip, and no word longer than 40
 * characters so a correct wrap can never overflow.
 */
const PROSE_LINES = [
  'This BBS is a PRIVATE SYSTEM. Only private citizens who are not employed',
  'by any government agency, and who have read and accepted the terms set',
  'out below, are granted an account here. Uploading is not a duty and',
  'downloading is not a right; the decision on either one is the sysop\'s.',
  '',
  'Messages left in the conferences remain the property of the people who',
  'wrote them. They are backed up nightly and are read by nobody but their',
  'recipient. Post as though your mother were reading, so that the rules on',
  'language, on warez and on plain personal abuse never have to be quoted at',
  'you, and so that the privacies of everyone who calls here are not',
  'violated.',
];

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bulletin-drive-'));
  const bullDir = path.join(root, 'Conf1', 'Screens', 'Bulletins');
  fs.mkdirSync(bullDir, { recursive: true });
  // BullHelp.txt must exist or the command reports "no bulletins" and returns.
  fs.writeFileSync(path.join(bullDir, 'BullHelp.txt'), Buffer.from('Bulletins\r\n', 'latin1'));
  fs.writeFileSync(
    path.join(bullDir, `Bull${PROSE_BULLETIN}.txt`),
    Buffer.from(`${PROSE_LINES.join('\n')}\n`, 'latin1')
  );
  fs.writeFileSync(
    path.join(bullDir, `Bull${TABLE_BULLETIN}.txt`),
    fs.readFileSync(path.join(REPO_ROOT, 'Bulletins', 'bull1.txt'))
  );

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

describe('handleReadBulletinCommand on real bulletin bytes', () => {
  it('the prose bulletin really is what the cases claim it is', () => {
    // The fixture is the premise of the three cases below, so it is checked
    // rather than trusted: over 40 columns, under 80, and no ANSI at all.
    const longest = Math.max(...PROSE_LINES.map((l) => l.length));
    expect(longest).toBeGreaterThan(40);
    expect(longest).toBeLessThanOrEqual(76);
    expect(PROSE_LINES.join('\n')).not.toMatch(/\x1b|\x9b/);
    expect(Math.max(...PROSE_LINES.flatMap((l) => l.split(' ').map((w) => w.length))))
      .toBeLessThanOrEqual(40);
  });

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
