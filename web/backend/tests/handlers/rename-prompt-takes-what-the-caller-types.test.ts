/**
 * T17: the rename prompt receives what the caller types.
 *
 * Reported on the web terminal - "caller cannot type a name at the
 * long-filename rename prompt". The service itself was already covered
 * (upload-rename-prompt-logging.test.ts drives it directly), which is exactly
 * the half that was never in doubt: what nobody had driven is the ROUTE, from
 * a typed byte arriving at the board to the handler the prompt installs.
 *
 * That route is `handleCommand`'s priority 9d: subState is
 * UPLOAD_RENAME_PROMPT and `session.uploadRenameInputHandler` is armed. This
 * feeds real keystrokes to the real entry point and asserts the echo, the
 * rename on disk, and the disarm - so a future change that reorders those
 * priorities, or an earlier branch that swallows input, fails here instead of
 * on the board.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { handleCommand } from '../../src/handlers/command.handler';
import { startRenamePrompt } from '../../src/services/rename-prompt.service';
import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';

function socketSpy() {
  const out: string[] = [];
  const socket: any = {
    id: `rename-${Math.random().toString(36).slice(2)}`,
    emit: (event: string, payload?: unknown) => {
      if (event === 'ansi-output') out.push(String(payload));
    },
    on: () => socket, once: () => socket, off: () => socket, removeListener: () => socket,
  };
  return { socket, said: () => out.join('') };
}

/** A playpen holding one file whose name express would refuse. */
function playpenWithLongName(): { dir: string; file: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rename-route-'));
  const file = path.join(dir, 'AVeryLongName.LHA');
  fs.writeFileSync(file, 'payload');
  return { dir, file };
}

function session(): any {
  return {
    user: { id: 'u1', username: 'spot', secLevel: 255 },
    nodeId: 1,
    tempData: {},
    // handleCommand drops every keystroke of a session that is not LOGGEDON,
    // LOGON or REGISTERING - it logs "Not in LOGGEDON/LOGON or REGISTERING
    // state, ignoring command" and returns. A fixture without this looks
    // exactly like the bug under test, which is worth saying out loud.
    state: BBSState.LOGGEDON,
    subState: LoggedOnSubState.DISPLAY_MENU,
  };
}

/** Type it the way a terminal sends it: one keystroke at a time. */
async function type(socket: any, sess: any, text: string): Promise<void> {
  for (const ch of text) {
    await handleCommand(socket, sess, ch);
  }
}

describe('what the caller types at the rename prompt', () => {
  let logSpy: jest.SpyInstance;
  let playpen: { dir: string; file: string };

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    playpen = playpenWithLongName();
  });

  afterEach(() => {
    logSpy.mockRestore();
    fs.rmSync(playpen.dir, { recursive: true, force: true });
  });

  it('reaches the prompt, echoes, and renames the file on Enter', async () => {
    const { socket, said } = socketSpy();
    const sess = session();
    let finished: any = null;

    startRenamePrompt(socket, sess, playpen.file, (result: any) => { finished = result; });
    expect(sess.subState).toBe(LoggedOnSubState.UPLOAD_RENAME_PROMPT);

    await type(socket, sess, 'SHORT.LHA');
    // Echoed as it was typed - a caller who sees nothing believes he cannot
    // type at all, which is what the report said.
    expect(said()).toContain('SHORT.LHA');

    await handleCommand(socket, sess, '\r');

    expect(finished).not.toBeNull();
    expect(finished.aborted).toBe(false);
    expect(finished.newFilename).toBe('SHORT.LHA');
    expect(fs.existsSync(path.join(playpen.dir, 'SHORT.LHA'))).toBe(true);
    expect(fs.existsSync(playpen.file)).toBe(false);
  });

  it('takes a correction: backspace rubs the character out', async () => {
    const { socket, said } = socketSpy();
    const sess = session();
    let finished: any = null;

    startRenamePrompt(socket, sess, playpen.file, (r: any) => { finished = r; });

    await type(socket, sess, 'SHORX');
    await handleCommand(socket, sess, '\x08');
    await type(socket, sess, 'T.LHA');
    await handleCommand(socket, sess, '\r');

    expect(said()).toContain('\b \b');
    expect(finished.newFilename).toBe('SHORT.LHA');
  });

  it('keeps asking rather than accepting a name express refuses', async () => {
    const { socket, said } = socketSpy();
    const sess = session();
    let finished: any = null;

    startRenamePrompt(socket, sess, playpen.file, (r: any) => { finished = r; });

    // express.e:19222-19228 - the forbidden set.
    await type(socket, sess, 'A B.LHA');
    await handleCommand(socket, sess, '\r');

    expect(finished).toBeNull();
    expect(said()).toContain('You may not include any special symbols');
    expect(said()).toContain('New Filename: ');

    await type(socket, sess, 'GOOD.LHA');
    await handleCommand(socket, sess, '\r');

    expect(finished.newFilename).toBe('GOOD.LHA');
  });
});
