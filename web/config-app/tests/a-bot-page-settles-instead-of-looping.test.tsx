/**
 * The bot page has to stop rendering.
 *
 * `const fields = query.data?.data ?? []` made a FRESH array on every render
 * and was the only dependency of the effect that seeds the config draft. The
 * setter returned a new object while the draft was empty, so React rendered
 * again, so `fields` was a new reference again: 5000+ renders and "Maximum
 * update depth exceeded".
 *
 * It bit in the three states a sysop actually meets:
 *  - a bot that is NOT installed - the config query is `enabled: !!manifest`,
 *    so it never resolves and the loop never ends;
 *  - a bot whose fields are all unset secrets (WHIP before anyone configured
 *    it) - `if (!field.secret && field.value)` fills nothing, so the draft
 *    stays empty for ever;
 *  - while the queries are still loading, and on an error.
 */
import { Profiler, type ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const getBotPlugins = vi.fn();
const getBotStatus = vi.fn();
const getBotLogs = vi.fn();
const getBotConfig = vi.fn();

// BotPage reports a failed save through the notification context now, so a
// bare render needs it stubbed - the same shape a-failed-bot-save-says-so and
// the persona suite use.
vi.mock('../src/contexts/NotificationContext', () => ({
  useNotification: () => ({ showError: vi.fn(), showSuccess: vi.fn(), confirm: vi.fn() }),
}));

vi.mock('../src/api/client', () => ({
  apiClient: {
    getBotPlugins: (...args: unknown[]) => getBotPlugins(...args),
    getBotStatus: (...args: unknown[]) => getBotStatus(...args),
    getBotLogs: (...args: unknown[]) => getBotLogs(...args),
    getBotConfig: (...args: unknown[]) => getBotConfig(...args),
    botAction: vi.fn(),
    setBotConfig: vi.fn(),
  },
}));

import { BotPage } from '../src/pages/BotPage';

const envelope = (data: unknown) => Promise.resolve({ success: true, data, timestamp: '' });

let client: QueryClient;
let commits = 0;

/** Far above any honest number of commits, far below a runaway loop. */
const RUNAWAY = 40;

/**
 * The loop is stopped from INSIDE the commit, not waited out: a runaway
 * render starves jsdom's event loop, so a test that only asserted afterwards
 * would hang the suite for ever rather than fail it.
 */
function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={client}>
      <Profiler
        id="bot"
        onRender={() => {
          commits += 1;
          if (commits > RUNAWAY) throw new Error(`${commits} renders: the bot page is looping`);
        }}
      >
        {children}
      </Profiler>
    </QueryClientProvider>
  );
}

describe('the bot page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    commits = 0;
    client = new QueryClient({
      defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
    });
    getBotStatus.mockReturnValue(envelope({ state: 'running' }));
    getBotLogs.mockReturnValue(envelope({ lines: [] }));
  });

  it('says a bot is not installed instead of rendering for ever', async () => {
    getBotPlugins.mockReturnValue(envelope([]));
    getBotConfig.mockReturnValue(envelope([]));

    render(<BotPage pluginId="whip" />, { wrapper });

    expect(await screen.findByRole('heading', { name: 'Bot not installed' })).toBeTruthy();
    expect(commits).toBeLessThan(RUNAWAY);
  });

  it('shows an unconfigured bot\'s empty secrets instead of rendering for ever', async () => {
    getBotPlugins.mockReturnValue(envelope([
      { id: 'whip', name: 'WHIP mirror', description: 'Discord mirror', version: '1.0.0' },
    ]));
    getBotConfig.mockReturnValue(envelope([
      { key: 'DISCORD_TOKEN', label: 'Discord token', secret: true, value: '', set: false },
      { key: 'DISCORD_WEBHOOK', label: 'Discord webhook', secret: true, value: '', set: false },
    ]));

    render(<BotPage pluginId="whip" />, { wrapper });

    expect(await screen.findByRole('heading', { name: /WHIP mirror/ })).toBeTruthy();
    expect(await screen.findByText('Discord token')).toBeTruthy();
    expect(commits).toBeLessThan(RUNAWAY);
  });
});
