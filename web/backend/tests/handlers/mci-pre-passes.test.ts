// @ts-nocheck
/**
 * ANSI byte-identity pin for the MCI pre-pass extraction (plan
 * `thoughts/shared/plans/2026-09-02-mci-in-petscii-seq.md`, Task 4b).
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * A large half of the MCI token set never reaches the tokenizer: twenty
 * regex passes inside `parseMciCodes` consume it first. Task 4b moves those
 * passes, verbatim and in order, into `handlers/mci-pre-passes.ts` so the
 * PETSCII `.seq` renderer runs the SAME twenty rather than supporting none
 * of them. As with the dispatch extraction, the `.TXT` path must not move a
 * byte, so the snapshot in `__fixtures__/mci-pre-passes-ansi-pin.json` was
 * generated BEFORE the move and is asserted afterwards.
 *
 * The twenty rows, in source order, each with a fixture below:
 *   ~D<char> terminator, ~XC_<cmd>||, ~XI<door>, ~CL., ~CD., ~ML., ~MD.,
 *   %NODELIST, ~CR_<prompt>||, ~SM_<menu>||, ~CC_ (non-inline),
 *   ~SS_/~2S (non-inline), ~<n>SR_ (non-inline), ~SX_<base>|| (both modes),
 *   ~SMO<n>|, ~SMC|, ~SP., ~CR., ~NSF, bare `~` on a line.
 *
 * The four list rows (~CL./~CD./~ML./~MD.) are pinned TWICE: once at 80
 * columns and once through the `isNarrow` branch a petsciiMode session
 * already takes today. Task 4b reuses those existing narrow branches for
 * `flavour: 'petscii'` rather than writing new 40-column builders, so both
 * shapes have to hold still.
 *
 * REGENERATING (only ever for a DELIBERATE, reviewed behaviour change):
 *   UPDATE_MCI_PIN=1 npx jest --config dev-scripts/jest.config.ts --rootDir . \
 *     tests/handlers/mci-pre-passes.test.ts
 */
import * as fs from 'fs';
import * as path from 'path';

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
    getMessageBases: jest.fn(async () => [{ name: 'General' }, { name: 'Amiga Coding' }]),
    getUsers: jest.fn(async () => []),
  },
}));

// %NODELIST reads the board config for max_nodes and the live node table.
jest.mock('../../src/services/bbs-config-file.service', () => ({
  getBoardConfig: jest.fn(async () => ({ max_nodes: 4 })),
}));

jest.mock('../../src/nodes/NodeStatusManager', () => ({
  nodeStatusManager: {
    getActiveNodes: () => [],
    getNodeInfo: (i: number) => (i === 1 ? { status: 0, handle: 'Zaphod' } : null),
  },
}));

// Inline mode's walker requires command.handler, which transitively boots
// src/index.ts. Stub it so the pin stays on the pre-passes.
jest.mock('../../src/handlers/command.handler', () => ({
  processCommand: jest.fn(async () => true),
}));

import { parseMciCodes, setConferences } from '../../src/handlers/screen.handler';
import { flushOutput } from '../../src/utils/output.util';

const SNAPSHOT_PATH = path.join(__dirname, '__fixtures__', 'mci-pre-passes-ansi-pin.json');
const UPDATE = process.env.UPDATE_MCI_PIN === '1';

function makeSession(overrides: any = {}): any {
  return {
    user: {
      id: 4243,
      username: 'PrePassUser',
      secLevel: 55,
      confAccess: 'XXX',
      dailyTimeLimit: 7200,
    },
    timeRemaining: 3600,
    currentConf: 1,
    currentConfName: 'Main',
    currentMsgBase: 1,
    nodeId: 1,
    slowmo: 0,
    slowmoCount: 0,
    ...overrides,
  };
}

const NARROW = { petsciiMode: true, screenWidth: 40 };

