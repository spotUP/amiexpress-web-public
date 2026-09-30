/**
 * The line editor and its Msg. Options menu, 1:1 with express.e edit()
 * (10077-10580): "always 1:1 with amiexpress sources" (the sysop,
 * 2026-09-30). Audit items K1-K10 and O1-O10 in
 * thoughts/shared/research/2026-09-30_message-parity-audit.md.
 *
 * Every case types through handleCommand, the entry point every keystroke
 * takes, one key per call as the transport dispatches them.
 */
process.env.SKIP_DB_INIT = '1';

// The replied-to message is read off disk; O8 hands one over.
jest.mock('../../src/utils/message-file.util', () => {
  const actual = jest.requireActual('../../src/utils/message-file.util');
  return { ...actual, readMessageFile: jest.fn(actual.readMessageFile) };
});

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { handleCommand } from '../../src/handlers/command.handler';
import { BBSState, LoggedOnSubState } from '../../src/index';
import { flushOutput } from '../../src/utils/output.util';
import { messageBodyLineLimit } from '../../src/utils/table-format.util';
import * as lineEditor from '../../src/handlers/message/line-editor';
import * as restriction from '../../src/utils/file-restriction.util';

// Counted and steered, not replaced: the real functions run unless a test says otherwise.
jest.mock('../../src/handlers/message/line-editor', () => {
  const actual = jest.requireActual('../../src/handlers/message/line-editor');
  return { ...actual, editKey: jest.fn(actual.editKey) };
});
jest.mock('../../src/utils/file-restriction.util', () => {
  const actual = jest.requireActual('../../src/utils/file-restriction.util');
  return { ...actual, isFileRestricted: jest.fn(actual.isFileRestricted) };
});
import * as messageEntry from '../../src/handlers/message/message-entry.handler';

const tick = () => new Promise((r) => setTimeout(r, 5));

const ACS_ATTACH_FILES = 41;
const ACS_PRI_MSGFILES = 58;

function flags(denied: number[] = []): string {
  const f = 'T'.repeat(90).split('');
  for (const d of denied) f[d] = 'F';
  return f.join('');
}

function drive(over: { columns?: number; denied?: number[]; body?: string[]; isPrivate?: boolean } = {}) {
  const out: string[] = [];
  const socket: any = {
    id: `edit-${Math.random()}`,
    emit: (event: string, text: unknown) => { if (event === 'ansi-output') out.push(String(text)); return true; },
    on() {}, off() {}, removeListener() {},
  };
  const columns = over.columns ?? 80;
  const session: any = {
    state: BBSState.LOGGEDON,
    subState: LoggedOnSubState.POST_MESSAGE_BODY,
    petsciiMode: columns === 40,
    terminalType: columns === 40 ? 'c64' : 'ansi',
    connectionType: 'web',
    screenWidth: columns,
    screenHeight: 25,
    nodeId: 1,
    currentConf: 1,
    inputBuffer: '',
    user: { id: 1, username: 'spot', secLevel: 255, securityFlags: flags(over.denied), secOverride: '' },
    tempData: {
      messageEntry: {
        body: [...(over.body ?? [])], currentLine: (over.body?.length ?? 0) + 1,
        toUser: 'ALL', subject: 's', isPrivate: over.isPrivate ?? false,
      },
    },
  };
  let mark = 0;
  const screen = () => { flushOutput(socket); return out.join(''); };
  return {
    socket,
    session,
    body: (): string[] => session.tempData?.messageEntry?.body,
    /** Type keys, one handleCommand call each; a string is split per character. */
    type: async (...keys: (string | string[])[]) => {
      for (const k of keys) {
        for (const key of Array.isArray(k) ? k : Array.from(k)) {
          await handleCommand(socket, session, key);
          await tick();
        }
      }
    },
    screen,
    /** Everything sent since the last call. */
    since: () => { const s = screen(); const d = s.slice(mark); mark = s.length; return d; },
  };
}

