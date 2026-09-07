/**
 * `P8` at the graphics prompt: the wide PETSCII screen.
 *
 * Plain `P` is asserted beside it in every case, because the whole promise
 * of this mode is that the 40-column caller's session is unchanged.
 */
import { applyGraphicsAnswer } from '../../src/handlers/command-handler/pre-login';

interface Emitted { event: string; data: any }
const run = (answer: string): { session: any; emitted: Emitted[] } => {
  const emitted: Emitted[] = [];
  const socket: any = { emit: (event: string, data: any) => { emitted.push({ event, data }); return true; } };
  const session: any = { petsciiMode: false, ansiEnabled: false, screenWidth: 80, screenHeight: 24, connectionType: 'web' };
  applyGraphicsAnswer(socket, session, answer);
  return { session, emitted };
};
const eventsOf = (e: Emitted[], name: string): any[] => e.filter((x) => x.event === name).map((x) => x.data);

describe('the graphics prompt', () => {
  it('P is the C64 screen, exactly as it was', () => {
    const { session, emitted } = run('P');
    expect(session.petsciiMode).toBe(true);
    expect(session.petsciiColumns).toBe(40);
    expect([session.screenWidth, session.screenHeight]).toEqual([40, 25]);
    expect(eventsOf(emitted, 'terminal-resize')).toEqual([{ cols: 40, rows: 25 }]);
  });

  it('P8 is the wide screen: eighty columns, still twenty-five rows', () => {
    const { session, emitted } = run('P8');
    expect(session.petsciiMode).toBe(true);
    expect(session.petsciiColumns).toBe(80);
    expect([session.screenWidth, session.screenHeight]).toEqual([80, 25]);
    expect(session.ripMode).toBe(false);
    expect(session.ansiEnabled).toBe(true);
    expect(eventsOf(emitted, 'terminal-resize')).toEqual([{ cols: 80, rows: 25 }]);
  });

  it('both answers announce the mode with its shape, which is what mounts the canvas', () => {
    expect(eventsOf(run('P').emitted, 'petscii-mode')).toEqual([{ cols: 40, rows: 25, palette: 'vic' }]);
    // ...and the 80-column screen is a C128's, so its colours are the VDC's
    // unless this caller has said otherwise (the preference is applied at
    // login; nobody is logged in at the graphics prompt).
    expect(eventsOf(run('P8').emitted, 'petscii-mode')).toEqual([{ cols: 80, rows: 25, palette: 'vdc' }]);
    // And the legacy geometry event is still sent for the 40-column caller,
    // because the browser has used that literal as the mount switch since
    // the canvas existed: a mid-deploy session must not lose its screen.
    expect(eventsOf(run('P').emitted, 'terminal-resize')).toEqual([{ cols: 40, rows: 25 }]);
  });

  it('a byte caller who answers P8 gets the C64 screen, because that is what they have', () => {
    for (const connectionType of ['telnet', 'ssh']) {
      const emitted: Emitted[] = [];
      const socket: any = { emit: (event: string, data: any) => { emitted.push({ event, data }); return true; } };
      const session: any = { petsciiMode: false, ansiEnabled: false, connectionType };
      applyGraphicsAnswer(socket, session, 'P8');
      expect(session.petsciiMode).toBe(true);
      expect(session.petsciiColumns).toBe(40);
      expect(eventsOf(emitted, 'terminal-resize')).toEqual([{ cols: 40, rows: 25 }]);
    }
  });

  it('the prompt offers it, in the shape the sysop pinned', () => {
    const { ANSI_GRAPHICS_PROMPT } = require('../../src/services/login-connect.service');
    expect(ANSI_GRAPHICS_PROMPT).toContain('P8');
    expect(ANSI_GRAPHICS_PROMPT).not.toMatch(/[a-z]/);
    const [del, question] = (ANSI_GRAPHICS_PROMPT as string).replace(/^\r\n/, '').split('\r\n');
    expect(del.length).toBeLessThanOrEqual(40);
    expect(question.endsWith('? ')).toBe(true);
  });

  it('an answer with no P is untouched by any of it', () => {
    for (const answer of ['N', 'Y', 'R', 'Q']) {
      const { session, emitted } = run(answer);
      expect(session.petsciiMode).toBe(false);
      expect(session.petsciiColumns).toBeUndefined();
      expect(eventsOf(emitted, 'petscii-mode')).toEqual([]);
    }
    // An 8 that is not a P8 - a caller typing "N8" - is not the wide screen.
    expect(run('N8').session.petsciiColumns).toBeUndefined();
  });
});
