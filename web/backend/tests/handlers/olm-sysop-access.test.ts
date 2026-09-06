/**
 * "The sysop can open OLM."
 *
 * The report, verbatim: "olm says min security level 20 but i get access denied
 * even with my sysop user".
 *
 * Two different gates answer for OLM, and only one of them is the `ACCESS=020`
 * he was reading:
 *
 *   1. `Commands/BBSCmd/Olm.info` carries `ACCESS=020`. That is the BBSCMD
 *      tier's gate (`command-execution.handler.ts` runCommand, express.e:4700)
 *      and it compares the user's secLevel against 20. Failing it prints
 *      "Command requires higher access." - a DIFFERENT string.
 *   2. `handleOlmCommand` (olm.handler.ts, express.e:25416) gates on
 *      `checkSecurity(ACS_OLM)`, which resolves through `Access/ACS.<level>.info`.
 *      Failing THAT used to print "Access denied." - the string he saw. That
 *      string was invented by this port; express.e:25416 returns
 *      RESULT_NOT_ALLOWED and the handler prints nothing at all, so it is gone
 *      and a refused caller now sees NOTHING from the handler.
 *
 * So the denial is gate 2, and gate 2 reads the board's ACS tooltype files.
 * These tests pin that mechanism from both ends so the next person does not
 * have to re-derive it:
 *
 *   - checkSecurity's answer for the sysop's real security level EQUALS what
 *     an independent reader finds in the live `Access/ACS.<level>.info`. That
 *     holds whether or not the grant is ever added, and it is the standing
 *     proof that the lookup is not consulting the SQL mirror, a stale cache,
 *     or a default.
 *   - A sysop-level user whose ACS level DOES carry `ACS.OLM` reaches the OLM
 *     node prompt; the same user without it is refused. Same for `Q` and
 *     `ACS.QUIET_NODE`, because `Q` is refused by the identical mechanism and
 *     the two were reported as one complaint.
 *
 * The fixtures are the board's OWN `Access/*.info` bytes, copied to a temp
 * board and edited there. Nothing under the live `Access/` is written.
 *
 * The answer this file records: the grant was MISSING DATA, not a bug. No
 * `Access/ACS.<level>.info` on this board carried `ACS.OLM` at any level -
 * 10, 20, 50, 60 or 255 - so the internal OLM command refused every caller,
 * the level-255 account included. `ACS.QUIET_NODE` shipped commented out at
 * 10/20/50/60 and absent at 255, so `Q` was refused the same way.
 *
 * The sysop has since granted both at HIS two levels only - 20 (`spot`) and
 * 255 (`sysop`) - and the last describe block pins that against the LIVE
 * `Access/` bytes, including the deliberate absence at 10, 50 and 60.
 *
 * A refusal is now SILENT, which means "allowed" and "refused" can no longer
 * be told apart by looking for a denial string. Every test below therefore
 * asserts the positive evidence of the command having RUN (the OLM banner and
 * node prompt, the Quiet Mode line, the toggled flag) or the complete absence
 * of output. Never `not.toContain('Access denied')` on its own - that passes
 * on a refusal too.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { ACSPermission } from '../../src/constants/acs-permissions';
import { checkSecurity, setACSConfig } from '../../src/utils/acs.util';
import {
  loadAcsAccessFiles,
  findAcsLevel,
  resetAcsLoader,
} from '../../src/utils/acs-access-loader';
import {
  parseInfoFile,
  writeInfoFile,
  addTooltype,
  removeTooltype,
} from '../../src/utils/info-file.util';
import { LoggedOnSubState } from '../../src/constants/bbs-states';
import {
  handleOlmCommand,
  handleQuietCommand,
  setOlmDependencies,
} from '../../src/handlers/transfer/olm.handler';

// The live board. Read only - the guard in tests/live-data-guard.ts throws on
// any write that lands inside it, and nothing here writes.
const BOARD_ROOT = path.resolve(__dirname, '../../../..');
const LIVE_ACCESS = path.join(BOARD_ROOT, 'Access');
const LIVE_USER_DATA = path.join(BOARD_ROOT, 'user.data');

/**
 * Independent tooltype reader.
 *
 * Deliberately NOT `parseInfoFile` - the point of the first test is that the
 * production lookup agrees with the BYTES, and checking a parse with the same
 * parser that produced it proves nothing. This walks the DiskObject header
 * (78 bytes), skips DrawerData and both Gadget images, skips the default tool
 * string, and reads the length-prefixed ToolTypes array.
 */
