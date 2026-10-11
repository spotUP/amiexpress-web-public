/**
 * Conference Maintenance edits the message base the sysop is looking at.
 *
 * Audit C-CM was left unresolved: its wiring was confirmed and nobody had
 * diffed express.e:22686-22948 field by field against this port. Doing that
 * turned up one identity confusion with three consequences.
 *
 * `cmMsgBase` counts 1..n WITHIN a conference - express's `msgBase`, what
 * `-`/`+` step and what the header shows as "2.1". Everything else in this
 * port addresses a message base by its own id, and the loader hands those out
 * sequentially ACROSS conferences, so base 1 of conference 2 is id 3.
 *
 * The screen mixed them:
 *   - it looked the base up by `mb.id === ordinal`, so on any conference past
 *     the first it found none, and the header lost its "conf.base" form and
 *     its name
 *   - B and C wrote mail_stats keyed by the ordinal, setting the next/lowest
 *     message number of ANOTHER conference's base
 *   - 3 and 4 reset that other base's pointers
 *
 * The capacity line is the second finding: express.e:22741 prints the
 * conference database's capacity and :22743-22756 the share of it in use.
 * This printed the USER COUNT as the capacity and divided it by a hardcoded
 * 1000, so option D - which sets the capacity - moved neither number.
 */
process.env.SKIP_DB_INIT = '1';

import {
  handleCMInput,
  handleCMNumericInput,
  setMessageCommandsDependencies,
} from '../../src/handlers/message/message-commands.handler';
import { flushOutput } from '../../src/utils/output.util';

/** Two conferences, two bases each. Ids run across conferences: 1,2 then 3,4. */
const MESSAGE_BASES = [
  { id: 1, conferenceId: 1, name: 'General', declaredName: 'General' },
  { id: 2, conferenceId: 1, name: 'Elite', declaredName: 'Elite' },
  { id: 3, conferenceId: 2, name: 'Uploads', declaredName: 'Uploads' },
  { id: 4, conferenceId: 2, name: 'Sysop', declaredName: 'Sysop' },
];

const CONFERENCES = [
  { id: 1, name: 'Uptown' },
  { id: 2, name: 'Downtown' },
];

function deps(overrides: Record<string, unknown> = {}) {
  const calls = {
    stats: [] as Array<[number, number]>,
    mailStat: [] as Array<[number, number]>,
    resetMail: [] as Array<[number, number]>,
    resetLast: [] as Array<[number, number]>,
    range: [] as Array<[number, number, number | undefined, number | undefined]>,
  };

  setMessageCommandsDependencies({
    messageBases: MESSAGE_BASES as never,
    conferences: CONFERENCES as never,
    joinConference: jest.fn(async () => true),
    displayScreen: jest.fn(),
    resetNewMailScanPointers: jest.fn(async (c: number, m: number) => { calls.resetMail.push([c, m]); return 0; }),
    resetLastMessageReadPointers: jest.fn(async (c: number, m: number) => { calls.resetLast.push([c, m]); return 0; }),
    getConferenceStats: jest.fn(async (c: number, m: number) => {
      calls.stats.push([c, m]);
      return { messageCount: 0, lowestMsgNum: 0, highestMsgNum: 0, userCount: 12, capacity: 200 };
    }),
    updateMessageNumberRange: jest.fn(async (c: number, m: number, low?: number, high?: number) => {
      calls.range.push([c, m, low, high]);
    }),
    getMailStatFile: jest.fn(async (c: number, m: number) => {
      calls.mailStat.push([c, m]);
      return { lowestKey: 1, highMsgNum: 99, lowestNotDel: 1 };
    }),
    ...overrides,
  } as never);

  return calls;
}

