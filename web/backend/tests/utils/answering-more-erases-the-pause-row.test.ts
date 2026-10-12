/**
 * express.e:5193-5199 checkForPause: after the caller answers
 * `(Pause)...More(y/n/ns)?` with RETURN, Y or NS, `aePuts('[1A[K')` erases
 * the prompt's row and the listing goes on from it. The port printed a line
 * break instead, so every pause left its prompt on screen between two pages.
 */

import { checkForPause } from '../../src/utils/flag-pause.util';

jest.mock('../../src/utils/file-flag.util');

function pausedSession() {
  const socket: any = { id: `more-erases-${Math.random()}`, emit: jest.fn() };
  const session: any = {
    user: { linesPerScreen: 23, lineLength: 80, pageLength: 23 },
    screenHeight: 24,
    nodeId: 1,
    currentConf: 1,
    tempData: { lineCount: 50, nonStopDisplayFlag: false },
  };
  const result = checkForPause(socket, session);
  socket.emit.mockClear();
  const answer = (line: string) => session.checkPauseHandler(line);
  const written = () =>
    socket.emit.mock.calls.filter((c: any[]) => c[0] === 'ansi-output').map((c: any[]) => c[1]).join('');
  return { result, answer, written, session };
}

describe('answering More', () => {
  it.each(['', 'y', 'ns'])('with %p erases the prompt row and goes on', async (line) => {
    const run = pausedSession();
    await run.answer(line);
    expect(await run.result).toBe(true);
    expect(run.written()).toBe('\r\x1b[K');
  });

  it('with n stops and leaves the prompt on screen', async () => {
    const run = pausedSession();
    await run.answer('n');
    expect(await run.result).toBe(false);
    expect(run.written()).toBe('\r\n');
  });
});
