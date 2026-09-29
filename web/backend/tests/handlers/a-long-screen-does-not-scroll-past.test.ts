/**
 * A screen taller than the caller's screen PAUSES instead of scrolling.
 *
 * express.e shows every screen through displayFile, which pauses per lineCount
 * (express.e:28025 / 5180) - a long bulletin pauses mid-content. This port had
 * that too, on the path that builds the screen as a string.
 *
 * It has not been on the path that actually runs. Inline mode emits a screen
 * DURING the parse, chunk by chunk, and the only thing that can stop it is a
 * `~SP` the artist typed - so a screen with no `~SP` and more lines than the
 * caller has streamed past. `Bulletins/bull6.txt` is 38 lines, a phone is 25,
 * and thirteen lines of the last-callers bulletin went by before the caller
 * could read them (sysop, 2026-09-14, with a screenshot of its tail sitting
 * alone above a pause prompt).
 *
 * So plain art that needs paging takes the paginating path, and everything
 * that depends on inline semantics - `~CC_` running in document order, `~SS_`
 * drawing where it stands, `~SP` carrying its own remainder - does not.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { displayScreen } from '../../src/handlers/screen.handler';
import { flushOutput } from '../../src/utils/output.util';
import { config } from '../../src/config';

/** 24 lines of screen, the web session's default (index.ts:1270). */
const CALLER_LINES = 24;

let root: string;
let previousDataDir: string;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'long-screen-'));
  previousDataDir = config.get('dataDir');
  config.set('dataDir', root);
});

afterAll(() => {
  config.set('dataDir', previousDataDir);
  fs.rmSync(root, { recursive: true, force: true });
});

/** A screen file of `count` numbered lines, with whatever header is given. */
function aScreenOf(count: number, header = '~f'): string {
  const body = Array.from({ length: count }, (_, i) => `line ${i + 1}`).join('\r\n');
  const file = path.join(root, `screen-${count}-${Math.random().toString(36).slice(2)}.txt`);
  fs.writeFileSync(file, `${header}\r\n${body}\r\n`, 'latin1');
  return file;
}

interface Shown { text: string; lines: number }

async function show(file: string): Promise<Shown> {
  const out: string[] = [];
  const session: any = {
    nodeId: 0,
    currentConf: 1,
    screenHeight: CALLER_LINES,
    // A different id per caller: the output buffer is keyed by socket id.
    user: { username: 'Spot', secLevel: 255 },
  };
  const socket: any = {
    id: `long-screen-${Math.random().toString(36).slice(2)}`,
    session,
    emit: (_event: string, data: unknown) => { if (typeof data === 'string') out.push(data); },
    on: () => {},
  };
  expect(await displayScreen(socket, session, file)).toBe(true);
  flushOutput(socket);
  const text = out.join('');
  return { text, lines: (text.match(/line \d+/g) || []).length };
}

/** The same, but asking the loader for a screen by NAME - what the board does. */
async function showByName(name: string): Promise<Shown> {
  const out: string[] = [];
  const session: any = {
    nodeId: 0,
    currentConf: 1,
    screenHeight: CALLER_LINES,
    user: { username: 'Spot', secLevel: 255 },
  };
  const socket: any = {
    id: `by-name-${Math.random().toString(36).slice(2)}`,
    session,
    emit: (_event: string, data: unknown) => { if (typeof data === 'string') out.push(data); },
    on: () => {},
  };
  expect(await displayScreen(socket, session, name)).toBe(true);
  flushOutput(socket);
  const text = out.join('');
  return { text, lines: (text.match(/line \d+/g) || []).length };
}

describe('a screen with more lines than the caller has', () => {
  it('stops at a page instead of streaming the lot', async () => {
    const shown = await show(aScreenOf(40));

    // RED before the fix: all 40 arrived at once and the first 15 scrolled off
    // a 25-row screen before anybody could read them.
    expect(shown.lines).toBeLessThanOrEqual(CALLER_LINES);
    expect(shown.lines).toBeGreaterThan(0);
  });

  it('asks the question express.e asks', () => {
    // Not the `~SP` prompt: this is pagination, so the caller can stop with
    // `n` or take the rest in one go with `ns`.
    return show(aScreenOf(40)).then((shown) => {
      expect(shown.text).toMatch(/More\(y\/n\/ns\)/);
    });
  });

  it('leaves a screen that FITS exactly as it was', async () => {
    // The common case, and the one this must not disturb: no prompt, no
    // pagination, every line in one go.
    const shown = await show(aScreenOf(10));

    expect(shown.lines).toBe(10);
    expect(shown.text).not.toMatch(/More\(y\/n\/ns\)/);
  });
});

describe('what keeps the inline path, however long it is', () => {
  it('a screen with its OWN pause', async () => {
    /*
     * `~SP` carries its own remainder through the segment machinery, and the
     * artist who typed it chose where the break falls. Pagination must not
     * take that screen over: its prompt is the `~SP` one.
     */
    const body = Array.from({ length: 40 }, (_, i) => `line ${i + 1}`).join('\r\n');
    const file = path.join(root, `paused-${Math.random().toString(36).slice(2)}.txt`);
    fs.writeFileSync(file, `~f\r\n${body}\r\n~SP\r\n`, 'latin1');

    const shown = await show(file);

    expect(shown.text).toMatch(/Space To Resume/);
    expect(shown.text).not.toMatch(/More\(y\/n\/ns\)/);
  });

  it('a screen that RUNS something, because order is the point', async () => {
    // `~CC_` runs where it stands, between the text above it and the text
    // below. A paginating path collects commands and runs them afterwards,
    // which is a different screen.
    const body = Array.from({ length: 40 }, (_, i) => `line ${i + 1}`).join('\r\n');
    const file = path.join(root, `cmd-${Math.random().toString(36).slice(2)}.txt`);
    fs.writeFileSync(file, `~f\r\n${body}\r\n~CC_ctop\r\n`, 'latin1');

    const shown = await show(file);

    // All forty, inline, exactly as before - no page break imposed on it.
    expect(shown.lines).toBe(40);
    expect(shown.text).not.toMatch(/More\(y\/n\/ns\)/);
  });
});

