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
 *      RESULT_NOT_ALLOWED and prints nothing at all, so it is gone and a
 *      refused caller now sees NOTHING from the handler.
 *
 * So the denial was gate 2, and gate 2 reads the board's ACS tooltype files.
 * The cause was MISSING DATA, not a bug: no `Access/ACS.<level>.info` carried
 * `ACS.OLM` at any level, and `ACS.QUIET_NODE` shipped parenthesised - which
 * reads as a denial - at 10/20/50/60 and absent at 255. The grant was added
 * for the sysop's own two levels in commit c9d174630 and proved there against
 * the live board.
 *
 * WHAT THIS FILE MAY AND MAY NOT READ
 *
 * It may read `Access/*.info`: those 13 files are tracked, so they exist in
 * every checkout, and the suite only ever copies them to a temp board before
 * touching them.
 *
 * It may NOT read `user.data`. That file is gitignored (.gitignore:339), so a
 * fresh worktree and CI have no such file and the suite died with ENOENT on
 * `origin/main` (df95e0a3e). It was also reading the sysop's live account on
 * every run. Every account these tests need is now a fixture the test writes:
 * 232-byte records with `secStatus` as a big-endian INT at byte 86, the layout
 * `axobjects.e:11-68` describes and `UserFileManager` writes.
 *
 * It also must not depend on what the tracked `Access/` files HAPPEN to grant.
 * Every mechanism test edits its own temp copy, so granting or revoking a
 * permission on the real board cannot silently invert the thing under test,
 * and no test asserts "level 20 has OLM" - board policy is the sysop's to
 * change without failing a build.
 *
 * THE TRAP IN A SILENT REFUSAL
 *
 * A refused caller now sees nothing. So "allowed" and "refused" can no longer
 * be told apart by looking for a denial string, and `not.toContain('Access
 * denied')` passes on a refusal too. Every allowed case below asserts POSITIVE
 * evidence that the command ran - the OLM banner and node prompt, the Quiet
 * Mode line, the toggled flag - and every refused case asserts an entirely
 * empty transcript.
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

/** The tracked `Access/` directory. Read only, and only ever copied. */
const BOARD_ROOT = path.resolve(__dirname, '../../../..');
const TRACKED_ACCESS = path.join(BOARD_ROOT, 'Access');

/** The two fixture accounts. Levels chosen to match tracked ACS level files. */
const SYSOP_LEVEL = 255;
const MEMBER_LEVEL = 20;

const USER_RECORD_SIZE = 232;
const SLOT_OFFSET = 84;
const SEC_STATUS_OFFSET = 86;

/**
 * Independent tooltype reader.
 *
 * Deliberately NOT `parseInfoFile` - the point of the agreement test is that
 * the production lookup agrees with the BYTES, and checking a parse with the
 * same parser that produced it proves nothing. This walks the DiskObject
 * header (78 bytes), skips DrawerData and both Gadget images, skips the
 * default tool string, and reads the length-prefixed ToolTypes array.
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
 * Write a `user.data` FIXTURE.
 *
 * 232-byte records: name[31], pass[9], location[30], phoneNumber[13], one pad
 * byte, then slotNumber and secStatus as big-endian INTs (axobjects.e:11-68;
 * UserFileManager.serializeUserStruct writes the same layout). Only the three
 * fields the reader below looks at are filled - the rest stays zero, which is
 * what an untouched record holds anyway.
 */
function writeUserDataFixture(
  filePath: string,
  accounts: Array<{ name: string; secLevel: number }>
): void {
  const buf = Buffer.alloc(accounts.length * USER_RECORD_SIZE, 0);
  accounts.forEach((a, i) => {
    const base = i * USER_RECORD_SIZE;
    buf.write(a.name.slice(0, 30), base, 'latin1');
    buf.writeInt16BE(i + 1, base + SLOT_OFFSET);
    buf.writeInt16BE(a.secLevel, base + SEC_STATUS_OFFSET);
  });
  fs.writeFileSync(filePath, buf);
}

/** Read a `user.data` back. The reader the suite's own fixture must satisfy. */
function accountsFromUserData(filePath: string): Array<{ name: string; secLevel: number }> {
  const d = fs.readFileSync(filePath);
  const out: Array<{ name: string; secLevel: number }> = [];
  for (let i = 0; i + USER_RECORD_SIZE <= d.length; i += USER_RECORD_SIZE) {
    const name = d.toString('latin1', i, i + 31).split('\0')[0];
    if (!name) continue;
    out.push({ name, secLevel: d.readInt16BE(i + SEC_STATUS_OFFSET) });
  }
  return out;
}

function makeUser(secLevel: number, username = 'sysop'): any {
  return {
    id: `${username}-under-test`,
    username,
    secLevel,
    securityFlags: '',
    secOverride: '',
    userFlags: 0,
  };
}

/**
 * A temp board: a byte copy of the tracked `Access/*.info` files plus a
 * `user.data` the test wrote. Nothing under the real board is written.
 */
