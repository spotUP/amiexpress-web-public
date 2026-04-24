/**
 * SystemStatus Component Tests
 * Tests the admin system status component that displays BBS config.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import SystemStatus from '../admin/SystemStatus';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('SystemStatus', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('shows loading state initially', () => {
    // Never resolves — keeps loading forever
    mockFetch.mockImplementation(() => new Promise(() => {}));
    render(<SystemStatus />);
    expect(screen.getByText(/Loading system settings/i)).toBeInTheDocument();
  });

  it('renders config key/value rows on success', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({
        success: true,
        data: { bbs_name: 'TestBBS', max_nodes: 4 },
      }),
    } as Response);

    render(<SystemStatus />);

    await waitFor(() => {
      expect(screen.getByText('bbs_name')).toBeInTheDocument();
      expect(screen.getByText('TestBBS')).toBeInTheDocument();
      expect(screen.getByText('max_nodes')).toBeInTheDocument();
      expect(screen.getByText('4')).toBeInTheDocument();
    });
  });

  it('shows error when API returns success=false', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({
        success: false,
        message: 'Config not found',
      }),
    } as Response);

    render(<SystemStatus />);

    await waitFor(() => {
      expect(screen.getByText('Config not found')).toBeInTheDocument();
    });
  });

  it('shows error when fetch throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    render(<SystemStatus />);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('renders table headers', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ success: true, data: { key: 'val' } }),
    } as Response);

    render(<SystemStatus />);

    await waitFor(() => {
      expect(screen.getByText('Key')).toBeInTheDocument();
      expect(screen.getByText('Value')).toBeInTheDocument();
    });
  });

  it('hides loading indicator after fetch completes', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ success: true, data: {} }),
    } as Response);

    render(<SystemStatus />);

    await waitFor(() => {
      expect(screen.queryByText(/Loading system settings/i)).toBeNull();
    });
  });
});
