/**
 * SPACE DISMISSES A PAUSE PROMPT, THE WAY IT DOES ON EVERY OTHER PAGER.
 *
 * The sysop, 2026-09-07: "Some BBS prompts are not dismissable with SPACE.
 * Make EVERY pause/continue prompt accept both SPACE and ENTER."
 *
 * The board's two pause prompts - `checkForPause`'s `(Pause)...More(y/n/ns)?`
 * and `flagPause`'s flag-carrying version - read a LINE, not a key. A space
 * went into the line buffer and the listing sat there until the caller also
 * pressed RETURN. Every "Press any key to continue" prompt on the board is
 * a different mechanism (a substate the next keystroke advances, whatever
 * that key is) and already took a space; these two were the class that did
 * not.
 *
 * Both prompt handlers have always read an EMPTY line as "more", so the fix
 * is one line at the single input choke point (`accumulatePause` in
 * server/terminal-input.ts, which both transports share since TP-8): a space
 * on an empty buffer submits the same empty line RETURN submits. No prompt
 * gained a second meaning and no handler gained a branch.
 *
 * These cases drive the REAL classifier and the REAL prompts, so they fail
 * if either half is reverted.
 */
process.env.SKIP_DB_INIT = '1';

import { classifyTerminalInput } from '../../src/server/terminal-input';
import { flagPause, checkForPause } from '../../src/utils/flag-pause.util';
import { handlePaginatedScreenInput } from '../../src/handlers/screen.handler';
import type { BBSSession } from '../../src/index';

function makeSocket(): { socket: any; emitted: string[] } {
  const emitted: string[] = [];
  return {
    emitted,
    socket: {
      emit: (event: string, payload: any) => {
        if (event === 'ansi-output') emitted.push(String(payload));
      },
    } as any,
  };
}

/** A session already past its screenful, so the next call prompts. */
function makeSession(): any {
  return {
    wireHeight: 23,
    tempData: { lineCount: 99 },
    user: { linesPerScreen: 23 },
    flagManager: null,
    currentConf: 1,
    nodeId: 0,
  };
}

/** One keystroke, through the pipeline both telnet and web use. */
function press(session: any, key: string) {
  return classifyTerminalInput(session as BBSSession, key);
}

/** Let the prompt register its handler (it does so in a microtask). */
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('a space at a pause prompt', () => {
  it('continues a flag-pause listing with no RETURN after it', async () => {
    const { socket } = makeSocket();
    const session = makeSession();
    const more = flagPause(socket, session, 1);
    await settle();
    expect(session.flagPauseHandler).toBeDefined();

    const decision = press(session, ' ') as any;

    expect(decision.kind).toBe('pause');
    expect(decision.which).toBe('flag');
    expect(decision.handler).not.toBeNull();
    // The empty line both handlers read as "more".
    expect(decision.line).toBe('');
    // Nothing is echoed: a space that acts as a key is not a character.
    expect(decision.echo).toBeNull();

    await decision.handler(decision.line);
    await expect(more).resolves.toBe(true);
  });

  it('continues a check-pause listing with no RETURN after it', async () => {
    const { socket } = makeSocket();
    const session = makeSession();
    const more = checkForPause(socket, session);
    await settle();
    expect(session.checkPauseHandler).toBeDefined();

    const decision = press(session, ' ') as any;

    expect(decision.which).toBe('check');
    expect(decision.line).toBe('');
    await decision.handler(decision.line);
    await expect(more).resolves.toBe(true);
  });

  it('is still a character once the caller has typed something', async () => {
    const { socket } = makeSocket();
    const session = makeSession();
    void flagPause(socket, session, 1);
    await settle();

    // `F <name>` flags a file, and `N S` is a line a caller may type: a
    // space after any character has to stay a space.
    expect((press(session, 'F') as any).echo).toBe('F');
    const space = press(session, ' ') as any;
    expect(space.handler).toBeNull();
    expect(space.echo).toBe(' ');
    expect(session.flagPauseBuffer).toBe('F ');

    const submitted = press(session, '\r') as any;
    expect(submitted.line).toBe('F ');
  });

  it('leaves RETURN doing exactly what it did', async () => {
    const { socket } = makeSocket();
    const session = makeSession();
    const more = flagPause(socket, session, 1);
    await settle();

    press(session, 'N');
    press(session, 'S');
    const submitted = press(session, '\r') as any;
    expect(submitted.line).toBe('NS');

    await submitted.handler(submitted.line);
    await expect(more).resolves.toBe(true);
    expect(session.tempData.nonStopDisplayFlag).toBe(true);
  });
});

/**
 * The board has a THIRD copy of `(Pause)...More(y/n/ns)?`: the screen
 * pager, which reads one KEYSTROKE rather than a line and so has always
 * taken a space (it trims and reads the empty string as "more"). It is
 * pinned here so the class stays closed - a future rewrite of the pager
 * that started buffering a line would break the sysop's request again,
 * and this is the case that would say so.
 */
describe('the screen pager, the third copy of the same prompt', () => {
  it('turns the page on a space, and stops on N', async () => {
    const { socket, emitted } = makeSocket();
    const session: any = { screenHeight: 3 };
    const page = (lines: string[]) => ({
      lines,
      nextIndex: 2,
      pageSize: 2,
      eventName: 'ansi-output',
      commands: [],
      onComplete: undefined,
      kind: 'bbs' as const,
      sourceAttrs: undefined,
    });

    session.paginatedScreen = page(['one', 'two', 'three', 'four']);
    expect(await handlePaginatedScreenInput(socket, session, ' ')).toBe(true);
    expect(emitted.join('')).toContain('three');

    session.paginatedScreen = page(['one', 'two', 'three', 'four']);
    emitted.length = 0;
    expect(await handlePaginatedScreenInput(socket, session, 'N')).toBe(true);
    expect(session.paginatedScreen).toBeUndefined();
    expect(emitted.join('')).not.toContain('three');
  });
});
