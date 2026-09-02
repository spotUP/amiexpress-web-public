// @ts-nocheck
/**
 * FULL-parity guard for the ONE MCI dispatch table (plan Task 4, tests 3
 * and the `~AK` / `~x` / `~y` rulings).
 *
 * Decision 1 of the plan is "every token the `.TXT` path supports works in a
 * `.seq`". The mechanical half of that promise is: `buildMciDispatch` returns
 * the SAME key set for `flavour: 'ansi'` and `flavour: 'petscii'`, for both
 * `dispatch` and `prefixDispatch`. An ANSI token added without a PETSCII
 * counterpart fails here rather than showing a C64 caller a literal `~code`.
 *
 * The rest of the file pins the transport differences the plan tabulates -
 * colour/background/reset/clear/backspace/CR as PETSCII control bytes, `~AK`
 * as plain 40-column rows, `~x`/`~y` as MOVE sentinels for the renderer to
 * resolve - and the invariant that no PETSCII value carries an ESC byte.
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
    getMessageBases: jest.fn(async () => [{ name: 'General' }, { name: 'Amiga' }]),
    getUsers: jest.fn(async () => []),
  },
}));

import {
  buildMciDispatch,
  MCI_SENTINELS,
  ACCESS_KEYS,
  renderAccessKeysAnsi,
  renderAccessKeysPetscii,
  PETSCII_RAW_CMDS,
  PETSCII_RAW_PREFIXES,
} from '../../src/handlers/mci-dispatch';

const session = () => ({
  user: { id: 7, username: 'C64User', secLevel: 30 },
  timeRemaining: 3600,
  currentConf: 0,
  currentConfName: 'Main',
  currentMsgBase: 1,
  nodeId: 3,
});

const opts = (flavour: 'ansi' | 'petscii', inlineMode = false) => ({
  flavour,
  inlineMode,
  bbsName: 'PinBBS',
  sysopName: 'PinSysop',
  location: 'PinLand',
  sentinels: MCI_SENTINELS,
});

/** The `~AK` literal this table replaced, kept here as the byte-exact oracle. */
const RETIRED_ACCESS_KEYS_LITERAL = [
  '         \x1b[44;33m F1 \x1b[40;35m  }- \x1b[33mSysop Login             \x1b[44;33m F2 \x1b[40;35m  }- \x1b[33mLocal Login',
  '         \x1b[44;33m F3 \x1b[40;35m  }- \x1b[33mInstant Remote Logon    \x1b[44;33m F4 \x1b[40;35m  }- \x1b[33mReserve for a user',
  '         \x1b[44;33m F5 \x1b[40;35m  }- \x1b[33mConference Maintenance  \x1b[44;33m F6 \x1b[40;35m  }- \x1b[33mAccount Editing',
  '       \x1b[44;33m SH+F5 \x1b[40;35m }- \x1b[33mOpen Shell            \x1b[44;33m SH+F6 \x1b[40;35m }- \x1b[33mView Callerslog',
  '         \x1b[44;33m F7 \x1b[40;35m  }- \x1b[33mChat Toggle             \x1b[44;33m F8 \x1b[40;35m  }- \x1b[33mReprogram modem',
  '         \x1b[44;33m F9 \x1b[40;35m  }- \x1b[33mExit BBS               \x1b[44;33m F10 \x1b[40;35m  }- \x1b[33mExit BBS \x1b[33m(\x1b[37moff hook\x1b[33m)\x1b[0m',
  '                                       \x1b[44;33m SH+F10 \x1b[40;35m }- \x1b[33mClear tooltype cache\x1b[0m',
].join('\r\n');

