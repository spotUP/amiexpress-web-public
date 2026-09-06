/**
 * A prompt that asks for a STRING must let the caller type one.
 *
 * The sysop's report, 2026-09-06: "z takes a hotkey instead of a string." He
 * typed Z on his C64, was asked `Enter string to search for:`, pressed C - and
 * that single letter WAS the search string. `H` then answered the directory
 * prompt, and the rest of what he typed landed at the menu as a command.
 *
 * The mechanism is line-versus-key, not the sub-state: `handleCommand` gets ONE
 * KEYSTROKE per call (server/socket-handlers.ts:818 iterates the input string
 * character by character), and a branch written as
 * `handler(socket, session, data.trim())` therefore runs its handler on the
 * first key. express.e reads both of these prompts with `lineInput()` -
 * express.e:26151 (78 chars) and express.e:26869 inside getDirSpan (8 chars) -
 * which blocks until Enter. So does the V command's filename prompt,
 * express.e:20414 (40 chars).
 *
 * The contract under test: a sub-state listed in `LINE_PROMPT_SUBSTATES` is
 * handed a whole LINE, and its branch runs once, when Enter arrives.
 *
 * Everything here drives the real chain - handleCommand -> processCommand ->
 * processBBSCommand -> the prompt - and asserts on what the caller receives
 * after typing, because the whole bug was that the second character never
 * reached the prompt it was typed at.
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('../../src/index', () => ({
  BBSState: { LOGGEDON: 'loggedon', AWAIT: 'await' },
  LoggedOnSubState: {},
}));
jest.mock('../../src/services/CallersLogManager');

import { handleCommand } from '../../src/handlers/command.handler';
import { config } from '../../src/config';
import { LoggedOnSubState } from '../../src/constants/bbs-states';
import { LINE_PROMPT_SUBSTATES } from '../../src/utils/line-input.util';

let root: string;
const realConfigGet = config.get.bind(config);

/** One DIR entry in the on-disk format express.e writes: 12-char name, space, status. */
const dirLine = (filename: string, desc: string) =>
  `${filename.padEnd(12)} P   12K  23-Oct-25  ${desc}`;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'line-prompt-'));
  // A conference with one file directory, so maxDirs is 1: both the zippy
  // search and the V command refuse to prompt at all when a conference has no
  // file areas (express.e:26136, express.e:20399).
  fs.mkdirSync(path.join(root, 'Conf1'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'Conf1', 'DIR1'),
    [dirLine('CHASE.LHA', 'A demo'), dirLine('SCOOPEX.LHA', 'Another one'), ''].join('\r\n'),
    'latin1'
  );
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

beforeEach(() => {
  jest.spyOn(config, 'get').mockImplementation((key: any) =>
    key === 'dataDir' ? root : realConfigGet(key)
  );
});

afterEach(() => {
  jest.restoreAllMocks();
});

function makeSocket() {
  const emitted: Array<{ event: string; data: unknown }> = [];
  return {
    id: `line-prompt-socket-${Math.random()}`,
    emitted,
    emit(event: string, data?: unknown) { emitted.push({ event, data }); return true; },
    on() { return this; },
  };
}

const allOutput = (socket: any) =>
  socket.emitted.filter((e: any) => e.event === 'ansi-output').map((e: any) => e.data).join('');

/** A user the ACS answers yes for: 'T' in every flag position the handlers ask about. */
const permissiveUser = {
  id: 'u1',
  username: 'C64USER',
  secLevel: 10,
  securityFlags: 'T'.repeat(64),
};

/** The sysop's session: a C64 at 40 columns, about to run `commandText`. */
function c64Session(commandText: string): any {
  return {
    state: 'loggedon',
    subState: LoggedOnSubState.PROCESS_COMMAND,
    user: permissiveUser,
    nodeId: 1,
    terminalType: 'c64',
    petsciiMode: true,
    screenWidth: 40,
    screenHeight: 25,
    currentConf: 1,
    tempData: {},
    commandHistory: [],
    historyIndex: 0,
    historyCycle: 0,
    commandText,
  };
}

/** What the transport does: one handleCommand call per character typed. */
async function type(socket: any, session: any, text: string): Promise<void> {
  for (const ch of text) {
    await handleCommand(socket, session, ch);
  }
}

