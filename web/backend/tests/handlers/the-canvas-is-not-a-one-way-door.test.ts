/**
 * LEAVING PETSCII IS A MODE CHANGE TOO, AND IT HAS TO REACH THE BROWSER.
 *
 * The sysop, 2026-09-15, with a screenshot of BBSTITLE drawn as a wall of
 * accented letters: "i pressed aq in the ansi prompt and got broken petscii
 * now after a petscii session".
 *
 * The board was right about every decision it made. Its own log for that
 * session reads `Graphics mode set: ANSI`, `[loadScreenFile] PETSCII mode:
 * NO`, and it served `Node1/BBSTITLE.txt` - the ANSI file. What was wrong was
 * the BROWSER: it had mounted the PETSCII canvas during an earlier session,
 * the socket came back on a reconnect (a deploy had restarted the board), the
 * graphics prompt was asked again, and nothing on the wire ever said "this
 * session is not PETSCII". So the canvas stayed up and painted ANSI bytes as
 * Commodore glyphs.
 *
 * `petscii-mode` mounts the canvas. `petscii-off` is the other direction.
 */
import { applyGraphicsAnswer } from '../../src/handlers/command-handler/pre-login';

interface Emitted { event: string; data: any }

const run = (answer: string, connectionType = 'web'): { session: any; emitted: Emitted[] } => {
  const emitted: Emitted[] = [];
  const socket: any = { emit: (event: string, data: any) => { emitted.push({ event, data }); return true; } };
  const session: any = { petsciiMode: false, ansiEnabled: false, screenWidth: 80, screenHeight: 24, connectionType };
  applyGraphicsAnswer(socket, session, answer);
  return { session, emitted };
};

const names = (emitted: Emitted[]): string[] => emitted.map((e) => e.event);

describe('the graphics prompt says when a session is NOT PETSCII', () => {
  it('the sysop\'s own answer - AQ - takes the browser off the canvas', () => {
    const { session, emitted } = run('AQ');

    expect(session.petsciiMode).toBe(false);
    expect(names(emitted)).toContain('petscii-off');
    // With the shape the session is going back to, so the browser has
    // somewhere to land: an ANSI caller is 80x24.
    expect(emitted.find((e) => e.event === 'petscii-off')!.data).toEqual({ cols: 80, rows: 24 });
  });

  it('every non-PETSCII answer says so', () => {
    for (const answer of ['', 'A', 'N', 'Q', 'R', 'T']) {
      const { session, emitted } = run(answer);
      expect({ answer, petscii: session.petsciiMode, said: names(emitted).includes('petscii-off') })
        .toEqual({ answer, petscii: false, said: true });
    }
  });

  it('a PETSCII answer mounts the canvas and never says the opposite', () => {
    for (const answer of ['P', 'P8', 'PQ']) {
      const { session, emitted } = run(answer);
      expect({ answer, petscii: session.petsciiMode }).toEqual({ answer, petscii: true });
      expect(names(emitted)).toContain('petscii-mode');
      expect(names(emitted)).not.toContain('petscii-off');
    }
  });

  it('a byte caller is told too, and ignores it - there is no canvas on a real C64', () => {
    for (const connectionType of ['telnet', 'ssh']) {
      expect(names(run('A', connectionType).emitted)).toContain('petscii-off');
    }
  });
});
