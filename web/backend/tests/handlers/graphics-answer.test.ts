/**
 * The graphics-prompt answer becomes session state in exactly one place:
 * applyGraphicsAnswer (express.e:29538-29546).
 *
 * Regression: three dispatchers carried their own copies of this block and
 * only a dead one set session.ripMode - answering R logged "RIP" and then
 * served .TXT screens. These tests pin the shared semantics; the
 * source-level pins below hold every live dispatcher to the shared call.
 */

jest.mock('../../src/index', () => {
  const states = require('../../src/constants/bbs-states');
  return { BBSState: states.BBSState, LoggedOnSubState: states.LoggedOnSubState, BBSSession: {} };
});
jest.mock('../../src/handlers/screen.handler', () => ({
  displayScreen: jest.fn().mockResolvedValue(true),
}));

import { applyGraphicsAnswer } from '../../src/handlers/command-handler/pre-login';

function makeSocket() {
  return { emit: jest.fn() };
}
function makeSession(): any {
  return { tempData: {} };
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
});

describe('every live dispatcher uses the shared implementation (source pins)', () => {
  const fs = require('fs');
  const path = require('path');
  const read = (p: string) =>
    fs.readFileSync(path.resolve(__dirname, '../../src/handlers', p), 'utf8');

  test('command.handler.ts calls applyGraphicsAnswer and keeps no hasR copy', () => {
    const src = read('command.handler.ts');
    expect(src).toContain('applyGraphicsAnswer(socket, session, answer)');
    expect(src).not.toMatch(/tempData\.ripMode\s*=\s*true/);
  });

  test('command-handler/core.ts calls applyGraphicsAnswer and keeps no hasR copy', () => {
    const src = read('command-handler/core.ts');
    expect(src).toContain('applyGraphicsAnswer(socket, session, answer)');
    expect(src).not.toMatch(/tempData as any\)\.ripMode/);
  });
});
