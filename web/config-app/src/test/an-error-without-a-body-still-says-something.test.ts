/**
 * A failed request always says something.
 *
 * The sysop opened Drive 1's contents while a deploy was restarting the
 * board (2026-09-29, 15:04 UTC): the proxy answered with its own page, not
 * the API's JSON, and over HTTP/2 there is no status text - so the error
 * panel showed a warning icon and no words at all.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient, statusWords } from '../api/client';

afterEach(() => vi.unstubAllGlobals());

describe('an error with no message of its own', () => {
  it('names a restarting board for a 502', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Bad Gateway</html>', { status: 502, statusText: '' })));
    await expect(apiClient.getDriveContents(1)).rejects.toThrow(/may be restarting/);
  });

  it('gives the status for anything else', () => {
    expect(statusWords(418)).toBe('The request failed (HTTP 418).');
  });
});
