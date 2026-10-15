import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltypeKey } from '../components/ui/TooltypeKey';
import { apiClient } from '../api/client';

/**
 * Naming the tooltype under a field is what makes the disk-first model
 * visible: the BBS reads bbsConfig.info, and this form is one way of editing
 * it. A field showing the wrong key would be worse than showing none, so the
 * map is fetched from the writer and a field the writer does not know about
 * renders nothing at all.
 */

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('TooltypeKey', () => {
  beforeEach(() => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: {
        success: true,
        timestamp: '2026-08-30T00:00:00.000Z',
        data: { sysop_name: 'SYSOP_NAME', capitalize_filenames: 'LVL_CAPITOLS_in_FILE' },
      },
    } as never);
  });

  it('names the file and the tooltype the field writes to', async () => {
    renderWithQuery(<TooltypeKey field="sysop_name" />);

    expect(await screen.findByText('bbsConfig.info : SYSOP_NAME')).toBeInTheDocument();
  });

  it('shows a tooltype exactly as AmiExpress spells it', async () => {
    // LVL_CAPITOLS_in_FILE is genuinely mixed case (axcommon.e:53).
    renderWithQuery(<TooltypeKey field="capitalize_filenames" />);

    expect(await screen.findByText('bbsConfig.info : LVL_CAPITOLS_in_FILE')).toBeInTheDocument();
  });

  it('renders nothing for a field that is not written to the file', async () => {
    const { container } = renderWithQuery(<TooltypeKey field="not_a_config_field" />);

    await waitFor(() => expect(apiClient.get).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing rather than a guess while the map is still loading', () => {
    const { container } = renderWithQuery(<TooltypeKey field="sysop_name" />);

    expect(container).toBeEmptyDOMElement();
  });

  it('can name a different file', async () => {
    renderWithQuery(<TooltypeKey field="sysop_name" file="Conf1.info" />);

    expect(await screen.findByText('Conf1.info : SYSOP_NAME')).toBeInTheDocument();
  });
});
