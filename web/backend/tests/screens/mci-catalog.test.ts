/**
 * The catalog is a DESCRIPTION of the MCI codes, so the only thing worth
 * testing about it is whether the description is true.
 *
 * Not "does the array have 100 entries" - a list agreeing with itself proves
 * nothing, which this repo has already paid for once (the entrypoint's
 * conference guard and its fixture invented the same icon format and neither
 * matched a real one). So every entry is driven through the REAL parser, and
 * an entry the parser leaves as literal text fails.
 */

import { parseMciCodes, mciDispatchKeys } from '../../src/handlers/screen.handler';
import { MCI_CATALOG, MCI_BY_CODE, MCI_FAMILY_ORDER, type MciCode } from '../../src/screens/mci-catalog';

/**
 * The session type, taken from the function under test rather than imported.
 *
 * `BBSSession` lives in `src/index.ts`, and importing from there to get a TYPE
 * drags the server's module graph into a unit test.
 */
type ParserSession = Parameters<typeof parseMciCodes>[1];

function makeSession(): ParserSession {
  return {
    user: {
      username: 'TestUser',
      realName: 'A Real Name',
      secLevel: 20,
      timesCalled: 5,
      messagesPosted: 3,
      uploads: 1,
      downloads: 2,
      uploadBytes: 1024,
      downloadBytes: 2048,
      location: 'Somewhere',
      phoneNumber: '555-0000',
      dailyTimeLimit: 7200,
    },
    timeRemaining: 3600,
    currentConf: 1,
    currentConfName: 'General',
    nodeId: 1,
    slowmo: 0,
    slowmoCount: 0,
  } as unknown as ParserSession;
}

/** A plausible argument for each kind, so the probe looks like a real screen. */
function probeArgument(entry: MciCode): string {
  switch (entry.argument.kind) {
    case 'none':    return '';
    case 'command': return 'gwall';
    case 'screen':  return 'BBS:Screens/probe.txt';
    case 'door':    return 'probedoor';
    case 'menu':    return 'MAIN';
    case 'text':    return 'Press a key';
    case 'number':  return '10';
    case 'char':    return '.';
  }
}

/**
 * The code as a screen file would carry it.
 *
 * `~~` is express.e's literal tilde (express.e:5749) and is the one entry that
 * is not written `~` + code.
 */
function probeFor(entry: MciCode): string {
  if (entry.code === '~') return '~~';
  return `~${entry.code}${probeArgument(entry)}${entry.terminator}`;
}

/**
 * What an UNRECOGNISED code produces.
 *
 * express.e's scanner consumes the `~` and the terminator whether or not the
 * cmd matched, and emits the cmd text as plain characters (express.e:5769-5802,
 * mirrored by the tokenizer's strict fall-through). So "the tilde is gone" is
 * true of every code ever written and proves NOTHING - the first version of
 * this test asserted exactly that and passed on codes the parser does not know.
 *
 * The real question is whether the output differs from the fall-through.
 */
function fallThroughFor(entry: MciCode): string {
  return `START ${entry.code}${probeArgument(entry)} END`;
}

describe('the MCI catalog describes what the parser actually does', () => {
  test.each(MCI_CATALOG.map(e => [e.code, e] as const))(
    '~%s does something the parser would not do for an unknown code',
    async (_code, entry) => {
      const probe = probeFor(entry);
      const { parsed } = await parseMciCodes(`START ${probe} END`, makeSession());

      if (entry.code === '~') {
        // `~~` collapses to one tilde rather than disappearing.
        expect(parsed).toBe('START ~ END');
        return;
      }

      expect(parsed).not.toBe(fallThroughFor(entry));
      expect(parsed).not.toContain(`~${entry.code}`);
    }
  );

  test('an unknown code IS left as its own text, which is what makes the probe mean something', async () => {
    const { parsed } = await parseMciCodes('START ~ZZ| END', makeSession());
    expect(parsed).toBe('START ZZ END');
  });
});

describe('the catalog and the dispatch cannot drift apart', () => {
  beforeAll(async () => {
    // mciDispatchKeys() reports what the last parse BUILT, so drive one.
    await parseMciCodes('~N|', makeSession());
  });

  test('every code the catalog calls tokenizer-handled is a real dispatch key', () => {
    const keys = new Set(mciDispatchKeys());
    expect(keys.size).toBeGreaterThan(0);

    const missing = MCI_CATALOG
      .filter(e => e.handledBy === 'dispatch')
      .map(e => e.code)
      .filter(code => !keys.has(code));

    expect(missing).toEqual([]);
  });

  test('every dispatch key is described by the catalog', () => {
    const undescribed = [...new Set(mciDispatchKeys())].filter(key => !MCI_BY_CODE.has(key));
    expect(undescribed).toEqual([]);
  });
});

describe('what the catalog promises about itself', () => {
  test('no code is listed twice', () => {
    const codes = MCI_CATALOG.map(e => e.code);
    expect(codes.length).toBe(new Set(codes).size);
  });

  test('every family has a heading, and every heading has codes', () => {
    const inCatalog = new Set(MCI_CATALOG.map(e => e.family));
    const inOrder = new Set(MCI_FAMILY_ORDER.map(f => f.family));
    expect([...inCatalog].filter(f => !inOrder.has(f))).toEqual([]);
    expect([...inOrder].filter(f => !inCatalog.has(f))).toEqual([]);
  });

  test('an alias names a code that exists, and is not itself aliased', () => {
    for (const entry of MCI_CATALOG.filter(e => e.aliasOf)) {
      const target = MCI_BY_CODE.get(entry.aliasOf!);
      expect(target).toBeDefined();
      expect(target!.aliasOf).toBeUndefined();
    }
  });

  test('the background colours are eight choices, not sixteen', () => {
    const bg = MCI_CATALOG.filter(e => e.family === 'colour' && e.summary.startsWith('Background'));
    expect(bg).toHaveLength(16);
    expect(bg.filter(e => !e.aliasOf)).toHaveLength(8);
  });

  test('an argument-taking code names where its choices come from', () => {
    expect(MCI_BY_CODE.get('CC_')!.argument.kind).toBe('command');
    expect(MCI_BY_CODE.get('SS_')!.argument.kind).toBe('screen');
    expect(MCI_BY_CODE.get('XI')!.argument.kind).toBe('door');
    expect(MCI_BY_CODE.get('SM_')!.argument.kind).toBe('menu');
  });

  test('~SR_ takes a width because the width is how many files it picks from', () => {
    expect(MCI_BY_CODE.get('SR_')!.takesWidth).toBe(true);
  });
});
