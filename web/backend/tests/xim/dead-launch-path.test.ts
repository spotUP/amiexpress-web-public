/**
 * SOURCE PIN. `launchAmigaDoor` (door.handler.ts:665) still derives its
 * lineWrap from `doorScreenWidth(session, terminalWidth)` — a 40-column
 * HARD character wrap (line-wrap.util.ts wrapLine has no word awareness).
 * That is fine only because nothing calls it: `executeDoor` dispatches every
 * XIM/AIM/SIM/TIM/IIM/FIM/DD door to `executeAmigaDoor`, whose bbsSession
 * carries no lineWrap at all, so the 80-column default in
 * XIMProtocol.ts:141 (`this.bbsSession?.lineWrap ?? 80`) applies instead
 * (see petscii-door-linewrap.test.ts).
 *
 * If a future edit wires `launchAmigaDoor` back into that dispatch, this
 * count goes from 0 to 1 and the test fails — the reviewer must then
 * revisit whether the 40-column hard wrap is safe on a PETSCII session
 * before landing it (this plan's ruling 4).
 *
 * Counting method: walk every .ts file under web/backend/src, strip `//`
 * line comments, and count occurrences of `launchAmigaDoor(` that are not
 * the function's own declaration (`function launchAmigaDoor(`). A real
 * invocation anywhere in src — dispatch code, a new handler, a test helper
 * imported into src — trips this.
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC_ROOT = path.resolve(__dirname, '../../src');

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listTsFiles(full));
    } else if (entry.isFile() && full.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** Strip `//...` line comments (naive but sufficient: no `//` occurs inside
 * a string literal anywhere near a `launchAmigaDoor` mention in this repo -
 * verified by inspection of every current match). */
function stripLineComments(line: string): string {
  const idx = line.indexOf('//');
  return idx === -1 ? line : line.slice(0, idx);
}

/** Real call sites for `launchAmigaDoor` across web/backend/src: every match
 * of `launchAmigaDoor(` outside `//` comments and outside the function's own
 * `function launchAmigaDoor(` declaration line. */
function countLaunchAmigaDoorCallSites(): { file: string; line: number; text: string }[] {
  const hits: { file: string; line: number; text: string }[] = [];
  for (const file of listTsFiles(SRC_ROOT)) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((rawLine, i) => {
      const code = stripLineComments(rawLine);
      if (!code.includes('launchAmigaDoor(')) return;
      if (/\bfunction\s+launchAmigaDoor\s*\(/.test(code)) return; // its own declaration
      hits.push({ file: path.relative(SRC_ROOT, file), line: i + 1, text: rawLine.trim() });
    });
  }
  return hits;
}

describe('launchAmigaDoor stays callerless (its 40-column lineWrap is unsafe once reachable)', () => {
  it('has zero real call sites in web/backend/src outside its own declaration', () => {
    const hits = countLaunchAmigaDoorCallSites();
    expect(hits).toEqual([]);
  });
});
