/**
 * A STEP WITH NOTHING IN IT SAYS WHERE THE SOMETHING IS.
 *
 * The sysop's screenshot, 2026-09-16: six steps, every one of them "Nothing
 * included. This screen is its own art, or it is empty." The theme picker had
 * opened on the board's default theme, whose copies of those screens are pure
 * art - while `Node1/logon20.txt`, with the five includes he came to edit,
 * sat one selection away and was never mentioned.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const get = vi.fn();
const put = vi.fn();
vi.mock('../api/client', () => ({ apiClient: { get: (...a: unknown[]) => get(...a), put: (...a: unknown[]) => put(...a) } }));
vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true) }),
}));

import { LoginSequencePage } from '../pages/LoginSequencePage';

/** What the board answers with a theme in play: art, and no includes. */
const THEMED = {
  node: 1, theme: 'tango',
  themes: [
    { slug: 'default', title: 'Board default screens', status: 'live', isDefault: false },
    { slug: 'tango', title: 'Tango', status: 'live', isDefault: true },
  ],
  steps: [{
    screen: 'LOGON', label: 'Logon screen', note: '', skippedByQuickFlag: false,
    file: 'Themes/tango/Node/LOGON.TXT', exists: true, bytes: 957, blankPause: false,
    items: [],
    otherCopy: { theme: 'default', file: 'Node1/logon20.txt', items: 5 },
  }],
  available: [],
};

/** And what it answers for the board's own screens. */
const BOARD = {
  node: 1, theme: 'default', themes: THEMED.themes,
  steps: [{
    screen: 'LOGON', label: 'Logon screen', note: '', skippedByQuickFlag: false,
    file: 'Node1/logon20.txt', exists: true, bytes: 149, blankPause: false,
    items: [
      { code: 'CC', target: 'gl', pause: true },
      { code: 'CC', target: 'gwall', pause: false },
    ],
    otherCopy: null,
  }],
  available: [],
};

const envelope = (payload: unknown) => ({ data: { success: true, data: payload, timestamp: '' } });

beforeEach(() => {
  get.mockReset().mockImplementation((url: string) =>
    Promise.resolve(envelope(/theme=default/.test(url) ? BOARD : THEMED)));
  put.mockReset().mockResolvedValue({ data: {} });
});

describe('a step whose theme copy is only art', () => {
  it('names the file that does have the login script, and how much is in it', async () => {
    render(<LoginSequencePage />);
    expect(await screen.findByText(/Node1\/logon20\.txt/)).toBeTruthy();
    expect(screen.getByText(/has 5 steps in it/)).toBeTruthy();
  });

  it('switches to the board\'s own screens in one click, and the rows appear', async () => {
    render(<LoginSequencePage />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /Show the board's own screens/ }));

    await waitFor(() => expect(
      (screen.getByLabelText('Row 1 of Logon screen') as HTMLInputElement).value
    ).toBe('gl'));
    expect(screen.getByText('~CC_gwall')).toBeTruthy();
  });

  it('says nothing of the sort when the step already has its includes', async () => {
    get.mockImplementation(() => Promise.resolve(envelope(BOARD)));
    render(<LoginSequencePage />);
    await screen.findByLabelText('Row 1 of Logon screen');
    expect(screen.queryByRole('button', { name: /Show the board's own screens/ })).toBeNull();
  });
});
