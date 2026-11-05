/** The menu logo delete answers 204 with no body, and a 409 carries usedBy beside the message. */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { apiClient, ApiError } from '../src/api/client';

afterEach(() => vi.unstubAllGlobals());

describe('menu logo delete', () => {
  it('resolves on an empty 204 answer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
    await expect(apiClient.deleteMenuLogo('MAIN', 'a.txt')).resolves.toBeUndefined();
  });
  it('surfaces usedBy from a 409', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: false, message: 'still shown', usedBy: ['header'] }), { status: 409 })));
    const err = await apiClient.deleteMenuLogo('MAIN', 'a.txt').catch(e => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).data).toEqual({ usedBy: ['header'] });
  });
});
