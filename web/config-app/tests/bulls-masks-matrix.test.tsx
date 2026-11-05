/**
 * Conference access as checkboxes, not mask strings.
 *
 * Bulls.CFG gives each conference a 20-character X/- mask, one character
 * per bulletin. The matrix puts bulletins across and conferences down; a
 * tick means shown. Saving sends only touched masks through the
 * door-settings API - the same endpoint the raw strings used, so no second
 * writer exists for one file.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const VIEW = {
  manifest: {
    command: 'B',
    settings: [
      { key: 'dual_listing', label: 'Dual listing', type: 'choice', group: 'Listing',
        choices: [{ value: 'YES', label: 'Yes' }, { value: 'NO', label: 'No' }], default: 'YES' },
      { key: 'conf_1_mask', label: 'Conference 1 bulletin mask', type: 'string', group: 'Conference access',
        pattern: '^[X-]{20}$', default: '--------------------', hidden: true },
      { key: 'conf_10_mask', label: 'Conference 10 bulletin mask', type: 'string', group: 'Conference access',
        pattern: '^[X-]{20}$', default: '--------------------', hidden: true },
    ],
  },
  values: { dual_listing: 'YES', conf_1_mask: 'XX------------------', conf_10_mask: '--------------------' },
  secretsSet: [],
};

const getDoorSettings = vi.fn(async (_command: string) => ({ success: true, data: VIEW }));
const saveDoorSettings = vi.fn(async (_command: string, _values: Record<string, unknown>) => ({ success: true, data: VIEW }));

vi.mock('../src/api/client', () => ({
  apiClient: {
    getDoorSettings: (command: string) => getDoorSettings(command),
    saveDoorSettings: (command: string, values: Record<string, unknown>) => saveDoorSettings(command, values),
  },
}));

vi.mock('../src/contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => false) }),
  NotificationProvider: ({ children }: { children: ReactNode }) => children,
}));

const { BullsMasksMatrix } = await import('../src/components/BullsMasksMatrix');

const TITLES = ['Top Uploaders', 'Top Downloaders'];

function renderMatrix() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <BullsMasksMatrix titles={TITLES} />
    </QueryClientProvider>
  );
}

describe('the conference access matrix', () => {
  beforeEach(() => { saveDoorSettings.mockClear(); getDoorSettings.mockClear(); });

  it('checks what the masks show', async () => {
    renderMatrix();

    const shown = await screen.findByRole('checkbox', { name: 'Top Uploaders in conference 1' }) as HTMLInputElement;
    expect(shown.checked).toBe(true);
    const hidden = screen.getByRole('checkbox', { name: 'Top Downloaders in conference 10' }) as HTMLInputElement;
    expect(hidden.checked).toBe(false);
  });

  it('sends only touched masks on save', async () => {
    const user = userEvent.setup();
    renderMatrix();

    const box = await screen.findByRole('checkbox', { name: 'Top Downloaders in conference 1' });
    await user.click(box);
    await user.click(screen.getByRole('button', { name: /save conference access/i }));

    await waitFor(() => expect(saveDoorSettings).toHaveBeenCalled());
    const [, values] = saveDoorSettings.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(values).toEqual({ conf_1_mask: 'X-------------------' });
  });

  it('stays quiet when nothing changed', async () => {
    renderMatrix();
    await screen.findByRole('checkbox', { name: 'Top Uploaders in conference 1' });

    expect(screen.getByRole('button', { name: /save conference access/i })).toBeDisabled();
  });
});
