/**
 * Regression: `~DT` (system date) and `~DB` (download bytes) were unreachable.
 *
 * Symptom: a screen with `~DT|` rendered nothing where the date should be,
 * and `~DB|` rendered nothing where the byte count should be. Both keys sat
 * in the dispatch table (mci-dispatch.ts) but never received the call.
 *
 * Root cause: the `~D<char>` terminator pre-pass in mci-pre-passes.ts ran
 * `/~D(.)/g` over the whole string BEFORE the tokenizer, so `~DT` was read as
 * "set the terminator to T" and `~DB` as "set it to B", and both vanished.
 * express.e:5743-5748 matches `StrCmp(cmd,'D',1)` LAST, after every exact
 * key ("this needs to be near the end otherwise it might pick up other
 * commands starting with D"); the pre-pass now mirrors that order via
 * consumeTerminatorChanges.
 *
 * Driven through parseMciCodes, the product's MCI entry point, with the same
 * frozen clock and stubs as mci-dispatch-ansi-pin.test.ts.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/utils/date-time.util', () => {
  const actual = jest.requireActual('../../src/utils/date-time.util');
  return {
    ...actual,
    getSystemTime: () => new Date(2026, 8, 2, 14, 5, 9),
    getSystemDate: () => new Date(2026, 8, 2, 14, 5, 9),
  };
});

jest.mock('../../src/services/SystemStatsService', () => ({
  systemStats: { getTodayCalls: () => 17 },
}));

jest.mock('../../src/database', () => ({
  db: {
    getMessageBases: jest.fn(async () => [{ name: 'General' }]),
    getUsers: jest.fn(async () => []),
  },
}));

jest.mock('../../src/handlers/command.handler', () => ({
  processCommand: jest.fn(async () => true),
}));

import { parseMciCodes } from '../../src/handlers/screen.handler';
import { consumeTerminatorChanges } from '../../src/handlers/mci-pre-passes';
import type { BBSSession } from '../../src/index';

const LOGON_TIME_SECONDS = Math.floor(new Date(2026, 8, 2, 9, 15, 30).getTime() / 1000);

function makeSession(): BBSSession {
  return {
    user: {
      id: 4242,
      username: 'DtUser',
      secLevel: 55,
      uploadBytes: 1048576,
      downloadBytes: 3145728,
      dailyTimeLimit: 7200,
    },
    logonTime: LOGON_TIME_SECONDS,
    timeRemaining: 3600,
    currentConf: 0,
    currentConfName: 'Main',
    currentMsgBase: 1,
    nodeId: 2,
    slowmo: 0,
    slowmoCount: 0,
  } as unknown as BBSSession;
}

async function render(content: string): Promise<string> {
  const r = await parseMciCodes(content, makeSession(), 'DtBBS', 'DtSysop', 'DtLand');
  return r.parsed;
}

describe('~DT and ~DB reach their dispatch handlers (regression)', () => {
  test('~DT| renders the system date', async () => {
    expect(await render('dt=~DT|x')).toBe('dt=09-02-26x');
  });

  test('~DB| renders the download byte count', async () => {
    expect(await render('db=~DB|x')).toBe('db=3,145,728x');
  });

  test('~DT and ~DB are exact keys at every tokenizer boundary, not only `|`', async () => {
    expect(await render('~DT ~DB')).toBe('09-02-26 3,145,728');
    expect(await render('~DT\n~DB\n')).toBe('09-02-26\n3,145,728\n');
    expect(await render('~DB')).toBe('3,145,728');
  });

  test('~DT keeps working after ~D. has retargeted the terminator', async () => {
    expect(await render('~D.dt=~DT.db=~DB.')).toBe('dt=09-02-26db=3,145,728');
  });

  test('the single-letter ~D<char> terminator change still works', async () => {
    expect(await render('~D.~c3.RED~N.')).toBe('\x1b[33mREDDtUser');
    expect(await render('~D#~c3#RED~N#')).toBe('\x1b[33mREDDtUser');
    // A `~D` whose following text is not an exact key is still a change.
    expect(await render('~DT_ x')).toBe('_ x');
  });
});

describe('consumeTerminatorChanges', () => {
  test('strips a ~D<char> and reports the new terminator', () => {
    expect(consumeTerminatorChanges('a~D.b')).toEqual({ text: 'ab', terminator: '.' });
  });

  test('leaves ~DT and ~DB in place for the dispatch', () => {
    expect(consumeTerminatorChanges('~DT|~DB|')).toEqual({ text: '~DT|~DB|', terminator: '|' });
    expect(consumeTerminatorChanges('~D.~DT.~DB.')).toEqual({ text: '~DT.~DB.', terminator: '.' });
  });

  test('~D at end of text or before a line break is not a change (as before)', () => {
    expect(consumeTerminatorChanges('a~D')).toEqual({ text: 'a~D', terminator: '|' });
    expect(consumeTerminatorChanges('a~D\nb')).toEqual({ text: 'a~D\nb', terminator: '|' });
  });

  test('applies changes in order and reports each one', () => {
    const seen: string[] = [];
    const r = consumeTerminatorChanges('~D.x~D#y', '|', (from, to) => seen.push(`${from}>${to}`));
    expect(r).toEqual({ text: 'xy', terminator: '#' });
    expect(seen).toEqual(['|>.', '.>#']);
  });
});
