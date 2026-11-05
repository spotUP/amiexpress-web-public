/**
 * A save from the Operator Chat page carries ONLY what the sysop changed.
 *
 * The page autosaves. It used to send the whole form - a copy of the config
 * taken when the page loaded - so a value written since by anyone else (the
 * TUI console, a second tab, a key set on the server) went back to what this
 * tab had seen, on the next keystroke, in every column at once. 2026-09-07:
 * an OpenRouter key set at 20:45 was empty at 20:47, taken by a page-timeout
 * edit in a tab that loaded before the key existed. "we keep losing settings
 * made in the admin ui."
 *
 * Driven through the real page with a stubbed network: the assertion is on
 * the bytes the page PUTs.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

const levels = { levels: [10, 20, 50, 255], inUse: [], permissions: [] };

const serverConfig = {
  enabled: true, requireCarrier: false, allowedSecLevels: [30], pageTimeout: 120, pageCooldown: 300,
  maxActivePages: 1, soundEnabled: true, vibrateEnabled: true, notifyOnPage: true,
  quietHours: { enabled: false, startHour: 23, startMinute: 0, endHour: 7, endMinute: 0, timezone: 'UTC', customMessage: '' },
  discordWebhook: '', discordUserId: '', notifyDiscord: false, quickReplies: [],
  aiEnabled: true, aiProvider: 'openrouter', aiModelName: '', aiTemperature: 0.9, aiSystemPrompt: '',
  openRouterApiKey: 'sk-or-v1-the-key-somebody-else-set', groqApiKey: '', geminiApiKey: '',
  botTypingSpeed: 40, botTypoProbability: 0.04, botThinkTime: 1000,
  pushoverUserKey: '', pushoverAppToken: '', gotifyUrl: '', gotifyAppToken: '', ntfyTopic: '', ntfyUrl: '',
};

const envelope = (data: unknown) =>
  Promise.resolve({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => ({ success: true, data, timestamp: '' }),
    text: async () => JSON.stringify({ success: true, data }),
  } as unknown as Response);

const puts: Array<Record<string, unknown>> = [];
const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.includes('/config/security/levels')) return envelope(levels);
  if (url.includes('/config/system')) return envelope({ new_user_sec_level: 30, bbs_name: 'Up Rough' });
  if (url.includes('/languages') || url.includes('/screen-types')) return envelope([]);
  if (url.includes('/config/push/')) return envelope({ enabled: false });
  if (url.includes('/operator-chat')) {
    if (init?.method === 'PUT') {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      puts.push(body);
      return envelope({ ...serverConfig, ...body });
    }
    return envelope(serverConfig);
  }
  return envelope({});
});
vi.stubGlobal('fetch', fetchMock);

vi.mock('../src/contexts/NotificationContext', () => ({
  useNotification: () => ({
    showSuccess: vi.fn(), showError: vi.fn(), showWarning: vi.fn(),
    confirm: vi.fn(async () => true),
  }),
}));
vi.mock('../src/hooks/usePushNotifications', () => ({
  usePushNotifications: () => ({ isSupported: false, isSubscribed: false, permission: 'default', subscribe: vi.fn(), unsubscribe: vi.fn(), error: null, isLoading: false }),
}));

import { OperatorChatSettingsPage, changedFields } from '../src/pages/OperatorChatSettingsPage';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter initialEntries={['/admin/operator-chat']}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

describe('an operator chat save carries only what the sysop changed', () => {
  beforeEach(() => { fetchMock.mockClear(); puts.length = 0; });

  it('a page-timeout edit does not write the API key back', async () => {
    render(<OperatorChatSettingsPage />, { wrapper });
    const timeout = (await screen.findByDisplayValue('120')) as HTMLInputElement;

    fireEvent.change(timeout, { target: { value: '16' } });
    await waitFor(() => expect(puts.length).toBeGreaterThan(0), { timeout: 3000 });

    const body = puts[0];
    expect(body.pageTimeout).toBe(16);
    expect(body).not.toHaveProperty('openRouterApiKey');
    expect(body).not.toHaveProperty('aiEnabled');
    expect(body).not.toHaveProperty('enabled');
  });

  it('typing a key sends the key, and only the key', async () => {
    render(<OperatorChatSettingsPage />, { wrapper });
    await screen.findByDisplayValue('120');
    const key = (await screen.findByPlaceholderText('gsk_...')) as HTMLInputElement;

    fireEvent.change(key, { target: { value: 'gsk_new' } });
    await waitFor(() => expect(puts.length).toBeGreaterThan(0), { timeout: 3000 });

    expect(puts[0]).toEqual({ groqApiKey: 'gsk_new' });
  });

  it('a nested or array field is sent whole when any part of it changed', () => {
    const values = {
      quietHours: { enabled: true, startHour: 22, startMinute: 0, endHour: 7, endMinute: 0, timezone: 'UTC' },
      allowedSecLevels: [30, 255],
      pageTimeout: 120,
    };
    expect(changedFields({ quietHours: { enabled: true }, allowedSecLevels: [true, false] }, values)).toEqual({
      quietHours: values.quietHours,
      allowedSecLevels: [30, 255],
    });
    expect(changedFields({ quietHours: { enabled: false } }, values)).toEqual({});
    expect(changedFields({}, values)).toEqual({});
  });
});
