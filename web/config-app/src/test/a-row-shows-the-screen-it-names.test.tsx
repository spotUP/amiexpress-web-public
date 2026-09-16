/**
 * A ROW SHOWS THE SCREEN IT NAMES.
 *
 * "ok but the content of bull6.txt is not visible nor editable? what am i
 * gonna do with that?" (sysop, 2026-09-16). The page listed the file and
 * stopped there. Now the row opens it, drawn by the same canvas the screen
 * editor uses - and says when the board writes the file itself, because
 * SAmiLog rewrites bull6 every night and art drawn over its numbers is gone
 * by morning.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const get = vi.fn();
const put = vi.fn();
const post = vi.fn();
const getScreenFile = vi.fn();
vi.mock('../api/client', () => ({
  apiClient: {
    get: (...a: unknown[]) => get(...a),
    put: (...a: unknown[]) => put(...a),
    post: (...a: unknown[]) => post(...a),
    getScreenFile: (...a: unknown[]) => getScreenFile(...a),
  },
}));
vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true) }),
}));
// The canvas is the editor's, and jsdom has no 2d context; what matters here
// is that the row asks for the bytes and hands them over to be drawn.
vi.mock('../components/ScreenArt', () => ({
  ScreenArt: ({ content }: { content: string }) => <pre data-testid="art">{content}</pre>,
}));

import { LoginSequencePage } from '../pages/LoginSequencePage';

const PAYLOAD = {
  node: 1, theme: 'default',
  themes: [{ slug: 'default', title: 'Board default screens', status: 'live', isDefault: true }],
  steps: [{
    screen: 'BULL', label: 'Board bulletin', note: '', skippedByQuickFlag: false,
    file: 'Screens/BULL.TXT', exists: true, bytes: 32, blankPause: false, home: null,
    items: [{
      code: 'SS', target: 'BBS:Bulletins/bull6.txt', pause: false,
      shows: 'Bulletins/bull6.txt', generated: true,
    }],
  }],
  available: [],
};

beforeEach(() => {
  get.mockReset().mockResolvedValue({ data: { success: true, data: PAYLOAD, timestamp: '' } });
  put.mockReset().mockResolvedValue({ data: {} });
  post.mockReset().mockResolvedValue({ data: {} });
  getScreenFile.mockReset().mockResolvedValue({ data: { content: 'SUPER-AMILOG BYTES' } });
});

describe('the screen behind a row', () => {
  it('is read from the board and drawn when the row is opened', async () => {
    render(<LoginSequencePage />);
    const user = userEvent.setup();

    await user.click(await screen.findByLabelText('Show BBS:Bulletins/bull6.txt'));

    await waitFor(() => expect(screen.getByTestId('art')).toBeTruthy());
    expect(getScreenFile).toHaveBeenCalledWith('Bulletins/bull6.txt', 'default');
    expect(screen.getByTestId('art').textContent).toBe('SUPER-AMILOG BYTES');
  });

  it('says the board writes it, so nobody draws over a door\'s output', async () => {
    render(<LoginSequencePage />);
    const user = userEvent.setup();

    await user.click(await screen.findByLabelText('Show BBS:Bulletins/bull6.txt'));

    expect(await screen.findByText(/BOARD-WRITTEN/)).toBeTruthy();
  });

  it('closes again, so the page is a list and not a wall of art', async () => {
    render(<LoginSequencePage />);
    const user = userEvent.setup();

    const eye = await screen.findByLabelText('Show BBS:Bulletins/bull6.txt');
    await user.click(eye);
    await waitFor(() => expect(screen.getByTestId('art')).toBeTruthy());

    await user.click(screen.getByLabelText('Show BBS:Bulletins/bull6.txt'));
    await waitFor(() => expect(screen.queryByTestId('art')).toBeNull());
  });

  it('offers nothing to open for a row whose target resolves to no file', async () => {
    get.mockResolvedValue({
      data: {
        success: true,
        data: {
          ...PAYLOAD,
          steps: [{
            ...PAYLOAD.steps[0],
            items: [{ code: 'CC', target: 'gl', pause: true }],
          }],
        },
        timestamp: '',
      },
    });

    render(<LoginSequencePage />);
    await screen.findByLabelText('Row 1 of Board bulletin');
    expect(screen.queryByLabelText('Show gl')).toBeNull();
  });
});

/**
 * AND WHEN TWO STEPS SHOW THE SAME SCREEN, THE ROW SAYS SO.
 *
 * Months of "two samilogs, the first one cleared before I could read it",
 * because bull6 was included by the logon screen and by the bulletin step at
 * once. Each file was right on its own; only the walk knew.
 */
describe('a screen another step also shows', () => {
  it('warns on the row, and names the other step', async () => {
    get.mockResolvedValue({
      data: {
        success: true,
        data: {
          node: 1,
          steps: [{
            screen: 'LOGON', label: 'Logon screen', note: '', skippedByQuickFlag: false,
            file: 'Node1/logon20.txt', exists: true, bytes: 60, blankPause: false,
            items: [{
              code: 'SS', target: 'BBS:Bulletins/bull6.txt', pause: true,
              shows: 'Bulletins/bull6.txt', generated: true,
              alsoShownBy: ['Board bulletin'],
            }],
          }],
          available: [],
        },
        timestamp: '',
      },
    });

    render(<LoginSequencePage />);
    expect(await screen.findByText(/\[TWICE\]/)).toBeTruthy();
    expect(screen.getByText(/Board bulletin shows this same screen/)).toBeTruthy();
  });
});
