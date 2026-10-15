/**
 * A door's art block opens in a dialog the keyboard cannot fall out of.
 *
 * DoorArtDialog was the last hand-rolled `fixed inset-0` overlay in pages/
 * (bar Bulls, which is its own fix): no `role="dialog"`, no focus trap, and
 * nothing telling assistive technology the page behind it had gone away. A
 * keyboard user could tab out of the ANSI canvas into the screen table
 * underneath and never get back. Escape was its own window listener, which
 * fired even when another dialog was on top.
 */
import type { ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const getDoorArt = vi.fn();

vi.mock('../api/client', () => ({
  apiClient: {
    getDoorArt: (...args: unknown[]) => getDoorArt(...args),
    saveDoorArt: vi.fn(),
  },
}));
vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true) }),
}));

import { DoorArtDialog } from '../pages/DoorArtDialog';

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const open = (onClose = vi.fn()) => {
  render(
    <DoorArtDialog
      command="MT"
      doorName="MegaTop"
      file="Bulls.CFG"
      section="TITLE"
      label="Title logo"
      maxLines={10}
      maxLineLength={79}
      onClose={onClose}
    />,
    { wrapper },
  );
  return onClose;
};

describe('a door art block', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    getDoorArt.mockResolvedValue({ success: true, data: [], timestamp: '' });
  });

  it('announces itself as a dialog, by the door and the block it is editing', async () => {
    open();

    expect(await screen.findByRole('dialog', { name: 'MegaTop - Title logo' })).toBeTruthy();
  });

  it('closes on Escape', async () => {
    const onClose = open();
    await screen.findByRole('dialog');

    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalled();
  });
});
