/**
 * An FTP caller appears in WHO.
 *
 * Phase 6. He takes a NODE from the same pool as everybody else - counted the
 * same way, refused with "all nodes are busy" the same way - but he has no
 * `BBSSession`, and WHO enumerates the session map. So a sysop looking at WHO
 * saw a node in use and nobody using it, which is worse than not showing him
 * at all: it reads as a leaked node.
 *
 * What is driven here is the registry and its lifecycle, because that is where
 * the mistake would be: a caller who is registered and never released is a
 * ghost in WHO for as long as the board runs.
 */
import {
  ftpCallersOnline,
  registerFtpCaller,
  releaseFtpCaller,
  resetFtpPresence,
} from '../../src/ftp/ftp-presence';

beforeEach(() => resetFtpPresence());
afterAll(() => resetFtpPresence());

describe('the FTP presence WHO reads', () => {
  it('lists a caller once he holds a node', () => {
    registerFtpCaller('ftp-1', { nodeId: 4, username: 'sysop', location: 'reference-board' });

    expect(ftpCallersOnline()).toEqual([
      expect.objectContaining({ nodeId: 4, username: 'sysop', location: 'reference-board' }),
    ]);
  });

  it('forgets him when the node goes back', () => {
    registerFtpCaller('ftp-1', { nodeId: 4, username: 'sysop', location: '' });
    releaseFtpCaller('ftp-1');

    expect(ftpCallersOnline()).toEqual([]);
  });

  it('releasing a session that never took a node is harmless', () => {
    // A login refused before a node was assigned still calls releaseNode -
    // the session teardown does not know how far the login got.
    expect(() => releaseFtpCaller('never-registered')).not.toThrow();
    expect(ftpCallersOnline()).toEqual([]);
  });

  it('orders by node, the way the WHO table reads', () => {
    registerFtpCaller('ftp-b', { nodeId: 9, username: 'krakken', location: '' });
    registerFtpCaller('ftp-a', { nodeId: 2, username: 'spot', location: '' });

    expect(ftpCallersOnline().map((caller) => caller.nodeId)).toEqual([2, 9]);
  });

  it('keeps two callers apart, so one leaving does not hide the other', () => {
    registerFtpCaller('ftp-a', { nodeId: 2, username: 'spot', location: '' });
    registerFtpCaller('ftp-b', { nodeId: 3, username: 'krakken', location: '' });

    releaseFtpCaller('ftp-a');

    expect(ftpCallersOnline().map((caller) => caller.username)).toEqual(['krakken']);
  });

  it('records when he arrived, so a long transfer is visible as one', () => {
    const before = Date.now();
    registerFtpCaller('ftp-1', { nodeId: 1, username: 'sysop', location: '' });

    const [caller] = ftpCallersOnline();
    expect(caller.since.getTime()).toBeGreaterThanOrEqual(before);
    expect(caller.since.getTime()).toBeLessThanOrEqual(Date.now());
  });
});

describe('the WHO command reads it', () => {
  it('is wired into the table, not merely available', () => {
    // The registry could be perfect and unread. This is the cheapest proof
    // that the command actually consults it; the row rendering itself is
    // express.e's format and covered by the WHO suite.
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '..', '..', 'src', 'handlers', 'commands', 'info-commands.handler.ts'),
      'utf8'
    );

    expect(source).toContain('ftpCallersOnline()');
  });
});
