// @ts-nocheck
/**
 * Regression: BB_SCRWIDTH (GetUser 520) answers the terminal WIDTH.
 *
 * The bug: `case 520: return String(user?.linesPerScreen ?? 80)` returned the
 * user's lines-per-screen - a HEIGHT, typically 23 or 24 - as the width, for
 * every session, and never consulted doorScreenWidth(), so a C64 caller's
 * AREXX door was told 23 instead of 40 and an ANSI caller was told 23 instead
 * of 80. BB_SCRHEIGHT (521) legitimately reads linesPerScreen and is
 * unchanged.
 */
import { AREXXInterpreter } from '../../src/services/arexx.service';

const BB_SCRWIDTH = 520;
const BB_SCRHEIGHT = 521;

function interpreter(session: any, user: any = {}) {
  return new AREXXInterpreter({
    user: { username: 'TestUser', secLevel: 20, id: 'scrwidth-user', ...user },
    session,
    socket: null,
    output: [],
  } as any);
}

describe('AREXX BB_SCRWIDTH', () => {
  it('answers 80 for an ANSI session whose user reads 23 lines per screen', async () => {
    const interp = interpreter({ currentConf: 1 }, { linesPerScreen: 23 });
    await expect(interp.bbsFunctions.GetUser(BB_SCRWIDTH)).resolves.toBe('80');
  });

  it('answers 40 for a PETSCII session', async () => {
    const interp = interpreter({ currentConf: 1, petsciiMode: true, screenWidth: 40 }, { linesPerScreen: 23 });
    await expect(interp.bbsFunctions.GetUser(BB_SCRWIDTH)).resolves.toBe('40');
  });

  it('answers 40 for a PETSCII session that still carries the 80 its xterm reported', async () => {
    // A web 'P' session is created at 80 and answers P afterwards.
    const interp = interpreter({ currentConf: 1, petsciiMode: true, screenWidth: 80 });
    await expect(interp.bbsFunctions.GetUser(BB_SCRWIDTH)).resolves.toBe('40');
  });

  it('answers 80 when nothing is known about the session', async () => {
    const interp = interpreter(undefined);
    await expect(interp.bbsFunctions.GetUser(BB_SCRWIDTH)).resolves.toBe('80');
  });

  it('leaves BB_SCRHEIGHT reading lines-per-screen', async () => {
    const interp = interpreter({ currentConf: 1 }, { linesPerScreen: 23 });
    await expect(interp.bbsFunctions.GetUser(BB_SCRHEIGHT)).resolves.toBe('23');
  });
});
