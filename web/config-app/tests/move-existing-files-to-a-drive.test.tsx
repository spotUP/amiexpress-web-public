/**
 * A directory put on a cloud drive keeps its existing files on this server
 * until the sysop moves them ("build it", sysop 2026-10-04). The admin shows
 * how many there are and moves them batch by batch.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const getMoveToDrivePlan = vi.fn();
const moveToDriveBatch = vi.fn();

vi.mock('../src/api/client', () => ({
  apiClient: {
    getMoveToDrivePlan: (...args: unknown[]) => getMoveToDrivePlan(...args),
    moveToDriveBatch: (...args: unknown[]) => moveToDriveBatch(...args),
  },
}));

import { MoveExistingFiles } from '../src/components/storage/MoveExistingFiles';

function renderIt() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MoveExistingFiles conference={1} dir={2} />
    </QueryClientProvider>,
  );
}

const plan = (files: Array<{ filename: string; size: number }>, roomBytes: number | null = null) => ({
  success: true,
  data: { conference: 1, dir: 2, driveNumber: 3, files, totalBytes: files.reduce((s, f) => s + f.size, 0), roomBytes },
});

beforeEach(() => {
  getMoveToDrivePlan.mockReset();
  moveToDriveBatch.mockReset();
});

describe('moving a directory\'s existing files onto its drive', () => {
  it('says how many files and bytes are still here, and moves them batch by batch until none are left', async () => {
    getMoveToDrivePlan
      .mockResolvedValueOnce(plan([{ filename: 'A.LHA', size: 1024 }, { filename: 'B.LHA', size: 2048 }], 10 * 1024 * 1024))
      .mockResolvedValue(plan([]));
    moveToDriveBatch
      .mockResolvedValueOnce({ success: true, data: { moved: ['A.LHA'], failed: [], remaining: 1 } })
      .mockResolvedValueOnce({ success: true, data: { moved: ['B.LHA'], failed: [], remaining: 0 } });
    renderIt();

    expect(await screen.findByText(/2 files \(3 KB\) are still on this server/)).toBeTruthy();
    expect(screen.getByText(/Drive 3 has 10 MB left/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Move them to drive 3/ }));

    await waitFor(() => expect(moveToDriveBatch).toHaveBeenCalledTimes(2));
    expect(moveToDriveBatch).toHaveBeenCalledWith(1, 2);
    expect(await screen.findByText(/Moved 2 files\. No files of this directory are left on this server/)).toBeTruthy();
  });

  it('stops when a batch moves nothing, and names each file that could not move', async () => {
    getMoveToDrivePlan.mockResolvedValue(plan([{ filename: 'BIG.LHA', size: 5000 }], 100));
    moveToDriveBatch.mockResolvedValue({
      success: true,
      data: { moved: [], failed: [{ filename: 'BIG.LHA', error: 'Drive 3 has no room for it.' }], remaining: 1 },
    });
    renderIt();

    expect(await screen.findByText(/They do not all fit/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Move them to drive 3/ }));

    expect(await screen.findByText('BIG.LHA: Drive 3 has no room for it.')).toBeTruthy();
    expect(moveToDriveBatch).toHaveBeenCalledTimes(1);
  });
});
