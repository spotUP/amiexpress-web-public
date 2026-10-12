/**
 * FM says what express.e's internalCommandFM says, and goes where it goes.
 *
 * Tier-5 invented-text audit (thoughts/spot/notes/2026-10-12_tier5-file-maintenance.md).
 * The port printed texts express.e has not got - "Are you sure you want to
 * delete this file (Y/n)?", "Removed X from flagged list", "File maintenance
 * complete." + "Press any key to continue...", "Move operation successful to
 * directory N", a `(Upload)` tag on the scanning line - asked "Remove from
 * flagged list" after (C)ontinue too, and kept going after a refused move.
 *
 * Driven from the FM command's target (command.handler `case 'FM'`) with every
 * key through the transports' dispatchInOrder and handleCommand, so the line states, the state router and the
 * awaited inputs (utils/await-input) are all on the path.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { config } from '../../src/config';
import { handleCommand } from '../../src/handlers/command.handler';
import { FileMaintenanceHandler, setFileMaintenanceDependencies } from '../../src/handlers/file/file-maintenance.handler';
import { FileFlagManager } from '../../src/utils/file-flag.util';
import { setConferences } from '../../src/handlers/screen.handler';
import { LoggedOnSubState } from '../../src/constants/bbs-states';
import { dispatchInOrder } from '../../src/server/terminal-input';

/** `filename(12) + status + size + mm-dd-yy + description`, as the board writes it. */
function dirLine(name: string, date: string): string {
  return `${name.padEnd(12).slice(0, 12)} N  123456  ${date}  a file`;
}

let root: string;
const savedData = process.env.BBS_DATA_DIR;
const realGet = config.get.bind(config);
jest.spyOn(config, 'get').mockImplementation(((key: string) => (key === 'dataDir' ? root : realGet(key as any))) as any);

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-express-'));
  process.env.BBS_DATA_DIR = root;
  for (const conf of ['Conf1', 'Conf2']) {
    fs.mkdirSync(path.join(root, conf, 'Files'), { recursive: true });
    fs.writeFileSync(path.join(root, `${conf}.info`), 'NDIRS=1\n');
  }
  fs.writeFileSync(path.join(root, 'Conf1', 'Files', 'ONE.LHA'), 'ONE');
  fs.writeFileSync(path.join(root, 'Conf1', 'Files', 'TWO.LHA'), 'TWO');
  fs.writeFileSync(path.join(root, 'Conf1', 'DIR1'),
    [dirLine('ONE.LHA', '03-01-24'), `${' '.repeat(33)}second line of ONE`, dirLine('TWO.LHA', '04-01-24')].join('\n') + '\n');
  fs.writeFileSync(path.join(root, 'Conf2', 'DIR1'), dirLine('THERE.LHA', '01-01-20') + '\n');
  setConferences([
    { id: 1, name: 'General', description: '', created: new Date(), updated: new Date() },
    { id: 2, name: 'Amiga', description: '', created: new Date(), updated: new Date() },
  ] as any);
  setFileMaintenanceDependencies({ db: undefined, config: { get: (key: string) => (key === 'dataDir' ? root : undefined) } });
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

afterAll(() => {
  if (savedData === undefined) delete process.env.BBS_DATA_DIR;
  else process.env.BBS_DATA_DIR = savedData;
});

