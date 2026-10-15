/**
 * EXECUTE_ON_CONNECT runs for every caller, with his node.
 *
 * express.e:7353 runs it once per call, right before the connect screen. It
 * ran from the web socket handler only - for every socket, a reconnect and a
 * chat-only page included, with node 0 - and never for telnet or SSH
 * (web-vs-telnet audit item 14, 2026-09-28). It runs at the head of the
 * pre-login pipeline now, which every transport takes.
 */
process.env.SKIP_DB_INIT = '1';

const runExecuteOn = jest.fn(async () => undefined);
jest.mock('../../src/services/batch-scheduler', () => ({
  ...jest.requireActual('../../src/services/batch-scheduler'),
  runExecuteOn: (...args: unknown[]) => (runExecuteOn as any)(...args),
}));
jest.mock('../../src/handlers/command-execution.handler', () => ({
  runSysCommand: async () => 0,
  commandCache: { syscmd: new Map() },
}));

import { runPreLoginConnect } from '../../src/services/login-connect.service';

it('runs EXECUTE_ON_CONNECT for a telnet caller, with his node, before the banner', async () => {
  const order: string[] = [];
  runExecuteOn.mockImplementation(async () => { order.push('execute-on-connect'); });
  const emitter: any = { id: 'telnet-5-1', emit: (event: string) => { if (event === 'ansi-output' && !order.includes('banner')) order.push('banner'); } };
  const session: any = { nodeId: 5, connectionType: 'telnet', tempData: {} };

  await runPreLoginConnect(emitter, session, { socketId: 'telnet-5-1' });

  expect(runExecuteOn).toHaveBeenCalledWith('CONNECT', 5, {});
  expect(order[0]).toBe('execute-on-connect');
});
