/**
 * The sysop edits the front page of THE UNKNOWN FREQUENCY from the admin.
 *
 * Driven as he drives it - add an article from the list, make another the
 * lead, remove one - and what is asserted is the REQUEST that reaches the
 * board: the ids, in the order he left them. The list saves itself; there is
 * no Save button to press.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const getMagazineFront = vi.fn();
const getMagazineStory = vi.fn();
const saveMagazineFront = vi.fn();
vi.mock('../api/client', () => ({
  apiClient: {
    getMagazineFront: (...a: unknown[]) => getMagazineFront(...a),
    getMagazineStory: (...a: unknown[]) => getMagazineStory(...a),
    saveMagazineFront: (...a: unknown[]) => saveMagazineFront(...a),
  },
}));
vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn() }),
}));

import { MagazinePage } from '../pages/MagazinePage';

const story = (id: string, headline: string, desk = 'SECURITY', deskLabel = 'Security') => ({
  id, headline, desk, deskLabel, source: 'example.org', date: '2026-10-01', bodyLength: 2400, origin: 'feed' as const,
});

const STORIES = [story('a', 'Alpha breach'), story('b', 'Bravo release', 'SCENE', 'Scene'), story('c', 'Charlie zero-day')];

function renderPage(front: string[]) {
  // `apiClient.get*` answers the route's envelope whole, so the payload is under `.data`.
  getMagazineFront.mockResolvedValue({ success: true, data: { stories: STORIES, front } });
  getMagazineStory.mockResolvedValue({ success: true, data: { ...STORIES[0], body: 'The full text of alpha.', summary: 's' } });
  saveMagazineFront.mockResolvedValue({ success: true, data: { front: [] } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MagazinePage /></QueryClientProvider>);
}

beforeEach(() => { vi.clearAllMocks(); });

describe('the Magazine admin page', () => {
  it('shows the first front page story as the lead and saves an added article at the end', async () => {
    renderPage(['a']);
    await screen.findByText('Bravo release');

    expect(screen.getByText('Lead')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Add Bravo release to the front page' }));

    await waitFor(() => expect(saveMagazineFront).toHaveBeenCalledWith(['a', 'b']), { timeout: 3000 });
    expect(saveMagazineFront).toHaveBeenCalledTimes(1);
  });

  it('makes a story the lead and keeps the rest in order', async () => {
    renderPage(['a', 'b', 'c']);
    await screen.findByText('Charlie zero-day', { selector: 'span' });

    await userEvent.click(screen.getByRole('button', { name: 'Make Charlie zero-day the lead' }));

    await waitFor(() => expect(saveMagazineFront).toHaveBeenCalledWith(['c', 'a', 'b']), { timeout: 3000 });
  });

  it('removes a story from the front page', async () => {
    renderPage(['a', 'b']);
    await screen.findByRole('button', { name: 'Remove Bravo release from the front page' });

    await userEvent.click(screen.getByRole('button', { name: 'Remove Bravo release from the front page' }));

    await waitFor(() => expect(saveMagazineFront).toHaveBeenCalledWith(['a']), { timeout: 3000 });
  });

  it('moves a story down one place', async () => {
    renderPage(['a', 'b']);
    await screen.findByRole('button', { name: 'Move Alpha breach down' });

    await userEvent.click(screen.getByRole('button', { name: 'Move Alpha breach down' }));

    await waitFor(() => expect(saveMagazineFront).toHaveBeenCalledWith(['b', 'a']), { timeout: 3000 });
  });

  it('shows the article text when its row is clicked', async () => {
    renderPage([]);
    const row = await screen.findByText('Alpha breach');

    await userEvent.click(row);

    expect(await screen.findByText('The full text of alpha.')).toBeTruthy();
    expect(getMagazineStory).toHaveBeenCalledWith('a');
  });

  it('filters the candidates by desk and by search text', async () => {
    renderPage([]);
    await screen.findByText('Alpha breach');

    await userEvent.selectOptions(screen.getByLabelText('Filter by desk'), 'SCENE');
    expect(screen.queryByText('Alpha breach')).toBeNull();
    expect(screen.getByText('Bravo release')).toBeTruthy();

    await userEvent.selectOptions(screen.getByLabelText('Filter by desk'), 'all');
    await userEvent.type(screen.getByLabelText('Search articles'), 'charlie');
    expect(screen.queryByText('Bravo release')).toBeNull();
    expect(screen.getByText('Charlie zero-day')).toBeTruthy();
  });
});