function caller(opts: { flagged?: string[]; confAccess?: string } = {}) {
  const out: string[] = [];
  const socket: any = { id: `fm-${Math.random()}`, emit: (_e: string, t: any) => out.push(String(t)), on() {}, off() {}, removeListener() {} };
  const flagManager = new FileFlagManager(root, 1, 1);
  for (const name of opts.flagged ?? []) flagManager.addFlag(name, 1);
  const session: any = {
    state: 'loggedon',
    subState: LoggedOnSubState.PROCESS_COMMAND,
    nodeId: 1,
    currentConf: 1,
    currentMsgBase: 1,
    screenWidth: 80,
    flagManager,
    tempData: {},
    user: {
      id: 1, username: 'sysop', secLevel: 255, slotNumber: 1,
      securityFlags: 'T'.repeat(100), confAccess: opts.confAccess ?? 'XX', userFlags: 0,
    },
  };
  const settle = () => new Promise((r) => setTimeout(r, 40));
  // The transports' own dispatcher: keys in order, and a key a parked
  // await-input procedure is waiting for goes straight to it.
  const type = async (text: string) => {
    for (const ch of text) {
      dispatchInOrder(session, [ch], (piece) => handleCommand(socket, session, piece), (err) => { throw err; });
      await new Promise((r) => setTimeout(r, 5));
    }
    await settle();
  };
  const take = () => { const t = out.join(''); out.length = 0; return t; };
  const start = async () => {
    // Not awaited: with flagged files FM waits on yesNo inside the command.
    void FileMaintenanceHandler.handleFileMaintenanceCommand(socket, session, '');
    await settle();
  };
  return { socket, session, type, take, settle, start };
}

const ACTIONS = '\x1b[32m(\x1b[33mC\x1b[32m)\x1b[36montinue, \x1b[32m(\x1b[33mD\x1b[32m)\x1b[36melete, \x1b[32m(\x1b[33mM\x1b[32m)\x1b[36move, \x1b[32m(\x1b[33mV\x1b[32m)\x1b[36miew, \x1b[32m(\x1b[33mQ\x1b[32m)\x1b[36muit\x1b[0m? ';
const YES_NO = '\x1b[32m(\x1b[33mY\x1b[32m/\x1b[33mn\x1b[32m)\x1b[32m?\x1b[0m ';

describe('FM on flagged files', () => {
  it('asks with yesNo(1), answers on one key, and does not ask "Remove" after Continue', async () => {
    const c = caller({ flagged: ['ONE.LHA'] });
    await c.start();
    // express.e:24926-24929
    expect(c.take()).toBe(`\r\nYou have flagged files, do you wish to work with these files ${YES_NO}`);

    await c.type('y'); // one key, no Enter (yesNo, express.e:2129)
    expect(c.take()).toContain('Yes\r\n\r\n');

    await c.type('1\r');
    const shown = c.take();
    // express.e:24979 - the upload directory (NDIRS=1) has no "(Upload)" tag.
    expect(shown).toContain('Scanning directory 1\r\n');
    expect(shown).not.toContain('(Upload)');
    // The entry and its description line (27485-27503), then the actions.
    expect(shown).toContain(`${' '.repeat(33)}second line of ONE\r\n\r\n${ACTIONS}`);

    await c.type('c'); // 27511: Continue is '\b\n' and the next match - no Remove prompt
    const after = c.take();
    expect(after).not.toContain('Remove from flagged list');
    expect(after).not.toContain('File maintenance complete');
    expect(after).not.toContain('Press any key');
    expect(c.session.flagManager.getAll()).toHaveLength(1);
  });

  it('D deletes at once with express\'s texts, then asks "Remove from flagged list" and removes silently', async () => {
    const c = caller({ flagged: ['ONE.LHA'] });
    await c.start();
    await c.type('y');
    await c.type('1\r');
    c.take();

    await c.type('d');
    const deleted = c.take();
    expect(deleted).not.toContain('Are you sure');
    expect(deleted).toContain('\r\n\r\nRemoving from directory list, please wait..'
      + '\r\nRemoving from download folder, please wait..'
      + '\r\n\r\nDelete operation complete \r\n'
      + `\r\nRemove from flagged list${YES_NO}`);
    expect(fs.readFileSync(path.join(root, 'Conf1', 'DIR1'), 'latin1')).not.toContain('ONE.LHA');

    await c.type('\r');
    const removed = c.take();
    expect(removed.startsWith('Yes\r\n')).toBe(true);
    expect(removed).not.toContain('from flagged list');
    expect(c.session.flagManager.getAll()).toHaveLength(0);
  });
});

