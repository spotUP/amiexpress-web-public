/**
 * The upload prompt must not wear the previous screen's text as a tail.
 *
 * The sysop, 2026-09-15, pressing `u` at the menu:
 *
 *   FileName 1: eb BBS [1:Amiga Demoscene!] Menu (9999 mins. left): u
 *
 * `FileName 1: ` is twelve columns. `The Uptown W` - the first twelve of the
 * menu prompt that was already on that row - is also twelve. So the prompt
 * replaced columns 0-11 and column 12 onward was simply never written, and
 * therefore never replaced.
 *
 * This is NOT the pause collision that `1a5291c4c` fixed, and it is not a
 * missing screen clear: express.e's `uploadDesc` (17656-17665) is plain
 * `aePuts` with no clear and no erase, and real AmiExpress needs neither,
 * because its output scrolls onto rows that are already blank. This board
 * draws over full-screen ANSI art that does not scroll away.
 *
 * So the port erases the rest of the row it writes - and only that.
 *
 * Everything below is driven through the real handlers - the U command, the
 * upload interface, every state that draws a FileName prompt, and every
 * sendCLS site - and reads what reached the socket.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { eraseRestOfLine, clearTheScreen, flushOutput } from '../../src/utils/output.util';
import { ANSI } from '../../src/constants/ansi-codes';
import { AnsiUtil } from '../../src/utils/ansi.util';
import { LoggedOnSubState, BBSState } from '../../src/constants/bbs-states';
import { config } from '../../src/config';

const aSocket = (session?: Record<string, unknown>) => ({ id: 'x', session } as any);

/** A caller's terminal: every byte the board sent it, in order. */
let sockets = 0;
function aTerminal() {
  const bytes: string[] = [];
  const socket: any = {
    id: `upload-erase-${++sockets}`,
    emit: (event: string, data: unknown) => {
      if (event === 'ansi-output' && typeof data === 'string') bytes.push(data);
      return true;
    },
    on: () => {}, off: () => {}, removeListener: () => {},
  };
  return { socket, wire: () => { flushOutput(socket); return bytes.join(''); } };
}

/** Every way this board has of wiping what is on the caller's screen. */
const CLEARS = [ANSI.CLEAR_SCREEN, AnsiUtil.clearScreen(), '\x0c'];
const clearsIn = (text: string) => CLEARS.filter((c) => text.includes(c));

/** A caller the board lets upload (express.e's per-user override string). */
const uploader = (over: Record<string, unknown> = {}) => ({
  state: BBSState.LOGGEDON,
  nodeId: 1,
  relConfNum: 1,
  currentConf: 1,
  connectionType: 'web',
  user: { id: 1, username: 'lamer', name: 'lamer', secLevel: 100, securityFlags: 'T'.repeat(64), slotNumber: 1 },
  ...over,
}) as any;

describe('erasing the rest of a row', () => {
  it('erases for a caller with ANSI', () => {
    expect(eraseRestOfLine(aSocket({ ansiEnabled: true }))).toBe(ANSI.CLEAR_LINE_END);
  });

  it('erases when nothing has said otherwise', () => {
    // Every existing site in this codebase (flag-pause.util, the pause
    // cleanup in screen.handler) erases unconditionally; an absent flag must
    // not silently turn that off.
    expect(eraseRestOfLine(aSocket({}))).toBe(ANSI.CLEAR_LINE_END);
    expect(eraseRestOfLine(aSocket(undefined))).toBe(ANSI.CLEAR_LINE_END);
  });

  it('sends a PETSCII caller no escape sequence at all', () => {
    // It would be printed as glyphs, which is a worse mess than the tail.
    expect(eraseRestOfLine(aSocket({ ansiEnabled: false }))).toBe('');
  });

  it('actually removes the tail it is there to remove', () => {
    // The bug, reproduced as text: writing over a row without erasing keeps
    // whatever was longer than what you wrote.
    const behind = 'The Uptown Web BBS [1:Amiga Demoscene!] Menu (9999 mins. left): ';
    const written = 'FileName 1: ';
    const naive = written + behind.slice(written.length);
    expect(naive).toContain('eb BBS [1:Amiga Demoscene!] Menu');   // what he saw

    const erased = written + eraseRestOfLine(aSocket({ ansiEnabled: true }));
    expect(erased).toBe('FileName 1: ' + ANSI.CLEAR_LINE_END);
    expect(erased).not.toContain('eb BBS');
  });
});

