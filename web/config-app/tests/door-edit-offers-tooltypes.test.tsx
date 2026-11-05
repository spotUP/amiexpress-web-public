/**
 * The door a sysop opens tells him where its tooltypes are.
 *
 * The .info editor has always existed, behind the second icon on the row. A
 * sysop looking for a door flag opens Edit - the pencil - finds six fields,
 * and concludes the admin cannot do it: "i dont see a way to edit tooltypes
 * for the doors in the admin ui when i click edit on gwall" (2026-09-07).
 * Twice this year a door flag has been hand-edited on the live volume for
 * want of that route: C64_ADAPT, and then C64_DROP_OLDEST.
 *
 * A pointer, not a second editor. The assertion is that the pencil offers the
 * way through AND that the way lands on the existing tooltype table, loaded
 * from the door's own .info path.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../src/api/client', async () => (await import('./door-edit-harness')).apiClientMock());
vi.mock('../src/contexts/NotificationContext', async () => (await import('./door-edit-harness')).notificationMock());

const { renderPage, state, getInfoFile } = await import('./door-edit-harness');

const TOOLTYPES = [
  { key: 'LOCATION', value: 'DOORS:GWall/GWall', commented: false, originalLine: 'LOCATION=DOORS:GWall/GWall' },
  { key: 'C64_ADAPT', value: '40', commented: false, originalLine: 'C64_ADAPT=40' },
];

describe('editing a door', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.tooltypes = TOOLTYPES;
  });

  it('offers the way to the tooltypes, and names the flag a sysop is looking for', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(await screen.findByLabelText('Edit GWall'));

    expect(await screen.findByRole('button', { name: /edit tooltypes/i })).toBeTruthy();
    // The reason a sysop is here at all, said in the dialog rather than left
    // to be discovered on the live volume.
    expect(screen.getByText(/C64_ADAPT/)).toBeTruthy();
  });

  it('lands on the existing tooltype table, loaded from the door.s own .info', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(await screen.findByLabelText('Edit GWall'));
    await user.click(await screen.findByRole('button', { name: /edit tooltypes/i }));

    await waitFor(() => expect(getInfoFile).toHaveBeenCalledWith('Commands/BBSCmd/GWALL.info'));
    // The table itself, with the door's own tooltypes in it.
    expect(await screen.findByDisplayValue('C64_ADAPT')).toBeTruthy();
    // TWO inputs now show `40`, and both should: the raw table row, and the
    // named "Adapt at (columns)" field in the C64 section, which reads the
    // same tooltype. `getByDisplayValue` was unambiguous only while the
    // adapter's flags had no form of their own - it is the arrival of that
    // form, not a regression, that makes this `getAll`.
    expect(screen.getAllByDisplayValue('40').length).toBeGreaterThan(0);
  });
});