const MENU = '\r\n\x1b[32mMsg. Options: \x1b[33mA\x1b[36m,\x1b[33mC\x1b[36m,\x1b[33mD\x1b[36m,\x1b[33mE';
const LEFT = '\x1b[D';

describe('reachability: keys typed at the board reach edit()', () => {
  it('runs every body key through editKey and the menu through its lineInput', async () => {
    const editKey = lineEditor.editKey as jest.Mock;
    editKey.mockClear();
    const d = drive();
    await d.type('hi\r\r');
    expect(editKey).toHaveBeenCalledTimes(4);
    expect(d.session.subState).toBe(LoggedOnSubState.POST_MESSAGE_OPTIONS);
    expect(d.session.inputWaiter).toBeDefined();
    await d.type('L\r');
    expect(d.screen()).toContain('L\r\n\r\n 1> hi\r\n');
  });
});

describe('typing a line (express.e 10166-10360)', () => {
  it('K1: a word that runs past the line moves to the next line whole', async () => {
    const d = drive();
    await d.type('x'.repeat(70) + ' hell');
    d.since();
    await d.type('o');
    expect(d.body()).toEqual(['x'.repeat(70)]);
    expect(d.session.inputBuffer).toBe('hello');
    // 10343-10352: `\b \b` for the word and the space before it, then the next line.
    expect(d.since()).toBe('o' + '\b \b'.repeat(6) + '\r\n 2> hello');
  });

  it('K1: a full line refuses a key typed in its middle', async () => {
    const d = drive();
    await d.type('y'.repeat(75), [LEFT]);
    d.since();
    await d.type('z');
    expect(d.session.inputBuffer).toBe('y'.repeat(75));
    expect(d.since()).toBe('');
  });

  it('K2: a tilde is a character, not a delete', async () => {
    const d = drive();
    await d.type('a~');
    expect(d.session.inputBuffer).toBe('a~');
  });

  it('K3: rubbing out a character sends express\'s bytes, and Delete takes the one under the cursor', async () => {
    const d = drive();
    await d.type('abc');
    d.since();
    await d.type('\x7f');
    expect(d.since()).toBe('\b \x1b[1D');
    await d.type([LEFT, '\x1b[3~']);
    expect(d.session.inputBuffer).toBe('a');
    expect(d.since()).toBe('\x1b[1D \x1b[1D');
  });

  it('K5: Home, End, Ctrl-A and Ctrl-E do not move the cursor', async () => {
    const d = drive();
    await d.type('abc', ['\x01'], 'z', ['\x1b[H'], 'y', [LEFT, LEFT, '\x05', '\x1b[F'], 'x');
    expect(d.session.inputBuffer).toBe('abcxzy');
  });

  it('K6: a tab in a line that is nearly full does not push it past the edge', async () => {
    const d = drive();
    await d.type('t'.repeat(73), Array(65).fill(LEFT), '\t');
    expect(d.session.inputBuffer).toBe('t'.repeat(73));
  });

  it('K7: Ctrl-^ rubs out what is left of the cursor; Ctrl-X is no key', async () => {
    const d = drive();
    await d.type('abcdef', ['\x18'], [LEFT, LEFT]);
    expect(d.session.inputBuffer).toBe('abcdef');
    d.since();
    await d.type('\x1e');
    expect(d.session.inputBuffer).toBe('');
    expect(d.since()).toBe('\b \b'.repeat(4));
  });

  it('K8: a pasted run is typed a key at a time, its control codes dropped', async () => {
    const d = drive();
    await handleCommand(d.socket, d.session, '\x1b[Cab\tc\x1bd');
    await tick();
    expect(d.session.inputBuffer).toBe('ab      cd');
  });

  it('K9: the eight hundredth line does not end entry', async () => {
    const d = drive({ body: Array(799).fill('l') });
    await d.type('x\r');
    expect(d.session.subState).toBe(LoggedOnSubState.POST_MESSAGE_BODY);
    expect(d.screen()).toContain('801> ');
  });

  it('K10: the header names the line length the caller really has', async () => {
    const d = drive({ columns: 40 });
    await messageEntry.promptForMessageBody(d.socket, d.session);
    expect(d.screen()).toContain(`(${messageBodyLineLimit(d.session)} chars/line)`);
  });

  it('K4: Continue puts the cursor at the end of the reopened line', async () => {
    const d = drive();
    await d.type('hello\r\r', 'C\r', '!');
    expect(d.session.inputBuffer).toBe('hello!');
  });
});