describe('the upload path follows express.e, which never clears', () => {
  it('draws NOUPLOADS, then UPLOADMSG, and clears nothing before the conference art', async () => {
    // express.e:18981-19016 is the whole sequence: NOUPLOADS, SCREEN_UPLOAD,
    // then the UPLOADING/space/filename lines. It clears nowhere, and a clear
    // added here wiped the art the sysop had asked to be able to see.
    const { handleUploadCommand, setUserCommandsDependencies } =
      require('../../src/handlers/commands/user-commands.handler');
    const { socket, wire } = aTerminal();
    const drawn: string[] = [];
    let wireAtInterface = '';
    setUserCommandsDependencies({
      conferences: [], messageBases: [], db: {} as never,
      joinConference: async () => undefined,
      checkConfAccess: () => true,
      displayScreen: async (_s: any, _x: any, name: string) => { drawn.push(name); return false; },
      displayUploadInterface: () => { wireAtInterface = wire(); },
      displayDownloadInterface: () => undefined,
    });

    await handleUploadCommand(socket, uploader());

    expect(drawn).toEqual(['NOUPLOADS', 'UPLOADMSG']);
    expect(clearsIn(wireAtInterface)).toEqual([]);
  });

  describe('inside the upload interface', () => {
    let dataDir: string;
    let spy: jest.SpyInstance;
    const { displayUploadInterface, setFileAreas } = require('../../src/handlers/file/file.handler');

    beforeEach(() => {
      dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-erase-'));
      const areaDir = path.join(dataDir, 'Conf1', 'Files');
      fs.mkdirSync(areaDir, { recursive: true });
      const original = config.get.bind(config);
      spy = jest.spyOn(config, 'get')
        .mockImplementation((key: string) => (key === 'dataDir' ? dataDir : original(key as never)));
      setFileAreas([{ id: 1, conferenceId: 1, dirNumber: 1, name: 'Conf1 - Dir 1', dlPath: areaDir, ulPath: areaDir }]);
    });

    afterEach(() => {
      spy.mockRestore();
      setFileAreas([]);
      fs.rmSync(dataDir, { recursive: true, force: true });
    });

    /*
     * KNOWN RED, marked `failing` so the suite stays honest: the interface
     * still opens with `AnsiUtil.clearScreen()` (file.handler.ts, added
     * 2026-09-12 as a deliberate deviation). The source pin this replaced
     * looked for the spelling `clearTheScreen(socket)` and so never saw it.
     * It runs AFTER UPLOADMSG is drawn, so it scrolls the conference's upload
     * art away - the sysop's 2026-09-15 report "it draws the upload ansi
     * clears it and then draws the upload ui". Whether that clear goes is the
     * sysop's call; when it does, drop `.failing`.
     */
    it.failing('does not clear again over the art the U command just drew', () => {
      const { socket, wire } = aTerminal();

      displayUploadInterface(socket, uploader({ subState: LoggedOnSubState.DISPLAY_MENU }), '');

      expect(clearsIn(wire())).toEqual([]);
    });

    it('reaches the first FileName prompt, which erases the rest of its row', () => {
      const { socket, wire } = aTerminal();
      const session = uploader({ subState: LoggedOnSubState.DISPLAY_MENU });

      displayUploadInterface(socket, session, '');

      expect(session.subState).toBe(LoggedOnSubState.UPLOAD_FILENAME_INPUT);
      expect(fileNamePrompts(wire())).toEqual(['FileName 1: ' + ANSI.CLEAR_LINE_END]);
    });
  });
});

