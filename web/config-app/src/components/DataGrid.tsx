/**
 * The inline-edit grid, now used only by Node Configuration.
 *
 * Everything sortable moved to `components/ui/DataTable`, which owns its own
 * row model. Node Configuration stays here on purpose: its rows turn into
 * input fields in place, and a row that is being edited must not be able to
 * move under the cursor because a sort changed. Nodes are also inherently
 * ordered by number, so there is nothing to sort by.
 *
 * The markup follows the same table conventions as DataTable.
 */

import type { ReactNode } from 'react';
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import { EmptyState } from './ui/states';

export interface DataGridColumn<T> {
  key: string;
  header: ReactNode;
  sortable?: boolean;
  align?: 'left' | 'right' | 'center';
  className?: string;
  render: (row: T) => ReactNode;
}

interface DataGridProps<T> {
  columns: DataGridColumn<T>[];
  rows: T[];
  sortKey?: string;
  sortDir?: 'asc' | 'desc';
  onSort?: (key: string) => void;
  emptyMessage?: string;
  getRowKey?: (row: T, index: number) => string | number;
}

function alignClass(align: DataGridColumn<unknown>['align']): string {
  if (align === 'right') return 'text-right';
  if (align === 'center') return 'text-center';
  return 'text-left';
}

export function DataGrid<T>({
  columns,
  rows,
  sortKey,
  sortDir,
  onSort,
  emptyMessage = 'No results found.',
  getRowKey,
}: DataGridProps<T>) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface-1">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-surface-2">
          <tr>
            {columns.map((column) => {
              const isSorted = sortKey === column.key;
              const sortable = Boolean(onSort && column.sortable);
              const SortIcon = !isSorted ? ChevronsUpDown : sortDir === 'asc' ? ChevronUp : ChevronDown;

              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={
                    isSorted ? (sortDir === 'asc' ? 'ascending' : 'descending') : sortable ? 'none' : undefined
                  }
                  className={`border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-content-muted ${alignClass(
                    column.align
                  )}`}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => onSort?.(column.key)}
                      className={`inline-flex items-center gap-1 transition-colors hover:text-content-primary ${
                        isSorted ? 'text-content-primary' : ''
                      }`}
                    >
                      {column.header}
                      <SortIcon size={12} aria-hidden="true" className={isSorted ? '' : 'opacity-40'} />
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {rows.map((row, index) => (
            <tr
              key={getRowKey ? getRowKey(row, index) : index}
              className="border-b border-border transition-colors last:border-b-0 hover:bg-surface-3"
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`h-row px-3 ${alignClass(column.align)} ${column.className || ''}`}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {rows.length === 0 && <EmptyState message={emptyMessage} />}
    </div>
  );
}
