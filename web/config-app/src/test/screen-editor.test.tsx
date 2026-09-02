/**
 * The editor as a sysop reaches it: a screen in the list, a file under it, an
 * Edit button, and bytes back on the board.
 *
 * Driven through the page rather than the component, and through the REAL
 * apiClient with only the network stubbed - the Screen Files page shipped
 * broken once because a test mocked the client and repeated the envelope
 * convention instead of what the method returns.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// The page's tabs keep the active one in the URL, so it needs a router.
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { base64ToBytes, bytesToBase64 } from '../pages/screen-bytes';

let ansiBytes = new TextEncoder().encode('\x1b[31mHI');
let fileFormat: 'ansi' | 'rip' = 'ansi';
let fileMci: { code: string; target: string; resolves: boolean; scopeSpecific: boolean }[] = [];

const screenIndex = () => ({
  builtAt: '2026-09-02T00:00:00.000Z',
  unused: [],
  screens: [
    {
      screen: 'BBSTITLE',
      dirType: 'node',
      missingScopes: 0,
      duplicateGroups: [],
      resolutions: [
        { scope: 'node', id: 1, dir: 'Node1', dirIsShared: false, file: 'Node1/BBSTITLE.txt', variants: [] },
      ],
    },
  ],
  files: {
    'Node1/BBSTITLE.txt': {
      relPath: 'Node1/BBSTITLE.txt', bytes: ansiBytes.length, format: fileFormat, sha256: 'a', mci: fileMci,
    },
  },
});

const envelope = (data: unknown) =>
  Promise.resolve({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => ({ success: true, data, message: undefined, timestamp: '' }),
    text: async () => JSON.stringify({ success: true, data }),
  } as unknown as Response);

/**
 * Two codes is enough to drive the picker: one that takes nothing and one
 * that takes a command, which is the case the sysop asked for.
 */
const mciCatalog = () => ({
  families: [
    { family: 'include', label: 'Screens and commands' },
    { family: 'conference', label: 'Conferences' },
  ],
  codes: [
    {
      code: 'CC_', summary: 'Run a BBS command', family: 'include',
      argument: { kind: 'command' }, takesWidth: false, terminator: '|',
      source: 'express.e:5555', handledBy: 'caller', uses: 0, files: 0,
    },
    {
      code: 'CL', summary: 'Every conference the caller may join, one per line',
      family: 'conference', argument: { kind: 'none' }, takesWidth: false,
      terminator: '.', source: 'express.e:5588', handledBy: 'caller', uses: 42, files: 42,
    },
  ],
  enablingTilde: { uses: 1, files: 1 },
});

const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.includes('/api/screens/mci/catalog')) return envelope(mciCatalog());
  if (url.includes('/api/screens/mci/targets')) {
    return envelope({ kind: 'command', targets: [
      { value: 'gwall', label: 'Global Wall', detail: 'access 10' },
      { value: 'ctop', label: 'Conference Top', detail: 'access 20' },
    ] });
  }
  if (url.includes('/api/screens/file') && init?.method === 'PUT') {
    return envelope({ written: ['Node1/BBSTITLE.txt'] });
  }
  if (url.includes('/api/screens/file')) {
    return envelope({
      ...screenIndex().files['Node1/BBSTITLE.txt'],
      content: bytesToBase64(ansiBytes),
    });
  }
  return envelope(screenIndex());
});
vi.stubGlobal('fetch', fetchMock);

vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
    confirm: vi.fn(async () => true),
  }),
}));

// xterm wants a real canvas; the caller's-eye preview is not what this is about.
vi.mock('../components/ScreenPreview', () => ({ ScreenPreview: () => null }));

import { ScreenFilesPage } from '../pages/ScreenFilesPage';