function tempBoard(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'olm-acs-'));
  const dst = path.join(root, 'Access');
  fs.mkdirSync(dst);
  for (const f of fs.readdirSync(TRACKED_ACCESS)) {
    if (!/^ACS\.\d+\.info$/i.test(f)) continue;
    fs.copyFileSync(path.join(TRACKED_ACCESS, f), path.join(dst, f));
  }
  writeUserDataFixture(path.join(root, 'user.data'), [
    { name: 'fixture_member', secLevel: MEMBER_LEVEL },
    { name: 'fixture_sysop', secLevel: SYSOP_LEVEL },
  ]);
  return root;
}

/** Every ACS level file the board tracks. */
function trackedAcsLevels(): number[] {
  return fs
    .readdirSync(TRACKED_ACCESS)
    .map(f => /^ACS\.(\d+)\.info$/i.exec(f))
    .filter((m): m is RegExpExecArray => m !== null)
    .map(m => parseInt(m[1], 10))
    .sort((a, b) => a - b);
}

/**
 * Put `key` into a temp board's ACS file in one of three states, then reload.
 * `absent` and `commented` are both denials; only `granted` is a grant.
 */
function setPermission(
  root: string,
  level: number,
  key: string,
  state: 'granted' | 'commented' | 'absent'
): void {
  const acsFile = path.join(root, 'Access', `ACS.${level}.info`);
  let info = parseInfoFile(acsFile);
  info = removeTooltype(info, key);
  if (state !== 'absent') info = addTooltype(info, key, '', state === 'commented');
  writeInfoFile(info);
  resetAcsLoader();
  loadAcsAccessFiles(root);
}

function captureSocket() {
  const output: string[] = [];
  return {
    output,
    text: () => output.join(''),
    socket: { emit: (event: string, data: any) => { if (event === 'ansi-output') output.push(String(data)); } } as any,
  };
}

const tempRoots: string[] = [];
function board(): string {
  const root = tempBoard();
  tempRoots.push(root);
  return root;
}

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

describe('the fixture accounts are readable the way AmiExpress reads them', () => {
  it('round-trips a 232-byte record through secStatus at byte 86', () => {
    const root = board();
    const accounts = accountsFromUserData(path.join(root, 'user.data'));

    expect(accounts).toEqual([
      { name: 'fixture_member', secLevel: MEMBER_LEVEL },
      { name: 'fixture_sysop', secLevel: SYSOP_LEVEL },
    ]);
    // Olm.info's ACCESS=020 is the BBSCMD gate. The fixture must still hold an
    // account that clears it, or the cases below are meaningless.
    expect(Math.max(...accounts.map(a => a.secLevel))).toBeGreaterThanOrEqual(20);
  });

  it('resolves each fixture level to a tracked ACS level file', () => {
    loadAcsAccessFiles(board());
    // findAcsLevel rounds down to the nearest 5 and walks down (express.e:3025).
    expect(findAcsLevel(SYSOP_LEVEL)).toBeGreaterThan(0);
    expect(findAcsLevel(MEMBER_LEVEL)).toBeGreaterThan(0);
  });
});

describe('checkSecurity answers from the ACS bytes and nowhere else', () => {
  // No policy is asserted here: whatever the tracked files say, the production
  // lookup must say the same. If these two ever disagree, checkSecurity has
  // started answering from the SQL mirror, a cache, or a default.
  it.each(trackedAcsLevels())('agrees with the raw bytes of ACS.%i.info', level => {
    loadAcsAccessFiles(BOARD_ROOT);
    const bytes = readTooltypesFromBytes(path.join(TRACKED_ACCESS, `ACS.${level}.info`));

    expect(checkSecurity(makeUser(level), ACSPermission.OLM))
      .toBe(grantedInBytes(bytes, 'ACS.OLM'));
    expect(checkSecurity(makeUser(level), ACSPermission.QUIET_NODE))
      .toBe(grantedInBytes(bytes, 'ACS.QUIET_NODE'));
  });

  it('reads a parenthesised tooltype as a denial, not a grant', () => {
    const root = board();
    const level = (loadAcsAccessFiles(root), findAcsLevel(SYSOP_LEVEL));

    setPermission(root, level, 'ACS.OLM', 'commented');
    expect(checkSecurity(makeUser(SYSOP_LEVEL), ACSPermission.OLM)).toBe(false);

    setPermission(root, level, 'ACS.OLM', 'granted');
    expect(checkSecurity(makeUser(SYSOP_LEVEL), ACSPermission.OLM)).toBe(true);
  });
});

