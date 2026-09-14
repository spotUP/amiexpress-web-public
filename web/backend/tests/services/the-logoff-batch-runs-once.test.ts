/**
 * The logoff batch ran TWICE on a clean logoff (sysop's live log,
 * 2026-09-14):
 *
 *   [executeAmigaDoor] Starting Amiga door: LOGOFF1 (SIM)  path .../batch1
 *   [BatchScheduler] Running logoff batches for node 1 (batch1)
 *
 * `G` runs it through express.e's sys-command (8222, 8231); the disconnect
 * handler runs it again through the mirror that exists for callers whose
 * carrier drops. The mirror stands down when the sys-command path has
 * already been through.
 */
import { logoffBatchesAlreadyRan } from '../../src/services/batch-scheduler';

describe('the logoff batch runs once', () => {
  it('stands down when the sys-command path already ran it', () => {
    expect(logoffBatchesAlreadyRan({ logoffBatchesRan: true })).toBe(true);
  });

  it('runs for a caller whose carrier dropped, who never reached that path', () => {
    expect(logoffBatchesAlreadyRan({})).toBe(false);
    expect(logoffBatchesAlreadyRan({ logoffBatchesRan: false })).toBe(false);
  });

  it('runs when there is no session left to ask', () => {
    expect(logoffBatchesAlreadyRan(null)).toBe(false);
    expect(logoffBatchesAlreadyRan(undefined)).toBe(false);
  });
});
