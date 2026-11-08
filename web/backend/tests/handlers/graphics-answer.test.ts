/**
 * The graphics-prompt answer becomes session state in exactly one place:
 * applyGraphicsAnswer (express.e:29538-29546).
 *
 * Regression: three dispatchers carried their own copies of this block and
 * only a dead one set session.ripMode - answering R logged "RIP" and then
 * served .TXT screens. These tests pin the shared semantics; the
 * dispatcher tests below type an answer into every live dispatcher and check
 * the session it leaves behind.
 */

jest.mock('../../src/index', () => {
  const states = require('../../src/constants/bbs-states');
  return { BBSState: states.BBSState, LoggedOnSubState: states.LoggedOnSubState, BBSSession: {} };
});
// express.e:29545 gates Q on sopt.qLogon, which ACP.e:2664 sets from the node's
// DISABLE_QUICK_LOGONS tooltype. The icon is mocked here; the real reader is
// covered in node-tooltypes.test.ts.
let quickLogonsKey = true;
jest.mock('../../src/utils/node-tooltypes.util', () => ({
  ...jest.requireActual('../../src/utils/node-tooltypes.util'),
  nodeFlag: (_node: number, key: string) => key === 'DISABLE_QUICK_LOGONS' && quickLogonsKey,
}));
beforeEach(() => { quickLogonsKey = true; });
jest.mock('../../src/handlers/screen.handler', () => ({
  displayScreen: jest.fn().mockResolvedValue(true),
}));

import { applyGraphicsAnswer } from '../../src/handlers/command-handler/pre-login';

function makeSocket() {
  return { emit: jest.fn() };
}
/**
 * The transport matters to exactly one answer. `R` asks for RIPscrip, which
 * this port rasterises in the browser and nowhere else (TP-6 of the SSH/telnet
 * parity plan), so the R branch is now conditional on
 * transportCapabilities(session).rip. Every case below that is not about R is
 * unaffected; the ones that are say which caller they mean.
 */
function makeSession(connectionType: 'web' | 'telnet' | 'ssh' = 'web'): any {
  return { tempData: {}, connectionType };
}

