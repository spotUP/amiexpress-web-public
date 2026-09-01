/**
 * Relogon must actually reach the login prompt.
 *
 * express.e:8234-8293: after LOGOFF, `IF (relogon) state:=STATE_LOGON`. The
 * port set the state and then did this:
 *
 *   const { handleLoginPrompt } = require('../login.handler');
 *
 * handleLoginPrompt is exported nowhere in the tree and there is no
 * login.handler module, so relogon threw at that line every time - the one
 * thing it exists to do never happened. It survived because a lazy require
 * inside a branch is invisible to the compiler and to every import-time
 * check; nothing runs it but a user choosing to log back in.
 *
 * The login state is entered directly now, the way a fresh connection enters
 * it (index.ts:1863): loginPhase 'username', empty buffer, and the prompt
 * shown to whoever needs it.
 */

process.env.SKIP_DB_INIT = 'true';

import { BBSState } from '../../src/constants/bbs-states';

describe('relogon after logoff', () => {
  function harness(connectionType: 'web' | 'telnet') {
    const emitted: Array<{ event: string; data: any }> = [];
    const socket: any = {
      id: 'relogon-test',
      on: () => {},
      emit: (event: string, data?: any) => emitted.push({ event, data }),
    };
    const session: any = {
      state: BBSState.LOGGEDON,
      subState: 'display_menu',
      relogon: true,
      connectionType,
      nodeId: 1,
      user: { username: 'Guest', slotNumber: 1, bbsName: 'Uptown' },
      tempData: {},
      flagManager: { save: () => {} },
    };
    return { socket, session, emitted };
  }

  async function runLogoff(socket: any, session: any) {
    const mod = require('../../src/handlers/commands/system-commands.handler');
    // The handler takes its screen functions by injection; without them the
    // Logoff.txt lookup throws before the relogon branch is ever reached.
    mod.setSystemCommandsDependencies({
      displayScreen: async () => false,   // no Logoff.txt, take the fallback text
      findSecurityScreen: () => null,
    });
    await mod.handleGoodbyeCommand(socket, session);
  }

  it('reaches the login state instead of throwing', async () => {
    const { socket, session } = harness('telnet');

    // Before the fix this rejected with:
    //   Error: Cannot find module '../login.handler'
    await expect(runLogoff(socket, session)).resolves.not.toThrow();

    expect(session.state).toBe(BBSState.LOGON);
    expect(session.relogon).toBe(false);
  });

  it('leaves a telnet caller at a username prompt it can answer', async () => {
    const { socket, session, emitted } = harness('telnet');
    await runLogoff(socket, session);

    // handleCommand's LOGON branch buffers the username itself and reads
    // tempData.loginPhase, so both have to be set or the first keystroke
    // goes nowhere.
    expect(session.tempData.loginPhase).toBe('username');
    expect(session.tempData.inputBuffer).toBe('');
    expect(emitted.map(e => String(e.data)).join('')).toContain('Username:');
  });

  it('tells a web caller to show its own login, which it drives itself', async () => {
    const { socket, session, emitted } = harness('web');
    await runLogoff(socket, session);

    // The LOGON branch returns immediately for web connections, so a
    // "Username:" written to the screen would be a prompt nothing reads.
    expect(emitted.some(e => e.event === 'retry-login')).toBe(true);
  });
});
