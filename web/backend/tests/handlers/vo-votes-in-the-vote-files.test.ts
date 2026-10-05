/**
 * VO is express.e's voting booth (20783-21023): topics, questions and
 * answers are files under the conference's Vote/ directory, a vote raises
 * the question's and the answer's .cnt by one, and the caller's Conf.DB
 * handle records that he voted (byte (n+3)>>3, bit (n+3) mod 8). The port
 * had a database booth of its own, with "Your votes have been recorded!",
 * "No questions available for this topic" and press-key prompts express.e
 * never prints, and sysop placeholders where create, edit and delete were.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const board = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-files-'));
process.env.BBS_DATA_DIR = board;
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/utils/acs.util', () => ({
  ...jest.requireActual('../../src/utils/acs.util'),
  // A caller who may vote but not keep the booth: vote(), not voteMenu().
  checkSecurity: (_u: unknown, perm: number) =>
    perm !== jest.requireActual('../../src/constants/acs-permissions').ACSPermission.MODIFY_VOTE,
}));
jest.mock('../../src/handlers/screen.handler', () => ({
  doPause: (_s: unknown, _sess: unknown, done: () => void) => done(),
}));
jest.mock('../../src/achievements/reporter', () => ({ report: () => undefined }));

/* eslint-disable @typescript-eslint/no-var-requires */
const { handleVotingBoothCommand } = require('../../src/handlers/commands/vote-booth');
const { feedInputWaiter } = require('../../src/utils/await-input');
const { messagePointerFileManager } = require('../../src/services/MessagePointerFileManager');
const { flushOutput } = require('../../src/utils/output.util');
/* eslint-enable @typescript-eslint/no-var-requires */

const vote = path.join(board, 'Conf1', 'Vote');

beforeAll(() => {
  fs.mkdirSync(vote, { recursive: true });
  fs.writeFileSync(path.join(vote, 'Vote01.def'), 'Best demo group\n');
  fs.writeFileSync(path.join(vote, 'Vote01.01.qst'), 'Who wins?\n');
  // express's answer names carry the question as \z\d[2]: "10" for 1.
  fs.writeFileSync(path.join(vote, 'Vote01.10.A'), 'Scoopex\n');
  fs.writeFileSync(path.join(vote, 'Vote01.10.B'), 'Fairlight\n');
});
afterAll(() => fs.rmSync(board, { recursive: true, force: true }));

async function waitForPrompt(session: any): Promise<void> {
  for (let i = 0; i < 200 && !session.inputWaiter; i++) await new Promise(r => setTimeout(r, 5));
}

test('a vote raises express.e\'s counters and sets the caller\'s voted bit', async () => {
  const said: string[] = [];
  const socket: any = { id: 'vo', emit: (e: string, d: unknown) => { if (e === 'ansi-output') said.push(String(d)); return true; } };
  const session: any = { nodeId: 1, currentConf: 1, user: { id: 1, username: 'spot', slotNumber: 2 } };

  const running = handleVotingBoothCommand(socket, session);
  await waitForPrompt(session);
  for (const k of ['1', '\r']) feedInputWaiter(socket, session, k);
  await waitForPrompt(session);
  feedInputWaiter(socket, session, 'b');
  await waitForPrompt(session);
  for (const k of ['q', '\r']) feedInputWaiter(socket, session, k);
  await running;
  flushOutput(socket);
  const out = said.join('');

  expect(out).toContain('\x1b[34m[\x1b[0m 1\x1b[34m] \x1b[32mBest demo group \x1b[35m     \r\n');
  expect(out).toContain('\x1b[34m[\x1b[0mB\x1b[34m]\x1b[0m ' + 'Fairlight'.padEnd(40) + '\r\n');
  expect(out).toContain('\r\n\x1b[0mCHOICE >: B\r\n');
  expect(out).not.toMatch(/recorded|Press any key/);
  expect(parseFloat(fs.readFileSync(path.join(vote, 'Vote01.10.cnt'), 'latin1'))).toBe(1);
  expect(parseFloat(fs.readFileSync(path.join(vote, 'Vote01.10.B.cnt'), 'latin1'))).toBe(1);
  expect(fs.existsSync(path.join(vote, 'Vote01.10.A.cnt'))).toBe(false);
  // Topic 1: byte 0, bit 1 << 4.
  expect(messagePointerFileManager.readRecordOrZero(1, 2).handle[0] & 16).toBe(16);
});
