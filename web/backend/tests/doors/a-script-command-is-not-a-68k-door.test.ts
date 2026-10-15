/**
 * A command whose LOCATION is an AmigaDOS SCRIPT must not go to the emulator.
 *
 * "this is a bug we have had for ages, bulls not generating when they should"
 * (the sysop, 2026-09-14), and this is why.
 *
 * Every `Commands/SysCmd/LOGOFF<n>.info` on this board is `TYPE=SIM` with
 * `LOCATION=BBS:Batch<n>` - the logoff batch. AmigaDOS runs that because of
 * WHAT THE FILE IS: an executable starts with HUNK_HEADER and is LoadSeg'd,
 * anything else goes to the shell as a script. The tooltype never decides.
 *
 * This port sent every SIM through the 68K emulator, so the live log read:
 *
 *   [loadDoorManifestForExecution] Loading manifest for door: LOGOFF2, path: Batch2
 *   [loadDoorManifestForExecution] No manifest found for LOGOFF2
 *   [executeAmigaDoor] Starting Amiga door: LOGOFF2 (SIM)
 *   [CallersLog] Node2: Door exit: LOGOFF2
 *
 * A door that started and exited without executing one batch line. MultiTop
 * rebuilds bull1-bull5 from that file and SAmiLog rebuilds bull6, so no
 * bulletin ever regenerated - and the `G` logoff then sets `logoffBatchesRan`
 * on the strength of having "run" LOGOFF<n>, suppressing the fallback runner
 * that would have done it properly. Two failures hiding each other, no error
 * anywhere, which is how it survived so long.
 *
 * The rule is pinned on the BYTES, because that is what AmigaDOS reads and
 * because a name-based rule would break the moment a door is called `Batch`.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** The first four bytes of every AmigaDOS executable. */
const HUNK_HEADER = Buffer.from([0x00, 0x00, 0x03, 0xf3]);

function board(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'script-cmd-'));
}

function scriptPathFor(dir: string, location: string) {
  process.env.BBS_DATA_DIR = dir;
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { amigaDosScriptPath } = require('../../src/doors/amigados-script');
  return amigaDosScriptPath(location) as string | null;
}

describe('a command whose LOCATION is a script', () => {
  const made: string[] = [];
  const make = () => { const dir = board(); made.push(dir); return dir; };

  afterAll(() => {
    for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
  });

  test('the logoff batch is recognised as a script, not a door', () => {
    const dir = make();
    // The real shape: LOCATION=BBS:Batch2, a text file of batch lines.
    fs.writeFileSync(
      path.join(dir, 'Batch2'),
      '.key node\ndoors:multitop/mtop designs/x.dsg bbs:bulletins/bull1.txt\n' +
      'typescript:samilog -UC"1" -O"BBS:Bulletins/bull6.txt"15\n',
    );

    expect(scriptPathFor(dir, 'Batch2')).toBe(path.join(dir, 'Batch2'));
  });

  test('a real 68K binary is still a door, whatever it is called', () => {
    const dir = make();
    // Named like a batch file on purpose: the header decides, not the name.
    fs.writeFileSync(path.join(dir, 'Batch2'), Buffer.concat([HUNK_HEADER, Buffer.alloc(64)]));

    expect(scriptPathFor(dir, 'Batch2')).toBeNull();
  });

  test('a file that is not there is not a script', () => {
    const dir = make();

    expect(scriptPathFor(dir, 'Batch5')).toBeNull();
  });

  test('a directory is not a script', () => {
    const dir = make();
    fs.mkdirSync(path.join(dir, 'Batch3'));

    expect(scriptPathFor(dir, 'Batch3')).toBeNull();
  });

  test('a one-line batch shorter than a hunk header still counts', () => {
    const dir = make();
    fs.writeFileSync(path.join(dir, 'Batch4'), 'x\n');

    expect(scriptPathFor(dir, 'Batch4')).toBe(path.join(dir, 'Batch4'));
  });

  test('finds the file whatever case the tooltype used - AmigaDOS is case-insensitive', () => {
    const dir = make();
    /*
     * The real shape on this board: LOGOFF2.info says `BBS:Batch2`, the volume
     * holds `batch2`. A plain existsSync answered "not a script" for every
     * LOGOFF<n> on live and fell back to the emulator - the exact bug this
     * module exists to fix, surviving inside the fix.
     *
     * Asserted on WHAT THE PATH OPENS, not on how it is spelled: this test
     * runs on macOS, whose filesystem is case-insensitive, so `Batch2` would
     * open `batch2` there however badly the lookup behaved. The board runs on
     * Linux, where it would not. Reading the bytes back is the one check that
     * means the same thing on both.
     */
    const body = 'doors:multitop/mtop bbs:bulletins/bull1.txt\n';
    fs.writeFileSync(path.join(dir, 'batch2'), body);

    const found = scriptPathFor(dir, 'Batch2');
    expect(found).not.toBeNull();
    expect(fs.readFileSync(found!, 'utf8')).toBe(body);
  });

  test('no LOCATION at all is not a script', () => {
    const dir = make();

    expect(scriptPathFor(dir, '')).toBeNull();
  });
});

/**
 * And the board really does ship the commands this is about, so the rule is
 * aimed at something that exists rather than at a shape someone imagined.
 */
describe('the board LOGOFF commands', () => {
  const REPO = path.join(__dirname, '..', '..', '..', '..');

  test('declare TYPE=SIM with a Batch file for a LOCATION', () => {
    const icon = path.join(REPO, 'Commands', 'SysCmd', 'LOGOFF1.info');
    if (!fs.existsSync(icon)) return; // a checkout without the board's data

    const text = fs.readFileSync(icon, 'latin1');
    expect(text).toContain('LOCATION=BBS:Batch1');
    expect(text).toContain('TYPE=SIM');
  });
});
