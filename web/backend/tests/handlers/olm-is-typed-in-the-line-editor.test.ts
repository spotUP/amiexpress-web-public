/**
 * OLM's message is typed in the board's own editor - express.e:25443-25445
 * `msgBuf.clear(); lines:=0; IF edit()<>RESULT_SUCCESS THEN RETURN` - and
 * sent when the caller saves. The port had a ten-line composer of its own
 * ("Enter your message (max 10 lines, /S to send, /A to abort):", "1> ").
 * Driven through handleCommand, one key at a time.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/utils/acs.util', () => ({
  ...jest.requireActual('../../src/utils/acs.util'),
  checkSecurity: () => true,
}));
jest.mock('../../src/server/session-manager', () => ({
  ...jest.requireActual('../../src/server/session-manager'),
  getSocketIdByNodeId: (n: number) => (n === 2 ? 'sock-2' : undefined),
}));
const received: string[] = [];
jest.mock('../../src/server/session-emitter-registry', () => ({
  ...jest.requireActual('../../src/server/session-emitter-registry'),
  emitterForSession: () => ({ emit: (_e: string, d: unknown) => { received.push(String(d)); return true; } }),
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const { handleCommand } = require('../../src/handlers/command.handler');
const { handleOlmCommand, setOlmDependencies } = require('../../src/handlers/transfer/olm.handler');
const { BBSState } = require('../../src/constants/bbs-states');
const { flushOutput } = require('../../src/utils/output.util');
/* eslint-enable @typescript-eslint/no-var-requires */

const settle = () => new Promise(r => setTimeout(r, 15));

test('an OLM is typed in the line editor and sent on Save', async () => {
  const target: any = { nodeId: 2, state: BBSState.LOGGEDON, user: { username: 'randy' } };
  setOlmDependencies({
    db: {}, io: { to: () => ({ emit: () => undefined }) }, setEnvStat: () => undefined,
    sessions: new Map([['2', target]]),
    config: { get: (k: string) => (k === 'olmEnabled' ? true : undefined) },
  });
  const said: string[] = [];
  const socket: any = {
    id: 'olm-1', emit: (e: string, d: unknown) => { if (e === 'ansi-output') said.push(String(d)); return true; },
    on: () => socket, once: () => socket, off: () => socket, removeListener: () => socket,
  };
  const session: any = {
    state: BBSState.LOGGEDON, nodeId: 1, currentConf: 1, currentMsgBase: 1, screenWidth: 80, inputBuffer: '',
    user: { id: 1, username: 'spot', slotNumber: 1, secLevel: 255 }, tempData: {},
  };

  const running = handleOlmCommand(socket, session, '2');
  await settle();
  for (const k of 'hello randy\r\rS\r') { await handleCommand(socket, session, k); await settle(); }
  await running;
  flushOutput(socket);

  const out = said.join('');
  expect(out).toContain('Enter your text. (Enter) alone to end.');
  expect(out).not.toContain('/S to send');
  expect(out).toContain('OLM SENT');
  // The recipient is not at the prompt: express queues it (1468-1472).
  expect([...received, ...(target.olmQueue ?? [])].join('')).toContain('hello randy\r\n');
});