function readTooltypesFromBytes(filePath: string): string[] {
  const d = fs.readFileSync(filePath);
  if (d.readUInt16BE(0) !== 0xe310) throw new Error(`${filePath}: not an .info`);

  const gadgetRender = d.readUInt32BE(22);
  const selectRender = d.readUInt32BE(26);
  const defaultTool = d.readUInt32BE(50);
  const toolTypes = d.readUInt32BE(54);
  const drawerData = d.readUInt32BE(66);

  let off = 78;
  if (drawerData) off += 56;
  const skipImage = (o: number): number => {
    const w = d.readInt16BE(o + 4);
    const h = d.readInt16BE(o + 6);
    const depth = d.readInt16BE(o + 8);
    return o + 20 + Math.ceil(w / 16) * 2 * h * depth;
  };
  if (gadgetRender) off = skipImage(off);
  if (selectRender) off = skipImage(off);
  if (defaultTool) off += 4 + d.readUInt32BE(off);

  const out: string[] = [];
  if (!toolTypes) return out;
  const entries = d.readUInt32BE(off) / 4 - 1;
  off += 4;
  for (let i = 0; i < entries; i++) {
    const len = d.readUInt32BE(off);
    off += 4;
    out.push(d.toString('latin1', off, off + len).replace(/\0+$/, ''));
    off += len;
  }
  return out;
}

/**
 * Is `key` GRANTED by these raw tooltype strings?
 *
 * AmigaOS tooltype semantics, same three rules the loader implements:
 * a name in parentheses is commented out and does not count; `=NO` is an
 * explicit denial; anything else present is a grant.
 */
function grantedInBytes(tooltypes: string[], key: string): boolean {
  for (const raw of tooltypes) {
    const commented = /^\s*\(.*\)\s*$/.test(raw);
    const body = commented ? raw.trim().slice(1, -1) : raw.trim();
    const eq = body.indexOf('=');
    const name = (eq === -1 ? body : body.slice(0, eq)).trim().toUpperCase();
    if (name !== key.toUpperCase()) continue;
    if (commented) return false;
    return (eq === -1 ? '' : body.slice(eq + 1).trim()).toUpperCase() !== 'NO';
  }
  return false;
}

/**
 * The board's real accounts, straight out of `user.data`.
 *
 * 232-byte records: name[31], pass[9], location[30], phoneNumber[13], one pad
 * byte, then slotNumber and secStatus as big-endian INTs
 * (UserFileManager.ts:640-654 writes the same layout).
 */
function realAccounts(): Array<{ name: string; secLevel: number }> {
  const d = fs.readFileSync(LIVE_USER_DATA);
  const REC = 232;
  const out: Array<{ name: string; secLevel: number }> = [];
  for (let i = 0; i + REC <= d.length; i += REC) {
    const name = d.toString('latin1', i, i + 31).split('\0')[0];
    if (!name) continue;
    out.push({ name, secLevel: d.readInt16BE(i + 86) });
  }
  return out;
}

function makeUser(secLevel: number): any {
  return {
    id: 'sysop-under-test',
    username: 'sysop',
    secLevel,
    securityFlags: '',
    secOverride: '',
    userFlags: 0,
  };
}

/** A temp board carrying a byte copy of the live `Access/` directory. */
function tempBoardWithLiveAccess(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'olm-acs-'));
  const dst = path.join(root, 'Access');
  fs.mkdirSync(dst);
  for (const f of fs.readdirSync(LIVE_ACCESS)) {
    if (!/^ACS\.\d+\.info$/i.test(f)) continue;
    fs.copyFileSync(path.join(LIVE_ACCESS, f), path.join(dst, f));
  }
  return root;
}

