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
 * EALL used to add a line of its own after express.e's "User does not
 * exist!!"; the sysop's rule since 2026-09-30 is "always 1:1 with amiexpress
 * sources", so EALL says express.e's line and nothing else
 * (tests/handlers/message/entering-a-message-names-the-recipient-like-express.test.ts).
 *
 * The refusal text is ADDITIVE on purpose: express.e's own line still comes
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
