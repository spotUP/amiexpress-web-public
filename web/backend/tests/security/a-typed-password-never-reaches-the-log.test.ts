/**
 * A password typed at the login never reaches the log.
 *
 * handleCommand logged every key verbatim, and the login is typed through it
 * one key at a time - the live backend.log held callers' passwords, a
 * character per line (found 2026-09-29). Driven through the real
 * handleCommand at the login, and at a W-menu password prompt.
 */
process.env.SKIP_DB_INIT = '1';

import { handleCommand } from '../../src/handlers/command.handler';
import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';

function logged(run: () => Promise<unknown>): Promise<string> {
  const lines: string[] = [];
  const spies = (['log', 'warn', 'error', 'info', 'debug'] as const).map((m) =>
    jest.spyOn(console, m).mockImplementation((...args: unknown[]) => { lines.push(args.map(String).join(' ')); }));
  return run().catch(() => undefined).then(() => {
    for (const s of spies) s.mockRestore();
    return lines.join('\n');
  });
}

function aCaller(session: Record<string, unknown>) {
  const socket: any = { id: `pw-${Math.random().toString(36).slice(2)}`, emit: () => true, on: () => socket, connected: true };
  return { socket, session: { nodeId: 1, tempData: {}, ...session } as any };
}

it('keys typed at the login are logged as a count, not as the keys', async () => {
  const { socket, session } = aCaller({ state: BBSState.LOGON });
  const log = await logged(async () => {
    for (const key of 'Zq9#') await handleCommand(socket, session, key);
  });
  expect(log).toContain('key hidden');
  expect(log).not.toMatch(/"Z"|"q"|"9"|"#"|data="Z"/);
});

it('a password prompt after login hides its keys too, and a menu key stays readable', async () => {
  const pw = aCaller({ state: BBSState.LOGGEDON, subState: LoggedOnSubState.W_EDIT_PASSWORD, user: { id: 1, username: 'x', secLevel: 10 } });
  const hidden = await logged(() => handleCommand(pw.socket, pw.session, 'Q'));
  expect(hidden).not.toContain('"Q"');

  const menu = aCaller({ state: BBSState.LOGGEDON, subState: LoggedOnSubState.READ_COMMAND, user: { id: 1, username: 'x', secLevel: 10 } });
  const readable = await logged(() => handleCommand(menu.socket, menu.session, 'T'));
  expect(readable).toContain('"T"');
});
