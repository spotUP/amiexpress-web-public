/**
 * The sysop unticks a bulletin, and the board stops showing it.
 *
 * "can we build an editor for all bulls etc that shows during login so i can
 * pick what i want and dont want in the admin ui?" (2026-09-14). His board was
 * showing five MultiTop-II pages on the way in because the node's bulletin
 * screen lists them; the only way to change that was to edit a file on a
 * volume he cannot reach.
 *
 * The page is driven here as he drives it - read the sequence, remove a page,
 * save - and what is asserted is the REQUEST that reaches the board: the file
 * the step resolves to, and the items in the order he left them. A test that
 * asserted the page's own state would pass against a page that never saved.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const get = vi.fn();
const put = vi.fn();
vi.mock('../api/client', () => ({ apiClient: { get: (...a: unknown[]) => get(...a), put: (...a: unknown[]) => put(...a) } }));

import { LoginSequencePage } from '../pages/LoginSequencePage';

const SEQUENCE = {
  data: {
    node: 1,
    steps: [
      {
        screen: 'LOGON', label: 'Logon screen', note: 'Logon.txt', skippedByQuickFlag: true,
        file: 'Node1/Logon.txt', exists: true, bytes: 40, blankPause: false,
        items: [{ code: 'CC', target: 'gl', pause: true }],
      },
      {
        screen: 'NODE_BULL', label: 'Node bulletins', note: 'this node\'s bulletins',
        skippedByQuickFlag: false,
        file: 'Themes/607080/Node/BULL.TXT', exists: true, bytes: 160, blankPause: false,
        items: [
          { code: 'SS', target: 'BBS:Bulletins/bull1.txt', pause: true },
          { code: 'SS', target: 'BBS:Bulletins/bull2.txt', pause: true },
          { code: 'SS', target: 'BBS:Bulletins/bull3.txt', pause: true },
          { code: 'SS', target: 'BBS:Bulletins/bull4.txt', pause: true },
          { code: 'SS', target: 'BBS:Bulletins/bull5.txt', pause: false },
        ],
      },
      {
        screen: 'MAILSCAN', label: 'Mail scan', note: 'during the conference scan',
        skippedByQuickFlag: false,
        file: 'Screens/MAILSCAN.TXT', exists: true, bytes: 0, blankPause: true, items: [],
      },
    ],
    available: [
      { target: 'BBS:Bulletins/bull6.txt', bytes: 3833 },
      { target: 'BBS:Bulletins/bull1.txt', bytes: 500 },
    ],
  },
};

beforeEach(() => {
  get.mockReset().mockResolvedValue(SEQUENCE);
  put.mockReset().mockResolvedValue({ data: {} });
});

describe('the login sequence page', () => {
  it('shows the walk in order, and names the file each step really resolves to', async () => {
    render(<LoginSequencePage />);

    expect(await screen.findByText(/1\. Logon screen/)).toBeTruthy();
    expect(screen.getByText(/2\. Node bulletins/)).toBeTruthy();
    // The theme's copy, not Node1/BULL.TXT - editing the wrong rung is the
    // failure that changes nothing on screen.
    expect(screen.getByText(/Themes\/607080\/Node\/BULL\.TXT/)).toBeTruthy();
  });

  it('says which MultiTop page each bulletin is, so he picks by meaning', async () => {
    render(<LoginSequencePage />);

    expect(await screen.findByText('MultiTop - uploaded bytes')).toBeTruthy();
    expect(screen.getByText('MultiTop - download CPS')).toBeTruthy();
  });

  it('warns about a step that draws nothing and still costs a keypress', async () => {
    render(<LoginSequencePage />);

    expect(await screen.findByText(/draws nothing and still costs the caller a keypress/)).toBeTruthy();
  });

  it('sends the board exactly what he left, at the path the step resolves to', async () => {
    render(<LoginSequencePage />);
    const user = userEvent.setup();

    await user.click(await screen.findByLabelText('Remove BBS:Bulletins/bull2.txt'));
    await user.click(screen.getByLabelText('Remove BBS:Bulletins/bull4.txt'));
    await user.click(screen.getAllByRole('button', { name: /^Save$/ })[1]);

    await waitFor(() => expect(put).toHaveBeenCalled());
    const [url, body] = put.mock.calls[0];
    expect(url).toBe('/api/screens/login-sequence');
    expect(body.screen).toBe('NODE_BULL');
    expect(body.path).toBe('Themes/607080/Node/BULL.TXT');
    expect(body.items.map((i: { target: string }) => i.target)).toEqual([
      'BBS:Bulletins/bull1.txt',
      'BBS:Bulletins/bull3.txt',
      'BBS:Bulletins/bull5.txt',
    ]);
  });

  it('keeps the order he put them in', async () => {
    render(<LoginSequencePage />);
    const user = userEvent.setup();

    await user.click(await screen.findByLabelText('Move BBS:Bulletins/bull5.txt up'));
    await user.click(screen.getAllByRole('button', { name: /^Save$/ })[1]);

    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(put.mock.calls[0][1].items.map((i: { target: string }) => i.target)).toEqual([
      'BBS:Bulletins/bull1.txt',
      'BBS:Bulletins/bull2.txt',
      'BBS:Bulletins/bull3.txt',
      'BBS:Bulletins/bull5.txt',
      'BBS:Bulletins/bull4.txt',
    ]);
  });

  it('does not save a step he has not changed', async () => {
    render(<LoginSequencePage />);
    await screen.findByText(/2\. Node bulletins/);

    // Every Save starts disabled: a request that writes the file back
    // unchanged still costs it a revision and a backup.
    for (const save of screen.getAllByRole('button', { name: /^Save$/ })) {
      expect((save as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('shows the board\'s refusal rather than claiming it saved', async () => {
    put.mockRejectedValueOnce(new Error(
      'Nothing would be left to draw. An empty NODE_BULL still opens, and a screen that opens costs the caller a keypress on a blank screen',
    ));
    render(<LoginSequencePage />);
    const user = userEvent.setup();

    await user.click(await screen.findByLabelText('Remove BBS:Bulletins/bull2.txt'));
    await user.click(screen.getAllByRole('button', { name: /^Save$/ })[1]);

    expect(await screen.findByText(/Nothing would be left to draw/)).toBeTruthy();
  });
});
