/**
 * A refused caller is told how long to wait, in the number the server sent.
 *
 * ACHIEVE printed "Too many requests; try again in a minute" for every 429.
 * Registration is THREE AN HOUR, so a sysop who registered a few times while
 * his mail was being repaired was told to wait a minute, waited many, and was
 * refused each time - "it says too many requests try again in a minute but it
 * was many minutes ago". The surface sends the seconds as `Retry-After` and in
 * the body; `apiRequest` dropped both, so the door had nothing truthful to
 * print.
 */
import { apiRequest } from '../../src/achievements/client';
import type { AchievementsSettings } from '../../src/achievements/config';

const settings = {
  enabled: true, serverUrl: 'https://doors.example.net', boardId: 'b1', boardKey: 'k',
} as unknown as AchievementsSettings;

const respond = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  jest.fn(async () => ({
    status,
    text: async () => JSON.stringify(body),
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  })) as never;

describe('what a 429 tells the caller', () => {
  it('carries the seconds the body names', async () => {
    const res = await apiRequest(settings, 'POST', '/players', {},
      respond(429, { error: 'rate_limited', detail: 'too many', retryAfter: 2400 }));

    expect(res.error).toBe('rate_limited');
    expect(res.retryAfter).toBe(2400);
  });

  it('falls back to the Retry-After header when the body has none', async () => {
    // A proxy that rewrites the body must not cost the caller the number.
    const res = await apiRequest(settings, 'POST', '/players', {},
      respond(429, { error: 'rate_limited' }, { 'retry-after': '900' }));

    expect(res.retryAfter).toBe(900);
  });

  it('leaves it unset when the server offers nothing', async () => {
    const res = await apiRequest(settings, 'POST', '/players', {}, respond(429, { error: 'rate_limited' }));

    expect(res.retryAfter).toBeUndefined();
  });

  it('does not invent one for an ordinary refusal', async () => {
    const res = await apiRequest(settings, 'POST', '/players', {}, respond(409, { error: 'handle_taken' }));

    expect(res.retryAfter).toBeUndefined();
    expect(res.error).toBe('handle_taken');
  });
});
