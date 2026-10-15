/**
 * Door text is logged only while DEBUG_68K is on, and never for a menu door.
 *
 * Measured 2026-10-15 on the live container log: with DEBUG_68K unset the board still wrote every message's String
 * (the XIMProtocol console line, the parser's "Parsed jhMessage" dump) - a menu door's typed command line and any
 * keystroke injected to a native door among it. The always-on lines now keep the command name and numbers and say
 * the text was withheld; DEBUG_68K=1 restores the verbose lines.
 */
import { XIMMessageParser } from '../../src/amiga-emulation/xim/messages';
import { logXimString, mayDumpRawStringFor, TEXT_WITHHELD } from '../../src/amiga-emulation/xim/redact';
import { XIMCommand } from '../../src/amiga-emulation/xim/types';

let debugOn = false;
jest.mock('../../src/utils/debug-log', () => ({
  debugLog: () => undefined,
  debugWarn: () => undefined,
  isDebugEnabled: () => debugOn,
}));

const TEXT = 'j 5 secretpass';

describe('logXimString', () => {
  test('DEBUG_68K off: a normal door\'s text is withheld whole, with no length', () => {
    debugOn = false;
    expect(logXimString(XIMCommand.JH_SM, 0, TEXT)).toBe(TEXT_WITHHELD);
    expect(logXimString(XIMCommand.JH_SM, 0, '')).toBe('');
  });
  test('DEBUG_68K on: a normal door\'s text is logged as before, a menu door\'s screen writes are not', () => {
    debugOn = true;
    expect(logXimString(XIMCommand.JH_SM, 0, TEXT)).toBe(TEXT);
    expect(logXimString(XIMCommand.JH_SM, 0, TEXT, true)).toBe('[menu screen write withheld]');
    expect(logXimString(XIMCommand.DT_PASSWORD, 0, 'hunter2')).toBe('[password withheld]');
  });
  test('the raw hex dump runs only with DEBUG_68K on, for a normal door', () => {
    debugOn = false;
    expect(mayDumpRawStringFor(XIMCommand.JH_SM, false)).toBe(false);
    debugOn = true;
    expect(mayDumpRawStringFor(XIMCommand.JH_SM, false)).toBe(true);
    expect(mayDumpRawStringFor(XIMCommand.JH_SM, true)).toBe(false);          // a menu door
    expect(mayDumpRawStringFor(XIMCommand.AEW_USERFIELD, false)).toBe(false); // the request commands
  });
});

describe('the parser dump (always-on console)', () => {
  function parseAndCapture(menuDoor: boolean): string {
    const emulator: any = {
      readMemory: () => 0x61,
      readMemory16: () => 0,
      readMemory32: (addr: number) => (addr === 0x1000 + 0xE0 ? XIMCommand.JH_SM : 0),
      readString: () => TEXT,
    };
    const lines: string[] = [];
    const spy = jest.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { lines.push(a.map(String).join(' ')); });
    try {
      const parser = new XIMMessageParser(emulator);
      parser.withholdScreenWrites = () => menuDoor;
      const msg = parser.parseMessage(0x1000);
      expect(msg.string).toBe(TEXT);   // the door still gets its text: only the log changes
    } finally { spy.mockRestore(); }
    return lines.join('\n');
  }

  test('DEBUG_68K off: no text, no raw hex dump, the command name still shown', () => {
    debugOn = false;
    const out = parseAndCapture(false);
    expect(out).not.toContain('secretpass');
    expect(out).not.toContain('RAW STRING');
    expect(out).toContain(TEXT_WITHHELD);
    expect(out).toContain('JH_SM');
  });
  test('DEBUG_68K on: a normal door shows its text and hex dump again', () => {
    debugOn = true;
    const out = parseAndCapture(false);
    expect(out).toContain(`String: "${TEXT}"`);
    expect(out).toContain('RAW STRING');
  });
  test('DEBUG_68K on: a menu door still withholds text and hex dump', () => {
    debugOn = true;
    const out = parseAndCapture(true);
    expect(out).not.toContain('secretpass');
    expect(out).not.toContain('RAW STRING');
  });
});