describe('typing Z lets me type a search string', () => {
  it('takes the whole word, not the first letter', async () => {
    const socket = makeSocket();
    const session = c64Session('Z');
    await handleCommand(socket as any, session, '');
    expect(allOutput(socket)).toContain('Enter string to search for:');

    await type(socket, session, 'CHASE');

    // Five letters in and the prompt is still the prompt - none of them was
    // taken as the answer. This is the sysop's report inverted: his C ended
    // the prompt on the first keystroke.
    expect(session.subState).toBe(LoggedOnSubState.ZIPPY_SEARCH_INPUT);

    await type(socket, session, '\r');

    // Enter is what ends it, and the next prompt is the directory span.
    expect(session.subState).toBe(LoggedOnSubState.ZIPPY_DIR_SPAN_INPUT);
    expect(allOutput(socket)).toContain('Directories:');
  });

  it('echoes what I type, so I can see the word I am searching for', async () => {
    const socket = makeSocket();
    const session = c64Session('Z');
    await handleCommand(socket as any, session, '');
    // Enter is the flush point (line-input.util flushes before handing the
    // line over); the echo is 16ms-buffered like every other keystroke this
    // board echoes, so the assertion is on the line as the caller sees it.
    await type(socket, session, 'CHASE\r');

    expect(allOutput(socket)).toContain('Enter string to search for: CHASE');
  });

  it('searches for the word I typed and finds the file', async () => {
    const socket = makeSocket();
    const session = c64Session('Z');
    await handleCommand(socket as any, session, '');
    await type(socket, session, 'CHASE\r');
    await type(socket, session, '1\r');

    const out = allOutput(socket);
    expect(out).toContain('Scanning directory 1');
    expect(out).toContain('CHASE.LHA');
    expect(session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
  });

  it('lets me answer the directory prompt with a span, not one key', async () => {
    const socket = makeSocket();
    const session = c64Session('Z');
    await handleCommand(socket as any, session, '');
    await type(socket, session, 'CHASE\r');

    // express.e:26869 reads this with lineInput('','',8,...) - the answers are
    // spans like "1-3", so a single keystroke cannot be the whole answer.
    await type(socket, session, '1-1');
    expect(session.subState).toBe(LoggedOnSubState.ZIPPY_DIR_SPAN_INPUT);

    await type(socket, session, '\r');
    expect(allOutput(socket)).toContain('CHASE.LHA');
  });

  it('still cancels on a bare Enter, the way express.e:26155 does', async () => {
    const socket = makeSocket();
    const session = c64Session('Z');
    await handleCommand(socket as any, session, '');
    await type(socket, session, '\r');

    expect(session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
  });

  it('lets me rub out a typo before I press Return', async () => {
    const socket = makeSocket();
    const session = c64Session('Z');
    await handleCommand(socket as any, session, '');
    await type(socket, session, 'CHASX');
    await handleCommand(socket as any, session, '\x7f');
    await type(socket, session, 'E\r');
    await type(socket, session, '1\r');

    expect(allOutput(socket)).toContain('CHASE.LHA');
  });
});

describe('typing V lets me type a filename', () => {
  it('looks for the whole name I typed, not its first letter', async () => {
    const socket = makeSocket();
    // express.e:20408 - a filename in the parameters skips the prompt, so the
    // prompt is reached by `V NS` (NS is the non-stop flag, not a filename).
    const session = c64Session('V NS');
    await handleCommand(socket as any, session, '');
    expect(allOutput(socket)).toContain('Enter filename of file to view?');

    await type(socket, session, 'NOSUCH.TXT');
    expect(session.subState).toBe(LoggedOnSubState.VIEW_FILE_INPUT);

    await type(socket, session, '\r');

    const out = allOutput(socket);
    expect(out).toContain('File NOSUCH.TXT not found.');
    expect(out).not.toContain('File N not found.');
  });
});

describe('the line-prompt table is the one declaration', () => {
  it('lists the prompts express.e reads with lineInput()', () => {
    expect([...LINE_PROMPT_SUBSTATES.keys()].sort()).toEqual(
      [
        LoggedOnSubState.VIEW_FILE_INPUT,
        LoggedOnSubState.ZIPPY_DIR_SPAN_INPUT,
        LoggedOnSubState.ZIPPY_SEARCH_INPUT,
      ].sort()
    );
  });

  it('lists no single-key prompt - those must not wait for Return', () => {
    // A readChar()/yesNo() prompt in this table would make the caller press
    // Return after Y. These are the confirmations nearest the entries above.
    for (const singleKey of [
      LoggedOnSubState.BATCH_DOWNLOAD_CONFIRM,
      LoggedOnSubState.MAILSCAN_PROMPT_INPUT,
    ]) {
      expect(LINE_PROMPT_SUBSTATES.has(singleKey)).toBe(false);
    }
  });
});
