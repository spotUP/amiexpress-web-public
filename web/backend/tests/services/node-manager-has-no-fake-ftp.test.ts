/**
 * `startTransfer('ftp', ...)` used to SUCCEED without moving a byte.
 *
 * `node-manager.service.ts` registered an `ftp` protocol under the comment
 * "FTP protocol (now implemented)" and answered it with `startFTPTransfer`,
 * which opened no socket: it waited three seconds on a `setTimeout` and then
 * called `completeTransfer(sessionId, 'ftp_checksum_placeholder')`. Anything
 * that asked the node manager for an FTP transfer got a transfer session that
 * recorded a completed transfer of a file that was never sent.
 *
 * A real server is specified in
 * `docs/superpowers/specs/2026-09-07-ftp-server-design.md`. Until it exists,
 * asking for FTP has to FAIL - a refusal is recoverable, a fabricated success
 * is not.
 */

const updateTransferSession = jest.fn();
const createTransferSession = jest.fn().mockResolvedValue('session-1');

jest.mock('../../src/database', () => ({
  db: {
    createTransferSession: (...args: unknown[]) => createTransferSession(...args),
    updateTransferSession: (...args: unknown[]) => updateTransferSession(...args),
    getNodes: jest.fn().mockResolvedValue([]),
  },
}));

describe('the node manager and FTP', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('refuses an FTP transfer instead of reporting one that never happened', async () => {
    const { ProtocolManager } = require('../../src/services/node-manager.service');
    const manager = new ProtocolManager();

    await expect(
      manager.startTransfer('ftp', {
        userId: 1,
        direction: 'download',
        filename: 'DEMO.LHA',
        size: 1024,
      })
    ).rejects.toThrow(/ftp/i);

    // and it did not open a transfer session on the way to failing
    expect(createTransferSession).not.toHaveBeenCalled();
    expect(updateTransferSession).not.toHaveBeenCalled();
  });

  it('does not offer FTP among the enabled protocols', () => {
    const { ProtocolManager } = require('../../src/services/node-manager.service');
    const manager = new ProtocolManager();

    expect(manager.getProtocol('ftp')).toBeNull();
    expect(manager.getEnabledProtocols().map((p: { id: string }) => p.id)).not.toContain('ftp');
  });

  it('leaves no simulated transfer in the source', () => {
    // The specific shape that made the fake pass for real: a timer that
    // completes the session with a placeholder checksum.
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '..', '..', 'src', 'services', 'node-manager.service.ts'),
      'utf8'
    );
    expect(source).not.toContain('ftp_checksum_placeholder');
    expect(source).not.toContain('startFTPTransfer');
  });
});
