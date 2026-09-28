/**
 * A refusal has to say what was refused.
 *
 * Every access denial in the board printed the same express.e sentence -
 * "Command requires higher access." - and nothing else, for all 35 call sites.
 * The caller was told that SOMETHING needed more access, never which thing and
 * never how far off he was. Thirty-five call sites already passed a
 * description ("download files", "edit accounts", "join conference") and
 * ErrorHandler.permissionDenied discarded every one of them behind a `_action`
 * parameter.
 *
 * EALL was worse: express.e answers a caller who may not use it with "User
 * does not exist!!" (express.e:10814), which is true of no user and explains
 * nothing - EALL is not a user, it is the public recipient, and the real cause
 * is a missing ACS.EALL_MESSAGES. That message cost the sysop an afternoon on
 * 2026-09-08, which is what prompted this.
 *
 * Both changes are ADDITIVE on purpose: express.e's own line still comes
 * first, unchanged, so parity is preserved and the explanation follows it.
 */

process.env.SKIP_DB_INIT = 'true';

import { ErrorHandler, higherAccess } from '../../src/utils/error-handling.util';

function fakeSocket(session?: unknown) {
  const out: string[] = [];
  const socket: any = {
    emit: (_event: string, text: string) => { out.push(String(text)); },
    session,
  };
  return { socket, out, text: () => out.join('') };
}

describe('an access refusal names what was refused', () => {
  it("keeps express.e's sentence, and keeps it FIRST", () => {
    const { socket, out } = fakeSocket({ user: { secLevel: 20 } });
    ErrorHandler.permissionDenied(socket, 'download files');

    // Parity: the original line is still the first thing the caller sees.
    expect(out[0]).toContain('Command requires higher access.');
  });

  it('says which action was refused, and what level the caller has', () => {
    const { socket, text } = fakeSocket({ user: { secLevel: 20 } });
    ErrorHandler.permissionDenied(socket, 'download files');

    const said = text();
    expect(said).toContain('download files');
    expect(said).toContain('level 20');
  });

  it('still explains itself when the level is unknown', () => {
    const { socket, text } = fakeSocket({});
    ErrorHandler.permissionDenied(socket, 'edit accounts');

    const said = text();
    expect(said).toContain('edit accounts');
    // No level to quote, so it must not print "level undefined".
    expect(said).not.toContain('undefined');
  });

  it('adds nothing when there is no action to name', () => {
    const { socket, out } = fakeSocket({ user: { secLevel: 20 } });
    ErrorHandler.permissionDenied(socket, '');

    expect(out.join('')).toContain('Command requires higher access.');
    expect(out.join('')).not.toContain('[INFO]');
  });

  it('higherAccess on its own is untouched - other callers depend on it', () => {
    const { socket, text } = fakeSocket();
    higherAccess(socket);

    expect(text()).toBe('\r\nCommand requires higher access.\r\n');
  });
});

describe('the EALL refusal explains the permission', () => {
  // Driven through the REAL message-entry handler, the way
  // tests/handlers/message/message-entry.test.ts drives the To: prompt: a
  // caller with no EALL_MESSAGES grant (no securityFlags, no ACS files) types
  // EALL, and what reaches his terminal is read back in order.
  it("says express.e's line first, then names ACS.EALL_MESSAGES", async () => {
    const { handleMessageToInput } = require('../../src/handlers/message/message-entry.handler');
    const { flushOutput } = require('../../src/utils/output.util');
    const out: string[] = [];
    const socket: any = {
      id: 'eall-refused',
      emit: (event: string, text: unknown) => { if (event === 'ansi-output') out.push(String(text)); return true; },
      on: () => socket,
    };
    const session: any = {
      state: 'logged_in', nodeId: 1, currentConf: 1,
      user: { username: 'Low', secLevel: 5, confAccess: 'X' },
      tempData: { messageEntry: { toUser: '', subject: '', isPrivate: false, body: [] } },
    };

    await handleMessageToInput(socket, session, 'EALL');
    flushOutput(socket);
    const said = out.join('');

    const parity = said.indexOf('User does not exist!!');
    const explain = said.indexOf('ACS.EALL_MESSAGES');
    expect(parity).toBeGreaterThan(-1);
    expect(explain).toBeGreaterThan(-1);
    // express.e's line first, the explanation after it.
    expect(explain).toBeGreaterThan(parity);
  });
});
