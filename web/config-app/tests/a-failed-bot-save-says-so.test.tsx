/**
 * A save that fails must say so.
 *
 * `saveMutation` had an `onSuccess` and nothing else, so a rejected write left
 * the form exactly as it had been: no message, no error, the Save button back
 * to idle. It looked identical to success.
 *
 * That is not hypothetical. The sysop pasted a freshly rotated Discord token
 * into this page while the plugin directory was still `root:root` and both
 * containers run as `bbsuser`, so the write threw EACCES. He was told nothing,
 * and only discovered it because the bot kept crash-looping on the old token -
 * several rounds later. `PUT /api/config/bots/:id/config` had been returning a
 * correct 500 with the reason in it the whole time; the page discarded it.
 *
 * Fourth of the same family this week - an error nobody sees, a promise nobody
 * resolves, a meter that cannot see its own fault, and now a form that reports
 * success it never got.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BotPage } from '../src/pages/BotPage';
import { QUERY_DEFAULTS } from '../src/lib/query-client';

const showError = vi.fn();
vi.mock('../src/contexts/NotificationContext', () => ({
  useNotification: () => ({ showError, showSuccess: vi.fn(), confirm: vi.fn() }),
}));

const setBotConfig = vi.fn();
vi.mock('../src/api/client', () => ({
  apiClient: {
    getBotPlugins: () => Promise.resolve({ success: true, data: [{ id: 'whip', name: 'WHIP', configSchema: [] }] }),
    getBotStatus: () => Promise.resolve({ success: true, data: { state: 'unmanaged' } }),
    getBotLogs: () => Promise.resolve({ success: true, data: { lines: [] } }),
    getBotConfig: () => Promise.resolve({
      success: true,
      data: [{ key: 'DISCORD_BOT_TOKEN', label: 'Bot token', secret: true, value: '', set: true }],
    }),
    setBotConfig: (...args: unknown[]) => setBotConfig(...args),
    botAction: () => Promise.resolve({ success: true }),
  },
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { ...QUERY_DEFAULTS, retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <BotPage pluginId="whip" />
    </QueryClientProvider>
  );
}

describe('saving the bot configuration', () => {
  beforeEach(() => {
    showError.mockClear();
    setBotConfig.mockReset();
  });

  it('shows the board\'s own reason when the write is refused', async () => {
    // What the route really answered while the directory was root-owned.
    setBotConfig.mockRejectedValue(
      new Error("EACCES: permission denied, open '/app/data/bots/whip.env'")
    );
    const user = userEvent.setup();
    renderPage();

    const field = await screen.findByLabelText(/bot token/i);
    await user.type(field, 'a-new-token');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(showError).toHaveBeenCalled());
    expect(String(showError.mock.calls[0][0])).toMatch(/EACCES|permission denied/i);
  });

  it('does not leave a success notice standing after a failure', async () => {
    setBotConfig.mockRejectedValue(new Error('nope'));
    const user = userEvent.setup();
    renderPage();

    const field = await screen.findByLabelText(/bot token/i);
    await user.type(field, 'x');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(showError).toHaveBeenCalled());
    expect(screen.queryByText(/Saved\./i)).toBeNull();
  });

  it('still reports success when the write lands', async () => {
    setBotConfig.mockResolvedValue({ success: true, data: [], message: 'Saved. Restart the bot to apply.' });
    const user = userEvent.setup();
    renderPage();

    const field = await screen.findByLabelText(/bot token/i);
    await user.type(field, 'x');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(await screen.findByText(/Saved\. Restart the bot to apply\./i)).toBeInTheDocument();
    expect(showError).not.toHaveBeenCalled();
  });
});
