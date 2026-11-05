/**
 * A file-backed art slot names its file and lets the sysop swap it.
 *
 * The slot IS the door's setting, so the picker writes the same value the
 * settings form writes - there is no second place a filename is recorded, and
 * that is the whole point of declaring art on the setting rather than in a
 * list beside it.
 */
import type { ReactNode } from 'react';
import { expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const saveDoorSettings = vi.fn(async (_command: string, _values: Record<string, string>) => ({ success: true }));

vi.mock('../src/api/client', () => ({
  apiClient: {
    saveDoorSettings: (command: string, values: Record<string, string>) => saveDoorSettings(command, values),
  },
}));
vi.mock('../src/contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true) }),
}));

import { DoorArtSlot } from '../src/pages/DoorArtSlot';

let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  saveDoorSettings.mockClear();
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

const slot = {
  section: 'setting:bulletinHeader',
  file: 'Bulletin_Header.txt',
  label: 'Bulletin header art',
  lines: 8,
  maxLines: 100,
  maxLineLength: 1000,
  choices: [
    { file: 'Bulletin_Header.txt', lines: 8 },
    { file: 'bulletindesign/Header3.ansi', lines: 7 },
  ],
};

const draw = (overrides = {}, onOpen = vi.fn()) =>
  render(<DoorArtSlot command="REQ" slot={{ ...slot, ...overrides }} onOpen={onOpen} />, { wrapper });

it('names the file the door currently uses, and its rows', () => {
  draw();

  expect(screen.getByText('Bulletin_Header.txt')).toBeInTheDocument();
  // Exact, not a regex: the picker's options also say "— 8 rows", and a loose
  // matcher would pass on the dropdown while the summary line said nothing.
  expect(screen.getByText('8 rows')).toBeInTheDocument();
});

it('does not show the caller a setting: prefix', () => {
  draw();

  // `setting:bulletinHeader` is how the slot is ADDRESSED, not what it is
  // called. An Empire section shows `[title]`; this one has no section.
  expect(screen.queryByText(/setting:/)).not.toBeInTheDocument();
});

it('writes the SETTING when another file is chosen', async () => {
  draw();

  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: /choose another/i }),
    'bulletindesign/Header3.ansi',
  );

  expect(saveDoorSettings).toHaveBeenCalledWith('REQ', { bulletinHeader: 'bulletindesign/Header3.ansi' });
});

it('opens the editor on the file the slot names', async () => {
  const onOpen = vi.fn();
  draw({}, onOpen);

  await userEvent.click(screen.getByRole('button', { name: /open in ansi editor/i }));

  expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({
    file: 'Bulletin_Header.txt', section: 'setting:bulletinHeader',
  }));
});

it('offers the picker and not the editor when the file is gone', () => {
  draw({ missing: true, lines: 0 });

  expect(screen.getByRole('combobox', { name: /choose another/i })).toBeEnabled();
  expect(screen.queryByRole('button', { name: /open in ansi editor/i })).not.toBeInTheDocument();
  expect(screen.getByText(/not there/i)).toBeInTheDocument();
});
