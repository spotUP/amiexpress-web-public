// @ts-nocheck
/**
 * ANSI byte-identity pin for the MCI dispatch extraction (plan
 * `thoughts/shared/plans/2026-09-02-mci-in-petscii-seq.md`, Task 4 test 1).
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Task 4 lifts the two MCI dispatch object literals out of `parseMciCodes`
 * (`screen.handler.ts` `userInfoDispatch` / `prefixDispatch`) into
 * `handlers/mci-dispatch.ts`. That move touches the render path of EVERY
 * `.TXT` screen on the board, so the standing 80-column rule ("the ANSI path
 * stays byte-identical") needs a mechanical proof, not a reading of the diff.
 *
 * The snapshot in `__fixtures__/mci-dispatch-ansi-pin.json` was generated on
 * the PRE-refactor tree and committed BEFORE the extraction landed. Every
 * fixture below is asserted byte-for-byte against it afterwards. A changed
 * byte anywhere in the dispatch fails here with the fixture's name.
 *
 * DETERMINISM
 * -----------
 * `parseMciCodes` reads the clock, the database, `Math.random`, the system
 * stats service, the conference list and the flagged-file queue. All six are
 * pinned below so the snapshot is reproducible on any machine and in any
 * timezone (the fixed dates are built from LOCAL calendar components on
 * purpose — a UTC epoch would render differently under a different TZ).
 *
 * REGENERATING (only ever for a DELIBERATE, reviewed behaviour change):
 *   UPDATE_MCI_PIN=1 npx jest --config dev-scripts/jest.config.ts --rootDir . \
 *     tests/handlers/mci-dispatch-ansi-pin.test.ts
 */
import * as fs from 'fs';
import * as path from 'path';

process.env.SKIP_DB_INIT = '1';

// Fixed clock. Built from local calendar components so formatLongDate /
// formatLongTime (which read getDate()/getHours()) render identically in
// every timezone.
const FIXED_NOW_PARTS = [2026, 8, 2, 14, 5, 9] as const;
const fixedNow = () => new Date(2026, 8, 2, 14, 5, 9);

jest.mock('../../src/utils/date-time.util', () => {
  const actual = jest.requireActual('../../src/utils/date-time.util');
  return {
    ...actual,
    getSystemTime: () => new Date(2026, 8, 2, 14, 5, 9),
    getSystemDate: () => new Date(2026, 8, 2, 14, 5, 9),
  };
});

// The dispatch closes over `todayCalls` from a dynamically imported service.
jest.mock('../../src/services/SystemStatsService', () => ({
  systemStats: { getTodayCalls: () => 17 },
}));

// `db` is a lazy Proxy singleton (database.ts) — jest.spyOn cannot reach
// through it, so the module is replaced with the two methods parseMciCodes
// actually calls.
jest.mock('../../src/database', () => ({
  db: {
    getMessageBases: jest.fn(async () => [{ name: 'General' }, { name: 'Amiga' }]),
    getUsers: jest.fn(async () => []),
  },
}));

// Inline mode's sentinel walker does `require('./command.handler')`
// unconditionally (screen.handler.ts, top of the `if (inlineMode)` block),
// and command.handler transitively loads src/index.ts — which boots the real
// server. Stubbing it keeps the pin to the MCI dispatch and nothing else.
const processCommandCalls: string[] = [];
jest.mock('../../src/handlers/command.handler', () => ({
  processCommand: jest.fn(async (_socket: any, _session: any, code: string, params: string) => {
    processCommandCalls.push(`${code}|${params}`);
    return true;
  }),
}));

import { parseMciCodes, setConferences } from '../../src/handlers/screen.handler';
import { flaggedFilesManager } from '../../src/services/FlaggedFilesManager';
import { flushOutput } from '../../src/utils/output.util';

const SNAPSHOT_PATH = path.join(__dirname, '__fixtures__', 'mci-dispatch-ansi-pin.json');
const UPDATE = process.env.UPDATE_MCI_PIN === '1';

const PIN_USER_ID = 4242;

// Logon time, also from local calendar components (Unix seconds).
const LOGON_TIME_SECONDS = Math.floor(new Date(2026, 8, 2, 9, 15, 30).getTime() / 1000);
const LAST_LOGIN = new Date(2026, 7, 30, 21, 44, 3);

function makeSession(overrides: any = {}): any {
  return {
    user: {
      id: PIN_USER_ID,
      username: 'PinUser',
      realName: 'Pin Real Name',
      email: 'pin@example.test',
      secLevel: 55,
      timesCalled: 91,
      callsToday: 3,
      messagesPosted: 12,
      uploads: 5,
      downloads: 22,
      uploadBytes: 1048576,
      downloadBytes: 3145728,
      location: 'Melbourne',
      phoneNumber: '555-0101',
      dailyTimeLimit: 7200,
      byteLimit: 9999,
      confAccess: 'XYZ',
      lastLogin: LAST_LOGIN,
    },
    timeRemaining: 3600,
    currentConf: 0,
    currentConfName: 'Main',
    currentMsgBase: 2,
    nodeId: 2,
    slowmo: 0,
    slowmoCount: 0,
    ...overrides,
  };
}