describe('applyGraphicsAnswer (express.e:29538-29546)', () => {
  test('R enables RIP mode with ANSI, standard 80x24 text', () => {
    const socket = makeSocket();
    const session = makeSession();
    applyGraphicsAnswer(socket, session, 'R');
    expect(session.ripMode).toBe(true);
    expect(session.ansiEnabled).toBe(true);
    expect(session.petsciiMode).toBe(false);
    expect(session.screenWidth).toBe(80);
  });

  test('P enables PETSCII at 40x25 and resizes the terminal', () => {
    const socket = makeSocket();
    const session = makeSession();
    applyGraphicsAnswer(socket, session, 'P');
    expect(session.petsciiMode).toBe(true);
    expect(session.ripMode).toBe(false);
    expect(socket.emit).toHaveBeenCalledWith('terminal-resize', { cols: 40, rows: 25 });
  });

  test('P beats R when both are answered', () => {
    const socket = makeSocket();
    const session = makeSession();
    applyGraphicsAnswer(socket, session, 'RP');
    expect(session.petsciiMode).toBe(true);
    expect(session.ripMode).toBe(false);
  });

  test('empty answer defaults to ANSI, everything else off', () => {
    const socket = makeSocket();
    const session = makeSession();
    applyGraphicsAnswer(socket, session, '');
    expect(session.ansiEnabled).toBe(true);
    expect(session.ripMode).toBe(false);
    expect(session.petsciiMode).toBe(false);
  });

  test('N disables ANSI', () => {
    const socket = makeSocket();
    const session = makeSession();
    applyGraphicsAnswer(socket, session, 'N');
    expect(session.ansiEnabled).toBe(false);
    expect(session.ripMode).toBe(false);
  });

  test('R on a byte transport falls back to ANSI and says so - no RIPscrip source on the wire', () => {
    // WEB_ deviation: express.e sends RIPscrip to whoever asks. There is no
    // server-side rasteriser here, so answering R on telnet/SSH used to ship
    // `!|` source across the caller's screen as literal text.
    for (const transport of ['telnet', 'ssh'] as const) {
      const socket = makeSocket();
      const session = makeSession(transport);
      applyGraphicsAnswer(socket, session, 'R');
      expect(session.ripMode).toBe(false);
      expect(session.ansiEnabled).toBe(true);
      expect(session.petsciiMode).toBe(false);
      expect(session.screenWidth).toBe(80);
      const said = socket.emit.mock.calls.map((c: any[]) => String(c[1] ?? '')).join('');
      expect(said).toContain('RIP GRAPHICS NEED A WEB BROWSER - USING ANSI');
    }
  });

  test('Q is ignored when the node lacks DISABLE_QUICK_LOGONS (qLogon FALSE, express.e:29545)', () => {
    quickLogonsKey = false;
    const session = makeSession();
    applyGraphicsAnswer(makeSocket(), session, 'Q');
    expect(session.quickFlag).toBeFalsy();
    expect(session.tempData.quickLogon).toBeUndefined();
  });

  test('RQ sets RIP and the quick-logon flag together', () => {
    const socket = makeSocket();
    const session = makeSession();
    applyGraphicsAnswer(socket, session, 'RQ');
    expect(session.ripMode).toBe(true);
    expect(session.quickFlag).toBe(true);
    expect(session.tempData.quickLogon).toBe(true);
  });

  test('does not emit rip-mode early - the [1! framing arms the terminal', () => {
    const socket = makeSocket();
    applyGraphicsAnswer(socket, makeSession(), 'R');
    const events = socket.emit.mock.calls.map((c: any[]) => c[0]);
    expect(events).not.toContain('rip-mode');
  });

  test('T enables teletext mode at 40x26 and emits texttv-mode', () => {
    // WEB_: no express.e counterpart. The web terminal swaps to TDAText at
    // 2x with a teletext palette on the event; geometry is the classic
    // 40x25 grid, the same 40-column path PETSCII sessions use.
    const socket = makeSocket();
    const session = makeSession();
    applyGraphicsAnswer(socket, session, 'T');
    expect(session.texttvMode).toBe(true);
    expect(session.ansiEnabled).toBe(true);
    expect(session.petsciiMode).toBe(false);
    expect(session.ripMode).toBe(false);
    expect(session.screenWidth).toBe(40);
    expect(session.screenHeight).toBe(26);
    expect(socket.emit).toHaveBeenCalledWith('texttv-mode', { enabled: true, cols: 40, rows: 26 });
  });

  test('P beats T when both are answered', () => {
    const socket = makeSocket();
    const session = makeSession();
    applyGraphicsAnswer(socket, session, 'PT');
    expect(session.petsciiMode).toBe(true);
    expect(session.texttvMode).toBe(false);
  });

  test('T beats R when both are answered', () => {
    const socket = makeSocket();
    const session = makeSession();
    applyGraphicsAnswer(socket, session, 'TR');
    expect(session.texttvMode).toBe(true);
    expect(session.ripMode).toBe(false);
  });

  test('T on a byte transport falls back to ANSI and says so - no mode event', () => {
    // Same shape as the R fallback: no teletext renderer on a byte
    // transport, so the ANSI the board emits is the honest answer.
    for (const transport of ['telnet', 'ssh'] as const) {
      const socket = makeSocket();
      const session = makeSession(transport);
      applyGraphicsAnswer(socket, session, 'T');
      expect(session.texttvMode).toBe(false);
      expect(session.ansiEnabled).toBe(true);
      expect(session.petsciiMode).toBe(false);
      expect(session.ripMode).toBe(false);
      const events = socket.emit.mock.calls.map((c: any[]) => c[0]);
      expect(events).not.toContain('texttv-mode');
      const said = socket.emit.mock.calls.map((c: any[]) => String(c[1] ?? '')).join('');
      expect(said).toContain('TELETEXT NEEDS A WEB BROWSER - USING ANSI');
    }
  });

  test('TQ sets teletext and the quick-logon flag together', () => {
    const socket = makeSocket();
    const session = makeSession();
    applyGraphicsAnswer(socket, session, 'TQ');
    expect(session.texttvMode).toBe(true);
    expect(session.quickFlag).toBe(true);
    expect(session.tempData.quickLogon).toBe(true);
  });

  test('other answers leave texttvMode off', () => {
    for (const answer of ['', 'A', 'R', 'P', 'N']) {
      const session = makeSession();
      applyGraphicsAnswer(makeSocket(), session, answer);
      expect(session.texttvMode).toBe(false);
    }
  });
});

