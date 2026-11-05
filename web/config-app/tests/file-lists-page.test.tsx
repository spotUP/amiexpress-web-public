/**
 * The admin file manager's page (plan 2026-09-29-admin-file-manager, P3):
 * a conference's lists, where each file's bytes are, delete and move through
 * the file-list API, and where the lists and the folders disagree.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const getFileListConferences = vi.fn();
const getFileListEntries = vi.fn();
const getFileListMismatches = vi.fn();
const deleteFileListEntry = vi.fn();
const moveFileListEntry = vi.fn();
const updateFileListDescription = vi.fn();

vi.mock('../src/api/client', () => ({
  apiClient: {
    getFileListConferences: (...a: unknown[]) => getFileListConferences(...a),
    getFileListEntries: (...a: unknown[]) => getFileListEntries(...a),
    getFileListMismatches: (...a: unknown[]) => getFileListMismatches(...a),
    deleteFileListEntry: (...a: unknown[]) => deleteFileListEntry(...a),
    moveFileListEntry: (...a: unknown[]) => moveFileListEntry(...a),
    updateFileListDescription: (...a: unknown[]) => updateFileListDescription(...a),
  },
}));

const confirmMock = vi.fn(async () => true);
vi.mock('../src/contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: confirmMock }),
  NotificationProvider: ({ children }: { children: ReactNode }) => children,
}));

const { FileListsPage } = await import('../src/pages/FileListsPage');

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><FileListsPage /></QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  getFileListConferences.mockResolvedValue({
    data: [
      { conf: 1, name: 'Main', dirs: [{ dir: 1, entries: 2 }, { dir: -1, entries: 0 }] },
      { conf: 2, name: 'Games', dirs: [{ dir: 1, entries: 0 }, { dir: -1, entries: 0 }] },
    ],
  });
  getFileListEntries.mockResolvedValue({
    data: [
      { filename: 'ONE.LHA', marker: 'P', size: 1234, date: '01-01-24', description: ['First file'], bytes: 'disk' },
      { filename: 'GHOST.LHA', marker: 'N', size: 99, date: '02-02-24', description: ['Gone'], bytes: 'missing' },
    ],
  });
  getFileListMismatches.mockResolvedValue({
    data: { unlisted: [{ folder: 'Conf1/Files', filename: 'STRAY.LHA', size: 10 }], missing: [{ dir: 1, filename: 'GHOST.LHA' }] },
  });
  deleteFileListEntry.mockResolvedValue({ data: { bytesError: null, retentionWarning: null } });
  moveFileListEntry.mockResolvedValue({ data: null });
});

describe('File lists', () => {
  it('shows a directory with where each file is, and the mismatches', async () => {
    renderPage();
    expect(await screen.findByText('ONE.LHA')).toBeInTheDocument();
    expect(getFileListEntries).toHaveBeenCalledWith(1, 1);
    expect(screen.getByText('On disk')).toBeInTheDocument();
    expect(screen.getAllByText('Missing').length).toBeGreaterThan(0);
    expect(await screen.findByText('STRAY.LHA')).toBeInTheDocument();
  });

  // "the file_id's needs to use the topaz font to make sense" (sysop,
  // 2026-09-29): a FILE_ID is Amiga art and only lines up in Topaz.
  it('shows each description whole, in the board font', async () => {
    renderPage();
    const art = await screen.findByText('First file');
    expect(art.tagName).toBe('PRE');
    expect(art.className).toContain('font-topaz');
  });

  it('deletes through the API after asking', async () => {
    renderPage();
    await screen.findByText('ONE.LHA');
    await userEvent.click(screen.getByRole('button', { name: 'Delete ONE.LHA' }));
    await waitFor(() => expect(deleteFileListEntry).toHaveBeenCalledWith(1, 1, 'ONE.LHA'));
    expect(confirmMock).toHaveBeenCalled();
  });

  it('moves to another conference', async () => {
    renderPage();
    await screen.findByText('ONE.LHA');
    await userEvent.click(screen.getByRole('button', { name: 'Move ONE.LHA' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.selectOptions(within(dialog).getByLabelText('To conference'), '2');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Move' }));
    await waitFor(() => expect(moveFileListEntry).toHaveBeenCalledWith(1, 1, 'ONE.LHA', 2, 1));
  });
});
