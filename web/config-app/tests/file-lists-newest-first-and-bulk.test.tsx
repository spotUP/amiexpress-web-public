/**
 * The admin File lists page: a listing opens newest first ("default sorting
 * should be new to old"), ticked rows are deleted together behind one typed
 * confirmation ("bulk edit would be nice for the file lists"), and a file no
 * list names can be purged ("i need to be able to purge these broken
 * uploads") - sysop, 2026-09-29.
 */
import type { ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const deleteFileListEntry = vi.fn();
const deleteUnlistedFile = vi.fn();
const envelope = (data: unknown) => Promise.resolve({ success: true, data, timestamp: '' });
const entry = (filename: string, date: string, dateValue: number) =>
  ({ filename, marker: 'N', size: 1, date, dateValue, description: [filename], bytes: 'disk' });

vi.mock('../src/api/client', () => ({
  apiClient: {
    getFileListConferences: () => envelope([{ conf: 1, name: 'Main', dirs: [{ dir: 1, entries: 3 }] }]),
    getFileListEntries: () => envelope([
      entry('OLDEST.LHA', '12-31-99', 19991231),
      entry('NEWEST.LHA', '09-29-26', 20260929),
      entry('MIDDLE.LHA', '01-01-20', 20200101),
    ]),
    getFileListMismatches: () => envelope({ unlisted: [{ folder: 'Conf1/Upload', filename: 'BROKEN.LHA', size: 5 }], missing: [] }),
    deleteFileListEntry: (...args: unknown[]) => deleteFileListEntry(...args),
    deleteUnlistedFile: (...args: unknown[]) => deleteUnlistedFile(...args),
    moveFileListEntry: vi.fn(),
    updateFileListDescription: vi.fn(),
  },
}));

const showError = vi.fn();
const showSuccess = vi.fn();
const confirmSpy = vi.fn(async (_options: { title: string; requireTypedConfirmation?: string }) => true);
vi.mock('../src/contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess, showError, showInfo: vi.fn(), showWarning: vi.fn(), confirm: confirmSpy }),
}));

import { FileListsPage } from '../src/pages/FileListsPage';

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('the File lists page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    deleteFileListEntry.mockReturnValue(envelope({ retentionWarning: null, bytesError: null }));
    deleteUnlistedFile.mockReturnValue(envelope(null));
  });

  it('lists newest first, the 1999 file last', async () => {
    render(<FileListsPage />, { wrapper });
    await screen.findByLabelText('Select NEWEST.LHA');
    const order = screen.getAllByLabelText(/^Select [A-Z]+\.LHA$/).map((box) => box.getAttribute('aria-label'));
    expect(order).toEqual(['Select NEWEST.LHA', 'Select MIDDLE.LHA', 'Select OLDEST.LHA']);
  });

  it('deletes the ticked files together, behind one typed confirmation of the count', async () => {
    render(<FileListsPage />, { wrapper });
    await userEvent.click(await screen.findByLabelText('Select NEWEST.LHA'));
    await userEvent.click(screen.getByLabelText('Select OLDEST.LHA'));
    const bar = screen.getByText('2 files selected').parentElement as HTMLElement;
    await userEvent.click(within(bar).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(deleteFileListEntry).toHaveBeenCalledTimes(2));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy.mock.calls[0][0].requireTypedConfirmation).toBe('2');
    expect(deleteFileListEntry.mock.calls.map((c) => c[2]).sort()).toEqual(['NEWEST.LHA', 'OLDEST.LHA']);
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('2 files deleted'));
  });

  it('purges a file no list names, by the folder the report gave', async () => {
    render(<FileListsPage />, { wrapper });
    await userEvent.click(await screen.findByLabelText('Purge BROKEN.LHA'));
    await waitFor(() => expect(deleteUnlistedFile).toHaveBeenCalledWith(1, 'Conf1/Upload', 'BROKEN.LHA'));
  });
});
