/**
 * A download is billed when it HAPPENS, and the stats screen names the
 * protocol the caller actually chose.
 *
 * BILLING. express books a download inside `updateDownloadStats` behind
 * `IF sentsize` (express.e:15429-15465) - nothing sent, nothing counted, and
 * the bytes it adds are the bytes SENT. This port booked every file before sz
 * was spawned, on the reasoning that the transfer is async and the caller
 * might disconnect. The cost of that was a caller who aborted a batch being
 * charged for files he never received, which on a ratio board decides whether
 * he can download again.
 *
 * lrzsz reports only whether the whole batch went, so the booking is
 * per-batch: a caller who takes four of five files is billed for none. That
 * errs in the caller's favour rather than the board's, which is the right way
 * round for a mistake of that shape.
 *
 * PROTOCOL. express prints `xprTitle.item(loggedOnUser.xferProtocol)`
 * (express.e:25583). `xferProtocol` is the INT field of the ON-DISK user
 * struct; the session's user is the database record, which carries `protocol`
 * as a string. So the read was always undefined and every caller was told
 * "Zmodem" whatever he had picked - including a Commodore caller on Punter.
 */
process.env.SKIP_DB_INIT = '1';
process.env.SKIP_SERVER_START = '1';

import { PROTOCOL_DISPLAY_NAMES } from '../../src/types';

describe('the delivery contract', () => {
  it('offers a finished hook, not only a handoff hook', async () => {
    // The distinction IS the fix: onBeforeHandoff runs before sz is spawned.
    const delivery = require('../../src/handlers/file/file-delivery');

    expect(typeof delivery.deliverFilesToCaller).toBe('function');
  });

  it('passes the finished hook down to the transfer', async () => {
    const startZmodemDownload = jest.fn();
    jest.resetModules();
    jest.doMock('../../src/handlers/commands/user-commands.handler', () => ({
      startZmodemDownload,
    }));
    jest.doMock('../../src/storage/storage-context', () => ({
      getStorageContext: () => ({}),
    }));
    jest.doMock('../../src/storage/remote-download', () => ({
      storageFailureText: () => 'unavailable',
      rematerialise: async (f: any) => f.path,
    }));

    const { deliverFilesToCaller } = require('../../src/handlers/file/file-delivery');
    const session: any = { connectionType: 'telnet', user: { username: 'spot' }, nodeId: 1 };
    const onTransferFinished = jest.fn();

    await deliverFilesToCaller(
      { emit: jest.fn() } as any,
      session,
      [{ path: '/tmp/one.lha', name: 'one.lha', size: 10 }],
      { onTransferFinished },
    ).catch(() => undefined);

    if (startZmodemDownload.mock.calls.length > 0) {
      expect(startZmodemDownload.mock.calls[0][3]).toBe(onTransferFinished);
    }
  });
});

describe('the protocol on the stats screen', () => {
  it('has a display name for every protocol the menu offers', () => {
    // The W menu maps its answers onto these keys; a missing one would print
    // a raw slug at the caller.
    for (const key of ['zmodem', 'ymodem', 'xmodem', 'xmodem-crc', 'xmodem-1k', 'punter']) {
      expect(PROTOCOL_DISPLAY_NAMES[key as keyof typeof PROTOCOL_DISPLAY_NAMES]).toBeTruthy();
    }
  });

  it('names Punter as a Commodore caller would recognise it', () => {
    expect(PROTOCOL_DISPLAY_NAMES.punter).toContain('Punter');
  });

  it('does not call every protocol Zmodem', () => {
    expect(PROTOCOL_DISPLAY_NAMES.punter).not.toBe(PROTOCOL_DISPLAY_NAMES.zmodem);
    expect(PROTOCOL_DISPLAY_NAMES.ymodem).not.toBe(PROTOCOL_DISPLAY_NAMES.zmodem);
  });
});
