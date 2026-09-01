/**
 * The A command must actually be able to load its own handler.
 *
 * From the sysop's session:
 *
 *   AmiExpress Web BBS [0:General] Menu (60 mins. left): a
 *   Error processing command.
 *
 * The cause was a require path that had never been right:
 *
 *   Error: Cannot find module './alter-flags.handler'
 *   Require stack:
 *   - src/handlers/commands/display-file-commands.handler.ts
 *
 * AlterFlagsHandler lives in `handlers/operations/`, and three call sites
 * asked for it - and for config and three utils - one directory too shallow.
 * A lazy `require()` inside a function is invisible to the compiler and to
 * every import-time check: typecheck passes, the server boots, every test
 * that imports the handler DIRECTLY passes, and the only thing that fails is
 * a user pressing the key. That is what these tests stand in for.
 *
 * They deliberately go through display-file-commands rather than importing
 * AlterFlagsHandler, because importing it directly is exactly the thing that
 * hid the bug.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';

process.env.SKIP_DB_INIT = 'true';

const SRC = path.resolve(__dirname, '../../src');
const ALTER_FLAGS = path.join(SRC, 'handlers/operations/alter-flags.handler.ts');
const DISPLAY_FILE = path.join(SRC, 'handlers/commands/display-file-commands.handler.ts');
const COMMAND_HANDLER = path.join(SRC, 'handlers/command.handler.ts');

/** Every `require('./x')` / `require('../x')` literal in a file, with line numbers. */
function relativeRequires(file: string): Array<{ spec: string; line: number }> {
  const out: Array<{ spec: string; line: number }> = [];
  const pattern = /require\(\s*['"](\.[^'"]+)['"]\s*\)/g;
  fs.readFileSync(file, 'utf-8').split('\n').forEach((text, i) => {
    for (const m of text.matchAll(pattern)) out.push({ spec: m[1], line: i + 1 });
  });
  return out;
}

/** Resolve a spec the way the running server would, from the requiring file. */
function resolvesFrom(file: string, spec: string): boolean {
  try {
    createRequire(file).resolve(spec);
    return true;
  } catch {
    return false;
  }
}

describe('the A command can reach the code it dispatches to', () => {
  it('resolves AlterFlagsHandler from the command that dispatches it', () => {
    // The exact failure the sysop hit.
    const requires = relativeRequires(DISPLAY_FILE).filter(r => r.spec.includes('alter-flags'));
    expect(requires.length).toBeGreaterThan(0);
    for (const r of requires) {
      expect(`${r.spec} (line ${r.line})`).toBe(
        resolvesFrom(DISPLAY_FILE, r.spec) ? `${r.spec} (line ${r.line})` : 'a path that resolves'
      );
    }
  });

  it('resolves AlterFlagsHandler from the flag-input continuation', () => {
    // A second, separate site: once the prompt is up, every keystroke of the
    // filename goes through command.handler's FLAG_INPUT branch. Fixing only
    // the first site would have moved the same error one keypress later.
    const requires = relativeRequires(COMMAND_HANDLER).filter(r => r.spec.includes('alter-flags'));
    expect(requires.length).toBeGreaterThan(0);
    for (const r of requires) {
      expect(resolvesFrom(COMMAND_HANDLER, r.spec)).toBe(true);
    }
  });

  it('resolves everything the handler itself requires lazily', () => {
    // The (F)rom branch loads config and three utils on demand, all four one
    // level short. Reachable only by pressing A and then F, so nothing else
    // would have caught them.
    const unresolvable = relativeRequires(ALTER_FLAGS)
      .filter(r => !resolvesFrom(ALTER_FLAGS, r.spec))
      .map(r => `${r.spec} (line ${r.line})`);
    expect(unresolvable).toEqual([]);
  });
});

describe('pressing A reaches the flag prompt', () => {
  it('prompts instead of reporting an error', async () => {
    const written: string[] = [];
    const socket: any = {
      emit: (event: string, data: any) => {
        if (event === 'ansi-output') written.push(String(data));
      },
    };
    const session: any = {
      // securityFlags all 'T' so checkSecurity(DOWNLOAD) passes and the body
      // runs; the permission-denied early return would pass this test while
      // proving nothing.
      user: { slotNumber: 1, username: 'Guest', securityFlags: 'T'.repeat(120), secOverride: '' },
      currentConf: 0,
      subState: 0,
    };

    const {
      handleAlterFlagsCommand,
    } = require('../../src/handlers/commands/display-file-commands.handler');

    await expect(handleAlterFlagsCommand(socket, session, '')).resolves.toBeUndefined();
    expect(written.join('')).toContain('to flag');
  });
});
