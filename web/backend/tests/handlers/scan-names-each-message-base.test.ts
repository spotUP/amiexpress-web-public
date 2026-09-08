/**
 * A mail scan says WHICH message base each result belongs to.
 *
 * express.e:11668-11679, inside searchNewMail: the conference line is printed
 * once, gated on `msgBaseNum=1`, and every pass then prints its own
 * ` Message Base: <name> - ` when the board declared a name for that base
 * (:11675 checks the length before printing).
 *
 * This port printed `Scanning Conference: X - ` INSIDE the per-base loop with
 * no gate and never named a base at all, so a conference with three message
 * bases repeated an identical header three times and nothing said which base
 * "No mail today!" referred to. Audit D-11 filed it as a missing label; it is
 * a repeated, undifferentiated header, and the fix predates the 2026-05-04
 * rewrite of this module and did not survive it.
 */
process.env.SKIP_DB_INIT = '1';

import {
  advanceConferenceScan,
  setMessageScanDependencies,
} from '../../src/handlers/message/message-scan.handler';

jest.mock('../../src/handlers/operations/conference.handler', () => ({
  joinConference: jest.fn(async () => undefined),
}));

jest.mock('../../src/utils/flag-pause.util', () => ({
  checkForPause: jest.fn(async () => false),
}));

// Only the pointer WRITE is stubbed; the rest of the module is real, or the
// scan swallows a TypeError and this test passes for the wrong reason.
jest.mock('../../src/utils/message-pointers.util', () => ({
  ...jest.requireActual('../../src/utils/message-pointers.util'),
  updateScanPointer: jest.fn(async () => undefined),
}));

function socketSpy() {
  const out: string[] = [];
  return {
    socket: {
      emit: (event: string, payload: unknown) => { if (event === 'ansi-output') out.push(String(payload)); },
      // The output buffer registers a disconnect listener on whatever it is
      // handed; a socket without these throws before the scan finishes.
      on: () => undefined,
      once: () => undefined,
      off: () => undefined,
      removeListener: () => undefined,
    },
    plain: () => out.join('').replace(/\x1b\[[0-9;]*m/g, ''),
  };
}

function session() {
  return {
    user: { id: 'u1', username: 'spot', confAccess: 'X' },
    tempData: {
      confScanState: { confIndex: 0, promptShown: true, mscan: true, phase: 'mail' },
    },
    subState: '',
  };
}

/** Two message bases in one conference, both named by the board. */
function twoNamedBases() {
  setMessageScanDependencies(
    { get: jest.fn(async () => undefined), all: jest.fn(async () => []), run: jest.fn(async () => undefined) },
    jest.fn(), jest.fn(), jest.fn(), jest.fn(),
    [{ id: 1, name: 'Uptown' }],
    [
      { id: 1, conferenceId: 1, name: 'General', declaredName: 'General' },
      { id: 2, conferenceId: 1, name: 'Elite', declaredName: 'Elite' },
    ],
  );
}

describe('the mail scan header on a conference with several message bases', () => {
  it('prints the conference once and names every base', async () => {
    twoNamedBases();
    const { socket, plain } = socketSpy();

    await advanceConferenceScan(socket as never, session() as never);
    const said = plain();

    // Once, not once per base - this is the whole defect.
    expect(said.match(/Scanning Conference: Uptown - /g) ?? []).toHaveLength(1);
    expect(said).toContain(' Message Base: General - ');
    expect(said).toContain(' Message Base: Elite - ');
    // The conference line and the first base's line are not run together.
    expect(said).toMatch(/Scanning Conference: Uptown - \r\n Message Base: General - /);
  });

  it('says nothing about a base the board never named', async () => {
    // express.e:11675 checks StrLen(msgBaseName) before printing. The loader
    // substitutes "Message Base 1" into `name` so a list has a label, which is
    // why the scan reads `declaredName` instead.
    setMessageScanDependencies(
      { get: jest.fn(async () => undefined), all: jest.fn(async () => []), run: jest.fn(async () => undefined) },
      jest.fn(), jest.fn(), jest.fn(), jest.fn(),
      [{ id: 1, name: 'Uptown' }],
      [{ id: 1, conferenceId: 1, name: 'Message Base 1', declaredName: '' }],
    );
    const { socket, plain } = socketSpy();

    await advanceConferenceScan(socket as never, session() as never);
    const said = plain();

    expect(said).toContain('Scanning Conference: Uptown - ');
    expect(said).not.toContain('Message Base:');
  });
});