/** The gallery opens first; these cases are about the tables behind it. */
async function openScreenTab(user: ReturnType<typeof userEvent.setup>, name: RegExp = /Node screens/) {
  await user.click(await screen.findByRole('tab', { name }));
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

/** Open BBSTITLE, then the file under it - what a sysop clicks to get here. */
async function openTheFile(user: ReturnType<typeof userEvent.setup>) {
  render(<ScreenFilesPage />, { wrapper });
  await openScreenTab(user);
  await user.click(await screen.findByText('BBSTITLE'));
  // The resolution row is the affordance now, not a button in the cell. The
  // path appears in the row and again in the dialog title, so take the row's.
  const rows = await screen.findAllByText('Node1/BBSTITLE.txt');
  await user.click(rows[0]);
}

/**
 * One code in the list is one <li>: where it sits, the code itself as a chip,
 * and - when it points at nothing - the reason. These tests match the row's
 * whole text rather than a single node, so they stay about what a sysop reads
 * and not about which span happens to hold which half of it.
 */
function codeRows(...parts: RegExp[]): HTMLElement[] {
  return screen.queryAllByText((_content, element) => {
    if (element?.tagName !== 'LI') return false;
    const text = element.textContent ?? '';
    return parts.every((part) => part.test(text));
  });
}

async function findCodeRow(...parts: RegExp[]): Promise<HTMLElement> {
  return await waitFor(() => {
    const [row] = codeRows(...parts);
    expect(row).toBeTruthy();
    return row;
  });
}

describe('editing a screen in the browser', () => {
  beforeEach(() => {
    fileFormat = 'ansi';
    ansiBytes = new TextEncoder().encode('\x1b[31mHI');
    fileMci = [];
    fetchMock.mockClear();
  });

  it('opens the art on a canvas, and saves it through the same fan-out a replace uses', async () => {
    const user = userEvent.setup();
    await openTheFile(user);

    expect(await screen.findByTestId('ansi-canvas')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /^save$/i }));
    // The fan-out is the upload path's, unchanged: editing the LOGON screen has
    // to offer "all the nodes that have it" exactly as replacing it does.
    await user.click(await screen.findByText('this file only'));

    await waitFor(() => {
      const put = fetchMock.mock.calls.find(([, init]) => (init as RequestInit)?.method === 'PUT');
      expect(put).toBeTruthy();
      const body = JSON.parse(String((put?.[1] as RequestInit).body));
      expect(base64ToBytes(body.content).length).toBeGreaterThan(0);
    });
  });

  it('saves what was drawn, not what was loaded', async () => {
    const user = userEvent.setup();
    await openTheFile(user);

    // A stroke on an empty row, in a colour the loaded screen does not carry.
    await user.click(screen.getByRole('button', { name: 'Bright green foreground' }));
    const canvas = screen.getByTestId('ansi-canvas');
    await user.pointer([{ target: canvas, coords: { clientX: 0, clientY: 32 }, keys: '[MouseLeft]' }]);

    await user.click(screen.getByRole('button', { name: /^save$/i }));
    await user.click(await screen.findByText('this file only'));

    await waitFor(() => {
      const put = fetchMock.mock.calls.find(([, init]) => (init as RequestInit)?.method === 'PUT');
      const body = JSON.parse(String((put?.[1] as RequestInit).body));
      const saved = base64ToBytes(body.content);
      const text = new TextDecoder('latin1').decode(saved);
      // Bright green is SGR 92, and the default brush is the full block, which
      // is byte 0xDB once it is CP437 again.
      expect(text).toContain('\x1b[92');
      expect(saved).toContain(0xdb);
    });
  });

  it('leaves the screen alone when the edit is abandoned', async () => {
    const user = userEvent.setup();
    await openTheFile(user);

    await user.click(screen.getByRole('button', { name: /cancel editing/i }));

    // The read-only view keeps drawing the art; the EDITOR is what closed.
    expect(screen.queryByRole('button', { name: /^save$/i })).toBeNull();
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit)?.method === 'PUT')).toBe(false);
  });

  it('shows a dead MCI code as dead, where it sits on the screen', async () => {
    // A screen is a program: a ~CC_ pointing at a deleted door is a menu item
    // that fails when a caller presses the key, and the editor is where a sysop
    // would see that before saving over it.
    ansiBytes = new TextEncoder().encode('press K for ~CC_nosuchdoor|');
    fileMci = [{ code: 'CC', target: 'nosuchdoor', resolves: false, scopeSpecific: false }];

    const user = userEvent.setup();
    await openTheFile(user);

    expect(await findCodeRow(/~CC_nosuchdoor/, /points at nothing/)).toBeTruthy();
  });

  it('inserts a code at the cursor, as one thing the sysop can undo', async () => {
    const user = userEvent.setup();
    await openTheFile(user);

    await user.click(screen.getByRole('button', { name: 'Insert a code' }));
    await user.click(await screen.findByRole('button', { name: /~CL/ }));
    await user.click(await screen.findByRole('button', { name: 'Insert it' }));

    expect(await findCodeRow(/line 1, column 1(?!\d)/, /~CL\./)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /undo/i }));
    expect(codeRows(/line 1, column 1(?!\d)/, /~CL\./)).toHaveLength(0);
  });

  it('offers the board\'s own commands for a code that needs one, by the name the icon carries', async () => {
    const user = userEvent.setup();
    await openTheFile(user);

    await user.click(screen.getByRole('button', { name: 'Insert a code' }));
    await user.click(await screen.findByRole('button', { name: /~CC_/ }));

    // The picker asks the board, and the board answers with the icon's NAME.
    await user.selectOptions(await screen.findByRole('combobox'), 'gwall');
    await user.click(screen.getByRole('button', { name: 'Insert it' }));

    expect(await findCodeRow(/line 1, column 1(?!\d)/, /~CC_gwall/)).toBeTruthy();
  });

  it('says so when the screen has no tilde on its first line, because then no code runs', async () => {
    const user = userEvent.setup();
    await openTheFile(user);

    await user.click(screen.getByRole('button', { name: 'Insert a code' }));

    expect(await screen.findByText(/will not run ANY code/)).toBeTruthy();
  });

  it('changes a code already in the screen, through the same picker', async () => {
    // The editor listed the codes and would not let a sysop touch one: to fix
    // a ~CC_ pointing at a deleted door you had to retype it by hand.
    ansiBytes = new TextEncoder().encode('~CC_gwall|');
    fileMci = [{ code: 'CC', target: 'gwall', resolves: true, scopeSpecific: false }];

    const user = userEvent.setup();
    await openTheFile(user);

    await user.click(await screen.findByRole('button', { name: 'change' }));

    // The picker opens ON that code - the door list is already showing, and
    // the code it was is already chosen.
    const commands = await screen.findByRole('combobox');
    expect((commands as HTMLSelectElement).value).toBe('gwall');

    await user.selectOptions(commands, 'ctop');
    await user.click(await screen.findByRole('button', { name: 'Change it' }));

    // Changed on the canvas, and the OLD code is gone - a shorter replacement
    // that did not pad would leave `~CC_ctop|all|` behind.
    expect(await findCodeRow(/line 1, column 1(?!\d)/, /~CC_ctop/)).toBeTruthy();
    expect(screen.queryByText(/gwall/)).toBeNull();
  });

  it('removes a code, returning its cells to the drawing', async () => {
    ansiBytes = new TextEncoder().encode('~CC_gwall|');
    fileMci = [{ code: 'CC', target: 'gwall', resolves: true, scopeSpecific: false }];

    const user = userEvent.setup();
    await openTheFile(user);

    expect(await findCodeRow(/line 1, column 1(?!\d)/, /~CC_gwall/)).toBeTruthy();
    await user.click(await screen.findByRole('button', { name: 'remove' }));

    expect(screen.queryByText(/~CC_gwall/)).toBeNull();
  });

  it('puts a code that points at nothing at the top of the list', async () => {
    ansiBytes = new TextEncoder().encode('~CC_gwall|\r\n~CC_nosuchdoor|');
    fileMci = [
      { code: 'CC', target: 'gwall', resolves: true, scopeSpecific: false },
      { code: 'CC', target: 'nosuchdoor', resolves: false, scopeSpecific: false },
    ];

    const user = userEvent.setup();
    await openTheFile(user);

    const items = await waitFor(() => {
      const rows = codeRows(/line \d+, column 1(?!\d)/, /~CC_/);
      expect(rows).toHaveLength(2);
      return rows;
    });
    expect(items[0].textContent).toContain('nosuchdoor');
    expect(items[0].textContent).toContain('points at nothing');
  });

  it('offers no editor for a RIP screen, and says which phase owns it', async () => {
    fileFormat = 'rip';
    const user = userEvent.setup();
    await openTheFile(user);

    expect(await screen.findByText(/RIP graphics/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /edit/i })).toBeNull();
  });
});

