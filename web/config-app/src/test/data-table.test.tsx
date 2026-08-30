import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataTable } from '../components/ui/DataTable';
import type { DataTableColumn } from '../components/ui/DataTable';

interface Door extends Record<string, unknown> {
  command: string;
  name: string;
  level: number;
}

const DOORS: Door[] = [
  { command: 'WALL', name: 'Global Wall', level: 20 },
  { command: 'ARCHIE', name: 'Archie', level: 10 },
  { command: 'MEGA', name: 'Megaboard', level: 30 },
];

const COLUMNS: DataTableColumn<Door>[] = [
  { id: 'command', header: 'Command', value: (door) => door.command, mono: true },
  { id: 'name', header: 'Name', value: (door) => door.name },
  { id: 'level', header: 'Level', value: (door) => door.level, align: 'right', mono: true },
  { id: 'icon', header: '', cell: () => <span>-</span> },
];

function renderTable(props: Partial<React.ComponentProps<typeof DataTable<Door>>> = {}) {
  return render(
    <DataTable columns={COLUMNS} rows={DOORS} getRowId={(door) => door.command} {...props} />
  );
}

function rowOrder(): string[] {
  const [, ...bodyRows] = screen.getAllByRole('row');
  return bodyRows.map((row) => within(row).getAllByRole('cell')[0].textContent ?? '');
}

describe('DataTable', () => {
  it('sorts a column when its header is clicked', async () => {
    // The v9 table only has sorting once the feature is registered. A table
    // built without it renders and looks right while doing nothing at all,
    // which is exactly what this asserts against.
    const user = userEvent.setup();
    renderTable();

    expect(rowOrder()).toEqual(['WALL', 'ARCHIE', 'MEGA']);

    await user.click(screen.getByRole('button', { name: /Command/ }));
    expect(rowOrder()).toEqual(['ARCHIE', 'MEGA', 'WALL']);

    await user.click(screen.getByRole('button', { name: /Command/ }));
    expect(rowOrder()).toEqual(['WALL', 'MEGA', 'ARCHIE']);
  });

  it('sorts numeric columns by value, largest first', async () => {
    // Numbers open descending and text opens ascending - the table default,
    // kept because the first thing a sysop wants from a numeric column is the
    // biggest value. String sorting here would put 30 before 4.
    const user = userEvent.setup();
    renderTable();

    await user.click(screen.getByRole('button', { name: /Level/ }));
    expect(rowOrder()).toEqual(['MEGA', 'WALL', 'ARCHIE']);

    await user.click(screen.getByRole('button', { name: /Level/ }));
    expect(rowOrder()).toEqual(['ARCHIE', 'WALL', 'MEGA']);
  });

  it('reports the sort direction to assistive technology', async () => {
    const user = userEvent.setup();
    renderTable();

    const header = screen.getByRole('columnheader', { name: /Command/ });
    expect(header).toHaveAttribute('aria-sort', 'none');

    await user.click(screen.getByRole('button', { name: /Command/ }));
    expect(header).toHaveAttribute('aria-sort', 'ascending');
  });

  it('leaves a column with no value unsortable', () => {
    renderTable();
    const headers = screen.getAllByRole('columnheader');
    expect(within(headers[3]).queryByRole('button')).toBeNull();
  });

  it('starts from the sort the caller asked for', () => {
    renderTable({ initialSort: [{ id: 'name', desc: false }] });
    expect(rowOrder()).toEqual(['ARCHIE', 'WALL', 'MEGA']);
  });

  it('says so when there is nothing to show', () => {
    renderTable({ rows: [], emptyMessage: 'No doors are installed.' });
    expect(screen.getByText('No doors are installed.')).toBeInTheDocument();
  });

  it('shows skeleton rows while loading rather than an empty table', () => {
    renderTable({ isLoading: true });
    expect(screen.queryByRole('table')).toBeNull();
  });
});
