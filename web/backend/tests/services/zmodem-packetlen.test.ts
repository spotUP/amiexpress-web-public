/**
 * `sz -L`, and why its default is not lrzsz's.
 *
 * P2-19, first half. The subpacket cap was hardcoded at 1024 - lrzsz would use
 * 8192 - because MuffinTerm's receive buffer overflowed at about 30KB with 8K
 * subpackets. That is a real finding about a real client, so the number stays
 * as the DEFAULT and becomes a tooltype: a board whose callers all run
 * SyncTerm or NetRunner can have the throughput back without the board that
 * still has a MuffinTerm caller losing its transfers.
 *
 * The second half of P2-19 - "pass a ZMCRC management flag so clients can skip
 * files they already hold" - is withdrawn, and the evidence is `sz --help`:
 * lrzsz exposes `-n` (newer), `-N` (newer-or-longer), `-p` (protect), `-Y`
 * (overwrite-or-skip), `-+` (append) and `-E` (rename), and NO option that
 * sets ZF1_ZMCRC (zmodem.e:313). Writing the bit into the ZFILE header behind
 * sz's back would leave the local sender unable to answer the ZCRC requests it
 * invites.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/services/bbs-config-file.service', () => ({
  getBoardConfig: jest.fn(() => ({})),
}));

import { zmodemPacketLength, LrzszTransferManager } from '../../src/services/lrzsz-transfer.service';
import { getBoardConfig } from '../../src/services/bbs-config-file.service';

const board = getBoardConfig as unknown as jest.Mock;

beforeEach(() => board.mockReturnValue({}));
afterEach(() => jest.clearAllMocks());

describe('the subpacket cap', () => {
  it('is 1024 on a board that has not said otherwise', () => {
    expect(zmodemPacketLength()).toBe(1024);
  });

  it('takes the board tooltype when there is one', () => {
    board.mockReturnValue({ zmodem_packetlen: 8192 });

    expect(zmodemPacketLength()).toBe(8192);
  });

  it('clamps to what lrzsz will actually send', () => {
    board.mockReturnValue({ zmodem_packetlen: 65536 });
    expect(zmodemPacketLength()).toBe(8192);

    board.mockReturnValue({ zmodem_packetlen: 16 });
    expect(zmodemPacketLength()).toBe(128);
  });

  it('ignores a value that is not a number, rather than passing it to sz', () => {
    board.mockReturnValue({ zmodem_packetlen: 'lots' });

    expect(zmodemPacketLength()).toBe(1024);
  });

  it('survives a board whose config cannot be read', () => {
    board.mockImplementation(() => { throw new Error('no bbsConfig.info'); });

    expect(zmodemPacketLength()).toBe(1024);
  });
});

describe('what sz is actually spawned with', () => {
  const argsFor = (): string[] => {
    const manager = new LrzszTransferManager({
      session: { nodeId: 1 } as never,
      transport: { type: 'telnet', send: () => { /* no wire in this test */ } },
      direction: 'download',
      paths: ['/tmp/FILE.LHA'],
    });
    return (manager as any).buildArgs();
  };

  it('carries the default cap', () => {
    expect(argsFor()).toEqual(['-b', '-o', '-L', '1024', '-vv', '/tmp/FILE.LHA']);
  });

  it('carries the configured one', () => {
    board.mockReturnValue({ zmodem_packetlen: 4096 });

    expect(argsFor()).toEqual(['-b', '-o', '-L', '4096', '-vv', '/tmp/FILE.LHA']);
  });

  it('still forces CRC16, which is a separate MuffinTerm workaround', () => {
    // `-o` is not the packet length's business and must survive its change:
    // MuffinTerm's rz ZNAKs ZBIN32 frames.
    expect(argsFor()).toContain('-o');
  });
});
