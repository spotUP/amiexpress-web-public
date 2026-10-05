/**
 * Regression for #12: cancelling an operator-page (Q / CTRL+C / /CANCEL while in
 * OPERATOR_CHAT_WAITING) used to crash the command handler with:
 *   Error: TypeInfo not known for "OperatorChatRepository"
 *       at handleCommand (.../command.handler.ts)
 *
 * Background:
 *   The earlier code resolved the repository through tsyringe:
 *     const repository = container.resolve(OperatorChatRepository);
 *   But OperatorChatRepository is NOT decorated with @injectable(), so
 *   tsyringe threw on every cancel. The exception propagated up through
 *   handleCommand, the user got an [ERROR] line, and the page state was
 *   left dangling — i.e. the cancel never actually fired.
 *
 *   The fix routes the lookup through the same path that every other
 *   OperatorChat caller uses (index.ts, config-routes.ts, the
 *   OPERATOR_CHAT_ACTIVE branch a few lines down): db.getOperatorChatRepository().
 *
 * Driven through the real `handleCommand` with a caller waiting on a page:
 * the board's database hands out a repository, and the cancel must reach
 * `handleUserCancelPage` with THAT repository and without throwing. The
 * page-cancel itself is recorded, not run - it is tested where it lives.
 */
process.env.SKIP_DB_INIT = '1';

const handleUserCancelPage = jest.fn(async (..._args: any[]) => {});
jest.mock('../../src/handlers/operator-chat.handler', () => ({
  ...jest.requireActual('../../src/handlers/operator-chat.handler'),
  handleUserCancelPage: (...args: any[]) => handleUserCancelPage(...args),
}));

import { handleCommand } from '../../src/handlers/command.handler';
import { setDatabase } from '../../src/handlers/command-handler/dependency-injection';
import { BBSState, LoggedOnSubState } from '../../src/index';

const repository = { name: 'the board\'s operator-chat repository' };

let n = 0;
function aCallerWaitingForTheSysop() {
  const printed: string[] = [];
  const socket = {
    id: `op-cancel-${++n}`,
    server: {},
    printed,
    emit: (event: string, data: unknown) => { if (event === 'ansi-output') printed.push(String(data)); return true; },
    on: () => {}, off: () => {}, removeListener: () => {},
  } as any;
  const session: any = {
    state: BBSState.LOGGEDON,
    subState: LoggedOnSubState.OPERATOR_CHAT_WAITING,
    connectionType: 'web',
    nodeId: 1,
    inputBuffer: '',
    user: { id: 1, username: 'spot', secLevel: 10 },
    tempData: {},
  };
  return { socket, session };
}

describe('OPERATOR_CHAT_WAITING cancel — repository resolution (regression for #12)', () => {
  beforeEach(() => {
    handleUserCancelPage.mockClear();
    setDatabase({ getOperatorChatRepository: () => repository });
  });

  test('Q cancels the page through the repository the database hands out, without throwing', async () => {
    const { socket, session } = aCallerWaitingForTheSysop();

    await expect(handleCommand(socket, session, 'q')).resolves.toBeUndefined();

    expect(handleUserCancelPage).toHaveBeenCalledTimes(1);
    expect(handleUserCancelPage.mock.calls[0][1]).toBe(repository);
    expect(handleUserCancelPage.mock.calls[0][2]).toBe(session);
  });

  test.each([
    ['CTRL+C', '\x03'],
    ['Q', 'Q'],
    ['/QUIT', '/quit'],
    ['/CANCEL', '/CANCEL'],
  ])('%s cancels the page (express.e:2342)', async (_name, key) => {
    const { socket, session } = aCallerWaitingForTheSysop();

    await handleCommand(socket, session, key);

    expect(handleUserCancelPage).toHaveBeenCalledTimes(1);
  });

  test('any other key leaves him waiting', async () => {
    const { socket, session } = aCallerWaitingForTheSysop();

    await handleCommand(socket, session, 'x');

    expect(handleUserCancelPage).not.toHaveBeenCalled();
    expect(session.subState).toBe(LoggedOnSubState.OPERATOR_CHAT_WAITING);
  });

  // express.e:20362-20371 reads the key and drops it: no "Waiting for sysop"
  // reminder, nothing at all.
  test('any other key prints nothing while the page waits', async () => {
    const { socket, session } = aCallerWaitingForTheSysop();

    await handleCommand(socket, session, 'x');
    await new Promise(r => setTimeout(r, 30));

    expect(socket.printed.join('')).toBe('');
  });

  test('with no repository to hand, the cancel still ends the wait (no silent crash)', async () => {
    setDatabase({ getOperatorChatRepository: () => undefined });
    const { socket, session } = aCallerWaitingForTheSysop();

    await handleCommand(socket, session, 'q');

    expect(handleUserCancelPage).not.toHaveBeenCalled();
    expect(session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
    await new Promise(r => setTimeout(r, 30));
    expect(socket.printed.join('')).toBe('Aborted!\r\n\r\n'); // express.e:20369
  });
});