describe('buildMciDispatch — FULL-parity key sets', () => {
  for (const inlineMode of [false, true]) {
    test(`dispatch key sets match across flavours (inlineMode=${inlineMode})`, async () => {
      const a = await buildMciDispatch(session(), opts('ansi', inlineMode));
      const p = await buildMciDispatch(session(), opts('petscii', inlineMode));
      expect(Object.keys(p.dispatch).sort()).toEqual(Object.keys(a.dispatch).sort());
      expect(Object.keys(a.dispatch).length).toBeGreaterThan(50);
    });

    test(`prefixDispatch key sets match across flavours (inlineMode=${inlineMode})`, async () => {
      const a = await buildMciDispatch(session(), opts('ansi', inlineMode));
      const p = await buildMciDispatch(session(), opts('petscii', inlineMode));
      expect(Object.keys(p.prefixDispatch).sort()).toEqual(Object.keys(a.prefixDispatch).sort());
    });
  }

  test('inline mode adds the three sentinel prefixes in BOTH flavours', async () => {
    for (const flavour of ['ansi', 'petscii'] as const) {
      const off = await buildMciDispatch(session(), opts(flavour, false));
      const on = await buildMciDispatch(session(), opts(flavour, true));
      expect(Object.keys(off.prefixDispatch)).not.toContain('CC_');
      expect(Object.keys(on.prefixDispatch).sort())
        .toEqual([...Object.keys(off.prefixDispatch), 'CC_', 'SS_', 'SR_'].sort());
    }
  });

  test('every PETSCII_RAW_CMDS entry is a real dispatch key', async () => {
    const p = await buildMciDispatch(session(), opts('petscii'));
    for (const cmd of PETSCII_RAW_CMDS) {
      expect(Object.keys(p.dispatch)).toContain(cmd);
    }
    for (const prefix of PETSCII_RAW_PREFIXES) {
      expect(Object.keys(p.prefixDispatch)).toContain(prefix);
    }
  });
});

describe('buildMciDispatch — shared entries are one definition', () => {
  test('~N, ~CN, ~ND render identically in both flavours', async () => {
    const a = await buildMciDispatch(session(), opts('ansi'));
    const p = await buildMciDispatch(session(), opts('petscii'));
    for (const cmd of ['N', 'CN', 'ND', 'RN', 'TR', 'FC']) {
      expect(p.dispatch[cmd](-1, '')).toBe(a.dispatch[cmd](-1, ''));
    }
  });

  test('~SP returns the same sentinel in both flavours (inline)', async () => {
    const a = await buildMciDispatch(session(), opts('ansi', true));
    const p = await buildMciDispatch(session(), opts('petscii', true));
    expect(p.dispatch.SP(-1, '')).toBe(MCI_SENTINELS.SP);
    expect(a.dispatch.SP(-1, '')).toBe(MCI_SENTINELS.SP);
  });

  test('~SP sets state.hasPause (non-inline) rather than a captured local', async () => {
    const p = await buildMciDispatch(session(), opts('petscii', false));
    expect(p.state.hasPause).toBe(false);
    expect(p.dispatch.SP(-1, '')).toBe('');
    expect(p.state.hasPause).toBe(true);
  });

  test('~NS mutates the session, not the dispatch state', async () => {
    const s: any = session();
    const p = await buildMciDispatch(s, opts('petscii'));
    expect(p.dispatch.NS(-1, '')).toBe('');
    expect(s.nonStopText).toBe(true);
    expect(p.state.hasPause).toBe(false);
  });
});

describe('~AK — one shared key list, two renderings', () => {
  test('the ANSI rendering is byte-identical to the retired literal', () => {
    expect(renderAccessKeysAnsi()).toBe(RETIRED_ACCESS_KEYS_LITERAL);
  });

  test('the list is the single source of both renderings', () => {
    expect(ACCESS_KEYS).toHaveLength(13);
    const petscii = renderAccessKeysPetscii().split('\n');
    expect(petscii).toHaveLength(13);
    for (const entry of ACCESS_KEYS) {
      expect(renderAccessKeysAnsi()).toContain(` ${entry.key} `);
      expect(petscii.some(row => row.startsWith(entry.key))).toBe(true);
    }
  });

  test('the PETSCII rendering is plain, 40 columns, no ANSI', () => {
    for (const row of renderAccessKeysPetscii().split('\n')) {
      expect(row).not.toContain('\x1b');
      expect(row.length).toBeLessThanOrEqual(40);
      expect(row).not.toContain('\r');
    }
  });

  test("F10's ANSI-decorated label does not leak into PETSCII", () => {
    expect(renderAccessKeysAnsi()).toContain('Exit BBS \x1b[33m(\x1b[37moff hook\x1b[33m)');
    expect(renderAccessKeysPetscii()).toContain('Exit BBS (off hook)');
  });
});

