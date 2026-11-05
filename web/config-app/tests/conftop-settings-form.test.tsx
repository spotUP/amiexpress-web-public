/**
 * The ConfTop settings form.
 *
 * "add the door setting to our admin web ui" (the sysop, 2026-09-14). The
 * point of the form is not that the fields exist - it is that ROWS SAYS WHAT
 * IT COSTS. A sysop choosing 20 is choosing a 26-line screen for a 25-line
 * caller, and until now the only way to learn that was a screenshot of a
 * bulletin with its first four rows missing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConftopSettings } from '../src/components/ConftopSettings';

const getConftopSettings = vi.fn();
const saveConftopSettings = vi.fn();

vi.mock('../src/api/client', () => ({
  apiClient: {
    getConftopSettings: (...args: unknown[]) => getConftopSettings(...args),
    saveConftopSettings: (...args: unknown[]) => saveConftopSettings(...args),
  },
}));

const showSuccess = vi.fn();
const showError = vi.fn();
vi.mock('../src/contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess, showError }),
}));

/** What the route answers for a conference that runs ConfTop. */
const view = (over: Record<string, unknown> = {}) => ({
  data: {
    present: true, rows: 12, days: 'WEEKLY', mailUser: 'eall',
    bullFile: 'BBS:Bulletins/conftop.txt', minLimit: null,
    skipEmptyLines: true, showResetDate: false,
    height: 18, fits: true, maxFittingRows: 13, chromeRows: 6,
    ...over,
  },
});

function draw(conferenceId = 3) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ConftopSettings conferenceId={conferenceId} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getConftopSettings.mockResolvedValue(view());
  saveConftopSettings.mockResolvedValue(view());
});

describe('the top-uploaders settings', () => {
  it('says how many lines the bulletin will take', async () => {
    draw();

    // 6 of chrome + 12 of uploaders, against the 25 a caller has.
    expect(await screen.findByText(/Prints 18 lines of the caller's 25/)).toBeInTheDocument();
  });

  it('names the most that fits, rather than leaving it to be discovered', async () => {
    draw();

    expect(await screen.findByText(/13 is the most that fits/)).toBeInTheDocument();
  });

  it('recounts as the number is changed', async () => {
    draw();
    const rows = await screen.findByLabelText('Uploaders listed');

    await userEvent.clear(rows);
    await userEvent.type(rows, '8');

    expect(await screen.findByText(/Prints 14 lines/)).toBeInTheDocument();
  });

  it('saves what the sysop chose', async () => {
    draw(3);
    const rows = await screen.findByLabelText('Uploaders listed');

    await userEvent.clear(rows);
    await userEvent.type(rows, '10');
    await userEvent.click(screen.getByRole('button', { name: /Save top-uploaders settings/ }));

    await waitFor(() => expect(saveConftopSettings).toHaveBeenCalled());
    const [conf, body] = saveConftopSettings.mock.calls[0];
    expect(conf).toBe(3);
    expect(body).toMatchObject({ rows: 10, skipEmptyLines: true });
  });

  it('says so when the conference does not run the door', async () => {
    // Rather than offering fields whose save would fail.
    getConftopSettings.mockResolvedValue(view({ present: false }));

    draw();

    expect(await screen.findByText(/does not run ConfTop/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Uploaders listed')).not.toBeInTheDocument();
  });

  it('surfaces a refusal from the board instead of swallowing it', async () => {
    saveConftopSettings.mockRejectedValue(new Error('the most that fits is 13'));

    draw();
    await screen.findByLabelText('Uploaders listed');
    await userEvent.click(screen.getByRole('button', { name: /Save top-uploaders settings/ }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('the most that fits is 13'));
  });
});
