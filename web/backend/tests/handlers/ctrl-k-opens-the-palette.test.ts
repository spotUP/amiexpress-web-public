/**
 * Ctrl-K at the command prompt opens the search palette (plan 2026-10-16 D4,
 * P5.1). Not an express.e key: the board sends `PALETTE <typed>` down the same
 * submit path Enter uses, so the menu door's PALETTE registration runs with the
 * line typed so far as its starting filter.
 *
 * Driven through the real `handleCommand`. The submit queues the dispatch on a
 * timer; fake timers hold it, so the witness is the command line the next
 * cycle would run and the state it would run from.
 */
process.env.SKIP_DB_INIT = '1';

import { handleCommand } from '../../src/handlers/command.handler';
import { commandCache } from '../../src/handlers/command-execution.handler';
import { BBSState, LoggedOnSubState } from '../../src/index';

function makeSocket(out: string[]) {
  return {
    id: `ctrl-k-${Math.random().toString(36).slice(2)}`,
    emit: (_event: string, data: unknown) => { if (typeof data === 'string') out.push(data); return true; },
    on: () => {}, off: () => {}, removeListener: () => {},
  } as any;
}

function at(subState: LoggedOnSubState, typed: string): any {
  return {
    state: BBSState.LOGGEDON,
    subState,
    connectionType: 'web',
    screenWidth: 80,
    screenHeight: 25,
    nodeId: 1,
    currentConf: 1,
    inputBuffer: typed,
    user: { id: 1, username: 'spot', secLevel: 255, expert: 'X' },
    tempData: {},
  };
}

describe('Ctrl-K', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    commandCache.bbscmd.set('PALETTE', { name: 'PALETTE' } as any);
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    commandCache.bbscmd.delete('PALETTE');
  });

  it('at the command prompt submits PALETTE with the typed line as the filter', async () => {
    const session = at(LoggedOnSubState.READ_COMMAND, ' mail ');

    await handleCommand(makeSocket([]), session, '\x0b');

    expect(session.commandText).toBe('PALETTE MAIL');
    expect(session.subState).toBe(LoggedOnSubState.PROCESS_COMMAND);
    expect(session.inputBuffer).toBe('');
    expect(jest.getTimerCount()).toBe(1);
  });

  it('with nothing typed submits a bare PALETTE', async () => {
    const session = at(LoggedOnSubState.READ_COMMAND, '');

    await handleCommand(makeSocket([]), session, '\x0b');

    expect(session.commandText).toBe('PALETTE');
  });

  it('inside the message reader does not open the palette', async () => {
    const session = at(LoggedOnSubState.MSG_READER_NAV, '');

    await handleCommand(makeSocket([]), session, '\x0b').catch(() => {});

    expect(session.commandText).toBeUndefined();
    expect(session.subState).not.toBe(LoggedOnSubState.PROCESS_COMMAND);
  });

  it('says so when PALETTE is not registered, and dispatches nothing', async () => {
    commandCache.bbscmd.delete('PALETTE');
    const out: string[] = [];
    const session = at(LoggedOnSubState.READ_COMMAND, 'mail');

    await handleCommand(makeSocket(out), session, '\x0b');

    expect(out.join('')).toContain('Palette not installed');
    expect(session.commandText).toBeUndefined();
    expect(session.subState).not.toBe(LoggedOnSubState.PROCESS_COMMAND);
  });
});