describe('PETSCII transport encodings', () => {
  const bytes = (s: string) => [...s].map(c => c.charCodeAt(0));

  test('~c0..~c7 map onto the VIC pen table', async () => {
    const p = await buildMciDispatch(session(), opts('petscii'));
    // VIC 0,2,5,7,6,4,3,1 -> black, red, green, yellow, blue, purple, cyan, white
    expect(bytes(p.dispatch.c0(-1, ''))).toEqual([0x90]);
    expect(bytes(p.dispatch.c1(-1, ''))).toEqual([0x1c]); // plan T5 test 8
    expect(bytes(p.dispatch.c2(-1, ''))).toEqual([0x1e]);
    expect(bytes(p.dispatch.c7(-1, ''))).toEqual([0x05]);
  });

  test('~b* and ~z* emit the CCGMS background pair ($02 + colour)', async () => {
    const p = await buildMciDispatch(session(), opts('petscii'));
    expect(bytes(p.dispatch.b2(-1, ''))).toEqual([0x02, 0x1e]); // plan T8: $02 $1E
    for (let i = 0; i < 8; i++) {
      expect(p.dispatch[`z${i}`](-1, '')).toBe(p.dispatch[`b${i}`](-1, ''));
      expect(bytes(p.dispatch[`b${i}`](-1, ''))[0]).toBe(0x02);
    }
  });

  test('~q, ~f, ~h, ~CR, ~n3 are PETSCII control bytes', async () => {
    const p = await buildMciDispatch(session(), opts('petscii'));
    expect(bytes(p.dispatch.q(-1, ''))).toEqual([0x92, 0x9a]); // reverse off + light blue
    expect(bytes(p.dispatch.f(-1, ''))).toEqual([0x93]);       // CLR
    expect(bytes(p.dispatch.h(-1, ''))).toEqual([0x14]);       // DEL
    expect(bytes(p.dispatch.CR(-1, ''))).toEqual([0x0d]);
    expect(bytes(p.dispatch.n3(-1, ''))).toEqual([0x0d, 0x0d, 0x0d]);
  });

  test('inline ~f still returns the F sentinel, not $93', async () => {
    const p = await buildMciDispatch(session(), opts('petscii', true));
    expect(p.dispatch.f(-1, '')).toBe(MCI_SENTINELS.F);
  });

  test('~x/~y become MOVE sentinels in 0-based coordinates', async () => {
    const p = await buildMciDispatch(session(), opts('petscii'));
    // express.e:5478-5495 — ~x<n> is row 1 / col n; ~y<n> is row n / col 1.
    expect(p.prefixDispatch.x('10', -1)).toBe(`${MCI_SENTINELS.MOVE}9|0${MCI_SENTINELS.END}`);
    expect(p.prefixDispatch.y('5', -1)).toBe(`${MCI_SENTINELS.MOVE}0|4${MCI_SENTINELS.END}`);
    expect(p.prefixDispatch.x('nope', -1)).toBe('');
    expect(p.prefixDispatch.y('nope', -1)).toBe('');
  });

  test('~x/~y keep the express.e ANSI bytes in the ansi flavour', async () => {
    const a = await buildMciDispatch(session(), opts('ansi'));
    expect(a.prefixDispatch.x('10', -1)).toBe('\x1b[;10H');
    expect(a.prefixDispatch.y('5', -1)).toBe('\x1b[5;H');
  });

  test('NO petscii dispatch value contains an ESC byte', async () => {
    const p = await buildMciDispatch(session(), opts('petscii', true));
    for (const [cmd, fn] of Object.entries<any>(p.dispatch)) {
      const value = fn(-1, '');
      if (typeof value === 'string') {
        expect(`${cmd}:${value}`).not.toContain('\x1b');
      }
    }
    for (const [prefix, fn] of Object.entries<any>(p.prefixDispatch)) {
      const value = fn('1', -1);
      if (typeof value === 'string') {
        expect(`${prefix}:${value}`).not.toContain('\x1b');
      }
    }
  });
});
