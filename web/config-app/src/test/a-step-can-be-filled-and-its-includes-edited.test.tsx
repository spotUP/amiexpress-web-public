/**
 * A STEP WITH NO SCREEN CAN BE GIVEN ONE, AND AN INCLUDED SCREEN IS EDITABLE.
 *
 * "there are more stuff that launches stuff during login bulletins etc"
 * (sysop, 2026-09-16), looking at a sequence where five of six steps read
 * "[no file on this board - the step is skipped in silence]" and the sixth
 * named the screen it includes without ever showing what was inside it.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const get = vi.fn();
const put = vi.fn();
const post = vi.fn();
vi.mock('../api/client', () => ({
  apiClient: {
    get: (...a: unknown[]) => get(...a),
    put: (...a: unknown[]) => put(...a),
    post: (...a: unknown[]) => post(...a),
  },
}));
vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true) }),
}));

import { LoginSequencePage } from '../pages/LoginSequencePage';

const PAYLOAD = {
  node: 1, theme: 'default',
  themes: [{ slug: 'default', title: 'Board default screens', status: 'live', isDefault: true }],
  steps: [
    {
      screen: 'LOGON', label: 'Logon screen', note: '', skippedByQuickFlag: false,
      file: 'Node1/logon20.txt', exists: true, bytes: 149, blankPause: false, home: null,
      items: [{
        code: 'SS', target: 'BBS:Screens/BULL.TXT', pause: false,
        nested: {
          file: 'Screens/BULL.TXT',
          items: [{ code: 'SS', target: 'BBS:Bulletins/bull6.txt', pause: false }],
        },
      }],
    },
    {
      screen: 'MAILSCAN', label: 'Mail scan', note: '', skippedByQuickFlag: false,
      file: null, exists: false, bytes: 0, blankPause: false,
      home: 'Screens/MAILSCAN.txt', items: [],
    },
  ],
  available: [{ target: 'BBS:Bulletins/bull6.txt', bytes: 2667 }],
};

beforeEach(() => {
  get.mockReset().mockResolvedValue({ data: { success: true, data: PAYLOAD, timestamp: '' } });
  put.mockReset().mockResolvedValue({ data: {} });
  post.mockReset().mockResolvedValue({ data: {} });
});

describe('the screen a step includes', () => {
  it('shows its rows, under the row that shows it', async () => {
    render(<LoginSequencePage />);
    const field = await screen.findByLabelText('Row 1 of Screens/BULL.TXT') as HTMLInputElement;
    expect(field.value).toBe('BBS:Bulletins/bull6.txt');
    expect(screen.getByText(/Inside/)).toBeTruthy();
  });

  it('writes a change to the INCLUDED file, not to the step', async () => {
    render(<LoginSequencePage />);
    const user = userEvent.setup();

    // The pause the sysop came for, on the Super-AmiLog include - the LAST
    // row of that file, which is where an included screen needs it.
    await user.click(await screen.findByLabelText('Row 1 of Screens/BULL.TXT')
      .then(() => screen.getAllByRole('checkbox'))
      .then(boxes => boxes[boxes.length - 1]));
    await user.click(screen.getByRole('button', { name: /Save BULL\.TXT/ }));

    await waitFor(() => expect(put).toHaveBeenCalled());
    const [url, body] = put.mock.calls[put.mock.calls.length - 1];
    expect(url).toBe('/api/screens/login-sequence/include');
    expect(body.path).toBe('Screens/BULL.TXT');
    expect(body.items[0]).toMatchObject({ target: 'BBS:Bulletins/bull6.txt', pause: true });
  });
});

describe('a step with no screen at all', () => {
  it('says where one would be created, instead of being a dead line', async () => {
    render(<LoginSequencePage />);
    expect(await screen.findByText(/Screens\/MAILSCAN\.txt/)).toBeTruthy();
  });

  it('creates it at the place the board named, showing what was picked', async () => {
    render(<LoginSequencePage />);
    const user = userEvent.setup();

    await user.selectOptions(
      await screen.findByLabelText('Create Mail scan showing'),
      'BBS:Bulletins/bull6.txt',
    );

    await waitFor(() => expect(post).toHaveBeenCalled());
    const [url, body] = post.mock.calls[0];
    expect(url).toBe('/api/screens/login-sequence');
    expect(body).toMatchObject({
      screen: 'MAILSCAN',
      path: 'Screens/MAILSCAN.txt',
      items: [{ code: 'SS', target: 'BBS:Bulletins/bull6.txt', pause: true }],
    });
  });

  it('offers nothing to create for a step that already has a screen', async () => {
    render(<LoginSequencePage />);
    await screen.findByLabelText('Row 1 of Logon screen');
    expect(screen.queryByLabelText('Create Logon screen showing')).toBeNull();
  });
});
