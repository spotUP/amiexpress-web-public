/**
 * A door the admin switched off says so, instead of blaming the caller's level.
 *
 * Reported from the board on 2026-09-08: "cardlobby is set to access level 30
 * but i get command requires higher access my user is 255". Its registration
 * read `ACCESS=32767, DRACCESS=30` - the door was OFF. Turning a door off
 * parks its ACCESS at DISABLED_ACCESS_LEVEL and remembers the real level in
 * DRACCESS (door-info-file.service.ts:53-65), and the admin goes on showing
 * "Min level 30", so the one number the sysop can see is the one the board is
 * not using.
 *
 * express.e's own sentence is unchanged and still first; the explanation is an
 * extra line after it, and only for the parked sentinel - a door that really
 * does out-rank the caller still says exactly what it always said.
 */
process.env.SKIP_DB_INIT = '1';

import { runBbsCommand, commandCache } from '../../src/handlers/command-execution.handler';
import { DISABLED_ACCESS_LEVEL } from '../../src/services/config-services/door-info-file.service';

function socketSpy() {
  const out: string[] = [];
  const socket: any = {
    id: `off-${Math.random().toString(36).slice(2)}`,
    emit: (event: string, payload: unknown) => { if (event === 'ansi-output') out.push(String(payload)); },
    on: () => socket, once: () => socket, off: () => socket, removeListener: () => socket,
  };
  return { socket, said: () => out.join('') };
}

/** A level-255 sysop, which is what makes the old message absurd. */
function sysopSession() {
  return {
    user: { id: 'u1', username: 'sysop', secLevel: 255 },
    tempData: {},
    subState: '',
  } as any;
}

describe('a command the admin switched off', () => {
  it('tells the caller the door is off, and does not blame his access', async () => {
    const { socket, said } = socketSpy();
    const caller = sysopSession();
    caller.user.secLevel = 20;

    await runBbsCommandWith(socket, caller, 'CARDLOBBY', DISABLED_ACCESS_LEVEL, 30);

    expect(said()).toContain('CARDLOBBY is switched off.');
    // express.e's sentence is WRONG here and is replaced, not added to: a
    // disabled door is this port's own state and express has no message for
    // it. Telling a caller he needs higher access sends him asking the sysop
    // for a level he already has.
    expect(said()).not.toContain('Command requires higher access.');
    // And nothing about the admin, which is not his to fix.
    expect(said()).not.toContain('admin');
  });

  it('tells a sysop where to switch it on, and what level it goes back to', async () => {
    const { socket, said } = socketSpy();

    await runBbsCommandWith(socket, sysopSession(), 'CARDLOBBY', DISABLED_ACCESS_LEVEL, 30);

    expect(said()).toContain('CARDLOBBY is switched off.');
    expect(said()).toContain('Switch it on under Doors in the admin');
    // The level it will come back at is the one DRACCESS remembers - the
    // number the admin has been showing all along.
    expect(said()).toContain('level 30');
  });

  it('says exactly what it always said when the door really does out-rank the caller', async () => {
    const { socket, said } = socketSpy();
    const junior = sysopSession();
    junior.user.secLevel = 10;

    await runBbsCommandWith(socket, junior, 'CARDLOBBY', 30, undefined);

    expect(said()).toContain('Command requires higher access.');
    expect(said()).not.toContain('switched off');
  });
});

/**
 * Drive the real refusal with a command definition of the given access level.
 *
 * The tiers resolve a command from `commandCache`, which the board fills at
 * startup from Commands/BBSCmd; a test fills it directly rather than standing
 * up a board to hold one .info file. `remembered` is DRACCESS - the level a
 * parked door goes back to.
 */
async function runBbsCommandWith(
  socket: any,
  session: any,
  cmd: string,
  access: number,
  remembered?: number,
): Promise<void> {
  commandCache.bbscmd.set(cmd, {
    name: cmd,
    access,
    type: 'BBSCMD',
    location: 'Doors/card-lobby',
    toolTypes: remembered === undefined ? {} : { DRACCESS: String(remembered) },
  } as never);

  try {
    await runBbsCommand(socket, session, cmd, '');
  } finally {
    commandCache.bbscmd.delete(cmd);
  }
}
