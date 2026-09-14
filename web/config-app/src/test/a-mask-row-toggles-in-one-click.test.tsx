/**
 * Forty conferences times twenty bulletins is eight hundred checkboxes.
 *
 * "it's MANY clicks to edit multi select would be nice" (sysop, 2026-09-14).
 * The edits a sysop actually makes are shaped like rows and columns - "this
 * conference sees everything", "nobody sees bulletin 14" - so the conference
 * number sets its whole row and a bulletin number sets that column in every
 * conference.
 *
 * Each asks what the majority already is and moves the rest to match, so a
 * second click undoes the first - the behaviour a "select all" box has
 * everywhere else.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const getDoorSettings = vi.fn();
const saveDoorSettings = vi.fn();
const getConferenceConfigs = vi.fn();
vi.mock('../api/client', () => ({
  apiClient: {
    getDoorSettings: (...a: unknown[]) => getDoorSettings(...a),
    saveDoorSettings: (...a: unknown[]) => saveDoorSettings(...a),
    getConferenceConfigs: (...a: unknown[]) => getConferenceConfigs(...a),
  },
}));
vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}));

import { BullsMasksMatrix } from '../components/BullsMasksMatrix';

/** Three conferences, four bulletins wide, so a row and a column are legible. */
const VIEW = {
  data: {
    manifest: {
      settings: [
        { key: 'conf_1_mask', label: 'Conference 1 bulletin mask', cfgRow: { field: 'mask' } },
        { key: 'conf_2_mask', label: 'Conference 2 bulletin mask', cfgRow: { field: 'mask' } },
        { key: 'conf_3_mask', label: 'Conference 3 bulletin mask', cfgRow: { field: 'mask' } },
      ],
    },
    values: {
      conf_1_mask: 'XX--',
      conf_2_mask: '----',
      conf_3_mask: '----',
    },
  },
};

function renderMatrix() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <BullsMasksMatrix titles={["News", "Sport", "Requests", "Extra"]} />
    </QueryClientProvider>,
  );
}

/** A board with three conferences, like the sysop's has five. */
const CONFERENCES = { data: [{ conference_id: 1 }, { conference_id: 2 }, { conference_id: 3 }] };

beforeEach(() => {
  getDoorSettings.mockReset().mockResolvedValue(VIEW);
  saveDoorSettings.mockReset().mockResolvedValue({});
  getConferenceConfigs.mockReset().mockResolvedValue(CONFERENCES);
});

describe('editing the matrix in bulk', () => {
  it('sets a whole conference from its own number', async () => {
    renderMatrix();
    const user = userEvent.setup();

    await user.click(await screen.findByLabelText('Toggle every bulletin in conference 2'));
    await user.click(screen.getByRole('button', { name: /^Save/ }));

    await waitFor(() => expect(saveDoorSettings).toHaveBeenCalled());
    // Conference 2 was all dashes, so one click shows everything.
    expect(saveDoorSettings.mock.calls[0][1]).toEqual({ conf_2_mask: 'XXXX' });
  });

  it('flips back on a second click', async () => {
    renderMatrix();
    const user = userEvent.setup();
    const row = await screen.findByLabelText('Toggle every bulletin in conference 2');

    await user.click(row);
    await user.click(row);
    await user.click(screen.getByRole('button', { name: /^Save/ }));

    await waitFor(() => expect(saveDoorSettings).toHaveBeenCalled());
    expect(saveDoorSettings.mock.calls[0][1]).toEqual({ conf_2_mask: '----' });
  });

  it('sets one bulletin across every conference from its column', async () => {
    renderMatrix();
    const user = userEvent.setup();

    // Named after the bulletin, not the column number - the header carries
    // the title so a sysop knows what he is switching off everywhere.
    await user.click(await screen.findByLabelText('Toggle News in every conference'));
    await user.click(screen.getByRole('button', { name: /^Save/ }));

    await waitFor(() => expect(saveDoorSettings).toHaveBeenCalled());
    const sent = saveDoorSettings.mock.calls[0][1];
    // Column 1 was X,-,- - most conferences did NOT have it, so the first
    // click shows it everywhere and a second would hide it everywhere. That
    // is what a "select all" box does, and the rule is "move the minority to
    // join the majority's opposite", not "invert each cell".
    expect(sent.conf_1_mask?.[0]).toBe('X');
    expect(sent.conf_2_mask?.[0]).toBe('X');
    expect(sent.conf_3_mask?.[0]).toBe('X');
  });

  it('still lets a single cell be ticked on its own', async () => {
    renderMatrix();
    const user = userEvent.setup();

    await user.click(await screen.findByLabelText('Requests in conference 1'));
    await user.click(screen.getByRole('button', { name: /^Save/ }));

    await waitFor(() => expect(saveDoorSettings).toHaveBeenCalled());
    expect(saveDoorSettings.mock.calls[0][1]).toEqual({ conf_1_mask: 'XXX-' });
  });

  it('sends only the conferences that were touched', async () => {
    renderMatrix();
    const user = userEvent.setup();

    await user.click(await screen.findByLabelText('Toggle every bulletin in conference 3'));
    await user.click(screen.getByRole('button', { name: /^Save/ }));

    await waitFor(() => expect(saveDoorSettings).toHaveBeenCalled());
    expect(Object.keys(saveDoorSettings.mock.calls[0][1])).toEqual(['conf_3_mask']);
  });
});

describe('the conferences the board actually has', () => {
  it('lists only those, not every row the file has space for', async () => {
    // Bulls.CFG carries forty mask rows because that is the door's format.
    // A sysop with five conferences was shown thirty-five he could tick to no
    // effect: "the live bbs only have 5 conferences".
    getDoorSettings.mockResolvedValue({
      data: {
        manifest: {
          settings: Array.from({ length: 40 }, (_, i) => ({
            key: `conf_${i + 1}_mask`,
            label: `Conference ${i + 1} bulletin mask`,
            cfgRow: { field: 'mask' },
          })),
        },
        values: Object.fromEntries(
          Array.from({ length: 40 }, (_, i) => [`conf_${i + 1}_mask`, '----']),
        ),
      },
    });

    renderMatrix();

    expect(await screen.findByLabelText('Toggle every bulletin in conference 3')).toBeTruthy();
    expect(screen.queryByLabelText('Toggle every bulletin in conference 4')).toBeNull();
    expect(screen.queryByLabelText('Toggle every bulletin in conference 40')).toBeNull();
  });

  it('shows every row rather than none when the board cannot be asked', async () => {
    // A FAILED request is not "this board has no conferences". Hiding them all
    // would read as a door with no conference access at all.
    getConferenceConfigs.mockRejectedValue(new Error('nope'));

    renderMatrix();

    expect(await screen.findByLabelText('Toggle every bulletin in conference 3')).toBeTruthy();
  });
});
