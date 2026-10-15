/**
 * An empty table and a failed request must not look the same.
 *
 * apiClient throws on a non-2xx, so `data` comes back undefined and every
 * page rendered its empty copy as a POSITIVE claim: "No protocols configured.
 * Add transfer protocols like ZMODEM..." for a request that 500'd, and an
 * expired session presenting as an empty BBS with the sysop's whole
 * configuration apparently gone.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataTable } from '../components/ui/DataTable';
import type { DataTableColumn } from '../components/ui/DataTable';

interface Door extends Record<string, unknown> {
  command: string;
  name: string;
}

const COLUMNS: DataTableColumn<Door>[] = [
  { id: 'command', header: 'Command', value: (door) => door.command },
  { id: 'name', header: 'Name', value: (door) => door.name },
];

describe('a table whose query failed', () => {
  it('shows what went wrong instead of "nothing configured"', () => {
    render(
      <DataTable
        columns={COLUMNS}
        rows={[]}
        getRowId={(door) => door.command}
        emptyMessage="No doors configured"
        error={new Error('Request failed with status 500')}
      />
    );

    expect(screen.getByText('Request failed with status 500')).toBeInTheDocument();
    expect(screen.queryByText('No doors configured')).not.toBeInTheDocument();
  });

  it('offers a retry that re-runs the query', async () => {
    const onRetry = vi.fn();
    render(
      <DataTable
        columns={COLUMNS}
        rows={[]}
        getRowId={(door) => door.command}
        error={new Error('nope')}
        onRetry={onRetry}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('still says "nothing configured" when the query SUCCEEDED and was empty', () => {
    // The distinction is the whole point: an empty board is a real answer.
    render(
      <DataTable
        columns={COLUMNS}
        rows={[]}
        getRowId={(door) => door.command}
        emptyMessage="No doors configured"
      />
    );

    expect(screen.getByText('No doors configured')).toBeInTheDocument();
  });
});