describe('reaching the editor', () => {
  beforeEach(() => {
    fileFormat = 'ansi';
    ansiBytes = new TextEncoder().encode('\x1b[31mHI');
    fileMci = [];
    fetchMock.mockClear();
  });

  it('opens the art straight from the screen row, in one click', async () => {
    // Reported by the sysop: "there is no way to open the screen files? they
    // are just listed". Clicking a screen DID reveal a panel below the table,
    // then asked for the file path to be clicked, then for Edit - three clicks
    // and no affordance saying so.
    const user = userEvent.setup();
    render(<ScreenFilesPage />, { wrapper });

    await openScreenTab(user);

    await user.click(await screen.findByText('BBSTITLE'));
    // One click on the row - no Edit button in it, which is the point.
    await user.click((await screen.findAllByText('Node1/BBSTITLE.txt'))[0]);

    expect(await screen.findByTestId('ansi-canvas')).toBeTruthy();
  });

  it('says a screen is openable, rather than leaving the row silent', async () => {
    const user = userEvent.setup();
    render(<ScreenFilesPage />, { wrapper });

    await openScreenTab(user);

    await user.click(await screen.findByText('BBSTITLE'));

    // The panel that opens has to announce itself, because it renders BELOW a
    // table that fills the screen.
    expect(await screen.findByTestId('screen-detail')).toBeTruthy();
  });
});