/*
 * The dispatcher of the graphics prompt, driven with a real keystroke.
 * command.handler.ts is the entry point every transport reaches (the second
 * dispatcher, command-handler/core.ts, is gone). The regression
 * was a dispatcher with its own copy that set only `tempData.ripMode` "for
 * future use", so the answer is asserted as the session the screen loader
 * reads - ripMode itself - and the dead field must stay unset.
 */
describe('every live dispatcher applies the answer the caller typed', () => {
  const { BBSState, LoggedOnSubState } = require('../../src/constants/bbs-states');
  const dispatchers: Array<[string, () => (s: any, x: any, d: string) => Promise<unknown>]> = [
    ['command.handler', () => require('../../src/handlers/command.handler').handleCommand],
  ];

  /** Its own socket id: the output buffer is keyed by it, and a shared key hands the text to another test's socket. */
  let n = 0;
  const aCaller = () => ({ id: `graphics-answer-${++n}`, emit: jest.fn() });

  function atTheGraphicsPrompt(typed: string): any {
    return {
      state: BBSState.AWAIT,
      subState: LoggedOnSubState.ANSI_PROMPT,
      connectionType: 'web',
      nodeId: 1,
      tempData: { inputBuffer: typed },
    };
  }

  test.each(dispatchers)('%s: R and Enter turn RIP on, and the dead tempData copy stays unset', async (_name, get) => {
    const session = atTheGraphicsPrompt('r');
    await get()(aCaller(), session, '\r');
    expect(session.ripMode).toBe(true);
    expect(session.tempData.ripMode).toBeUndefined();
  });

  test.each(dispatchers)('%s: T and Enter turn teletext on', async (_name, get) => {
    const session = atTheGraphicsPrompt('t');
    await get()(aCaller(), session, '\r');
    expect(session.texttvMode).toBe(true);
    expect(session.ripMode).toBe(false);
  });

  /*
   * REWRITTEN 2026-09-16, and the CODE moved with it: `core.ts` used to carry
   * its OWN COPY of the prompt, "kept identical to login-connect.service.ts"
   * by a comment. There is one string now; both dispatchers must put exactly
   * that string on the wire when the connect screen is dismissed.
   */
  test.each(dispatchers)('%s: asks with the one shared prompt string, not a copy of it', async (_name, get) => {
    const { ANSI_GRAPHICS_PROMPT } = require('../../src/services/login-connect.service');
    const socket = aCaller();
    const session: any = { state: BBSState.AWAIT, subState: LoggedOnSubState.DISPLAY_CONNECT, connectionType: 'web', nodeId: 1, tempData: {} };

    await get()(socket, session, ' ');

    const wire = socket.emit.mock.calls.filter((c: any[]) => c[0] === 'ansi-output').map((c: any[]) => String(c[1])).join('');
    expect(session.subState).toBe(LoggedOnSubState.ANSI_PROMPT);
    expect(wire).toContain(ANSI_GRAPHICS_PROMPT);
  });
});

describe('the connect prompt', () => {
  test('is two lines, uppercase, and invites a C64 on its own line', () => {
    const { ANSI_GRAPHICS_PROMPT } = require('../../src/services/login-connect.service');

    const lines = ANSI_GRAPHICS_PROMPT.split('\r\n').filter((l: string) => l.length > 0);
    expect(lines).toHaveLength(2);

    // The DEL invite keeps its own line so it cannot word-wrap mid-word on a
    // real C64's forty columns (sysop addendum, 2026-09-02).
    expect(lines[0]).toContain('<DEL>');
    expect(lines[0].length).toBeLessThanOrEqual(40);

    // Uppercase ASCII only: a power-on C64 is in the graphics set, where
    // lowercase letters are graphics.
    expect(ANSI_GRAPHICS_PROMPT).not.toMatch(/[a-z]/);

    // The question comes last, with a trailing space, so the cursor sits
    // after it rather than under it.
    expect(ANSI_GRAPHICS_PROMPT.endsWith('? ')).toBe(true);
  });
});
