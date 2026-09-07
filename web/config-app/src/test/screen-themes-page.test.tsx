/**
 * The screen themes page shows what the SERVER says this account may do.
 *
 * Every permission on this page is carried on the row (`mine`, `writable`) or
 * beside the list (`canCreate`). A page that worked them out from the account's
 * level would be a second copy of the ownership rules the backend enforces,
 * and the copy is what drifts - the sysop sees a button that 403s, or an
 * artist is shown none at all.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const getScreenThemes = vi.fn();
const createScreenTheme = vi.fn();
const updateScreenTheme = vi.fn();
const setDefaultScreenTheme = vi.fn();

vi.mock('../api/client', () => ({
  apiClient: {
    getScreenThemes: (...args: unknown[]) => getScreenThemes(...args),
    createScreenTheme: (...args: unknown[]) => createScreenTheme(...args),
    updateScreenTheme: (...args: unknown[]) => updateScreenTheme(...args),
    setDefaultScreenTheme: (...args: unknown[]) => setDefaultScreenTheme(...args),
  },
}));

const confirmMock = vi.fn(async (_options: { title: string; message: string }) => true);
vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: confirmMock }),
  NotificationProvider: ({ children }: { children: ReactNode }) => children,
}));

const { ScreenThemesPage } = await import('../pages/ScreenThemesPage');

function theme(over: Record<string, unknown> = {}) {
  return {
    slug: 'neon', title: 'Neon', author: 'Skope', owner: 'skope', dir: 'Themes/neon',
    widths: [80], doorTheme: '', status: 'draft', screens: 4, exists: true,
    mine: false, wearable: false, writable: false, ...over,
  };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ScreenThemesPage />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  confirmMock.mockResolvedValue(true);
  createScreenTheme.mockResolvedValue({ success: true, data: {} });
  updateScreenTheme.mockResolvedValue({ success: true, data: {} });
  setDefaultScreenTheme.mockResolvedValue({ success: true, data: {} });
});

describe('what the page lists', () => {
  it('names the theme, its artist, its owner and how many screens it carries', async () => {
    getScreenThemes.mockResolvedValue({
      success: true,
      data: { defaultSlug: 'default', canCreate: true, themes: [theme()] },
    });
    renderPage();

    expect(await screen.findByText('Neon')).toBeInTheDocument();
    expect(screen.getByText('neon')).toBeInTheDocument();
    expect(screen.getByText('Skope')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it("says which one the board wears by default", async () => {
    getScreenThemes.mockResolvedValue({
      success: true,
      data: { defaultSlug: 'neon', canCreate: true, themes: [theme({ status: 'live' })] },
    });
    renderPage();

    expect(await screen.findByText(/board default/i)).toBeInTheDocument();
  });
});

describe('the actions each account is offered', () => {
  it('offers a sysop the create button; an artist gets none', async () => {
    getScreenThemes.mockResolvedValue({
      success: true,
      data: { defaultSlug: 'default', canCreate: true, themes: [] },
    });
    const sysop = renderPage();
    expect(await screen.findByRole('button', { name: /new theme/i })).toBeInTheDocument();
    sysop.unmount();

    getScreenThemes.mockResolvedValue({
      success: true,
      data: { defaultSlug: 'default', canCreate: false, themes: [] },
    });
    renderPage();
    await waitFor(() => expect(screen.queryByRole('button', { name: /new theme/i })).toBeNull());
  });

  it("lets an artist send THEIR draft for review, and does not offer publish", async () => {
    getScreenThemes.mockResolvedValue({
      success: true,
      data: { defaultSlug: 'default', canCreate: false, themes: [theme({ mine: true, writable: true })] },
    });
    renderPage();

    await userEvent.click(await screen.findByTitle(/send for review/i));

    expect(updateScreenTheme).toHaveBeenCalledWith('neon', { status: 'review' });
    expect(screen.queryByTitle(/^publish$/i)).toBeNull();
  });

  it('warns a sysop that publishing an empty theme changes nothing a caller sees', async () => {
    getScreenThemes.mockResolvedValue({
      success: true,
      data: { defaultSlug: 'default', canCreate: true, themes: [theme({ screens: 0 })] },
    });
    renderPage();

    await userEvent.click(await screen.findByTitle(/publish/i));

    await waitFor(() => expect(confirmMock).toHaveBeenCalled());
    expect(confirmMock.mock.calls[0][0].message).toMatch(/no screens yet/i);
  });

  it('makes a live theme the board default, after saying what that means', async () => {
    getScreenThemes.mockResolvedValue({
      success: true,
      data: { defaultSlug: 'default', canCreate: true, themes: [theme({ status: 'live' })] },
    });
    renderPage();

    await userEvent.click(await screen.findByTitle(/make the board default/i));

    await waitFor(() => expect(setDefaultScreenTheme).toHaveBeenCalledWith('neon'));
    expect(confirmMock.mock.calls[0][0].message).toMatch(/who has not chosen/i);
  });
});
