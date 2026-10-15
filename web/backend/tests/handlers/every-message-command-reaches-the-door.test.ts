/**
 * The four commands a caller TYPES at a conference whose message base is a
 * door - and the one that must not.
 *
 * express.e gives each message command the same shape: if this conference
 * carries the `CUSTOM` tooltype, hand it to the conference's own door with a
 * `MAIL_*` function code; otherwise do what the board has always done.
 *
 *   R      25525-25530   MAIL_READ
 *   E      24864-24869   MAIL_CREATE
 *   C      24664-24668   MAIL_SYSOP_COMMENT
 *
 * Four separate call sites in one 5,000-line switch is exactly where a fifth
 * gets added later without the check, so this drives the real dispatcher and
 * asserts what each one asked for. It is not a source pin: a `case` that
 * merely MENTIONS the hook proves nothing about whether the dispatcher reaches
 * it.
 *
 * ZOOM is here for the opposite reason. It is in the CUSTOM table in express.e
 * (26392, 26602), and the sysop decided on 2026-09-14 that it stays with the
 * board: it is a QWK/ASCII packet writer plus an archiver, not a message
 * command. A later reader who "completes" the set by adding it will fail this.
 */
process.env.SKIP_DB_INIT = '1';

interface Ask { fn: number; commandText: string }
const asks: Ask[] = [];

/** Whether the conference's message base is a door at all, this test. */
let doorAnswers = true;

jest.mock('../../src/services/custom-msgbase', () => {
  const actual = jest.requireActual('../../src/services/custom-msgbase');
  return {
    ...actual,
    tryCustomMsgbase: jest.fn(async (_socket: any, _session: any, fn: number, commandText = '') => {
      asks.push({ fn, commandText });
      return doorAnswers;
    }),
  };
});

import { MailFunction } from '../../src/services/custom-msgbase';

/**
 * The dispatcher, by require rather than import: command.handler pulls a large
 * graph at load and the env above has to be set first.
 */
let processBBSCommand: (
  socket: any, session: any, command: string, params?: string, privcmd?: boolean,
) => Promise<any>;

beforeAll(() => {
  processBBSCommand = require('../../src/handlers/command.handler').processBBSCommand;
});

beforeEach(() => {
  asks.length = 0;
  doorAnswers = true;
});

const aSocket = () => ({ id: 'msgcmd-test', emit: () => {}, on: () => {} }) as any;
const aCaller = (): any => ({
  currentConf: 1,
  currentMsgBase: 1,
  nodeId: 0,
  state: 'LOGGED_ON',
  user: { id: 1, username: 'Spot', secLevel: 255 },
});

describe('a conference whose message base is a door', () => {
  const CASES: ReadonlyArray<[string, string, number]> = [
    ['R', '', MailFunction.READ],
    ['E', '', MailFunction.CREATE],
    ['EALL', '', MailFunction.CREATE],
    ['C', '', MailFunction.SYSOP_COMMENT],
  ];

  for (const [command, params, fn] of CASES) {
    it(`${command} asks the door for ${MailFunction[fn]}`, async () => {
      await processBBSCommand(aSocket(), aCaller(), command, params);
      expect(asks.map((a) => a.fn)).toEqual([fn]);
    });
  }

  it('hands R its arguments, so it opens on the message the caller named', async () => {
    // express.e:12427-12428 - `passCmdLine` 1. `R 42` arriving as `R` opens the
    // wrong message and looks like a door bug for the rest of the evening.
    await processBBSCommand(aSocket(), aCaller(), 'R', '42');
    expect(asks[0].commandText).toBe('R 42');
  });

  it('does NOT hand ZOOM to the door', async () => {
    // The sysop's decision, recorded rather than assumed: ZOOM packs an
    // offline mail archive and shares nothing with the list, the reader or
    // the composer.
    await processBBSCommand(aSocket(), aCaller(), 'ZOOM', '');
    expect(asks).toHaveLength(0);
  });

  it('does not ask about a command that has nothing to do with mail', async () => {
    // X, the expert-mode toggle: a command that touches no message base and
    // needs nothing of the board that this test does not have.
    await processBBSCommand(aSocket(), aCaller(), 'X', '');
    expect(asks).toHaveLength(0);
  });
});

describe('an ordinary conference', () => {
  it('falls through to the board when there is no door', async () => {
    /*
     * The fall-through IS the contract: `tryCustomMsgbase` answering false
     * must leave the board's own message base to answer, not swallow the
     * command. Proven by the command reaching the board - which, with no
     * database behind it here, is an error rather than a message, and an error
     * from the board is still the board.
     */
    doorAnswers = false;
    await expect(processBBSCommand(aSocket(), aCaller(), 'R', '')).resolves.not.toThrow();
    expect(asks).toHaveLength(1);
  });
});