describe.each([
  ['a sysop-level caller', SYSOP_LEVEL],
  ['a member-level caller', MEMBER_LEVEL],
])('OLM for %s', (_label, level) => {
  it('reaches the node prompt when the ACS level grants ACS.OLM', async () => {
    const root = board();
    loadAcsAccessFiles(root);
    setPermission(root, findAcsLevel(level), 'ACS.OLM', 'granted');
    expect(checkSecurity(makeUser(level), ACSPermission.OLM)).toBe(true);

    const cap = captureSocket();
    const session: any = { user: makeUser(level), nodeId: 1, subState: LoggedOnSubState.DISPLAY_MENU };
    await handleOlmCommand(cap.socket, session, '');

    // Positive evidence the command RAN. A refusal is silent, so an absent
    // denial string would prove nothing on its own.
    expect(cap.text()).toContain('OLM MESSAGE SYSTEM');
    expect(cap.text()).toContain('OLM to Which Node?');
    expect(session.subState).toBe(LoggedOnSubState.OLM_NODE_INPUT);
  });

  it('is refused, silently, when the ACS level does not grant ACS.OLM', async () => {
    const root = board();
    loadAcsAccessFiles(root);
    setPermission(root, findAcsLevel(level), 'ACS.OLM', 'absent');
    expect(checkSecurity(makeUser(level), ACSPermission.OLM)).toBe(false);

    const cap = captureSocket();
    const session: any = { user: makeUser(level), nodeId: 1, subState: LoggedOnSubState.DISPLAY_MENU };
    await handleOlmCommand(cap.socket, session, '');

    // express.e:25416 - RETURN RESULT_NOT_ALLOWED, and internalCommandOLM
    // prints nothing on the way out. Not "Access denied." (this port invented
    // that), not a banner, not a prompt.
    expect(cap.text()).toBe('');
    expect(session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
  });
});

describe.each([
  ['a sysop-level caller', SYSOP_LEVEL],
  ['a member-level caller', MEMBER_LEVEL],
])('Q for %s', (_label, level) => {
  it('toggles quiet mode when the ACS level grants ACS.QUIET_NODE', async () => {
    const root = board();
    loadAcsAccessFiles(root);
    setPermission(root, findAcsLevel(level), 'ACS.QUIET_NODE', 'granted');

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

  it('is refused, silently, when ACS.QUIET_NODE is only commented out', async () => {
    // A parenthesised entry is exactly how ACS.10/50/60 still ship
    // `(ACS.QUIET_NODE)`, and it must not read as a grant.
    const root = board();
    loadAcsAccessFiles(root);
    setPermission(root, findAcsLevel(level), 'ACS.QUIET_NODE', 'commented');

    const cap = captureSocket();
    const session: any = {
      user: makeUser(level),
      nodeId: 1,
      subState: LoggedOnSubState.DISPLAY_MENU,
      blockOLM: false,
    };
    await handleQuietCommand(cap.socket, session);

    // express.e:25513-25514 - the ELSE arm is a bare RETURN RESULT_NOT_ALLOWED.
    expect(cap.text()).toBe('');
    expect(session.blockOLM).toBe(false);
    expect(session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
  });
});

describe('OLM and Q are gated by their own separate permissions', () => {
  it('lets OLM through while Q is still refused', async () => {
    const root = board();
    loadAcsAccessFiles(root);
    const level = findAcsLevel(SYSOP_LEVEL);
    setPermission(root, level, 'ACS.OLM', 'granted');
    setPermission(root, level, 'ACS.QUIET_NODE', 'absent');

    const olm = captureSocket();
    const olmSession: any = { user: makeUser(SYSOP_LEVEL), nodeId: 1, subState: LoggedOnSubState.DISPLAY_MENU };
    await handleOlmCommand(olm.socket, olmSession, '');
    expect(olm.text()).toContain('OLM MESSAGE SYSTEM');

    const quiet = captureSocket();
    const quietSession: any = {
      user: makeUser(SYSOP_LEVEL),
      nodeId: 1,
      subState: LoggedOnSubState.DISPLAY_MENU,
      blockOLM: false,
    };
    await handleQuietCommand(quiet.socket, quietSession);
    expect(quiet.text()).toBe('');
    expect(quietSession.blockOLM).toBe(false);
  });

  it('lets Q through while OLM is still refused', async () => {
    const root = board();
    loadAcsAccessFiles(root);
    const level = findAcsLevel(SYSOP_LEVEL);
    setPermission(root, level, 'ACS.OLM', 'absent');
    setPermission(root, level, 'ACS.QUIET_NODE', 'granted');

    const quiet = captureSocket();
    const quietSession: any = {
      user: makeUser(SYSOP_LEVEL),
      nodeId: 1,
      subState: LoggedOnSubState.DISPLAY_MENU,
      blockOLM: false,
    };
    await handleQuietCommand(quiet.socket, quietSession);
    expect(quiet.text()).toContain('Quiet Mode On');
    expect(quietSession.blockOLM).toBe(true);

    const olm = captureSocket();
    const olmSession: any = { user: makeUser(SYSOP_LEVEL), nodeId: 1, subState: LoggedOnSubState.DISPLAY_MENU };
    await handleOlmCommand(olm.socket, olmSession, '');
    expect(olm.text()).toBe('');
    expect(olmSession.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
  });
});
