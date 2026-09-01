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
import * as os from 'os';
import * as path from 'path';
import { createRequire } from 'module';

process.env.SKIP_DB_INIT = 'true';
// Flags are PERSISTED (dataDir/Partdownload), so without this a file flagged
// by one test is still flagged in the next one and the suite passes or fails
// depending on what ran before it.
process.env.BBS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'amiexpress-flags-'));

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

/**
 * The A command's prompt must be the last thing on screen, and the session
 * must still be listening when it is.
 *
 * Reported as "prompt is positioned wrong":
 *
 *   Filename(s) to flag: (F)rom, (C)lear, (Enter)=none?
 *   dsfsdfsf
 *
 * express.e cannot produce that. lineInput() blocks (express.e:12599), so
 * flagFiles() returns only once the user has answered and 0 means "pressed
 * Enter, done". Porting that blocking read to a state machine gave 0 a
 * second meaning - "prompt printed, waiting" - and alterFlags read it as the
 * first, running express.e:12664's closing newline immediately and putting
 * subState back to DISPLAY_MENU.
 */
describe('the flag prompt leaves the cursor on its own line', () => {
  function pressA() {
    const written: string[] = [];
    const socket: any = {
      emit: (event: string, data: any) => {
        if (event === 'ansi-output') written.push(String(data));
      },
    };
    const session: any = {
      user: { slotNumber: 1, username: 'Guest', securityFlags: 'T'.repeat(120), secOverride: '' },
      currentConf: 0,
      subState: 'display_menu',
    };
    return { socket, session, written };
  }

  it('writes nothing after the prompt', async () => {
    const { socket, session, written } = pressA();
    const {
      handleAlterFlagsCommand,
    } = require('../../src/handlers/commands/display-file-commands.handler');

    await handleAlterFlagsCommand(socket, session, '');

    // The prompt ends "=none? " and the cursor has to sit right there, so
    // whatever the user types continues that line.
    expect(written.join('')).toMatch(/=none\x1b\[0m\? $/);
  });

  it('is still waiting for flag input, not back at the menu', async () => {
    const { socket, session } = pressA();
    const {
      handleAlterFlagsCommand,
    } = require('../../src/handlers/commands/display-file-commands.handler');

    await handleAlterFlagsCommand(socket, session, '');

    // With subState back at DISPLAY_MENU the typed filename was never read
    // as flag input at all.
    expect(session.subState).toBe('flag_input');
    expect(session.tempData?.waitingForFlag).toBe(true);
  });

  it('re-prompts after a filename without reprinting the list', async () => {
    const { socket, session, written } = pressA();
    const { AlterFlagsHandler } = require('../../src/handlers/operations/alter-flags.handler');
    const {
      handleAlterFlagsCommand,
    } = require('../../src/handlers/commands/display-file-commands.handler');

    await handleAlterFlagsCommand(socket, session, '');
    written.length = 0;

    await AlterFlagsHandler.handleFlagInput(socket, session, 'SOMEFILE.LHA');

    // express.e:12651 JUMPs to backloop, which is BELOW the showFlags() call
    // at 12598 - so an add re-prompts without listing the flags again.
    const out = written.join('');
    expect(out).toContain('to flag');
    expect(out).not.toContain('No file flags');
    expect(session.subState).toBe('flag_input');
  });

  it('closes the command when Enter is pressed', async () => {
    const { socket, session, written } = pressA();
    const { AlterFlagsHandler } = require('../../src/handlers/operations/alter-flags.handler');
    const {
      handleAlterFlagsCommand,
    } = require('../../src/handlers/commands/display-file-commands.handler');

    await handleAlterFlagsCommand(socket, session, '');
    written.length = 0;

    await AlterFlagsHandler.handleFlagInput(socket, session, '');

    // express.e:12603 RETURN, then alterFlags' closing newline at 12664.
    expect(written.join('')).toBe('\r\n');
    expect(session.subState).toBe('display_menu');
  });
});

/**
 * Typing at the flag prompt must flag ONE file, not one per letter.
 *
 * The sysop's flag list came back as "W 1 D A Q" - five single characters,
 * saved to Partdownload/flagged<slot> and reprinted on every later visit.
 * express.e reads this prompt with lineInput() (express.e:12599), which
 * blocks until Enter; the web port gets one keystroke per socket message,
 * and the FLAG_INPUT branch handed each one straight to handleFlagInput as
 * if it were a finished answer.
 */
describe('the flag prompt reads a line, not a keystroke', () => {
  const { collectLine } = require('../../src/utils/line-input.util');

  const { flushOutput } = require('../../src/utils/output.util');
  let socketSeq = 0;

  function typing() {
    const written: string[] = [];
    // Echo goes through the buffered writer (16ms batching), which wants a
    // real-ish socket; a fresh id per test keeps their buffers apart.
    const socket: any = {
      id: `line-input-test-${socketSeq++}`,
      on: () => {},
      emit: (event: string, data: any) => {
        if (event === 'ansi-output') written.push(String(data));
      },
    };
    const flush = () => flushOutput(socket);
    return { socket, written, flush };
  }

  it('hands over nothing until Enter', async () => {
    const { socket } = typing();
    const session: any = {};
    const lines: string[] = [];

    for (const key of ['W', 'O', 'O', 'F']) {
      const done = await collectLine(socket, session, key, (l: string) => { lines.push(l); });
      expect(done).toBe(false);
    }

    // Four keystrokes, four flagged "files" - that was the bug.
    expect(lines).toEqual([]);
    expect(session.inputBuffer).toBe('WOOF');
  });

  it('hands over the whole word on Enter', async () => {
    const { socket } = typing();
    const session: any = {};
    const lines: string[] = [];

    for (const key of ['W', 'O', 'O', 'F', '\r']) {
      await collectLine(socket, session, key, (l: string) => { lines.push(l); });
    }

    expect(lines).toEqual(['WOOF']);
    expect(session.inputBuffer).toBe('');
  });

  it('erases on backspace instead of flagging a control code', async () => {
    const { socket, written, flush } = typing();
    const session: any = {};
    const lines: string[] = [];

    for (const key of ['W', 'O', '\x7f', 'K', '\r']) {
      await collectLine(socket, session, key, (l: string) => { lines.push(l); });
    }
    flush();

    expect(lines).toEqual(['WK']);
    expect(written.join('')).toContain('\b \b');
  });

  it('echoes what was typed so the prompt line reads back', async () => {
    const { socket, written, flush } = typing();
    const session: any = {};

    for (const key of ['A', 'B']) {
      await collectLine(socket, session, key, () => { /* not reached */ });
    }
    flush();

    expect(written.join('')).toBe('AB');
  });
});
