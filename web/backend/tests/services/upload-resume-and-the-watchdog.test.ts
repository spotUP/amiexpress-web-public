/**
 * Three faults in the upload path, all of which cost the caller his transfer.
 *
 * 1. THE WATCHDOG KILLED HEALTHY TRANSFERS. It was one `setTimeout` armed when
 *    the child spawned: ten minutes after the transfer STARTED, the child was
 *    killed, however well it was going. At the modem rates this board exists
 *    to emulate a large file legitimately takes longer, so the watchdog killed
 *    exactly what it was there to protect. express has no such timer - it
 *    relies on the protocol's own timeouts and carrier detect - so the only
 *    thing worth killing is a transfer that has gone SILENT.
 *
 * 2. SSH COULD NOT RESUME. `rz -y` (overwrite from byte zero) was given to
 *    everything that was not telnet. The real discriminator is ZRPOS, which
 *    the browser's zmodem.js does not implement and every terminal program
 *    does - and an SSH caller is running the same terminal programs as a
 *    telnet caller.
 *
 * 3. RESUME COULD NEVER FIRE AT ALL. `cleanPlayPen` - the port of
 *    express.e:18259, which files partial uploads into `<conf>/PartUpload` so
 *    `resumeStuff()` can offer them back - was written, documented, and called
 *    by nothing. PartUpload was never filled, so there was never anything to
 *    resume from.
 */
process.env.SKIP_DB_INIT = '1';

import { LrzszTransferManager } from '../../src/services/lrzsz-transfer.service';

function transferFor(type: 'telnet' | 'ssh' | 'web'): any {
  return new (LrzszTransferManager as any)({
    session: { nodeId: 1, user: { username: 'spot', slotNumber: 3 } },
    transport: { type, send: () => undefined },
    direction: 'upload',
    paths: ['/tmp'],
  });
}

describe('which rz flags a transport gets', () => {
  it('lets an SSH caller resume, as a telnet caller can', () => {
    // The bug: SSH was grouped with the browser, so an interrupted upload
    // restarted from byte zero and the caller sent the whole file again.
    const args = transferFor('ssh').buildArgs();

    expect(args).toContain('-r');
    expect(args).not.toContain('-y');
  });

  it('still lets a telnet caller resume', () => {
    const args = transferFor('telnet').buildArgs();

    expect(args).toContain('-r');
    expect(args).not.toContain('-y');
  });

  it('still overwrites for the browser, which cannot do ZRPOS', () => {
    // zmodem.js answers a ZRPOS with "Unhandled header" and the transfer dies
    // unrecoverably, so the browser must NOT be offered resume.
    const args = transferFor('web').buildArgs();

    expect(args).toContain('-y');
    expect(args).not.toContain('-r');
  });
});

describe('the transfer watchdog', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  it('measures silence, not how long the transfer has taken', () => {
    const transfer = transferFor('telnet');
    const cancel = jest.spyOn(transfer, 'cancel').mockImplementation(() => undefined);
    (transfer as any).timeoutMs = 1000;

    (transfer as any).touch();
    // Data keeps arriving, well past the old ten-minute total-duration kill.
    for (let tick = 0; tick < 20; tick += 1) {
      jest.advanceTimersByTime(900);
      (transfer as any).touch();
    }

    expect(cancel).not.toHaveBeenCalled();
  });

  it('still kills a transfer that has gone quiet', () => {
    const transfer = transferFor('telnet');
    const cancel = jest.spyOn(transfer, 'cancel').mockImplementation(() => undefined);
    (transfer as any).timeoutMs = 1000;

    (transfer as any).touch();
    jest.advanceTimersByTime(1001);

    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('can be disabled with 0, and then never fires', () => {
    const transfer = transferFor('telnet');
    const cancel = jest.spyOn(transfer, 'cancel').mockImplementation(() => undefined);
    (transfer as any).timeoutMs = 0;

    (transfer as any).touch();
    jest.advanceTimersByTime(60 * 60 * 1000);

    expect(cancel).not.toHaveBeenCalled();
  });
});
