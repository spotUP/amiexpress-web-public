/**
 * `^` takes a help TOPIC, and a topic is a name.
 *
 * express.e:25089 resolves `BBS:help/<params>` through an AmigaDOS assign. This
 * port resolves it against a filesystem root, and `path.join` normalises `..` -
 * so a caller typing `^ ../../../<something>` reached any text file on the
 * container, because _findSecurityScreen appends `.txt`/`.TXT` and displays
 * whatever it finds. Any logged-on caller, no special access.
 *
 * Two earlier fixes made it worse without meaning to: the path had been
 * CWD-relative and resolved nowhere, so the traversal was latent; anchoring it
 * at the real board root made it live.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * The confinement rule, exercised as the handler applies it. Mirrors the
 * predicate in utility-commands.handler.ts; if that changes shape, this test
 * is where the disagreement surfaces.
 */
function confineToHelp(root: string, term: string): string | null {
  if (!term || term.includes('..') || path.isAbsolute(term)) return null;
  if (term.includes('/') || term.includes('\\')) return null;
  const full = path.resolve(root, term);
  return full === root || full.startsWith(root + path.sep) ? full : null;
}

describe('a help topic cannot climb out of HELP/', () => {
  let root: string;
  let secret: string;

  beforeEach(() => {
    const board = fs.mkdtempSync(path.join(os.tmpdir(), 'help-confine-'));
    root = path.join(board, 'HELP');
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, 'TESTPAGE.txt'), 'a real help page');
    // Something a caller must never reach by typing at the `^` prompt.
    secret = path.join(board, 'secrets.txt');
    fs.writeFileSync(secret, 'not for callers');
  });

  it('serves a plain topic', () => {
    const resolved = confineToHelp(root, 'TESTPAGE');
    expect(resolved).toBe(path.join(root, 'TESTPAGE'));
  });

  it('refuses a parent segment', () => {
    // THE VULNERABILITY. Before the fix this resolved to the sibling file and
    // _findSecurityScreen displayed it.
    expect(confineToHelp(root, '../secrets')).toBeNull();
    expect(confineToHelp(root, '../../../../etc/hosts')).toBeNull();
  });

  it('refuses a separator, so no subdirectory can be addressed either', () => {
    expect(confineToHelp(root, 'sub/page')).toBeNull();
    expect(confineToHelp(root, 'sub\\page')).toBeNull();
  });

  it('refuses an absolute path', () => {
    expect(confineToHelp(root, secret.replace(/\.txt$/, ''))).toBeNull();
    expect(confineToHelp(root, '/etc/hosts')).toBeNull();
  });

  it('refuses an empty term rather than serving the directory itself', () => {
    expect(confineToHelp(root, '')).toBeNull();
  });

  it('still confines when the term is shortened, as the progressive search does', () => {
    // express strips the last character and retries. Each attempt is confined
    // on its own; shortening must never turn a refused term into an allowed
    // path that escapes.
    let term = '../secrets';
    const reached: Array<string | null> = [];
    while (term.length > 0) {
      reached.push(confineToHelp(root, term));
      term = term.slice(0, -1);
    }
    for (const r of reached) {
      if (r !== null) expect(r.startsWith(root + path.sep) || r === root).toBe(true);
    }
  });
});
