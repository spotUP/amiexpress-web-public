/**
 * Removing an include SAVES, without hunting for a Save button.
 *
 * Sysop, 2026-09-14: "i delete one now but got no toast" - and nothing had
 * happened, because the trash button edited a local draft and the board was
 * only written when Save was pressed further up the step. Then: "the admin ui
 * should auto save when possible".
 *
 * The save is DEBOUNCED, and not only for politeness: every write to a screen
 * file invalidates the board's screen index, whose rebuild is ~2s of
 * synchronous filesystem work on the backend's single event loop. Reordering a
 * list of five with a save per click would freeze the board five times.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const get = vi.fn();
const put = vi.fn();
vi.mock('../src/api/client', () => ({ apiClient: { get: (...a: unknown[]) => get(...a), put: (...a: unknown[]) => put(...a) } }));

const showSuccess = vi.fn();
vi.mock('../src/contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess, showError: vi.fn(), confirm: vi.fn(async () => true) }),
}));

import { LoginSequencePage } from '../src/pages/LoginSequencePage';

const PAYLOAD = {
  node: 1,
  steps: [
    {
      screen: 'NODE_BULL', label: 'Node bulletins', note: "this node's bulletins",
      skippedByQuickFlag: false, file: 'Node1/BULL.TXT', exists: true, bytes: 160,
      blankPause: false,
      items: [
        { code: 'SS', target: 'BBS:Bulletins/bull1.txt', pause: true },
        { code: 'SS', target: 'BBS:Bulletins/bull2.txt', pause: true },
      ],
    },
  ],
  available: [],
};

const envelope = { data: { success: true, data: PAYLOAD, timestamp: '' } };

beforeEach(() => {
  get.mockReset().mockResolvedValue(envelope);
  put.mockReset().mockResolvedValue({ data: { success: true, data: {}, timestamp: '' } });
  showSuccess.mockReset();
});

describe('removing an include from the login sequence', () => {
  it('reaches the board without a Save button being pressed', async () => {
    const user = userEvent.setup();
    render(<LoginSequencePage />);

    await user.click(await screen.findByRole('button', { name: /Remove BBS:Bulletins\/bull2\.txt/ }));

    await waitFor(() => expect(put).toHaveBeenCalledTimes(1), { timeout: 3000 });
    const [, body] = put.mock.calls[0];
    expect(body.screen).toBe('NODE_BULL');
    // The one that was removed is gone; the one that was not is still there.
    expect(body.items.map((i: { target: string }) => i.target)).toEqual(['BBS:Bulletins/bull1.txt']);
  });

  it('says so out loud, which is what was missing', async () => {
    const user = userEvent.setup();
    render(<LoginSequencePage />);

    await user.click(await screen.findByRole('button', { name: /Remove BBS:Bulletins\/bull2\.txt/ }));

    await waitFor(() => expect(showSuccess).toHaveBeenCalled(), { timeout: 3000 });
  });

  it('writes ONCE for a burst of edits, because each write costs the board an index rebuild', async () => {
    const user = userEvent.setup();
    render(<LoginSequencePage />);

    // Two removals in quick succession: the debounce must collapse them.
    await user.click(await screen.findByRole('button', { name: /Remove BBS:Bulletins\/bull2\.txt/ }));
    await user.click(await screen.findByRole('button', { name: /Remove BBS:Bulletins\/bull1\.txt/ }));

    await waitFor(() => expect(put).toHaveBeenCalled(), { timeout: 3000 });
    expect(put).toHaveBeenCalledTimes(1);
  });

  it('adds anything the sysop types, not only what the picker found', async () => {
    // The picker lists files the board already has. A screen about to exist, a
    // door, or a path only the live volume carries were all unreachable -
    // "it must be possible to add custom strings as well".
    const user = userEvent.setup();
    render(<LoginSequencePage />);

    await user.type(
      await screen.findByLabelText(/Anything to add to Node bulletins/),
      'BBS:Bulletins/bull6.txt',
    );
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(put).toHaveBeenCalled(), { timeout: 3000 });
    const [, body] = put.mock.calls[0];
    expect(body.items.map((i: { target: string }) => i.target)).toContain('BBS:Bulletins/bull6.txt');
  });

  it('adds it as the KIND the sysop chose, not always a screen include', async () => {
    const user = userEvent.setup();
    render(<LoginSequencePage />);

    await user.selectOptions(
      await screen.findByLabelText(/What to add to Node bulletins/),
      'CC',
    );
    await user.type(screen.getByLabelText(/Anything to add to Node bulletins/), 'gl');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(put).toHaveBeenCalled(), { timeout: 3000 });
    const [, body] = put.mock.calls[0];
    expect(body.items.at(-1)).toMatchObject({ code: 'CC', target: 'gl' });
  });
});