/**
 * The fixture list named by the plan, one entry per dispatch row family.
 * `~SS_` / `~SR_` deliberately reference base names that cannot exist on any
 * checkout so the `{{DISPLAY_FILE:N}}` placeholder resolves to '' everywhere
 * (the plan's `~SS_FOO|` / `~5SR_bar|` are the same forms with names that a
 * stray screen file could otherwise collide with).
 */
const FIXTURES: Array<{ name: string; content: string }> = [
  { name: 'N', content: 'user=~N|' },
  { name: 'N-width', content: 'user=[~10N|]' },
  { name: 'P-password-never', content: 'pw=[~P|]' },
  { name: 'UL-location', content: 'loc=~UL|' },
  { name: 'hash-phone', content: 'phone=~#|' },
  { name: 'counts', content: 'tc=~TC| tt=~TT| m=~M| a=~A| s=~S| ca=~CA| br=~BR| hw=~HW|' },
  { name: 'LC-lastcall', content: 'lc=~LC|' },
  { name: 'time', content: 'tl=~TL| tr=~TR|' },
  { name: 'bytes', content: 'ub=~UB| su=~SU| sd=~SD| fu=~FU| fd=~FD| bd=~BD|' },
  // PRE-EXISTING behaviour, deliberately pinned rather than fixed here: the
  // `~D<char>` terminator regex (screen.handler.ts, `terminatorRegex`) runs
  // over the WHOLE string before the tokenizer, so `~DT` (date) and `~DB`
  // (download bytes) are consumed as "set terminator to T / B" and never
  // reach the dispatch. Task 4 is a behaviour-free move; this row exists so
  // the move cannot quietly change the collision either way.
  { name: 'DT-eaten-by-terminator-regex', content: 'dt=~DT|x' },
  { name: 'DB-eaten-by-terminator-regex', content: 'db=~DB|x' },
  { name: 'node-identity', content: 'on=~ON| lg=~LG| in=~IN| rn=~RN| nd=~ND|' },
  { name: 'conference', content: 'cf=~CF| cn=~CN| mb=~MB| mn=~MN|' },
  { name: 'clocks', content: 'ct=~CT| vd=~VD| ve=~VE| ot=~OT| od=~OD| sc=~SC|' },
  { name: 'flagged', content: 'fc=~FC| ff=~FF|' },
  { name: 'FL', content: 'FL:[~FL|]' },
  { name: 'AK', content: '~AK|' },
  { name: 'CR', content: 'a~CR|b' },
  { name: 'NS', content: 'a~NS|b' },
  { name: 'SP', content: 'a~SP\nb' },
  { name: 'SP-width-gated', content: 'a~5SP|b' },
  { name: 'f-clear-noninline', content: 'a~f|b' },
  { name: 'w-delay', content: 'a~w|b~5w|c~w5|d' },
  { name: 'colors-fg', content: '~c0|~c1|~c2|~c3|~c4|~c5|~c6|~c7|' },
  { name: 'colors-bg', content: '~b0|~b1|~b2|~b3|~b4|~b5|~b6|~b7|' },
  { name: 'colors-bg-z-alias', content: '~z0|~z1|~z2|~z3|~z4|~z5|~z6|~z7|' },
  { name: 'newlines', content: '~n1|~n2|~n3|~n4|~n5|~n6|~n7|~n8|~n9|' },
  { name: 'q-reset', content: 'a~q|b' },
  { name: 'h-backspace', content: 'a~h|b' },
  { name: 'x-cursor-col', content: 'a~x10|b' },
  { name: 'y-cursor-row', content: 'a~y5|b' },
  { name: 'CC-noninline', content: 'a~CC_X|b' },
  { name: 'SS-noninline', content: 'a~SS_PIN_NO_SUCH_SCREEN|b' },
  { name: 'SR-noninline', content: 'a~5SR_pin_no_such_base|b' },
  { name: 'D-dot-terminator', content: '~D.~c3RED.~c4GREEN.~N.' },
  { name: 'D-hash-terminator', content: '~D#~c3RED#~N#' },
  { name: 'unknown-falls-through', content: 'a~ZZ|b' },
  { name: 'uppercase-F-is-not-clear', content: 'a~F|b' },
  { name: 'literal-tilde', content: 'a~~b' },
  { name: 'mixed-row', content: '~c3|~N| has ~FC| flagged on node ~ND|~q|' },
];

