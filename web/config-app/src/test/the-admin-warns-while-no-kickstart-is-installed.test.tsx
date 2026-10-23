/**
 * Every admin page shows a banner while no Kickstart ROM is installed, linking
 * to the Health page's upload card. Driven through AppShell (the frame every
 * admin page renders in) and the real Kickstart status hook; only the network
 * edge and the unrelated chrome are stubbed.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

let kickstart: Record<string, unknown>;
const asked: string[] = [];
vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
  asked.push(String(input));
  return Promise.resolve({
    ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => kickstart,
    text: async () => JSON.stringify(kickstart),
  } as unknown as Response);
}));

let secLevel = 255;
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { username: 'sysop' }, secLevel }) }));
vi.mock('../realtime/RealtimeProvider', () => ({ useRealtime: () => ({ status: 'live' }) }));
vi.mock('../components/AppShell/Header', () => ({ Header: () => null }));
vi.mock('../components/AppShell/Sidebar', () => ({ Sidebar: () => null }));
vi.mock('../components/PagingBeep', () => ({ PagingBeep: () => null }));

import { AppShell } from '../components/AppShell/AppShell';

const status = (over: Record<string, unknown>) => ({
  found: false, usingAros: true, label: 'AROS', path: null, rejected: [],
  uploadDir: '/data/amiga-roms', message: 'No Kickstart ROM installed.', ...over,
});

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter><QueryClientProvider client={client}><AppShell /></QueryClientProvider></MemoryRouter>,
  );
}

beforeEach(() => { asked.length = 0; secLevel = 255; });

describe('the admin frame while no Kickstart is installed', () => {
  it('shows a banner linking to the Health page upload', async () => {
    kickstart = status({});
    mount();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('No Kickstart ROM is installed');
    expect(alert.textContent).toContain('AROS fallback');
    expect(screen.getByRole('link', { name: 'Upload Kickstart ROM' }).getAttribute('href')).toBe('/admin/health');
    expect(asked.some((u) => u.includes('/config/kickstart'))).toBe(true);
  });

  it('shows nothing once a Kickstart is installed', async () => {
    kickstart = status({ found: true, usingAros: false, label: 'Kickstart 3.1', path: '/x/kickstart.rom', message: null });
    mount();
    await vi.waitFor(() => expect(asked.length).toBeGreaterThan(0));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('does not ask, or show it, to an account below sysop', async () => {
    kickstart = status({});
    secLevel = 100;
    mount();
    await new Promise((r) => setTimeout(r, 50));
    expect(asked).toEqual([]);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
