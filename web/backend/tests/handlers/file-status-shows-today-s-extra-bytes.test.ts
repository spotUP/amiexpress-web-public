/**
 * FILE STATUS SHOWS TODAY'S EXTRA BYTES.
 *
 * express.e:24172-24176 prints Bytes Avail from todaysBytesLimit, the daily
 * limit plus the extra bytes a sysop (21537-21544) or an upload (19531) gave
 * for today. The port printed dailyBytesLimit - dailyBytesDld, so a caller
 * given extra bytes was shown the plain daily allowance.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/index', () => {
  const states = require('../../src/constants/bbs-states');
  return { BBSState: states.BBSState, LoggedOnSubState: states.LoggedOnSubState, BBSSession: {} };
});

import { flushOutput } from '../../src/utils/output.util';
import { injectBoardConfAccess } from '../helpers/board-conf-access';

beforeAll(injectBoardConfAccess);

async function bytesAvailShown(user: Record<string, unknown>): Promise<string> {
  const emitted: string[] = [];
  const session: any = {
    currentConf: 1, nodeId: 1, tempData: {},
    user: { id: 'u1', username: 'SPOT', securityFlags: 'T'.repeat(64), confAccess: 'X', ratio: 3, ...user },
  };
  const socket: any = {
    id: `fs-avail-${Math.random().toString(36).slice(2)}`,
    session,
    emit(event: string, data: string) { if (event === 'ansi-output') emitted.push(data); return true; },
    on() { return socket; },
  };
  const { FileStatusHandler } = require('../../src/handlers/file/file-status.handler');
  const handler = new FileStatusHandler(
    { getConferences: jest.fn().mockResolvedValue([{ id: 1, name: 'General' }]) },
    {} as any,
  );
  await handler.handleFileStatusCommand(socket, session);
  flushOutput(socket);
  return emitted.join('');
}

describe('File Status Bytes Avail (express.e:24172-24176)', () => {
  it('shows today\'s limit with the sysop\'s extra bytes, less today\'s downloads', async () => {
    const out = await bytesAvailShown({ byteLimit: 1_000_000, todaysBytesLimit: 5_000_000, dailyBytesDld: 250_000 });
    expect(out).toContain('4750000');
    expect(out).not.toMatch(/(?<!\d)750000(?!\d)/);
  });

  it('shows Infinite when today\'s limit is 0', async () => {
    const out = await bytesAvailShown({ byteLimit: 0, todaysBytesLimit: 0, dailyBytesDld: 0 });
    expect(out).toContain('Infinite');
  });
});