/**
 * ...AND THREE SCREENS THAT ARE MEANT TO RUN PAST THE BOTTOM.
 *
 * The connect splash, the title and the logon screen are one piece of art
 * each. The first version of this fix paginated them, and the sysop met
 * `(Pause)...More(y/n/ns)?` through the middle of the title logo - twice -
 * before saying what the art is for: "we already format it so it looks nice
 * at 80 columns, its supposed to be tall".
 *
 * Asserted as a PROPERTY of a 68-line screen, not as a claim that this
 * board's title happens to be short - it is not, and a claim like that rots
 * the first time an artist redraws it. And read off the WIRE: no prompt
 * reaches the caller, rather than a flag being false somewhere.
 */
describe('a screen that is one piece of art', () => {
  /** BBSTITLE's real height on this board, and far over any caller's. */
  const TITLE_LINES = 68;

  const asScreen = (name: string, lines: number): void => {
    const body = Array.from({ length: lines }, (_, i) => `line ${i + 1}`).join('\r\n');
    /*
     * Every directory the loader walks for a bare screen NAME - the node's
     * own, the node's Screens, and the board's - because which one wins is
     * express.e's business (screen-resolution.ts) and not what this is about.
     */
    for (const dir of [
      path.join(root, 'Screens'),
      path.join(root, 'Node0'),
      path.join(root, 'Node0', 'Screens'),
    ]) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${name}.TXT`), `~f\r\n${body}\r\n`, 'latin1');
    }
  };

  for (const name of ['BBSTITLE', 'AWAITSCREEN', 'LOGON', 'LOGOFF']) {
    it(`${name} is not paginated at ${TITLE_LINES} lines`, async () => {
      asScreen(name, TITLE_LINES);
      const shown = await showByName(name);

      expect(shown.text).not.toMatch(/More\(y\/n\/ns\)/);
      // And all of it went out: the art is meant to run past the bottom.
      expect(shown.lines).toBe(TITLE_LINES);
    });
  }

  it('the logo the logoff screen INCLUDES is not paginated either', async () => {
    /*
     * The half that adding LOGOFF to the list does not fix, and the reason
     * the sysop saw a cut logo four times.
     *
     * This board's logoff screen is one line - `~ ~3SR_WORK:bbs/Screens/
     * logoff/logoff` - so the art arrives through the include, shown as a
     * screen of its own named by its resolved PATH. `001.logoff` matched no
     * exemption, so the board paused in the middle of the logo with nobody
     * left to answer the prompt.
     */
    const dir = path.join(root, 'Screens', 'logoff');
    fs.mkdirSync(dir, { recursive: true });
    const body = Array.from({ length: TITLE_LINES }, (_, i) => `line ${i + 1}`).join('\r\n');
    const file = path.join(dir, '001.logoff.txt');
    fs.writeFileSync(file, `~f\r\n${body}\r\n`, 'latin1');

    const shown = await show(file);

    expect(shown.text).not.toMatch(/More\(y\/n\/ns\)/);
    expect(shown.lines).toBe(TITLE_LINES);
  });

  it('the logo is not paginated when the pool asks for it WITHOUT an extension', async () => {
    // What the ~SR_ include actually asks for on the live board:
    // `/app/data/bbs/Screens/logoff/001.logoff` - the name lost its `.logoff`
    // to the extension strip and matched no exemption (2026-09-29).
    const dir = path.join(root, 'Screens', 'logoff');
    fs.mkdirSync(dir, { recursive: true });
    const body = Array.from({ length: TITLE_LINES }, (_, i) => `line ${i + 1}`).join('\r\n');
    fs.writeFileSync(path.join(dir, '002.logoff.txt'), `~f\r\n${body}\r\n`, 'latin1');

    const shown = await show(path.join(dir, '002.logoff'));

    expect(shown.text).not.toMatch(/More\(y\/n\/ns\)/);
    expect(shown.lines).toBe(TITLE_LINES);
  });

  it("any screen that carries express.e's ~NS| is one piece, whatever its name", async () => {
    // express.e:5740-5742 - `~NS` sets nonStopDisplayFlag. The parity survey
    // (2026-09-29) found `~NS|` still paginated a tall screen (G-NS).
    const shown = await show(aScreenOf(TITLE_LINES, '~f~NS|'));

    expect(shown.text).not.toMatch(/More\(y\/n\/ns\)/);
    expect(shown.lines).toBe(TITLE_LINES);
  });

  it('and so does the port\'s older ~NSF spelling', async () => {
    const shown = await show(aScreenOf(TITLE_LINES, '~f~NSF'));

    expect(shown.text).not.toMatch(/More\(y\/n\/ns\)/);
  });

  it('a code that only STARTS with NS is not the non-stop flag', async () => {
    const shown = await show(aScreenOf(40, '~f~NSX|'));

    expect(shown.text).toMatch(/More\(y\/n\/ns\)/);
  });

  it('still paginates a screen that is text to be read', async () => {
    // BULL: in the board's catalogue like the three above, and deliberately
    // NOT exempt - it is text to be read. By name, so what is under test is
    // the exemption list and not the fixture.
    asScreen('BULL', 40);
    const shown = await showByName('BULL');

    expect(shown.text).toMatch(/More\(y\/n\/ns\)/);
    expect(shown.lines).toBeLessThanOrEqual(CALLER_LINES);
  });
});
