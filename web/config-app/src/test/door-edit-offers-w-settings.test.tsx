/**
 * The Edit dialog of a door offers the W settings menu declaration as named
 * fields, so a sysop does not hand-edit SETTINGS / SETTINGS_LABEL /
 * SETTINGS_SECTION in the raw tooltype table (the board reads them in
 * handlers/commands/w-settings-doors.ts). Harness: ./door-edit-harness.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../api/client', async () => (await import('./door-edit-harness')).apiClientMock());
vi.mock('../contexts/NotificationContext', async () => (await import('./door-edit-harness')).notificationMock());

const { renderPage, state, updateInfoFile } = await import('./door-edit-harness');

describe('a door listed under W', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.tooltypes = [
      { key: 'LOCATION', value: 'Doors/notify', commented: false, originalLine: 'LOCATION=Doors/notify' },
      { key: 'SETTINGS', value: 'YES', commented: false, originalLine: 'SETTINGS=YES' },
      { key: 'SETTINGS_LABEL', value: 'Notifications', commented: false, originalLine: 'SETTINGS_LABEL=Notifications' },
    ];
  });

  it("shows the three W settings as named fields, from the door's own .info", async () => {
    const user = userEvent.setup();
    await renderPage();
    await user.click(await screen.findByLabelText('Edit GWall'));
    expect(await screen.findByText('Listed under W')).toBeTruthy();
    await waitFor(() =>
      expect((screen.getByLabelText('Show in the W settings menu') as HTMLInputElement).checked).toBe(true));
    expect((screen.getByLabelText('Row label') as HTMLInputElement).value).toBe('Notifications');
    expect((screen.getByLabelText('Section') as HTMLInputElement).value).toBe('');
  });

  it('a section typed and saved reaches the .info', async () => {
    const user = userEvent.setup();
    await renderPage();
    await user.click(await screen.findByLabelText('Edit GWall'));
    await user.type(await screen.findByLabelText('Section'), 'Communication');
    await user.click(screen.getByRole('button', { name: 'Update Door' }));
    await waitFor(() => expect(updateInfoFile).toHaveBeenCalled());
    const [, written] = updateInfoFile.mock.calls[0] as unknown as [string, Array<{ key: string; value: string }>];
    expect(written.find((t) => t.key === 'SETTINGS_SECTION')?.value).toBe('Communication');
  });

  it('a section already on the .info is edited, not duplicated', async () => {
    state.tooltypes = [...state.tooltypes,
      { key: 'SETTINGS_SECTION', value: 'Appearance', commented: false, originalLine: 'SETTINGS_SECTION=Appearance' }];
    const user = userEvent.setup();
    await renderPage();
    await user.click(await screen.findByLabelText('Edit GWall'));
    const field = await screen.findByLabelText('Section');
    await waitFor(() => expect((field as HTMLInputElement).value).toBe('Appearance'));
    await user.clear(field);
    await user.type(field, 'Communication');
    await user.click(screen.getByRole('button', { name: 'Update Door' }));
    await waitFor(() => expect(updateInfoFile).toHaveBeenCalled());
    const [, written] = updateInfoFile.mock.calls[0] as unknown as [string, Array<{ key: string; value: string }>];
    expect(written.filter((t) => t.key === 'SETTINGS_SECTION')).toEqual([expect.objectContaining({ value: 'Communication' })]);
  });

  it.each([['YES', true], ['', true], ['TRUE', true], ['1', true], ['NO', false]])(
    'SETTINGS=%j is read the way the board reads it (ticked: %s)',
    async (value, ticked) => {
      state.tooltypes = [{ key: 'SETTINGS', value, commented: false, originalLine: `SETTINGS=${value}` }];
      const user = userEvent.setup();
      await renderPage();
      await user.click(await screen.findByLabelText('Edit GWall'));
      await waitFor(() =>
        expect((screen.getByLabelText('Show in the W settings menu') as HTMLInputElement).checked).toBe(ticked));
    },
  );
});
