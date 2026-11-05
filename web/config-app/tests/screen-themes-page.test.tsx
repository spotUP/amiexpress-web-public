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
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const getScreenThemes = vi.fn();
const createScreenTheme = vi.fn();
const updateScreenTheme = vi.fn();
const setDefaultScreenTheme = vi.fn();
/**
 * Publish asks the server whether the theme CAN go live before it offers the
 * confirmation, so the page has to be able to ask. These cases are about the
 * BUTTONS each account is offered; the gate itself is proved in
 * screen-theme-validation-and-preview.test.tsx.
 */
const getScreenThemeValidation = vi.fn();
const previewScreen = vi.fn();
const getScreenIndex = vi.fn();

vi.mock('../src/api/client', () => ({
  apiClient: {
    getScreenThemes: (...args: unknown[]) => getScreenThemes(...args),
    createScreenTheme: (...args: unknown[]) => createScreenTheme(...args),
    updateScreenTheme: (...args: unknown[]) => updateScreenTheme(...args),
    setDefaultScreenTheme: (...args: unknown[]) => setDefaultScreenTheme(...args),
    getScreenThemeValidation: (...args: unknown[]) => getScreenThemeValidation(...args),
    previewScreen: (...args: unknown[]) => previewScreen(...args),
    getScreenIndex: (...args: unknown[]) => getScreenIndex(...args),
  },
}));

let authUser = { username: 'sysop', secLevel: 255 };
vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ user: authUser, secLevel: authUser.secLevel }),
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));

const confirmMock = vi.fn(async (_options: { title: string; message: string }) => true);
vi.mock('../src/contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: confirmMock }),
  NotificationProvider: ({ children }: { children: ReactNode }) => children,
}));

const { ScreenThemesPage } = await import('../src/pages/ScreenThemesPage');

function theme(over: Record<string, unknown> = {}) {
  return {
    slug: 'neon', title: 'Neon', author: 'Skope', owner: 'skope', dir: 'Themes/neon',
    widths: [80], doorTheme: '', status: 'draft', screens: 4, exists: true,
    mine: false, wearable: false, writable: false, ...over,
  };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // A router, because each row now LINKS to its art at
  // `/admin/screens?theme=<slug>` - the way out of this page that it lacked.
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <ScreenThemesPage />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  authUser = { username: 'sysop', secLevel: 255 };
  vi.clearAllMocks();
  confirmMock.mockResolvedValue(true);
  createScreenTheme.mockResolvedValue({ success: true, data: {} });
  updateScreenTheme.mockResolvedValue({ success: true, data: {} });
  setDefaultScreenTheme.mockResolvedValue({ success: true, data: {} });
  getScreenThemeValidation.mockResolvedValue({
    success: true,
    data: { slug: 'neon', blocking: [], advisory: [], publishable: true, coverage: { provided: 4, total: 44 } },
  });
  previewScreen.mockResolvedValue({ success: true, data: null });
  getScreenIndex.mockResolvedValue({ success: true, data: { screens: [] } });
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

describe('who the create form asks about', () => {
  beforeEach(() => {
    getScreenThemes.mockResolvedValue({
      success: true,
      data: { defaultSlug: 'default', canCreate: true, themes: [] },
    });
  });

  it('asks a sysop who owns it and who to credit', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /new theme/i }));

    expect(screen.getByLabelText(/owned by/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/artist/i)).toBeInTheDocument();
  });

  it("asks an artist neither, because both are their own name", async () => {
    // The server forces a non-sysop's theme to their own account whatever the
    // request says, so asking is a question with one answer and a way to get
    // it wrong.
    authUser = { username: 'skope', secLevel: 100 };
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /new theme/i }));

    expect(screen.queryByLabelText(/owned by/i)).toBeNull();
    expect(screen.queryByLabelText(/artist/i)).toBeNull();
    expect(screen.getByText(/credited to/i)).toHaveTextContent('skope');
  });

  it("sends the artist's own name as both owner and artist", async () => {
    authUser = { username: 'skope', secLevel: 100 };
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /new theme/i }));
    await userEvent.type(screen.getByLabelText(/slug/i), 'neon');
    await userEvent.type(screen.getByLabelText(/title/i), 'Neon');
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() => expect(createScreenTheme).toHaveBeenCalled());
    expect(createScreenTheme.mock.calls[0][0]).toMatchObject({
      slug: 'neon', title: 'Neon', author: 'skope', owner: 'skope',
    });
  });
});
