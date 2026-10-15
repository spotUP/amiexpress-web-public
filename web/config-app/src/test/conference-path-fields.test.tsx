/**
 * The path rows reach the form.
 *
 * A conference declares up to sixteen directories and the form offered one,
 * blank. The logic for the rest is unit-tested next door; this drives the page,
 * because a feature the UI cannot reach is not a feature - the Screen Files
 * page shipped crashing for exactly the want of a test at this level.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const conference = {
  id: 1,
  conference_id: 1,
  name: 'Amiga Demoscene',
  location: 'BBS:Conf2/',
  ndirs: 2,
  dlpath_1: 'BBS:Conf2/Files',
  ulpath_1: 'BBS:Conf2/Upload',
  dlpath_2: 'BBS:Archive/Best',
  ulpath_2: '',
  min_access_level: 0,
  max_access_level: 255,
  force_newscan: false,
  exclude_ftp: false,
  private_conf: false,
  read_only: false,
};

const updateConferenceConfig = vi.fn(async () => conference);

vi.mock('../api/client', () => ({
  apiClient: {
    getConferenceConfigs: async () => ({ success: true, data: [conference] }),
    createConferenceConfig: vi.fn(async () => conference),
    updateConferenceConfig: (...args: unknown[]) => updateConferenceConfig(...(args as [])),
    deleteConferenceConfig: vi.fn(async () => ({ success: true })),
  },
}));

vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true) }),
}));

import { ConferencesPage } from '../pages/ConferencesPage';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function openTheEditor() {
  const user = userEvent.setup();
  render(<ConferencesPage />, { wrapper });
  await waitFor(() => expect(screen.getByText('Amiga Demoscene')).toBeTruthy());
  await user.click(await screen.findByRole('button', { name: /edit amiga demoscene/i }));
  return user;
}

describe('the conference form', () => {
  it('shows a download and upload path for every directory the conference declares', async () => {
    await openTheEditor();

    await waitFor(() => {
      expect(screen.getByLabelText(/Dir 1 download/i)).toBeTruthy();
    });
    expect(screen.getByLabelText(/Dir 2 upload/i)).toBeTruthy();
  });

  it('fills a following path with the conference directory rather than leaving it blank', async () => {
    await openTheEditor();

    await waitFor(() => {
      expect((screen.getByLabelText(/Dir 2 upload/i) as HTMLInputElement).value).toBe('BBS:Conf2/Upload');
    });
  });

  it('leaves a path the sysop set alone, and offers to reset it', async () => {
    await openTheEditor();

    await waitFor(() => {
      expect((screen.getByLabelText(/Dir 2 download/i) as HTMLInputElement).value).toBe('BBS:Archive/Best');
    });
    expect(screen.getByText(/custom - reset/i)).toBeTruthy();
  });

  it('reset puts the derived path back', async () => {
    const user = await openTheEditor();

    await waitFor(() => expect(screen.getByText(/custom - reset/i)).toBeTruthy());
    await user.click(screen.getByText(/custom - reset/i));

    await waitFor(() => {
      expect((screen.getByLabelText(/Dir 2 download/i) as HTMLInputElement).value).toBe('BBS:Conf2/Files');
    });
  });

  it('raising the directory count adds rows that already follow', async () => {
    const user = await openTheEditor();

    const ndirs = await screen.findByLabelText(/Number of Directories/i);
    await user.clear(ndirs);
    await user.type(ndirs, '3');

    await waitFor(() => {
      expect((screen.getByLabelText(/Dir 3 download/i) as HTMLInputElement).value).toBe('BBS:Conf2/Files');
    });
  });
});