describe('the screen-clear helper itself', () => {
  it('clears before it draws anything', () => {
    // The sysop, 2026-09-15: "clear. the. fucking. screen. before. drawing.
    // the. upload. stuff." express.e does not (cleanItUp at 17656 cleans the
    // node work directory), and erasing each row as it was written still left
    // the art between and above the lines.
    expect(clearTheScreen(aSocket({ ansiEnabled: true }))).toBe(ANSI.CLEAR_SCREEN);
  });

  it('clears a PETSCII terminal the way a PETSCII terminal clears', () => {
    // 0x93, not an ANSI sequence it would print as glyphs.
    expect(clearTheScreen(aSocket({ petsciiMode: true }))).toBe('\x93');
  });
});

/** Every FileName prompt on the wire, with the two bytes that follow it. */
function fileNamePrompts(text: string): string[] {
  return [...text.matchAll(/FileName \d+: (.{0,3})/gs)].map((m) => m[0]);
}

/**
 * The pattern, not one line of it: a prompt that forgets to erase is the
 * defect, and every state that draws one is driven here through the real
 * `handleCommand`.
 */
describe('every FileName prompt', () => {
  const { handleCommand } = require('../../src/handlers/command.handler');

  const atTheFileNamePrompt = () => uploader({
    subState: LoggedOnSubState.UPLOAD_FILENAME_INPUT,
    tempData: { uploadMode: true, uploadBatch: [], uploadCount: 1, uploadStartTime: Date.now() },
  });
  const describingAFile = (lines: number) => uploader({
    subState: LoggedOnSubState.UPLOAD_DESC_INPUT,
    tempData: {
      uploadMode: true, uploadBatch: [], uploadCount: 1, currentFilename: 'A.LHA',
      currentDescription: ['a file'], descLineCount: lines, maxDescLines: 10, currentLineBuffer: '',
    },
  });

  it.each([
    ['after a name that is too long', atTheFileNamePrompt, 'THIRTEENCHARS.LHA\r'],
    ['after a name with a symbol the file check refuses', atTheFileNamePrompt, 'A(B).LHA\r'],
    ['after a description ended with a blank line', () => describingAFile(1), '\r'],
  ])('erases the rest of its row %s', async (_when, session, keys) => {
    const { socket, wire } = aTerminal();

    const caller = session();
    // One key per call, as the transport delivers them: the name prompt is a
    // line prompt, buffered by handleCommand until Enter.
    for (const key of keys) await handleCommand(socket, caller, key);

    const prompts = fileNamePrompts(wire());
    expect(prompts.length).toBe(1);
    expect(prompts[0].endsWith(ANSI.CLEAR_LINE_END)).toBe(true);
  });

  it('erases the rest of its row after a description that filled every line', async () => {
    const { socket, wire } = aTerminal();
    const session = describingAFile(9);

    for (const key of 'last line\r') await handleCommand(socket, session, key);

    const prompts = fileNamePrompts(wire());
    expect(prompts).toEqual(['FileName 2: ' + ANSI.CLEAR_LINE_END]);
  });
});

/**
 * sendCLS has to reach the terminal the caller actually has.
 *
 * express.e:5224-5228 sends ASCII 12, and a real Amiga terminal clears on it.
 * xterm.js treats 0x0C as a line feed, so every `checkScreenClear()` this port
 * made - at every site express.e calls it, the menu at express.e:28585
 * included - asked for a clear that never happened. That is why the sysop's
 * screen kept its old contents no matter how correct the board's side was.
 *
 * Each site is driven for a caller with the screen-clear flag set
 * (USER_SCRNCLR, 8): his terminal must get the clear it understands, and no
 * bare form feed.
 */
