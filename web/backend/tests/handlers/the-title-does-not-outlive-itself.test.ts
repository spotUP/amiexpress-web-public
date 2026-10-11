/**
 * The title screen is cleared before the login prompt.
 *
 * BBSTITLE is the tallest thing this board draws: 69 lines of art, ELEVEN of
 * them wider than any terminal - `Screens/BBSTITLE.txt` line 47 is 1,427
 * characters - so an 80-column caller gets each of those folded into a dozen
 * rows or more and the screen scrolls several times over.
 *
 * Every other screen transition here clears. This one printed the welcome
 * straight underneath, which just continues the scroll: the tail of the title
 * stays above the login for the rest of the session. The sysop, 2026-09-14,
 * on a phone, where a 25-row screen makes it unmissable: "the bbstitle is very
 * tall and the upper part is not cleared on my mobile so its always visible
 * above the bbs content".
 *
 * THE TRANSITION EXISTS THREE TIMES, and only one of them runs. `pre-login.ts`
 * carries a copy that command.handler.ts:1163 calls dead in so many words -
 * "handlePreLoginInput is never called from the live dispatcher" - and
 * command-handler/core.ts carries a third. So this drives `handleCommand`, the
 * dispatcher a real keystroke reaches, rather than whichever copy is easiest
 * to call; a test against a dead branch is how this fix would have shipped
 * green and changed nothing.
 */
process.env.SKIP_DB_INIT = '1';

/*
 * displayScreen is the sentinel for the logon walk below: it records that the
 * title RAN and puts a marker where the title's bytes would be, so the test
 * can read what follows it. Everything else in the module is the real one.
 */
const screensShown: string[] = [];
jest.mock('../../src/handlers/screen.handler', () => ({
  ...jest.requireActual('../../src/handlers/screen.handler'),
  displayScreen: jest.fn(async (socket: any, _session: any, name: string) => {
    screensShown.push(name);
    // Through the board's own buffered writer, so it lands in wire order
    // with the echo and the prompt around it.
    jest.requireActual('../../src/utils/output.util').emitText(socket, `<<${name}>>`);
    return true;
  }),
}));
// No system password by default: the walk goes straight from the graphics
// answer to the title (express.e:29548-29552). The system-password walk sets
// one. `var`, not `let`: the module graph reads the config while the
// hoisted jest.mock runs, before a `let` would be initialised.
// eslint-disable-next-line no-var
var mockSysPassword = '';
jest.mock('../../src/services/bbs-config-file.service', () => ({
  ...jest.requireActual('../../src/services/bbs-config-file.service'),
  loadBBSConfig: () => ({ system_password: mockSysPassword || '' }),
}));

import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';
import { handleCommand } from '../../src/handlers/command.handler';

interface Emit { event: string; data: string }

function aCallerAtTheTitle() {
  const emits: Emit[] = [];
  const socket = {
    /*
     * A DIFFERENT ID PER CALLER. The board's output buffer is keyed by socket
     * id (ansi-buffer.util), so two test sockets sharing one id share one
     * buffer - and the second caller's bytes flush into the first one's
     * socket, which reads here as a board that emitted nothing at all.
     */
    id: `title-test-${Math.random().toString(36).slice(2)}`,
    emit: (event: string, data: unknown) => {
      if (typeof data === 'string') emits.push({ event, data });
      else emits.push({ event, data: '' });
    },
    on: () => {},
  } as any;
  const session = {
    state: BBSState.AWAIT,
    subState: LoggedOnSubState.DISPLAY_BBSTITLE,
    nodeId: 1,
  } as any;
  return { socket, session, emits };
}

/** Everything the board put on the wire, in order. */
const wire = (emits: Emit[]) => emits.map((e) => e.data).join('');

describe('pressing a key at the title screen', () => {
  it('clears the screen, then the name prompt - no welcome banner (express.e:29552-29571)', async () => {
    const { socket, session, emits } = aCallerAtTheTitle();

    await handleCommand(socket, session, ' ');

    // express.e:29571 StringF(tempStr,'\b\n\s ',namePrompt): one line
    // break between the (cleared) title and "Enter your Name: ".
    const stream = wire(emits);
    expect(stream).toBe('\x1b[2J\x1b[3J\x1b[H\r\nEnter your Name: ');
  });

  it('drops what SCROLLED OFF too, not just what is on screen', () => {
    /*
     * `2J` erases the visible rows; the folded title is several screens tall,
     * and the rest of it sits in the terminal's scrollback where a swipe on a
     * phone brings it straight back. `3J` is the one that discards that.
     */
    const { socket, session, emits } = aCallerAtTheTitle();

    return handleCommand(socket, session, ' ').then(() => {
      expect(wire(emits)).toContain('\x1b[3J');
    });
  });

  it('puts the cursor home, so the prompt starts at the top', async () => {
    const { socket, session, emits } = aCallerAtTheTitle();

    await handleCommand(socket, session, ' ');

    expect(wire(emits)).toContain('\x1b[H');
  });

  it('still moves the caller on to the login', async () => {
    // The clear is an addition, not a replacement: the state change and the
    // frontend's login form are what this branch is FOR.
    const { socket, session, emits } = aCallerAtTheTitle();

    await handleCommand(socket, session, ' ');

    expect(session.state).toBe(BBSState.LOGON);
    expect(session.subState).toBeUndefined();
    expect(emits.some((e) => e.event === 'prompt-login')).toBe(true);
  });
});

