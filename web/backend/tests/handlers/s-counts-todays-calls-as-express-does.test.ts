/**
 * S "Times Today" is express.e getTodaysCalls (25567, 28425-28432): the day's
 * call count while the last call was today, 0 once it was another day. The
 * port printed `user.timesToday`, a field nothing sets, so it was always 0.
 */
import { handleUserStatsCommand } from '../../src/handlers/commands/user-commands.handler';
import { flushOutput } from '../../src/utils/output.util';
import { getSystemTime } from '../../src/utils/date-time.util';
import { injectBoardConfAccess } from '../helpers/board-conf-access';

beforeAll(injectBoardConfAccess);

function statsFor(lastLogin: Date, callsToday: number): string {
  const wire: string[] = [];
  const socket: any = {
    id: `s-today-${Math.random().toString(36).slice(2)}`,
    emit: (event: string, data: unknown) => { if (event === 'ansi-output' && typeof data === 'string') wire.push(data); return true; },
    on: () => socket,
  };
  const session: any = {
    nodeId: 1, currentConf: 1, tempData: {},
    user: { id: 'caller-1', username: 'caller', secLevel: 20, securityFlags: '', confAccess: 'XXXXXXXXXX', lastLogin, callsToday, calls: 40 },
  };
  jest.spyOn(console, 'log').mockImplementation(() => {});
  handleUserStatsCommand(socket, session);
  flushOutput(socket);
  return wire.join('');
}

afterEach(() => jest.restoreAllMocks());

test('a caller on for the third time today sees 3', () => {
  expect(statsFor(getSystemTime(), 3)).toMatch(/Times Today\S*:\S* 3\r\n/);
});

test('a count left from another day reads 0', () => {
  const twoDaysAgo = new Date(getSystemTime().getTime() - 2 * 86400 * 1000);
  expect(statsFor(twoDaysAgo, 3)).toMatch(/Times Today\S*:\S* 0\r\n/);
});
