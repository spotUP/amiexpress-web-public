/**
 * Whether the sysop is around has ONE answer, and S and O both give it.
 *
 * express.e keeps one flag, sysopAvail (express.e:123, default TRUE), read by
 * S "Sysop Here" (25596) and O's refusal (25396-25400). The port read a session
 * field nothing wrote - S always said NO - and O never refused, while the
 * status the sysop actually sets on the Operator Chat page went unread
 * (parity survey, 2026-09-29). Driven through the real S and O handlers and
 * the real operator-chat repository.
 */
import { db } from '../../src/database';
import { handleUserStatsCommand } from '../../src/handlers/commands/user-commands.handler';
import { handlePageSysopCommand } from '../../src/handlers/command-handler/page-sysop-command';
import { SysopAvailability } from '../../src/types/operator-chat.types';
import { flushOutput } from '../../src/utils/output.util';
import { injectBoardConfAccess } from '../helpers/board-conf-access';

beforeAll(injectBoardConfAccess);

function aCaller(secLevel = 20) {
  const wire: string[] = [];
  const socket: any = {
    id: `sysop-away-${Math.random().toString(36).slice(2)}`,
    emit: (event: string, data: unknown) => { if (event === 'ansi-output' && typeof data === 'string') wire.push(data); return true; },
    on: () => socket,
  };
  const session: any = {
    nodeId: 1, currentConf: 1, pagesAllowed: -1, tempData: {},
    user: { id: 'caller-1', username: 'caller', secLevel, securityFlags: '', confAccess: 'XXXXXXXXXX' },
  };
  return { socket, session, said: () => { flushOutput(socket); return wire.join(''); } };
}

const quiet: jest.SpyInstance[] = [];
beforeEach(() => {
  quiet.push(jest.spyOn(console, 'log').mockImplementation(() => {}));
  (db as any).getOperatorChatRepository().db.prepare('DELETE FROM operator_sysop_status').run();
});
afterEach(() => {
  while (quiet.length) quiet.pop()!.mockRestore();
  (db as any).getOperatorChatRepository().db.prepare('DELETE FROM operator_sysop_status').run();
});

const setSysop = (a: SysopAvailability) => db.getOperatorChatRepository().updateSysopStatus('sysop-1', a, '');

it('S says the sysop is here when he is AVAILABLE, and not when he is AWAY', () => {
  setSysop(SysopAvailability.AVAILABLE);
  const here = aCaller();
  handleUserStatsCommand(here.socket, here.session);
  expect(here.said()).toMatch(/Sysop {2}Here\S*\s*\S*YES/);

  setSysop(SysopAvailability.AWAY);
  const away = aCaller();
  handleUserStatsCommand(away.socket, away.session);
  expect(away.said()).toMatch(/Sysop {2}Here\S*\s*\S*NO/);
});

it('O tells the caller the sysop is not around, and points at C', async () => {
  setSysop(SysopAvailability.AWAY);
  const c = aCaller();
  await handlePageSysopCommand(c.socket, c.session, { fetchSockets: async () => [] });
  expect(c.said()).toContain('is not around right now');
  expect(c.said()).toContain("You can use 'C' to leave a comment.");
});
