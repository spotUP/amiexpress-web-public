/**
 * Nine conference settings the backend has always carried and the admin could
 * never edit.
 *
 * Each is in `CONFERENCE_FIELD_TOOLTYPES`/`CONFERENCE_FLAG_TOOLTYPES` - the one
 * map that owns conference tooltypes - in the zod schema, and in
 * `ConferenceConfig`. The form simply had no input for any of them, so a sysop
 * who wanted a conference that never new-scans, or free downloads, or its own
 * menu prompt, had to edit Conf<N>.info by hand.
 *
 *   NO_NEWSCAN, SHOW_NEW_FILES, NO_NEW_FILES  scan behaviour
 *   FREEDOWNLOADS         express.e:5010, downloads cost no ratio
 *   USERNAME/REALNAME/INTERNETNAME  express.e:4081, :4083, :5022
 *   MENU_PROMPT           express.e:5013
 *   CONFDB_SHARED         shared message base
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const conferences = [
  {
    id: 1, conference_id: 1, name: 'General', ndirs: 1, dlpath_1: '', ulpath_1: '',
    min_access_level: 0, max_access_level: 255, force_newscan: false,
    exclude_ftp: false, private_conf: false, read_only: false,
    no_newscan: true, show_new_files: true, no_new_files: false,
    free_downloads: true, use_username: false, use_realname: true,
    use_internetname: false, menu_prompt: 'Pick one', confdb_shared: 4,
  },
];

type Conference = (typeof conferences)[number];

const updateConferenceConfig =
  vi.fn<(n: number, u: Partial<Conference>) => Promise<Conference>>(async () => conferences[0]);

vi.mock('../src/api/client', () => ({
  apiClient: {
    getConferenceConfigs: async () => ({ success: true, data: conferences }),
    createConferenceConfig: vi.fn(async () => conferences[0]),
    updateConferenceConfig: (n: number, u: Partial<Conference>) => updateConferenceConfig(n, u),
    deleteConferenceConfig: vi.fn(),
  },
}));

vi.mock('../src/contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => false) }),
  NotificationProvider: ({ children }: { children: ReactNode }) => children,
}));

const { ConferencesPage } = await import('../src/pages/ConferencesPage');

async function openEditor() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ConferencesPage />
    </QueryClientProvider>
  );
  await userEvent.click(await screen.findByRole('button', { name: /edit general/i }));
}

beforeEach(() => updateConferenceConfig.mockClear());

describe('the conference settings that had no UI', () => {
  it('loads the scan flags the conference carries', async () => {
    await openEditor();

    expect(screen.getByLabelText(/never new-scan/i)).toBeChecked();
    expect(screen.getByLabelText(/show new files/i)).toBeChecked();
    expect(screen.getByLabelText(/never new-files scan/i)).not.toBeChecked();
  });

  it('loads the ratio and name-display flags', async () => {
    await openEditor();

    expect(screen.getByLabelText(/free downloads/i)).toBeChecked();
    expect(screen.getByLabelText(/show real names/i)).toBeChecked();
    expect(screen.getByLabelText(/show user names/i)).not.toBeChecked();
  });

  it('loads the menu prompt and the shared message base', async () => {
    await openEditor();

    expect((screen.getByLabelText(/menu prompt/i) as HTMLInputElement).value).toBe('Pick one');
    expect((screen.getByLabelText(/shares message base with/i) as HTMLInputElement).value).toBe('4');
  });

  it('sends an edited flag to the API', async () => {
    await openEditor();

    await userEvent.click(screen.getByLabelText(/free downloads/i));
    await userEvent.click(screen.getByRole('button', { name: /update conference/i }));

    await waitFor(() => expect(updateConferenceConfig).toHaveBeenCalledTimes(1));
    expect(updateConferenceConfig.mock.calls[0][1]).toMatchObject({ free_downloads: false });
  });

  it('sends an edited menu prompt and shared base', async () => {
    await openEditor();

    const prompt = screen.getByLabelText(/menu prompt/i);
    await userEvent.clear(prompt);
    await userEvent.type(prompt, 'What now');
    const shared = screen.getByLabelText(/shares message base with/i);
    await userEvent.clear(shared);
    await userEvent.type(shared, '2');
    await userEvent.click(screen.getByRole('button', { name: /update conference/i }));

    await waitFor(() => expect(updateConferenceConfig).toHaveBeenCalledTimes(1));
    expect(updateConferenceConfig.mock.calls[0][1]).toMatchObject({
      menu_prompt: 'What now', confdb_shared: 2,
    });
  });
});