describe('the logon path, connect to name prompt (reachability)', () => {
  it('goes from BBSTITLE straight to "Enter your Name:" with no banner between', async () => {
    const { socket, session, emits } = aCallerAtTheTitle();
    session.subState = LoggedOnSubState.DISPLAY_CONNECT;
    session.connectionType = 'telnet';
    screensShown.length = 0;

    await handleCommand(socket, session, '\r'); // past the connect screen
    expect(session.subState).toBe(LoggedOnSubState.ANSI_PROMPT);
    await handleCommand(socket, session, 'A');
    await handleCommand(socket, session, '\r'); // graphics answered

    // The title RAN (sentinel), the caller is at the name prompt, and the
    // bytes after the title are express.e:29571's and nothing else.
    expect(screensShown).toEqual(['BBSTITLE']);
    expect(session.state).toBe(BBSState.LOGON);
    expect(session.tempData.loginPhase).toBe('username');
    const stream = wire(emits);
    expect(stream).not.toMatch(/Welcome to AmiExpress-Web|Please login to continue/);
  });

  /*
   * THE BREAKS AROUND THE TITLE. express.e prints the graphics answer's
   * lineInput break (29530) BEFORE the title and one break after it, in the
   * name prompt (29571 '\b\n\s '). The port printed none before and two
   * after: the same count, so the line-break audit's totals matched, but the
   * title started on the answer's own row and the prompt stood one row lower.
   */
  it('puts one line break before the title and one after it (express.e:29530, 29571)', async () => {
    const { socket, session, emits } = aCallerAtTheTitle();
    session.subState = LoggedOnSubState.DISPLAY_CONNECT;
    session.connectionType = 'telnet';

    await handleCommand(socket, session, '\r');
    const answerAt = wire(emits).length;
    expect(answerAt).toBeGreaterThan(0);
    await handleCommand(socket, session, 'A');
    await handleCommand(socket, session, '\r');

    // The answer's echo, its Enter, the title, the prompt - and nothing else.
    expect(wire(emits).slice(answerAt).endsWith('A\r\n<<BBSTITLE>>\r\nEnter your Name: ')).toBe(true);
  });

  it('after a correct system password: two breaks before the title, one after (express.e:29355, 29571)', async () => {
    mockSysPassword = 'secret';
    try {
      const { socket, session, emits } = aCallerAtTheTitle();
      session.subState = LoggedOnSubState.DISPLAY_CONNECT;
      session.connectionType = 'telnet';

      await handleCommand(socket, session, '\r');
      await handleCommand(socket, session, '\r'); // graphics: default ANSI
      expect(session.subState).toBe(LoggedOnSubState.SYSTEM_PASSWORD_INPUT);
      for (const ch of 'secret') await handleCommand(socket, session, ch);
      await handleCommand(socket, session, '\r');

      // getPass2's break (1592) + doSystemPassword's (29355), the title,
      // then the name prompt's one.
      const stream = wire(emits);
      expect(stream.slice(stream.lastIndexOf('>: '))).toMatch(/^>: [^\r\n]*\r\n\r\n<<BBSTITLE>>\r\nEnter your Name: $/);
    } finally {
      mockSysPassword = '';
    }
  });

  it('a real C64 sent straight to the title gets the same one break after it (express.e:29571)', async () => {
    const { showC64Title } = await import('../../src/services/login-connect.service');
    const { socket, session, emits } = aCallerAtTheTitle();
    session.subState = undefined;
    screensShown.length = 0;

    await showC64Title(socket, session);

    // The title goes through the board's buffered writer in this harness and
    // the prompt straight to the emitter, so compare without the marker.
    expect(screensShown).toContain('BBSTITLE');
    expect(wire(emits).replace('<<BBSTITLE>>', '')).toBe('\r\nEnter your Name: ');
    expect(session.tempData.loginPhase).toBe('username');
  });
});
