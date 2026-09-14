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