describe('FM move', () => {
  async function atTwo(c: ReturnType<typeof caller>) {
    await c.start();
    await c.type('TWO.LHA\r');
    await c.type('1\r');
    c.take();
  }

  it('lists conferences under express\'s heading and says "Move operation successful" with no directory number', async () => {
    const c = caller();
    await atTwo(c);

    await c.type('m');
    expect(c.take()).toContain('\r\n\r\nConference Number to move to (L to List): ');
    await c.type('L\r');
    // express.e:27030-27032: the spaces come before [32m, and nothing resets it.
    expect(c.take()).toContain('\r\n\r\n                                 \x1b[32mConference List\r\n\r\n');
    await c.type('2\r');
    const chosen = c.take();
    expect(chosen).toContain('\r\nYou have chosen conference: Amiga\r\n');
    expect(chosen).toContain('\r\nDirectory to move to: (1-1), (A)uto, (Enter)=abort? ');

    await c.type('1\r');
    const moved = c.take();
    expect(moved).toContain('\r\nUpdating directory list, please wait..\r\nMoving file, please wait..\r\n\r\nMove operation successful \r\n');
    expect(moved).not.toContain('to directory');
    expect(fs.readFileSync(path.join(root, 'Conf2', 'DIR1'), 'latin1')).toContain('TWO.LHA');
  });

  it('a conference the sysop cannot join ends FM, as getMoveConf\'s failure does', async () => {
    const c = caller({ confAccess: 'X_' });
    await atTwo(c);

    await c.type('m');
    await c.type('2\r');
    const refused = c.take();
    expect(refused).toContain('\r\nYou do not have access to the requested conference\r\n\r\n');
    // 25008-25011: RESULT_FAILURE raises out of FM - no more files, no prompt again.
    expect(refused).not.toContain('Continue');
    expect(c.session.subState).not.toBe(LoggedOnSubState.FM_SCAN);
    expect(fs.readFileSync(path.join(root, 'Conf1', 'DIR1'), 'latin1')).toContain('TWO.LHA');
  });
});

describe('FM follows express.e on Q, typed names and ^C', () => {
  async function atOne(c: ReturnType<typeof caller>) {
    await c.start();
    await c.type('ONE.LHA\r');
    await c.type('1\r');
    c.take();
  }

  it('a capital Q does not quit: only lowercase q does (express.e:25019)', async () => {
    const c = caller();
    await atOne(c);
    await c.type('Q');
    // Falls through (no flagged list here) and shows the same file again.
    expect(c.take()).toContain('ONE.LHA');
    expect(c.session.subState).toBe(LoggedOnSubState.FM_SCAN);
    await c.type('q');
    c.take();
    expect(c.session.subState).not.toBe(LoggedOnSubState.FM_SCAN);
  });

  it('a typed wildcard is not expanded: the directory name is the pattern (express.e:27444-27470)', async () => {
    const c = caller();
    await c.start();
    await c.type('*.LHA\r');
    await c.type('1\r');
    const shown = c.take();
    expect(shown).toContain('Scanning directory 1\r\n');
    expect(shown).not.toContain('ONE.LHA');
    expect(shown).not.toContain('Continue');
  });

  it('^C during the search prints **Break and leaves FM (express.e:27436-27442, 24993)', async () => {
    const c = caller();
    c.session.subState = LoggedOnSubState.FM_SCAN;
    // A ^C reaches FM_SCAN's handler through handleCommand (checkInput + readChar=3).
    await handleCommand(c.socket, c.session, '\x03');
    expect(c.session.tempData.fmBreak).toBe(true);
    // The search sees a ^C that arrived while it was reading: model that key
    // as already pending when the loop looks (the search clears the flag as it starts).
    Object.defineProperty(c.session.tempData, 'fmBreak', { get: () => true, set: () => undefined });
    const search = (FileMaintenanceHandler as any).maintenanceFileSearch(
      c.socket, c.session, false, 1, 1, ['ONE.LHA'], 0);
    expect(await search).toBe('break');
    const shown = c.take();
    expect(shown).toContain('**Break\r\n');
    expect(shown).not.toContain('Continue');
  });
});