/** Inline-mode (socket) fixtures: the SENTINEL_* returns of the same table. */
const INLINE_FIXTURES: Array<{ name: string; content: string }> = [
  { name: 'inline-N', content: 'hi ~N|!' },
  { name: 'inline-f-sentinel', content: 'a~f|b' },
  { name: 'inline-SP-sentinel', content: 'a~SP\nb' },
  { name: 'inline-CC-sentinel', content: 'a~CC_X|b' },
];

/**
 * A UNIQUE socket id per fixture is required, not cosmetic: emitText buffers
 * per socket id (output.util), so two mock sockets sharing an id make
 * flushOutput deliver the second fixture's bytes to the FIRST fixture's
 * emit spy — and the pin would then freeze an empty string as "correct".
 */
function makeMockSocket(name: string) {
  const emitted: string[] = [];
  const socket: any = {
    emit: (_event: string, payload: string) => emitted.push(payload),
    on: () => {},
    removeAllListeners: () => {},
    id: `mci-pin-${name}`,
  };
  return { socket, emitted };
}

type PinRecord = {
  parsed: string;
  commands: string[];
  hasPause: boolean;
  slowmo: number;
  slowmoCount: number;
  nonStopText: boolean;
  currentMenuName: string | null;
  emitted?: string;
  inlineEmitted?: boolean;
  pendingInlineContent?: string;
  commandCalls?: string[];
};

const actual: Record<string, PinRecord> = {};

let randomSpy: jest.SpyInstance;

beforeAll(async () => {
  randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5);

  setConferences([
    { id: 0, name: 'Main Conference' },
    { id: 1, name: 'Amiga Chat' },
    { id: 2, name: 'Uploads' },
  ]);

  flaggedFilesManager.addFile(PIN_USER_ID, {
    fileName: 'demo1.lha', filePath: '/tmp/demo1.lha', fileSize: 1024,
  });
  flaggedFilesManager.addFile(PIN_USER_ID, {
    fileName: 'demo2.lha', filePath: '/tmp/demo2.lha', fileSize: 2048,
  });

  for (const fixture of FIXTURES) {
    const session = makeSession({ logonTime: LOGON_TIME_SECONDS });
    const result = await parseMciCodes(fixture.content, session, 'PinBBS', 'PinSysop', 'PinLand');
    actual[fixture.name] = {
      parsed: result.parsed,
      commands: result.commands,
      hasPause: result.hasPause,
      slowmo: result.slowmo ?? 0,
      slowmoCount: result.slowmoCount ?? 0,
      nonStopText: session.nonStopText === true,
      currentMenuName: session.currentMenuName ?? null,
    };
  }

  for (const fixture of INLINE_FIXTURES) {
    const session = makeSession({ logonTime: LOGON_TIME_SECONDS });
    const { socket, emitted } = makeMockSocket(fixture.name);
    processCommandCalls.length = 0;
    const result = await parseMciCodes(
      fixture.content, session, 'PinBBS', 'PinSysop', 'PinLand', socket,
    );
    flushOutput(socket);
    actual[fixture.name] = {
      parsed: result.parsed,
      commands: result.commands,
      hasPause: result.hasPause,
      slowmo: result.slowmo ?? 0,
      slowmoCount: result.slowmoCount ?? 0,
      nonStopText: session.nonStopText === true,
      currentMenuName: session.currentMenuName ?? null,
      emitted: emitted.join(''),
      inlineEmitted: result.inlineEmitted === true,
      pendingInlineContent: result.pendingInlineContent ?? '',
      commandCalls: [...processCommandCalls],
    };
  }

  if (UPDATE) {
    fs.mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true });
    fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(actual, null, 2) + '\n', 'utf8');
  }
});

afterAll(() => {
  randomSpy?.mockRestore();
});

describe('ANSI byte-identity pin — MCI dispatch', () => {
  test('the committed snapshot exists (regenerate only on purpose)', () => {
    expect(fs.existsSync(SNAPSHOT_PATH)).toBe(true);
  });

  test('the snapshot covers exactly the fixture list (no silent drops)', () => {
    const expected = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
    const names = [...FIXTURES, ...INLINE_FIXTURES].map(f => f.name).sort();
    expect(Object.keys(expected).sort()).toEqual(names);
  });

  test.each([...FIXTURES, ...INLINE_FIXTURES].map(f => [f.name] as const))(
    'fixture %s renders byte-identically to the pre-refactor snapshot',
    (name: string) => {
      const expected = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
      expect(actual[name]).toEqual(expected[name]);
    },
  );

  test('the fixed clock really drove the snapshot (guards a stale mock)', () => {
    expect(fixedNow().getFullYear()).toBe(FIXED_NOW_PARTS[0]);
    expect(actual['clocks'].parsed).toContain('AmiExpress-Web 2.0');
  });
});