describe('Msg. Options (express.e 10373-10578)', () => {
  it('O1: the command is typed and echoed, and Enter alone draws the menu again', async () => {
    const d = drive({ body: ['one'] });
    await d.type('\r');
    d.since();
    await d.type('l');
    expect(d.since()).toBe('l');
    await d.type('\r');
    expect(d.since()).toBe('\r\n\r\n 1> one\r\n' + MENU + '\x1b[36m,\x1b[33mF\x1b[36m,\x1b[33mL\x1b[36m,\x1b[33mS\x1b[36m,\x1b[33mX\x1b[36m,\x1b[33m? \x1b[0m>:');
    await d.type('\r');
    expect(d.since()).toBe('\r\n' + MENU + '\x1b[36m,\x1b[33mF\x1b[36m,\x1b[33mL\x1b[36m,\x1b[33mS\x1b[36m,\x1b[33mX\x1b[36m,\x1b[33m? \x1b[0m>:');
  });

  it('O2: offers express\'s commands and no others', async () => {
    const d = drive({ body: ['one'] });
    await d.type('\r', '?\r');
    const long = d.screen();
    expect(long).toContain('\r\n\x1b[33mX\x1b[32m>\x1b[36mfer Files\x1b[0m\r\n\x1b[0m >: ');
    expect(long).not.toMatch(/nsert Line|eplace Text|uote from Reply/);
  });

  it('O2: X is not offered for a private message without ACS_PRI_MSGFILES', async () => {
    const d = drive({ body: ['one'], isPrivate: true, denied: [ACS_PRI_MSGFILES] });
    await d.type('\r');
    expect(d.screen()).not.toContain('\x1b[33mX');
    await d.type('X\r');
    expect(d.session.tempData.messageEntry.rzmsg).toBeUndefined();
  });

  it('O2: X asks for the upload with the save', async () => {
    const d = drive({ body: ['one'] });
    const entry = d.session.tempData.messageEntry;
    await d.type('\r', 'X\r');
    expect(entry.rzmsg).toBe(true);
    expect(d.screen()).toContain('X\r\n\r\nSaving...');
  });

  it('O3: F without the access says so', async () => {
    const d = drive({ body: ['one'], denied: [ACS_ATTACH_FILES] });
    await d.type('\r');
    d.since();
    await d.type('F\r');
    expect(d.since()).toBe('F\r\n\r\nCommand requires higher access.\r\n' + MENU + '\x1b[36m,\x1b[33mL\x1b[36m,\x1b[33mS\x1b[36m,\x1b[33mX\x1b[36m,\x1b[33m? \x1b[0m>:');
  });

  describe('F, with a device to attach from', () => {
    let dir: string;
    const saved = process.env.BBS_DATA_DIR;
    beforeAll(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-attach-'));
      fs.writeFileSync(path.join(dir, 'song.mod'), 'x');
      process.env.BBS_DATA_DIR = dir;
    });
    afterAll(() => {
      if (saved === undefined) delete process.env.BBS_DATA_DIR; else process.env.BBS_DATA_DIR = saved;
      fs.rmSync(dir, { recursive: true, force: true });
    });

    it('O4: a path on no mounted device is refused', async () => {
      const d = drive({ body: ['one'] });
      await d.type('\r', 'F\r');
      d.since();
      await d.type('song.mod\r');
      expect(d.since()).toBe('song.mod\r\n\r\nDevice not Mounted.\r\n\r\n' + MENU + '\x1b[36m,\x1b[33mF\x1b[36m,\x1b[33mL\x1b[36m,\x1b[33mS\x1b[36m,\x1b[33mX\x1b[36m,\x1b[33m? \x1b[0m>:');
      expect(d.session.tempData.messageEntry.attachedFiles).toEqual([]);
    });

    it('O4: a file that does not exist is dropped without a prompt', async () => {
      const d = drive({ body: ['one'] });
      await d.type('\r', 'F\r', 'BBS:nothing.here\r');
      expect(d.screen()).not.toContain('Delete file(s)');
      expect(d.session.tempData.messageEntry.attachedFiles).toEqual([]);
    });

    it('O4: a Restricted file is refused and logged', async () => {
      (restriction.isFileRestricted as jest.Mock).mockResolvedValueOnce(true);
      const d = drive({ body: ['one'] });
      await d.type('\r', 'F\r', 'BBS:song.mod\r');
      expect(d.screen()).toContain('\r\n BBS:song.mod\r\n >>Restricted File<< Updating CallersLog\r\n');
      expect(d.session.tempData.messageEntry.attachedFiles).toEqual([]);
    });

    it('O7: the delete-files question is express\'s yesNo(2), and Enter answers No', async () => {
      const d = drive({ body: ['one'] });
      await d.type('\r', 'F\r');
      d.since();
      await d.type('BBS:song.mod\r');
      expect(d.since()).toBe('BBS:song.mod\r\nDelete file(s) when message is deleted \x1b[32m(\x1b[33my\x1b[32m/\x1b[33mN\x1b[32m)\x1b[32m?\x1b[0m ');
      await d.type('\r');
      expect(d.since().startsWith('No\r\n' + MENU)).toBe(true);
      expect(d.session.tempData.messageEntry.attachedFiles).toEqual(['N', 'BBS:song.mod']);
    });

    it('O5: attaching again replaces the list, one flag in front', async () => {
      const d = drive({ body: ['one'] });
      await d.type('\r', 'F\r', 'BBS:song.mod\r', 'y');
      await d.type('F\r', 'BBS:song.mod\r', 'n');
      expect(d.session.tempData.messageEntry.attachedFiles).toEqual(['N', 'BBS:song.mod']);
    });

    it('O6: 5 <dir> lists the directory and goes back to the menu', async () => {
      const d = drive({ body: ['one'] });
      await d.type('\r', 'F\r');
      d.since();
      await d.type('5 BBS:\r');
      const shown = d.since();
      expect(shown).toContain('song.mod');
      expect(shown).not.toContain('Enter path/filename');
      expect(shown.endsWith('\x1b[33m? \x1b[0m>:')).toBe(true);
    });
  });

  it('O8: the quote range echoes and holds six characters', async () => {
    const d = drive();
    // Quote in Reply reads the replied-to message from its file (10887).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const files = require('../../src/utils/message-file.util');
    (files.readMessageFile as jest.Mock).mockResolvedValueOnce({
      from: 'Zaphod', to: 'ALL', subject: 's', date: '', msgNum: 7, msgDate: 0, body: 'first\nsecond',
    });
    d.session.subState = LoggedOnSubState.POST_MESSAGE_QUOTE_REPLY_CONFIRM;
    d.session.tempData.messageEntry.parentId = 7;
    await d.type('y');
    d.since();
    await d.type('1,2abcd', '\x7f');
    expect(d.since()).toBe('1,2abc\b \b');
    expect(d.session.subState).toBe(LoggedOnSubState.POST_MESSAGE_QUOTE_RANGE);
  });

  it('O9: an abort ends with enterMSG\'s own line break', async () => {
    const d = drive({ body: ['one'] });
    await d.type('\r', 'A\r');
    d.since();
    await d.type('y');
    expect(d.since().startsWith('Yes\r\n\r\n')).toBe(true);
    expect(d.session.tempData).toBeUndefined();
  });

  it('O10: an edited line holds no more than the editor\'s own lines', async () => {
    const d = drive({ body: ['abc'] });
    await d.type('\r', 'E\r', '1\r', 'z'.repeat(80), '\r');
    expect(d.body()).toEqual(['abc' + 'z'.repeat(72)]);
  });
});
