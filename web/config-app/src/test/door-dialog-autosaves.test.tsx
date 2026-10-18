/**
 * The Edit Door dialog has no save button: "the door dialog needs to auto save
 * the save button should be removed" (sysop, 2026-10-19), on top of "i want no
 * save buttons at all in the admin ui everything should auto save"
 * (2026-09-14). Harness: ./door-edit-harness.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../api/client', async () => (await import('./door-edit-harness')).apiClientMock());
vi.mock('../contexts/NotificationContext', async () => (await import('./door-edit-harness')).notificationMock());

const { renderPage, state } = await import('./door-edit-harness');
const { apiClient } = await import('../api/client');

// The first render pays the page's cold import (~4s), past vitest's 5s default.
describe('the Edit Door dialog', { timeout: 20000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.tooltypes = [];
  });

  it('a changed door field is written without a save button', async () => {
    const user = userEvent.setup();
    await renderPage();
    await user.click(await screen.findByLabelText('Edit GWall'));
    const name = await screen.findByLabelText(/Door Name/);

    // Opening the dialog populates the form; that is not an edit.
    expect(apiClient.updateDoor).not.toHaveBeenCalled();

    await user.clear(name);
    await user.type(name, 'GWall Two');

    await waitFor(() => expect(apiClient.updateDoor).toHaveBeenCalled(), { timeout: 3000 });
    const [id, updates] = (apiClient.updateDoor as ReturnType<typeof vi.fn>).mock.lastCall as [number, Record<string, unknown>];
    expect(id).toBe(7);
    expect(updates.door_name).toBe('GWall Two');
    expect(updates.original_command).toBe('GWALL');

    const dialog = screen.getByLabelText(/Door Name/).closest('form') as HTMLElement;
    expect(within(dialog).queryByRole('button', { name: /Update Door|Save/ })).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeTruthy();
  });

  it('says Saved inside the dialog once the write lands', async () => {
    // "no toast when it saves? i get no confirmation at all" (sysop,
    // 2026-10-19): the corner toast went unseen, so the dialog itself says it.
    const user = userEvent.setup();
    await renderPage();
    await user.click(await screen.findByLabelText('Edit GWall'));
    const dialog = (await screen.findByLabelText(/Door Name/)).closest('form') as HTMLElement;
    expect(within(dialog).getByRole('status').textContent).toBe('Changes save themselves');

    await user.type(screen.getByLabelText(/Door Name/), 'X');
    await waitFor(() => expect(within(dialog).getByRole('status').textContent).toBe('Saved'), { timeout: 3000 });

    // A new edit is not saved yet; the line must not keep claiming it is.
    await user.type(screen.getByLabelText(/Door Name/), 'Y');
    expect(within(dialog).getByRole('status').textContent).not.toBe('Saved');
  });
});
