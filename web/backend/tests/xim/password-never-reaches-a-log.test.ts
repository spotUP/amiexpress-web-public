/**
 * A password a door sends is written to none of the seven XIM log sinks of
 * XIMProtocol.handleMessage, nor to the parser's own dump.
 *
 * The sinks: console, the debug ring (debugRegistry), the XIM debug log
 * (xim-debug.log), the JSON logger, debugLog (console, DEBUG_68K), the Amiga
 * format log, and the door log. Four of them write files; those are asserted
 * by the content written, not only by console output.
 */
const SECRET = 'hunter2-Zq9';

// xim-debug.log and the door log both write through amigafs; keep what they
// are asked to write instead of writing it into the repo's logs/.
const mockFileWrites: string[] = [];
jest.mock('../../src/utils/amigafs', () => ({
  ...jest.requireActual('../../src/utils/amigafs'),
  appendFileSync: (_p: unknown, data: unknown) => { mockFileWrites.push(String(data)); },
  writeFileSync: (_p: unknown, data: unknown) => { mockFileWrites.push(String(data)); },
}));

// Every logger reads its switch when it is first loaded.
process.env.SKIP_DB_INIT = '1';
process.env.XIM_DEBUG = '1';
process.env.XIM_DEBUG_JSON = '1';
process.env.XIM_DEBUG_AMIGA = '1';
process.env.DEBUG_68K = '1';
process.env.NODE_ENV = 'development';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xim-redact-'));
process.env.XIM_LOG_FILE = path.join(logDir, 'xim.json');
process.env.XIM_AMIGA_LOG = path.join(logDir, 'xim-amiga.log');
// XIMLogger.initLogStream logs before its stream has created the file, which
// re-enters initLogStream without end; an existing file avoids that loop.
fs.writeFileSync(process.env.XIM_LOG_FILE, '');

const { XIMProtocol } = require('../../src/amiga-emulation/XIMProtocol');
const { XIMMessageParser } = require('../../src/amiga-emulation/xim/messages');
const { XIMCommand } = require('../../src/amiga-emulation/xim/types');
const { ximLogger } = require('../../src/utils/XIMLogger');
const { debugRegistry } = require('../../src/debug/DebugRegistry');

function makeEmulator() {
  const mem = new Map<number, number>();
  const w = (a: number, v: number, n: number) => { for (let i = 0; i < n; i++) mem.set(a + i, (v >>> (8 * (n - 1 - i))) & 0xff); };
  const r = (a: number, n: number) => { let v = 0; for (let i = 0; i < n; i++) v = v * 256 + (mem.get(a + i) ?? 0); return v; };
  return {
    readMemory: (a: number) => mem.get(a) ?? 0,
    writeMemory: (a: number, v: number) => { mem.set(a, v & 0xff); },
    readMemory8: (a: number) => mem.get(a) ?? 0,
    writeMemory8: (a: number, v: number) => { mem.set(a, v & 0xff); },
    readMemory16: (a: number) => r(a, 2),
    writeMemory16: (a: number, v: number) => w(a, v, 2),
    readMemory32: (a: number) => r(a, 4),
    writeMemory32: (a: number, v: number) => w(a, v, 4),
    readString: (addr: number, max = 200) => {
      let out = '';
      for (let i = 0; i < max; i++) { const b = mem.get(addr + i) ?? 0; if (b === 0) break; out += String.fromCharCode(b); }
      return out;
    },
    writeString: (addr: number, text: string) => {
      for (let i = 0; i < text.length; i++) mem.set(addr + i, text.charCodeAt(i));
      mem.set(addr + text.length, 0);
    },
  } as any;
}

describe('a password never reaches a log', () => {
  const written: string[] = [];
  let spies: jest.SpyInstance[] = [];

  beforeEach(() => {
    written.length = 0;
    mockFileWrites.length = 0;
    const take = (...a: unknown[]) => { written.push(a.map(String).join(' ')); };
    spies = [
      jest.spyOn(console, 'log').mockImplementation(take),
      jest.spyOn(console, 'error').mockImplementation(take),
      jest.spyOn(console, 'warn').mockImplementation(take),
      // The debug ring only keeps a registered node; capture what is pushed to it.
      jest.spyOn(debugRegistry, 'pushXIM').mockImplementation((_n: number, entry: unknown) => { written.push(JSON.stringify(entry)); }),
    ];
  });
  afterEach(() => { spies.forEach((s) => s.mockRestore()); });
  afterAll(() => { fs.rmSync(logDir, { recursive: true, force: true }); });

  async function sendThroughHandleMessage(command: number, data: number, text: string) {
    const emulator = makeEmulator();
    const MSG = 0x1000;
    emulator.writeString(MSG + 0x14, text);
    const session: any = {
      nodeId: 1, doorCommand: 'W',
      user: { id: 1, username: 'spot', secLevel: 255, securityFlags: 'T'.repeat(128), userFlags: 0 },
    };
    const protocol = new XIMProtocol(emulator, { replyMsg: jest.fn() } as any, { id: 's', emit: jest.fn(), on: jest.fn() } as any, 1, session);
    await protocol.handleMessage({ command, data, msgAddr: MSG, string: text, replyPort: 0x2000 });
  }

  /** Close the two stream loggers so their buffered content is on disk. */
  async function streamLogs(): Promise<string> {
    ximLogger.close();
    await new Promise((r) => setTimeout(r, 200));
    return [process.env.XIM_LOG_FILE!, process.env.XIM_AMIGA_LOG!]
      .map((f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '')).join('\n');
  }

  test('a DT_PASSWORD write, through handleMessage, leaves no trace in console, ring, or any log file', async () => {
    await sendThroughHandleMessage(XIMCommand.DT_PASSWORD, 0, SECRET);
    const everything = written.join('\n') + '\n' + mockFileWrites.join('\n') + '\n' + (await streamLogs());
    // The sinks are alive: the command itself was logged.
    expect(everything).toContain('DT_PASSWORD');
    expect(everything).not.toContain(SECRET);
  });

  test('the W door\'s PASSWORD request, through handleMessage, leaves no trace either', async () => {
    await sendThroughHandleMessage(XIMCommand.AEW_USERFIELD, 1, `PASSWORD ${SECRET}\t${SECRET}`);
    const everything = written.join('\n') + '\n' + mockFileWrites.join('\n') + '\n' + (await streamLogs());
    expect(everything).toContain('AEW_USERFIELD');
    expect(everything).not.toContain(SECRET);
  });

  test('the parser\'s own dump of a password message carries neither the text nor its hex', () => {
    const emulator = makeEmulator();
    const parser = new XIMMessageParser(emulator);
    const MSG = 0x1000;
    emulator.writeMemory16(MSG + 18, 0x114);
    parser.writeCommand(MSG, XIMCommand.DT_PASSWORD);
    emulator.writeString(MSG + 0x14, SECRET);
    written.length = 0;
    parser.parseMessage(MSG);
    const hex = Array.from(SECRET.slice(0, 4)).map((c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join(' ');
    const out = written.join('\n');
    expect(out).toContain('DT_PASSWORD');
    expect(out).not.toContain(SECRET);
    expect(out).not.toContain(hex);
  });
});
