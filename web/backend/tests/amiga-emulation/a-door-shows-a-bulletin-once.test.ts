/**
 * A DOOR THAT SHOWS A BULLETIN SHOWS IT ONCE.
 *
 * Live, 2026-09-16, the sysop's scrollback after B then 6 in the Bulls door:
 * two rows of the Super-AmiLog logo, a stray line, then the whole screen
 * again ending in "(Pause)...More(y/n/ns)?". Months of "two exact same
 * super-amilog screens, one drew then quickly cleared". The board's own
 * displayScreen sends the file once (a-bulletin-is-drawn-once); this drives
 * the DOOR's route to the same file - JH_SF through the real XIMIOHandler.
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

let tmpDir: string;
beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'door-bull-once-'));
  fs.mkdirSync(path.join(tmpDir, 'Bulletins'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'Bulletins', 'bull6.txt'), SAMILOG);
});
afterAll(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

function handlerWith(pauseLines: number) {
  const out: string[] = [];
  const socket: any = { emit: (ev: string, payload: string) => { if (ev === 'ansi-output') out.push(payload); return true; } };
  const emulator: any = { pause: () => {}, resume: () => {}, readMemory: () => 0, readMemory32: () => 0, writeMemory: () => {} };
  const execLibrary: any = { replyMsg: () => {}, putMsg: () => {} };
  const messageParser: any = { writeCommand: () => {}, writeMessageString: () => {}, writeData: () => {}, getCommandName: () => 'JH_SF' };
  const state: any = {
    registered: true, shuttingDown: false, nonStopText: false,
    autoPauseEnabled: true, lineCount: 0, lineWrap: 0, pauseLines,
    language: '', confAccess: '', carrierDropped: false, rawArrow: false, transfering: false, doorSilent: false,
  };
  const bbsSession: any = { bbsPath: tmpDir, dataDir: tmpDir, screenWidth: 80, screenHeight: pauseLines, user: { secLevel: 255 } };
  const handler = new XIMIOHandler(emulator, execLibrary, socket, messageParser, state, bbsSession);
  (handler as any).getMessageString = (m: any) => m.string || '';
  return { handler, out };
}

const msg = (file: string): any => ({ command: 8, data: 0, msgAddr: 0x1000, replyPort: 0x2000, string: file });
const count = (s: string, needle: string) => s.split(needle).length - 1;

describe('JH_SF on the Super-AmiLog', () => {
  it('sends the art once on a screen it fits', async () => {
    const { handler, out } = handlerWith(30);
    await handler.handleShowFile(msg('BBS:Bulletins/bull6.txt'));
    expect(count(out.join(''), 'lAST cALLERS')).toBe(1);
  });

  it('sends the art once on a screen it does not fit, which is the caller\'s case', async () => {
    const { handler, out } = handlerWith(24);
    await handler.handleShowFile(msg('BBS:Bulletins/bull6.txt'));
    const wire = out.join('');
    expect(count(wire, 'lAST cALLERS')).toBe(1);
  });
});
