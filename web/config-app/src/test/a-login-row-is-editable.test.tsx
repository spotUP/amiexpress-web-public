/**
 * A ROW OF THE LOGIN SEQUENCE IS A LINE THE SYSOP CAN EDIT.
 *
 * "it needs to be more detailed though it just shows that BBS:Bulletins/
 * bull6.txt is loaded, i need the content, each row of it listed as input
 * fields and i need to change order of the rows etc" (sysop, 2026-09-16).
 *
 * Until now a row was a label: to change a path you deleted the row and added
 * it again from a picker, and what the board would actually be written was
 * never shown. Now the row carries what the loader reads - the code, the
 * target, the pause - and prints the line itself.
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

import { LoginSequencePage, mciLine } from '../pages/LoginSequencePage';
// The board's own writer. Two spellings of one format is how a UI starts
// promising a line the board does not write.
import { lineFor } from '../../../backend/src/screens/login-sequence';

const PAYLOAD = {
  node: 1,
  steps: [
    {
      screen: 'BULL', label: 'Bulletins', note: 'after the logon screen',
      skippedByQuickFlag: false,
      file: 'Screens/BULL.TXT', exists: true, bytes: 32, blankPause: false,
      items: [
        { code: 'SS', target: 'BBS:Bulletins/bull6.txt', pause: false },
        { code: 'CC', target: 'gwall', pause: false },
      ],
    },
  ],
  available: [{ target: 'BBS:Bulletins/bull1.txt', bytes: 500 }],
};

const SEQUENCE = { data: { success: true, data: PAYLOAD, timestamp: '' } };

beforeEach(() => {
  get.mockReset().mockResolvedValue(SEQUENCE);
  put.mockReset().mockResolvedValue({ data: {} });
});

describe('a row of the login sequence', () => {
  it('is a field with the target in it, not a label', async () => {
    render(<LoginSequencePage />);

    const field = await screen.findByLabelText('Row 1 of Bulletins') as HTMLInputElement;
    expect(field.value).toBe('BBS:Bulletins/bull6.txt');
  });

  it('sends the board the target he typed', async () => {
    render(<LoginSequencePage />);
    const user = userEvent.setup();

    const field = await screen.findByLabelText('Row 1 of Bulletins');
    await user.clear(field);
    await user.type(field, 'BBS:Bulletins/lastc.txt');
    await user.click(screen.getAllByRole('button', { name: /^Save$/ })[0]);

    // Every keystroke is its own debounced save, so the board sees the path
    // being typed as well as the finished one. What matters is that the
    // finished one reaches it.
    // Every keystroke is its own debounced save, so the board sees the path
    // being typed as well as the finished one. What matters is that the
    // finished one reaches it - and that a reload mid-word does not take it
    // back, which is what `unsaved` and the skeleton guard are for.
    // Every keystroke is its own debounced save, so the board sees the path
    // being typed as well as the finished one. What matters is that the
    // finished one reaches it - and that a reload mid-word does not take it
    // back, which is what `unsaved` and the skeleton guard are for.
    await waitFor(() => expect(
      put.mock.calls.some((call: unknown[]) => {
        const body = call[1] as { items: Array<{ target: string; code: string }> };
        return body.items[0].target === 'BBS:Bulletins/lastc.txt' && body.items[0].code === 'SS';
      })
    ).toBe(true));
  });

  it('sends the board the code he picked, so a row can become a command', async () => {
    render(<LoginSequencePage />);
    const user = userEvent.setup();

    await user.selectOptions(await screen.findByLabelText('What row 1 of Bulletins does'), 'CC');
    await user.click(screen.getAllByRole('button', { name: /^Save$/ })[0]);

    await waitFor(() => expect(put).toHaveBeenCalled());
    const [, body] = put.mock.calls[put.mock.calls.length - 1];
    expect(body.items[0].code).toBe('CC');
  });

  it('ticks the pause the sysop came for, and says so in the line', async () => {
    render(<LoginSequencePage />);
    const user = userEvent.setup();

    // The first row is the unpaused Super-AmiLog; the last row's pause is
    // disabled (a screen owes no pause to itself), so row one is the case.
    await screen.findByLabelText('Row 1 of Bulletins');
    await user.click(screen.getAllByRole('checkbox')[0]);
    expect(await screen.findByText('~SS_BBS:Bulletins/bull6.txt ~SP')).toBeTruthy();

    await user.click(screen.getAllByRole('button', { name: /^Save$/ })[0]);
    await waitFor(() => expect(
      put.mock.calls.some((call: unknown[]) => {
        const body = call[1] as { items: Array<{ pause: boolean }> };
        return body.items[0].pause === true;
      })
    ).toBe(true));
  });

  it('shows the line the loader will read, before anything is saved', async () => {
    render(<LoginSequencePage />);

    expect(await screen.findByText('~SS_BBS:Bulletins/bull6.txt')).toBeTruthy();
    expect(screen.getByText('~CC_gwall')).toBeTruthy();
  });

  it('reorders by row, because the order IS the sequence', async () => {
    render(<LoginSequencePage />);
    const user = userEvent.setup();

    await user.click(await screen.findByLabelText('Move BBS:Bulletins/bull6.txt down'));
    await user.click(screen.getAllByRole('button', { name: /^Save$/ })[0]);

    await waitFor(() => expect(put).toHaveBeenCalled());
    const [, body] = put.mock.calls[put.mock.calls.length - 1];
    expect(body.items.map((i: { target: string }) => i.target)).toEqual([
      'gwall', 'BBS:Bulletins/bull6.txt',
    ]);
  });
});

describe('the line the row prints', () => {
  it('is the one the board writes, for every code and either pause', () => {
    for (const code of ['SS', 'CC', 'SR'] as const) {
      for (const pause of [true, false]) {
        const item = { code, target: 'BBS:Bulletins/bull6.txt', pause };
        expect(mciLine(item)).toBe(lineFor(item));
      }
    }
  });
});

/**
 * A ROW IS NAMED THE WAY THE SYSOP KNOWS IT.
 *
 * "i still dont see samilog anywhere" (sysop, 2026-09-16) - looking straight
 * at the row that IS it. `bull6.txt` is rebuilt by SAmiLog and signs itself
 * "Super-AmiLog by P0T-NOoDLE of ANTHROX"; the page called it "Last callers",
 * which is what it holds and not what he calls it.
 */
describe('what a bulletin row is called', () => {
  it('names the Super-AmiLog by the door that writes it', async () => {
    get.mockResolvedValue({
      data: {
        success: true,
        data: {
          node: 1,
          steps: [{
            screen: 'BULL', label: 'Board bulletin', note: '', skippedByQuickFlag: false,
            file: 'Screens/BULL.TXT', exists: true, bytes: 32, blankPause: false,
            items: [{ code: 'SS', target: 'BBS:Bulletins/bull6.txt', pause: false }],
          }],
          available: [],
        },
        timestamp: '',
      },
    });

    render(<LoginSequencePage />);
    expect(await screen.findByText(/Super-AmiLog/)).toBeTruthy();
  });
});
