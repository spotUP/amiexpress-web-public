/**
 * An artist's admin does not ask for what the server will refuse.
 *
 * `/api/nodes`, `/api/stats` and `/api/admin-permissions` are all mounted
 * behind `requireSysop()`. The shell polls the first two every few seconds for
 * whoever is logged in, and AuthContext probes the third on every session - so
 * a level-100 artist reaching the screen studio got a 403 every three seconds
 * for as long as the tab stayed open. The sysop, on their first visit:
 * "GET /api/admin-permissions 403 (Forbidden)" and pages of it.
 *
 * The caller's own level answers all three questions before they are asked.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { QUERY_DEFAULTS } from '../src/lib/query-client';

const asked: string[] = [];
vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
  asked.push(String(input).replace(/^https?:\/\/[^/]+/, ''));
  return Promise.resolve({
    ok: false, status: 403, headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => ({ success: false, error: 'Sysop access required' }),
    text: async () => '{"error":"Sysop access required"}',
  } as unknown as Response);
}));

let secLevel = 100;
vi.mock('../src/contexts/AuthContext', () => ({ useAuth: () => ({ user: { username: 'skope' }, secLevel }) }));
vi.mock('../src/realtime/RealtimeProvider', () => ({ useRealtime: () => ({ status: 'live' }) }));

import { useNodeStatus, useSessionStats, useSystemStats } from '../src/hooks/useBoardData';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { ...QUERY_DEFAULTS, queries: { ...QUERY_DEFAULTS.queries, retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('the board polls, for a caller who may read them', () => {
  beforeEach(() => { asked.length = 0; secLevel = 100; });

  it('asks nothing on behalf of an artist', async () => {
    renderHook(() => { useNodeStatus(); useSessionStats(); useSystemStats(); }, { wrapper });

    await new Promise(resolve => setTimeout(resolve, 50));
    expect(asked.filter(url => /\/api\/(nodes|stats)/.test(url))).toEqual([]);
  });

  it('still asks on behalf of a sysop', async () => {
    secLevel = 255;
    renderHook(() => { useNodeStatus(); useSessionStats(); useSystemStats(); }, { wrapper });

    await waitFor(() => expect(asked.some(url => url.includes('/api/nodes/status'))).toBe(true));
    expect(asked.some(url => url.includes('/api/stats/session'))).toBe(true);
  });
});
