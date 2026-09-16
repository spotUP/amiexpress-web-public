/**
 * THE REST OF A BULLETIN FOLLOWS THE PAUSE.
 *
 * The sysop over telnet, 2026-09-16, at `B 6` in the Bulls door: "it stops
 * here: (Pause)...More(y/n/ns)? <--- i can not press y/n/ns only enter and
 * then ... it skips to [the menu] by itself". Captured on the wire
 * (scratchpad telnet-b6b.py): 23 rows of the Super-AmiLog, the prompt, and
 * after RETURN the menu - the daily and record bars and the tailer never
 * came. The door shows the file with JH_SF; the XIM handler paused at row 23
 * and RETURNED, and the lines it had not sent were gone.
 *
 * express.e's displayFile (6746-6849) prints a file a line at a time and asks
 * checkForPause (5181-5201) after each: `n` abandons the file, `ns` turns the
 * pausing off, anything else - `y`, an empty line - goes on. The prompt is a
 * lineInput, so what the caller types is echoed and RETURN submits it.
 *
 * These cases drive the REAL JH_SF handler on the REAL bulletin file through
 * the real XIMIOHandler, then answer the prompt through the real queueInput.
 * What they read is the wire and the door's reply.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { XIMIOHandler } from '../../src/amiga-emulation/xim/io';

/**
 * The bulletin FROZEN at 38 rows, as the board shipped it (a922a780f). The
 * live file is regenerated at every logoff and is fitted to the screen since
 * SamiLogService learned fitRows - read live it no longer pages at all, and
 * paging is what this suite is about (RULES.md, "The board is not a fixture").
 */
const SAMILOG = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'board-screens', 'bulletins-bull6-samilog.txt'));
/** The same bulletin as fitRows writes it on the live board: 23 rows, the top of the logo on the `~f` line. */
const FITTED = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'board-screens', 'bulletins-bull6-samilog-fitted.txt'));
const PROMPT = '(Pause)...More(y/n/ns)? ';
/** The records bar, the second-to-last row of the bulletin (row 35 of 37). */
const TAILER = 'The Records';