function socketSpy() {
  const out: string[] = [];
  const socket: any = {
    // The output buffer is keyed by socket id; without one every test in this
    // file shares a buffer, and the first flush empties it for the rest.
    id: `cm-${Math.random().toString(36).slice(2)}`,
    emit: (event: string, payload: unknown) => { if (event === 'ansi-output') out.push(String(payload)); },
    on: () => socket, once: () => socket, off: () => socket, removeListener: () => socket,
  };
  // emitText batches into a 16ms window; without the flush the screen is
  // still in the buffer when the assertion runs.
  return {
    socket,
    plain: () => { flushOutput(socket); return out.join('').replace(/\x1b\[[0-9;?]*[A-Za-z]/g, ''); },
  };
}

/** The sysop, parked on conference 2's FIRST message base - ordinal 1, id 3. */
function sessionOnSecondConference() {
  return {
    user: { id: 'u1', username: 'sysop', secLevel: 255 },
    tempData: { cmConf: 2, cmMsgBase: 1 },
    subState: '',
  } as never;
}

describe('Conference Maintenance on a conference past the first', () => {
  it('names the base it is showing, and its "conf.base" number', async () => {
    deps();
    const { socket, plain } = socketSpy();

    await handleCMInput(socket, sessionOnSecondConference(), 'x'); // unknown key: redraw
    const said = plain();

    expect(said).toContain('Downtown - Uploads');
    expect(said).toContain('[2.1  ]'.replace(/[[\]]/g, (c) => c)); // "Conference [2.1  ]:"
  });

  it('asks for the stats of THAT base, not of another conference\'s', async () => {
    const calls = deps();
    const { socket } = socketSpy();

    await handleCMInput(socket, sessionOnSecondConference(), 'x');

    // Ordinal 1 on conference 2 is the base whose id is 3.
    expect(calls.stats).toContainEqual([2, 3]);
    expect(calls.mailStat).toContainEqual([2, 3]);
    expect(calls.stats).not.toContainEqual([2, 1]);
  });

  it('resets the pointers of that base', async () => {
    const calls = deps();
    const { socket } = socketSpy();

    await handleCMInput(socket, sessionOnSecondConference(), '3');
    await handleCMInput(socket, sessionOnSecondConference(), '4');

    expect(calls.resetMail).toContainEqual([2, 3]);
    expect(calls.resetLast).toContainEqual([2, 3]);
  });

  it('writes the next and lowest message numbers of that base', async () => {
    const calls = deps();
    const { socket } = socketSpy();

    await handleCMNumericInput(socket, sessionOnSecondConference(), '500', 'HIGH_MSG');
    await handleCMNumericInput(socket, sessionOnSecondConference(), '2', 'LOW_MSG');

    expect(calls.range).toContainEqual([2, 3, undefined, 500]);
    expect(calls.range).toContainEqual([2, 3, 2, undefined]);
  });

  it('steps to the second base of the conference with +', async () => {
    const calls = deps();
    const { socket, plain } = socketSpy();
    const session = sessionOnSecondConference();

    await handleCMInput(socket, session, '+');

    expect((session as any).tempData.cmMsgBase).toBe(2);
    expect(plain()).toContain('Downtown - Sysop');
    expect(calls.stats).toContainEqual([2, 4]);
  });
});

describe('the capacity line', () => {
  it('shows the conference capacity and the share of it in use', async () => {
    deps();
    const { socket, plain } = socketSpy();

    await handleCMInput(socket, sessionOnSecondConference(), 'x');
    const said = plain();

    // 12 users of 200 = 6%, not "12 users" and not 12/1000. express.e:22741
    // `\d[4]` is left-justified; 22753 prints the remainder times 1000 as
    // `\z\r\d[3]`, so the fraction reads 000.
    expect(said).toContain('Capacity 200  Users');
    expect(said).toContain(' 6.000% In use ');
  });

  it('says >100% rather than a number when the conference is over its size', async () => {
    deps({
      getConferenceStats: jest.fn(async () => ({
        messageCount: 0, lowestMsgNum: 0, highestMsgNum: 0, userCount: 300, capacity: 200,
      })),
    });
    const { socket, plain } = socketSpy();

    await handleCMInput(socket, sessionOnSecondConference(), 'x');

    // express.e:22750-22751.
    expect(plain()).toContain('>100% In use');
  });

  it('does not divide by a capacity the board never set', async () => {
    deps({
      getConferenceStats: jest.fn(async () => ({
        messageCount: 0, lowestMsgNum: 0, highestMsgNum: 0, userCount: 12, capacity: 0,
      })),
    });
    const { socket, plain } = socketSpy();

    await handleCMInput(socket, sessionOnSecondConference(), 'x');

    expect(plain()).toContain(' 0.000% In use ');
  });
});
