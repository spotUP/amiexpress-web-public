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
  it('tells the sysop it is off, not that he needs more access', async () => {
    const { socket, said } = socketSpy();

    await runBbsCommandWith(socket, sysopSession(), 'CARDLOBBY', DISABLED_ACCESS_LEVEL);

    // express.e:4705, unchanged and first.
    expect(said()).toContain('Command requires higher access.');
    // ...then the part that saves an evening.
    expect(said()).toContain('CARDLOBBY is switched OFF in the admin');
  });

  it('says nothing extra when the door really does out-rank the caller', async () => {
    const { socket, said } = socketSpy();
    const junior = sysopSession();
    junior.user.secLevel = 10;

    await runBbsCommandWith(socket, junior, 'CARDLOBBY', 30);

    expect(said()).toContain('Command requires higher access.');
    expect(said()).not.toContain('switched OFF');
  });
});

/**
 * Drive the real refusal with a command definition of the given access level.
 *
 * The tiers resolve a command from `commandCache`, which the board fills at
 * startup from Commands/BBSCmd; a test fills it directly rather than standing
 * up a board to hold one .info file.
 */
async function runBbsCommandWith(socket: any, session: any, cmd: string, access: number): Promise<void> {
  commandCache.bbscmd.set(cmd, {
    name: cmd,
    access,
    type: 'BBSCMD',
    location: 'Doors/card-lobby',
  } as never);

  try {
    await runBbsCommand(socket, session, cmd, '');
  } finally {
    commandCache.bbscmd.delete(cmd);
  }
}