describe('sendCLS on a web terminal', () => {
  const SCRNCLR = 8;
  const aMessage = { id: 7, msgNumber: 7, timestamp: new Date('2026-09-15T12:00:00Z'), fromUser: 'spot', toUser: 'ALL', subject: 'hi', body: 'hello' };
  const aReader = () => uploader({
    subState: LoggedOnSubState.READ_COMMAND,
    user: { id: 1, username: 'lamer', name: 'lamer', secLevel: 100, userFlags: SCRNCLR, expert: 'X' },
    tempData: { msgReaderMessages: [{ ...aMessage }], msgReaderIndex: -1, msgReaderConfId: 1 },
  });

  const sites: Array<[string, (socket: any, session: any) => Promise<unknown>]> = [
    ['the ? command (express.e:24596)', (socket, session) =>
      require('../../src/handlers/commands/display-file-commands.handler').handleQuestionMarkCommand(socket, session)],
    ['reading one message (express.e:8889)', (socket, session) =>
      require('../../src/handlers/message/messaging.handler').displaySingleMessage(socket, session, 0)],
    ['reading messages non-stop (express.e:8897)', (socket, session) =>
      require('../../src/handlers/message/messaging.handler').handleMessageReaderNav(socket, session, 'NS')],
  ];

  it.each(sites)('%s clears with the sequence the terminal understands, never a bare form feed', async (_site, run) => {
    const { socket, wire } = aTerminal();

    try { await run(socket, aReader()); } catch { /* what follows the clear is not this test's business */ }

    const sent = wire();
    expect(sent).toContain(ANSI.CLEAR_SCREEN);
    expect(sent).not.toContain('\x0c');
  });
});

describe('the upload screen\'s own pause', () => {
  // "there is no pause after the screen when i press u" (sysop, 2026-09-29).
  // uploadmsg.txt ends in `~SP`; the interface clears the screen. Run at once,
  // it cleared the art and the prompt, and the pause waited unseen.
  it('holds the upload interface until the caller answers the screen\'s ~SP', async () => {
    const { handleUploadCommand, setUserCommandsDependencies } =
      require('../../src/handlers/commands/user-commands.handler');
    const { socket } = aTerminal();
    const session = uploader();
    let interfaceDrawn = 0;
    setUserCommandsDependencies({
      conferences: [], messageBases: [], db: {} as never,
      joinConference: async () => undefined,
      checkConfAccess: () => true,
      displayScreen: async (_s: any, sess: any, name: string) => {
        if (name !== 'UPLOADMSG') return false;
        // What displayScreen leaves for a screen with a trailing ~SP.
        sess.screenSegments = { segments: ['\r\n\x1b[0m'], eventName: 'ansi-output' };
        return true;
      },
      displayUploadInterface: () => { interfaceDrawn++; },
      displayDownloadInterface: () => undefined,
    });

    await handleUploadCommand(socket, session);

    expect(interfaceDrawn).toBe(0);
    expect(session.paginatedScreen?.kind).toBe('doPause');

    const { handlePaginatedScreenInput } = require('../../src/handlers/screen.handler');
    await handlePaginatedScreenInput(socket, session, ' ');

    expect(interfaceDrawn).toBe(1);
  });

  it('draws the interface straight away when the screen has no pause', async () => {
    const { handleUploadCommand, setUserCommandsDependencies } =
      require('../../src/handlers/commands/user-commands.handler');
    const { socket } = aTerminal();
    let interfaceDrawn = 0;
    setUserCommandsDependencies({
      conferences: [], messageBases: [], db: {} as never,
      joinConference: async () => undefined,
      checkConfAccess: () => true,
      displayScreen: async () => false,
      displayUploadInterface: () => { interfaceDrawn++; },
      displayDownloadInterface: () => undefined,
    });

    await handleUploadCommand(socket, uploader());

    expect(interfaceDrawn).toBe(1);
  });
});
