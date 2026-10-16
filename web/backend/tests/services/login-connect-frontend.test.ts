/**
 * The connect flow says what happened to the FRONTEND syscmd.
 *
 * A board with no FRONTEND registration goes straight to the ANSI prompt, and
 * so does a board whose FRONTEND is registered but never runs. Those looked
 * identical from outside and from the log: the step caught every throw and
 * printed "syscmd not found" whatever the cause, and ignored the RESULT code
 * entirely. A sysop reported the Who's-Online screen missing on the live board
 * while it worked locally, and there was nothing recorded to tell the two
 * cases apart.
 *
 * -1 is RESULT_FAILURE (no such command), -2 RESULT_NOT_ALLOWED (access), and
 * 0 is success (command-execution.handler.ts:27-29).
 *
 * Driven through the REAL runPreLoginConnect, with the syscmd handler stubbed
 * the way tests/services/execute-on-connect-runs-for-every-transport.test.ts
 * stubs it: what FRONTEND answers is chosen per test, and the log lines the
 * step writes are read back (console is spied - tests/quiet-console.ts would
 * otherwise drop the log line).
 */
process.env.SKIP_DB_INIT = '1';

const mockRunSysCommand = jest.fn(async (..._args: unknown[]): Promise<number> => 0);
jest.mock('../../src/handlers/command-execution.handler', () => ({
  runSysCommand: (...args: unknown[]) => mockRunSysCommand(...args),
  commandCache: { syscmd: new Map([['LOGON', {}], ['LOGOFF', {}], ['WHO', {}]]) },
}));
jest.mock('../../src/services/batch-scheduler', () => ({
  ...jest.requireActual('../../src/services/batch-scheduler'),
  runExecuteOn: async () => undefined,
}));

import { runPreLoginConnect, ANSI_GRAPHICS_PROMPT } from '../../src/services/login-connect.service';

async function connect() {
  const said: string[] = [];
  const emitter: any = { id: 'telnet-7-1', emit: (e: string, d: unknown) => { if (e === 'ansi-output') said.push(String(d)); } };
  const session: any = { nodeId: 7, connectionType: 'telnet', tempData: {} };
  const result = await runPreLoginConnect(emitter, session, { socketId: 'telnet-7-1' });
  return { result, said: said.join(''), session };
}

const logged = (spy: jest.SpyInstance) => spy.mock.calls.map((c) => c.map(String).join(' ')).join('\n');

describe('the FRONTEND step of the connect flow', () => {
  let log: jest.SpyInstance;
  let error: jest.SpyInstance;
  beforeEach(() => {
    mockRunSysCommand.mockReset();
    log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => { log.mockRestore(); error.mockRestore(); });

  it('reports a non-zero result rather than passing it over', async () => {
    mockRunSysCommand.mockResolvedValue(-2);
    await connect();
    expect(mockRunSysCommand).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'FRONTEND', '');
    expect(logged(log)).toContain('FRONTEND syscmd returned -2');
  });

  it('says nothing when FRONTEND ran', async () => {
    mockRunSysCommand.mockResolvedValue(0);
    await connect();
    expect(logged(log)).not.toContain('FRONTEND syscmd returned');
  });

  it('reports the error it caught, not a guess about the cause', async () => {
    // The old catch printed "FRONTEND syscmd not found" for any throw at all.
    const cause = new Error('door exploded');
    mockRunSysCommand.mockRejectedValue(cause);
    await connect();
    const failed = error.mock.calls.find((c) => String(c[0]).includes('FRONTEND syscmd failed:'));
    expect(failed?.[1]).toBe(cause);
    // Only the FRONTEND step's own lines: other startup lines (BBSConfig on a checkout with no
    // gitignored bbsConfig.info) may say "not found" about something else.
    const frontendLines = (logged(log) + '\n' + logged(error)).split('\n').filter((l) => l.includes('FRONTEND'));
    expect(frontendLines.length).toBeGreaterThan(0);
    expect(frontendLines.join('\n')).not.toContain('not found');
  });

  it('names the cache it looked in, not just the answer it got', async () => {
    // A dynamic import that resolves to a second copy of the handler has its
    // own empty cache: every syscmd then fails as "not registered" while the
    // startup log says sixteen were loaded. The size tells the two apart.
    mockRunSysCommand.mockResolvedValue(-1);
    await connect();
    expect(logged(log)).toContain('syscmd cache holds 3: LOGON, LOGOFF, WHO');
  });

  it('still treats a board with no FRONTEND as normal, not as an error', async () => {
    // No throw, no crash: the flow continues to the graphics prompt either
    // way. Only the log distinguishes them.
    for (const answer of [() => mockRunSysCommand.mockResolvedValue(-1), () => mockRunSysCommand.mockRejectedValue(new Error('x'))]) {
      answer();
      const { result, said } = await connect();
      expect(result).toEqual({ ok: true });
      expect(said).toContain(ANSI_GRAPHICS_PROMPT.trim().slice(0, 20));
    }
  });
});