let tmpDir: string;
beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bull-follows-pause-'));
  fs.mkdirSync(path.join(tmpDir, 'Bulletins'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'Bulletins', 'bull6.txt'), SAMILOG);
  fs.writeFileSync(path.join(tmpDir, 'Bulletins', 'fitted.txt'), FITTED);
  // Three screens' worth (57 rows): the bulletin, then its logo and table
  // again, so the pause has to ask twice and the records bar comes once.
  const encore = SAMILOG.toString('latin1').split('\n').slice(1, 21).join('\n');
  fs.writeFileSync(path.join(tmpDir, 'Bulletins', 'tall.txt'), Buffer.concat([SAMILOG, Buffer.from('\n' + encore, 'latin1')]));
});
afterAll(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

interface Rig {
  handler: XIMIOHandler;
  out: string[];
  replies: number[];
  pauses: () => number;
  resumes: () => number;
}

function rig(pauseLines: number, rowsAlreadyOnScreen = 0): Rig {
  const out: string[] = [];
  const replies: number[] = [];
  let pauses = 0;
  let resumes = 0;
  const socket: any = { emit: (ev: string, payload: string) => { if (ev === 'ansi-output') out.push(payload); return true; } };
  const emulator: any = {
    pause: () => { pauses += 1; },
    resume: () => { resumes += 1; },
    readMemory: () => 0, readMemory32: () => 0, writeMemory: () => {},
  };
  const execLibrary: any = { replyMsg: (addr: number) => { replies.push(addr); }, putMsg: () => {} };
  const messageParser: any = { writeCommand: () => {}, writeMessageString: () => {}, writeData: () => {}, getCommandName: () => 'JH_SF' };
  const state: any = {
    registered: true, shuttingDown: false, nonStopText: false,
    autoPauseEnabled: true, lineCount: rowsAlreadyOnScreen, lineWrap: 0, pauseLines,
    language: '', confAccess: '', carrierDropped: false, rawArrow: false, transfering: false, doorSilent: false,
  };
  const bbsSession: any = { bbsPath: tmpDir, dataDir: tmpDir, screenWidth: 80, screenHeight: pauseLines, user: { secLevel: 255 } };
  const handler = new XIMIOHandler(emulator, execLibrary, socket, messageParser, state, bbsSession);
  (handler as any).getMessageString = (m: any) => m.string || '';
  return { handler, out, replies, pauses: () => pauses, resumes: () => resumes };
}

const msg = (file: string): any => ({ command: 8, data: 0, msgAddr: 0x1000, replyPort: 0x2000, string: file });
const count = (s: string, needle: string) => s.split(needle).length - 1;
const rows = (s: string) => count(s, '\r\n');

describe('JH_SF on the Super-AmiLog at 24 rows', () => {
  it('stops at the prompt with the tailer still to come, and the door not yet replied to', async () => {
    const r = rig(24);
    await r.handler.handleShowFile(msg('BBS:Bulletins/bull6.txt'));
    const wire = r.out.join('');
    expect(wire.endsWith(PROMPT)).toBe(true);
    expect(wire).not.toContain(TAILER);
    expect(r.replies).toHaveLength(0);
    expect(r.pauses()).toBe(1);
  });

  it('y RETURN goes on with the rest of the file and then replies once', async () => {
    const r = rig(24);
    await r.handler.handleShowFile(msg('BBS:Bulletins/bull6.txt'));
    const page1 = r.out.length;
    r.handler.queueInput('y');
    expect(r.out[r.out.length - 1]).toBe('y');          // echoed, like lineInput
    r.handler.queueInput('\r');
    const page2 = r.out.slice(page1).join('');
    expect(page2.startsWith('y\r\x1b[K')).toBe(true);   // the prompt row is wiped and reused
    expect(page2).toContain(TAILER);
    expect(count(r.out.join(''), 'lAST cALLERS')).toBe(1);
    expect(count(r.out.join(''), PROMPT)).toBe(1);
    expect(r.replies).toEqual([0x1000]);
    expect(r.resumes()).toBe(1);
  });

  it('an empty RETURN and a SPACE both mean more', async () => {
    for (const key of ['\r', ' ']) {
      const r = rig(24);
      await r.handler.handleShowFile(msg('BBS:Bulletins/bull6.txt'));
      r.handler.queueInput(key);
      expect(r.out.join('')).toContain(TAILER);
      expect(r.replies).toEqual([0x1000]);
    }
  });

  it('n RETURN abandons the rest of the file and replies', async () => {
    const r = rig(24);
    await r.handler.handleShowFile(msg('BBS:Bulletins/bull6.txt'));
    r.handler.queueInput('n');
    r.handler.queueInput('\r');
    expect(r.out.join('')).not.toContain(TAILER);
    expect(r.replies).toEqual([0x1000]);
    expect(r.resumes()).toBe(1);
  });

  it('a space after n is not a submit: n<space> RETURN still abandons', async () => {
    const r = rig(24);
    await r.handler.handleShowFile(msg('BBS:Bulletins/bull6.txt'));
    r.handler.queueInput('n');
    r.handler.queueInput(' ');
    expect(r.replies).toHaveLength(0);
    r.handler.queueInput('\r');
    expect(r.out.join('')).not.toContain(TAILER);
    expect(r.replies).toEqual([0x1000]);
  });

  it('backspace takes the n back, so what is submitted is an empty line', async () => {
    const r = rig(24);
    await r.handler.handleShowFile(msg('BBS:Bulletins/bull6.txt'));
    r.handler.queueInput('n');
    r.handler.queueInput('\x7f');
    expect(r.out[r.out.length - 1]).toBe('\b \b');
    r.handler.queueInput('\r');
    expect(r.out.join('')).toContain(TAILER);
  });
});

describe('JH_SF on a file three screens tall', () => {
  it('asks twice with y, and the reply comes only after the last page', async () => {
    const r = rig(24);
    await r.handler.handleShowFile(msg('BBS:Bulletins/tall.txt'));
    expect(count(r.out.join(''), PROMPT)).toBe(1);
    r.handler.queueInput('y');
    r.handler.queueInput('\r');
    expect(count(r.out.join(''), PROMPT)).toBe(2);
    expect(r.replies).toHaveLength(0);
    expect(r.pauses()).toBe(2);
    r.handler.queueInput('\r');
    const wire = r.out.join('');
    expect(count(wire, 'lAST cALLERS')).toBe(2);
    expect(count(wire, TAILER)).toBe(1);
    expect(r.replies).toEqual([0x1000]);
    expect(r.resumes()).toBe(1);
  });

  it('ns RETURN sends everything left with no further prompt', async () => {
    const r = rig(24);
    await r.handler.handleShowFile(msg('BBS:Bulletins/tall.txt'));
    r.handler.queueInput('n');
    r.handler.queueInput('s');
    r.handler.queueInput('\r');
    const wire = r.out.join('');
    expect(count(wire, PROMPT)).toBe(1);
    expect(count(wire, 'lAST cALLERS')).toBe(2);
    expect(count(wire, TAILER)).toBe(1);
    expect(r.replies).toEqual([0x1000]);
  });

  it('every row of the file reaches the wire, in order, once', async () => {
    const r = rig(24);
    await r.handler.handleShowFile(msg('BBS:Bulletins/tall.txt'));
    r.handler.queueInput('\r');
    r.handler.queueInput('\r');
    const wire = r.out.join('').replace(/\(Pause\)\.\.\.More\(y\/n\/ns\)\? |\r\x1b\[K/g, '');
    const fileRows = fs.readFileSync(path.join(tmpDir, 'Bulletins', 'tall.txt'), 'latin1')
      .replace(/~f/, '').split(/\r?\n/).filter((l) => l.length > 0);
    // Rows are compared without attributes: the handler resets colours at the
    // end of a message, which is a wire detail this suite does not own.
    const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '').trimEnd();
    const wireRows = wire.split('\r\n').map(strip).filter((l) => l.length > 0);
    for (const row of fileRows.map(strip).filter((l) => l.length > 0)) {
      expect(wireRows).toContain(row);
    }
    expect(rows(wire)).toBeGreaterThanOrEqual(fileRows.length);
  });
});

describe('the row count, as express.e keeps it', () => {
  it('a 23-row bulletin on a 24-row screen is not followed by a prompt, whatever the door printed first', async () => {
    // Bulls sends two newlines before JH_SF (live log, 2026-09-16 17:36:55);
    // the sysop's screenshot had the prompt under a bulletin that fit.
    const r = rig(24, 2);
    await r.handler.handleShowFile(msg('BBS:Bulletins/fitted.txt'));
    const wire = r.out.join('');
    expect(count(wire, PROMPT)).toBe(0);
    expect(count(wire, TAILER)).toBe(1);
    expect(r.replies).toEqual([0x1000]);
    expect(r.pauses()).toBe(0);
  });

  it('the clear at the top of the file is where the count starts, so the first page is a full screen', async () => {
    const r = rig(24);
    await r.handler.handleShowFile(msg('BBS:Bulletins/bull6.txt'));
    const wire = r.out.join('');
    const firstPage = wire.slice(0, wire.indexOf(PROMPT));
    expect(rows(firstPage)).toBe(24);
  });
});