/** One fixture per pre-pass row (`narrow` re-runs it through isNarrow). */
const FIXTURES: Array<{ name: string; content: string; session?: any }> = [
  // 1. ~D<char> terminator (emits nothing, retargets the tokenizer)
  { name: 'D-terminator-dot', content: 'a~D.b' },
  { name: 'D-terminator-retargets-tokenizer', content: '~D.~N.' },
  // 2. ~XC_<cmd>|| — queue a command, emit ''
  { name: 'XC-command', content: 'a~XC_DOORS:who/NI ~N||b' },
  // 3. ~XI<doorpath> — queue an XIM door, emit ''
  { name: 'XI-door', content: 'a~XIDOORS:who/NI b' },
  // 4. ~CL. — conference list
  { name: 'CL-conference-list', content: '[~CL.]' },
  { name: 'CL-conference-list-narrow', content: '[~CL.]', session: NARROW },
  // 5. ~CD. — conference directory
  { name: 'CD-conference-dir', content: '[~CD.]' },
  { name: 'CD-conference-dir-narrow', content: '[~CD.]', session: NARROW },
  // 6. ~ML. — message base list
  { name: 'ML-msgbase-list', content: '[~ML.]' },
  { name: 'ML-msgbase-list-narrow', content: '[~ML.]', session: NARROW },
  // 7. ~MD. — message base descriptions
  { name: 'MD-msgbase-desc', content: '[~MD.]' },
  { name: 'MD-msgbase-desc-narrow', content: '[~MD.]', session: NARROW },
  // 8. %NODELIST
  { name: 'NODELIST', content: '[%NODELIST]' },
  { name: 'NODELIST-narrow', content: '[%NODELIST]', session: NARROW },
  // 9. ~CR_<prompt>|| — sets hasPause, emits the prompt text
  { name: 'CR-underscore-prompt', content: 'a~CR_Press any key||b' },
  // 10. ~SM_<menu>|| — sets session.currentMenuName, emits ''
  { name: 'SM-set-menu', content: 'a~SM_MAINMENU||b' },
  // 11. ~CC_<cmd> non-inline — queue the command
  { name: 'CC-noninline', content: 'a~CC_X|b' },
  { name: 'CC-noninline-double-pipe', content: 'a~CC_BULL||b' },
  // 12. ~SS_ / ~2S non-inline — {{DISPLAY_FILE:N}} placeholder
  { name: 'SS-noninline', content: 'a~SS_PIN_NO_SUCH_SCREEN|b' },
  { name: '2S-noninline', content: 'a~2SPIN_NO_SUCH_SCREEN|b' },
  // 13. ~<n>SR_ non-inline — random numbered file placeholder
  { name: 'SR-noninline', content: 'a~5SR_pin_no_such_base|b' },
  { name: 'SR-noninline-no-width', content: 'a~SR_pin_no_such_base|b' },
  // 14. ~SX_<base>|| — sequential numbered file (BOTH modes)
  { name: 'SX-sequential', content: 'a~SX_pin_no_such_base||b' },
  // 15. ~SMO<n>| — slow mode on
  { name: 'SMO-3', content: 'a~SMO3|b' },
  { name: 'SMO-bare', content: 'a~SMO|b' },
  { name: 'SMO-clamped-high', content: 'a~SMO9|b' },
  { name: 'SMO-clamped-low', content: 'a~SMO-9|b' },
  // 16. ~SMC| — slow mode clear
  { name: 'SMC-clears', content: 'a~SMO3|b~SMC|c' },
  // 17. ~SP. — pause variant
  { name: 'SP-dot', content: 'a~SP.b' },
  // 18. ~CR. — silent character read
  { name: 'CR-dot', content: 'a~CR.b' },
  // 19. ~NSF — non-stop flag
  { name: 'NSF', content: 'a~NSFb' },
  // 20. bare ~ on a line — WEB clear-screen extension
  { name: 'bare-tilde-line', content: 'a\n~\nb' },
  { name: 'bare-tilde-line-trailing-space', content: 'a\n~  \nb' },
  // The whole set in one document, in source order.
  {
    name: 'all-rows-combined',
    content: [
      '~D|',
      'x~XC_DOORS:who/NI||y',
      'x~XIDOORS:who/NO y',
      '~CL.',
      '~CD.',
      '~ML.',
      '~MD.',
      '%NODELIST',
      '~CR_Hit it||',
      '~SM_MENUNAME||',
      '~CC_X|',
      '~SS_PIN_NO_SUCH_SCREEN|',
      '~5SR_pin_no_such_base|',
      '~SX_pin_no_such_base||',
      '~SMO2|',
      '~SMC|',
      '~SP.',
      '~CR.',
      '~NSF',
      '~',
    ].join('\n'),
  },
];

/** ~SX_ runs in BOTH modes, so it is pinned through the socket path too. */
const INLINE_FIXTURES: Array<{ name: string; content: string }> = [
  { name: 'inline-SX-sequential', content: 'a~SX_pin_no_such_base||b' },
  { name: 'inline-SP-dot', content: 'a~SP.b' },
  { name: 'inline-NSF', content: 'a~NSFb' },
  { name: 'inline-bare-tilde-line', content: 'a\n~\nb' },
];

function makeMockSocket(name: string) {
  const emitted: string[] = [];
  const socket: any = {
    emit: (_event: string, payload: string) => emitted.push(payload),
    on: () => {},
    removeAllListeners: () => {},
    id: `mci-prepass-${name}`,
  };
  return { socket, emitted };
}

const actual: Record<string, any> = {};

let randomSpy: jest.SpyInstance;

beforeAll(async () => {
  randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5);

  // Conference ids are 1-based for checkConfAccess (confAccess 'XXX' grants
  // positions [0..2], i.e. conferences 1..3).
  setConferences([
    { id: 1, name: 'Main Conference' },
    { id: 2, name: 'Amiga Chat' },
    { id: 3, name: 'Uploads And Downloads Area' },
  ]);

  for (const fixture of FIXTURES) {
    const session = makeSession(fixture.session);
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
    const session = makeSession();
    const { socket, emitted } = makeMockSocket(fixture.name);
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

describe('ANSI byte-identity pin — MCI pre-passes', () => {
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

  test('the fixtures really exercised the passes (guards a silent no-op)', () => {
    expect(actual['XC-command'].commands).toEqual(['DOORS:who/NI ~N']);
    expect(actual['SM-set-menu'].currentMenuName).toBe('MAINMENU');
    expect(actual['NSF'].nonStopText).toBe(true);
    expect(actual['SP-dot'].hasPause).toBe(true);
    expect(actual['SMO-3'].slowmo).toBe(3);
    expect(actual['CL-conference-list'].parsed).toContain('Main Conference');
    expect(actual['ML-msgbase-list'].parsed).toContain('Amiga Coding');
    expect(actual['NODELIST'].parsed).toContain('Node 0:');
    expect(actual['bare-tilde-line'].parsed).toContain('\x1b[2J\x1b[H');
  });

  test('the narrow branch really differs from the 80-column one', () => {
    for (const row of ['CL-conference-list', 'CD-conference-dir', 'ML-msgbase-list', 'MD-msgbase-desc']) {
      expect(actual[`${row}-narrow`].parsed).not.toBe(actual[row].parsed);
    }
  });
});