function captureSocket() {
  const output: string[] = [];
  return {
    output,
    text: () => output.join(''),
    socket: { emit: (event: string, data: any) => { if (event === 'ansi-output') output.push(String(data)); } } as any,
  };
}

describe('the sysop can open OLM', () => {
  const tempRoots: string[] = [];

  beforeEach(() => {
    resetAcsLoader();
    // The board's own defaults: no Default.info exists under Access/, so the
    // default-access tier contributes nothing and the ACS level file decides.
    setACSConfig({ overrideDefaultAccess: false, userSpecificAccess: false });
    setOlmDependencies({
      db: null,
      sessions: new Map(),
      io: null,
      setEnvStat: () => { /* no STATS@ file from a test */ },
      config: { get: (k: string) => (k === 'olmEnabled' ? true : undefined) },
    });
  });

  afterAll(() => {
    for (const r of tempRoots) fs.rmSync(r, { recursive: true, force: true });
    resetAcsLoader();
  });

  it('reads the sysop account out of the real user.data', () => {
    const accounts = realAccounts();
    expect(accounts.length).toBeGreaterThan(0);
    const top = Math.max(...accounts.map(a => a.secLevel));
    // Olm.info's ACCESS=020 is the BBSCMD gate. The board must still hold an
    // account that clears it, or the fixture below is meaningless.
    expect(top).toBeGreaterThanOrEqual(20);
  });

  it('answers ACS.OLM for the sysop exactly as the live Access/ bytes do', () => {
    const top = Math.max(...realAccounts().map(a => a.secLevel));

    loadAcsAccessFiles(BOARD_ROOT);
    const level = findAcsLevel(top);
    expect(level).toBeGreaterThan(0);

    const bytes = readTooltypesFromBytes(path.join(LIVE_ACCESS, `ACS.${level}.info`));

    // The production lookup and an independent read of the same file must not
    // disagree. If they ever do, checkSecurity has started answering from
    // somewhere other than the disk - the SQL mirror, a cache, or a default.
    expect(checkSecurity(makeUser(top), ACSPermission.OLM))
      .toBe(grantedInBytes(bytes, 'ACS.OLM'));
    expect(checkSecurity(makeUser(top), ACSPermission.QUIET_NODE))
      .toBe(grantedInBytes(bytes, 'ACS.QUIET_NODE'));
  });

  it('lets a sysop-level user whose ACS level grants ACS.OLM reach the node prompt', async () => {
    const top = Math.max(...realAccounts().map(a => a.secLevel));
    const root = tempBoardWithLiveAccess();
    tempRoots.push(root);

    loadAcsAccessFiles(root);
    const level = findAcsLevel(top);
    const acsFile = path.join(root, 'Access', `ACS.${level}.info`);

    // The data change under test, applied to the board's OWN file: grant OLM.
    let info = parseInfoFile(acsFile);
    info = removeTooltype(info, 'ACS.OLM');
    info = addTooltype(info, 'ACS.OLM', '');
    writeInfoFile(info);
    resetAcsLoader();
    loadAcsAccessFiles(root);

    expect(checkSecurity(makeUser(top), ACSPermission.OLM)).toBe(true);

    const cap = captureSocket();
    const session: any = { user: makeUser(top), nodeId: 1, subState: LoggedOnSubState.DISPLAY_MENU };
    await handleOlmCommand(cap.socket, session, '');

    expect(cap.text()).toContain('OLM MESSAGE SYSTEM');
    expect(cap.text()).toContain('OLM to Which Node?');
    expect(session.subState).toBe(LoggedOnSubState.OLM_NODE_INPUT);
  });

  it('refuses the same user when the ACS level does not grant ACS.OLM', async () => {
    const top = Math.max(...realAccounts().map(a => a.secLevel));
    const root = tempBoardWithLiveAccess();
    tempRoots.push(root);

    loadAcsAccessFiles(root);
    const level = findAcsLevel(top);
    const acsFile = path.join(root, 'Access', `ACS.${level}.info`);

    let info = parseInfoFile(acsFile);
    info = removeTooltype(info, 'ACS.OLM');
    writeInfoFile(info);
    resetAcsLoader();
    loadAcsAccessFiles(root);

    expect(checkSecurity(makeUser(top), ACSPermission.OLM)).toBe(false);

    const cap = captureSocket();
    const session: any = { user: makeUser(top), nodeId: 1, subState: LoggedOnSubState.DISPLAY_MENU };
    await handleOlmCommand(cap.socket, session, '');

    // express.e:25416 - RETURN RESULT_NOT_ALLOWED, and internalCommandOLM
    // prints nothing on the way out. The refused caller sees NOTHING: not
    // "Access denied." (this port invented that), not a banner, not a prompt.
    expect(cap.text()).toBe('');
    expect(session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
  });

  it('gates Q on ACS.QUIET_NODE through the identical mechanism', async () => {
    const top = Math.max(...realAccounts().map(a => a.secLevel));
    const root = tempBoardWithLiveAccess();
    tempRoots.push(root);

    loadAcsAccessFiles(root);
    const level = findAcsLevel(top);
    const acsFile = path.join(root, 'Access', `ACS.${level}.info`);

    // Denied first - a commented-out tooltype is exactly how ACS.10/20/50/60
    // ship `(ACS.QUIET_NODE)` today, and it must not read as a grant.
    let info = parseInfoFile(acsFile);
    info = removeTooltype(info, 'ACS.QUIET_NODE');
    info = addTooltype(info, 'ACS.QUIET_NODE', '', true);
    writeInfoFile(info);
    resetAcsLoader();
    loadAcsAccessFiles(root);

    const denied = captureSocket();
    const deniedSession: any = { user: makeUser(top), nodeId: 1, subState: LoggedOnSubState.DISPLAY_MENU, blockOLM: false };
    await handleQuietCommand(denied.socket, deniedSession);
    // express.e:25513-25514 - the ELSE arm of internalCommandQ is a bare
    // RETURN RESULT_NOT_ALLOWED. Silent, exactly like OLM.
    expect(denied.text()).toBe('');
    expect(deniedSession.blockOLM).toBe(false);
    expect(deniedSession.subState).toBe(LoggedOnSubState.DISPLAY_MENU);

    // Granted - uncommenting the same line is the whole data change.
    info = parseInfoFile(acsFile);
    info = removeTooltype(info, 'ACS.QUIET_NODE');
    info = addTooltype(info, 'ACS.QUIET_NODE', '');
    writeInfoFile(info);
    resetAcsLoader();
    loadAcsAccessFiles(root);

    const allowed = captureSocket();
    const allowedSession: any = { user: makeUser(top), nodeId: 1, subState: LoggedOnSubState.DISPLAY_MENU, blockOLM: false };
    await handleQuietCommand(allowed.socket, allowedSession);
    expect(allowed.text()).toContain('Quiet Mode On');
    expect(allowedSession.blockOLM).toBe(true);
  });
});

/**
 * The grant itself, proven against the LIVE `Access/` directory.
 *
 * `Access/ACS.20.info` and `Access/ACS.255.info` were edited through
 * `applyTooltypes` so the sysop's two accounts (`spot` at 20, `sysop` at 255)
 * carry `ACS.OLM` and `ACS.QUIET_NODE`. On 20 the QUIET_NODE entry existed but
 * was PARENTHESISED, which reads as a denial, so uncommenting it was a real
 * edit rather than a no-op.
 *
 * Levels 10, 50 and 60 were deliberately left alone: whether ordinary callers
 * may send online messages is board policy, not a bug fix. That absence is
 * pinned here too, because "grant it for the sysop" is only correct if it did
 * NOT leak to everybody.
 *
 * These read the real files, never a temp copy - a grant proven by re-reading
 * the file the test just wrote proves nothing about the board.
 */
describe("the sysop's own two levels carry the OLM grants", () => {
  beforeEach(() => {
    resetAcsLoader();
    setACSConfig({ overrideDefaultAccess: false, userSpecificAccess: false });
    setOlmDependencies({
      db: null,
      sessions: new Map(),
      io: null,
      setEnvStat: () => { /* no STATS@ file from a test */ },
      config: { get: (k: string) => (k === 'olmEnabled' ? true : undefined) },
    });
    loadAcsAccessFiles(BOARD_ROOT);
  });

  afterAll(() => resetAcsLoader());

  it.each([20, 255])('grants ACS.OLM and ACS.QUIET_NODE at level %i', level => {
    const bytes = readTooltypesFromBytes(path.join(LIVE_ACCESS, `ACS.${level}.info`));

    // Independent byte read first: the tooltypes are present AND live, not
    // parenthesised and not `=NO`.
    expect(grantedInBytes(bytes, 'ACS.OLM')).toBe(true);
    expect(grantedInBytes(bytes, 'ACS.QUIET_NODE')).toBe(true);

    // Then the production lookup, through findAcsLevel, must agree.
    expect(findAcsLevel(level)).toBe(level);
    expect(checkSecurity(makeUser(level), ACSPermission.OLM)).toBe(true);
    expect(checkSecurity(makeUser(level), ACSPermission.QUIET_NODE)).toBe(true);
  });

  it.each([10, 50, 60])('leaves level %i without either permission', level => {
    const bytes = readTooltypesFromBytes(path.join(LIVE_ACCESS, `ACS.${level}.info`));
    expect(grantedInBytes(bytes, 'ACS.OLM')).toBe(false);
    expect(grantedInBytes(bytes, 'ACS.QUIET_NODE')).toBe(false);
    expect(checkSecurity(makeUser(level), ACSPermission.OLM)).toBe(false);
    expect(checkSecurity(makeUser(level), ACSPermission.QUIET_NODE)).toBe(false);
  });

  it.each([20, 255])('opens the OLM node prompt for a level-%i caller', async level => {
    const cap = captureSocket();
    const session: any = { user: makeUser(level), nodeId: 1, subState: LoggedOnSubState.DISPLAY_MENU };
    await handleOlmCommand(cap.socket, session, '');

    // Positive evidence that the command RAN. A refusal is silent now, so an
    // absent denial string would prove nothing.
    expect(cap.text()).toContain('OLM MESSAGE SYSTEM');
    expect(cap.text()).toContain('OLM to Which Node?');
    expect(session.subState).toBe(LoggedOnSubState.OLM_NODE_INPUT);
  });

  it.each([20, 255])('toggles quiet mode for a level-%i caller', async level => {
    const cap = captureSocket();
    const session: any = {
      user: makeUser(level),
      nodeId: 1,
      subState: LoggedOnSubState.DISPLAY_MENU,
      blockOLM: false,
    };
    await handleQuietCommand(cap.socket, session);

    expect(cap.text()).toContain('Quiet Mode On');
    expect(session.blockOLM).toBe(true);
    expect(session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
  });

  it.each([10, 50, 60])('still refuses a level-%i caller, and does it in silence', async level => {
    const olm = captureSocket();
    const olmSession: any = { user: makeUser(level), nodeId: 1, subState: LoggedOnSubState.DISPLAY_MENU };
    await handleOlmCommand(olm.socket, olmSession, '');
    expect(olm.text()).toBe('');
    expect(olmSession.subState).toBe(LoggedOnSubState.DISPLAY_MENU);

    const quiet = captureSocket();
    const quietSession: any = {
      user: makeUser(level),
      nodeId: 1,
      subState: LoggedOnSubState.DISPLAY_MENU,
      blockOLM: false,
    };
    await handleQuietCommand(quiet.socket, quietSession);
    expect(quiet.text()).toBe('');
    expect(quietSession.blockOLM).toBe(false);
  });
});
