/**
 * VOTE MAINTENANCE 3 is express.e's createVoteTopic (20567-20637): the topic
 * number, then the description, each question and each answer typed in the
 * board's line editor - edit(FALSE,50) - and saved as the Vote/ files the
 * booth reads. Before, choice 3 did nothing at all.
 *
 * Driven through handleCommand, one key at a time, as a caller types it.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const board = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-create-'));
process.env.BBS_DATA_DIR = board;
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/utils/acs.util', () => ({
  ...jest.requireActual('../../src/utils/acs.util'),
  checkSecurity: () => true,
}));
jest.mock('../../src/handlers/screen.handler', () => ({
  ...jest.requireActual('../../src/handlers/screen.handler'),
  doPause: (_s: unknown, _sess: unknown, done: () => void) => done(),
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const { handleCommand } = require('../../src/handlers/command.handler');
const { handleVotingBoothCommand } = require('../../src/handlers/commands/vote-booth');
const { BBSState } = require('../../src/constants/bbs-states');
const { flushOutput } = require('../../src/utils/output.util');
/* eslint-enable @typescript-eslint/no-var-requires */

afterAll(() => fs.rmSync(board, { recursive: true, force: true }));

const settle = () => new Promise(r => setTimeout(r, 15));

test('3 creates a topic, its question and its answers through the line editor', async () => {
  const said: string[] = [];
  const socket: any = {
    id: 'vo-create', emit: (e: string, d: unknown) => { if (e === 'ansi-output') said.push(String(d)); return true; },
    on: () => socket, once: () => socket, off: () => socket, removeListener: () => socket,
  };
  const session: any = {
    state: BBSState.LOGGEDON, nodeId: 1, currentConf: 1, currentMsgBase: 1, screenWidth: 80, inputBuffer: '',
    user: { id: 1, username: 'spot', slotNumber: 1, secLevel: 255 }, tempData: {},
  };
  const type = async (keys: string) => {
    for (const k of keys) { await handleCommand(socket, session, k); await settle(); }
  };

  const running = handleVotingBoothCommand(socket, session);
  await settle();
  await type('3');
  await type('1\r');                 // topic number
  await type('Best group\r\r');      // description, Enter alone ends
  await type('S\r');                 // Msg. Options: Save
  await type('Who wins?\r\rS\r');    // question 1
  await type('Scoopex\r\rS\r');      // answer A
  await type('\rS\r');               // answer B: nothing typed - answers end
  await type('\rS\r');               // question 2: nothing typed - topic ends
  await type('7');
  await running;
  flushOutput(socket);

  const vote = path.join(board, 'Conf1', 'Vote');
  expect(fs.readFileSync(path.join(vote, 'Vote01.def'), 'latin1')).toBe('Best group\n');
  expect(fs.readFileSync(path.join(vote, 'Vote01.01.qst'), 'latin1')).toBe('Who wins?\n');
  expect(fs.readFileSync(path.join(vote, 'Vote01.10.A'), 'latin1')).toBe('Scoopex\n');
  expect(fs.existsSync(path.join(vote, 'Vote01.10.B'))).toBe(false);
  expect(fs.readFileSync(path.join(vote, 'VoteLock'), 'latin1')).toBe('DO NOT DELETE!\n');
  const out = said.join('');
  expect(out).toContain('\x1b[33mENTER TOPIC DESCRIPTION \x1b[0m');
  expect(out).toContain('(50 chars/line)');
  expect(out).toContain('\r\nANSWER \x1b[33mB\x1b[0m ]\r\n');
});
