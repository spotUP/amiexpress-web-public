/**
 * The data grid converted pages use.
 *
 * TanStack Table owns the sorted row model and the sorting state; this file
 * owns the markup, so the table conventions of the design system live in one
 * place: sticky header, no zebra striping, hover on the surface ramp, a left
 * border on the selected row, right-aligned numerics with tabular figures, and
 * row actions that fade in on hover without leaving the keyboard order.
 *
 * Filtering stays outside. Pages already hold their own filter state, and a
 * filtered array is a cheaper contract than a second feature registration.
 *
 * `components/DataGrid` remains for Node Configuration alone, whose rows turn
 * into input fields in place - a row being edited must not move because a sort
 * changed.
 */

import { useMemo } from 'react';
import type { ReactNode } from 'react';
import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_text,
  tableFeatures,
  useTable,
} from '@tanstack/react-table';
import type { ColumnSort, RowData } from '@tanstack/react-table';
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import { EmptyState, SkeletonRows } from './states';

/**
 * Registered once at module scope. Feature registration is what creates the
 * sorting state and its APIs; a table built from a fresh object each render
 * invalidates every data-dependent model.
 */
const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    text: sortFn_text,
    basic: sortFn_basic,
  },
});

/** A stable empty array: a new fallback per render would invalidate the model. */
const EMPTY_ROWS: never[] = [];

export type CellValue = string | number | boolean | null | undefined;

export interface DataTableColumn<T extends RowData> {
  id: string;
  header: ReactNode;
  /**
   * The sortable value behind the column. Omit for a column that carries no
   * value of its own - row actions, an icon - and it is not sortable.
   */
  value?: (row: T) => CellValue;
  /** Defaults to the value. Use it for anything that is not plain text. */
  cell?: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  /** Identifiers, paths, counts and timestamps are mono with tabular figures. */
  mono?: boolean;
  /** Any CSS width, for example '8rem' or '10%'. */
  width?: string;
  sortable?: boolean;
  headerClassName?: string;
  cellClassName?: string;
}

interface DataTableProps<T extends RowData> {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  /** Sorted on first paint. */
  initialSort?: ColumnSort[];
  isLoading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  selectedRowId?: string;
  /** Rendered at the end of each row, revealed on hover and on focus. */
  rowActions?: (row: T) => ReactNode;
}

function alignClass(align: DataTableColumn<Record<string, unknown>>['align']): string {
  if (align === 'right') return 'text-right';
  if (align === 'center') return 'text-center';
  return 'text-left';
}

export function DataTable<T extends RowData>({
  columns,
  rows,
  getRowId,
  initialSort,
  isLoading = false,
  emptyMessage = 'Nothing to show yet.',
  onRowClick,
  selectedRowId,
  rowActions,
}: DataTableProps<T>) {
  const tableColumns = useMemo(() => {
    const helper = createColumnHelper<typeof features, T>();
    return columns.map((column) => {
      // The accessor is declared as returning `unknown` on purpose: the table's
      // column type is invariant in the value type, so a narrower return would
      // not be assignable to the ColumnDef list useTable takes.
      const accessor = (row: T): unknown => (column.value ? column.value(row) : null);

      return helper.accessor(accessor, {
        id: column.id,
        enableSorting: column.sortable !== false && column.value !== undefined,
      });
    });
  }, [columns]);

  const table = useTable({
    features,
    data: rows.length > 0 ? rows : EMPTY_ROWS,
    columns: tableColumns,
    getRowId,
    initialState: initialSort ? { sorting: initialSort } : undefined,
    // One unambiguous cycle: ascending, descending, ascending. A third click
    // that silently returns the table to insertion order reads as a bug.
    enableSortingRemoval: false,
  });

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-surface-1 p-3">
        <SkeletonRows rows={6} />
      </div>
    );
  }

  const modelRows = table.getRowModel().rows;

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface-1">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-surface-2">
          <tr>
            {columns.map((column) => {
              const tableColumn = table.getColumn(column.id);
              const canSort = tableColumn?.getCanSort() ?? false;
              const sorted = tableColumn?.getIsSorted();
              const SortIcon = sorted === 'asc' ? ChevronUp : sorted === 'desc' ? ChevronDown : ChevronsUpDown;

              return (
                <th
                  key={column.id}
                  scope="col"
                  style={column.width ? { width: column.width } : undefined}
                  aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}
                  className={`border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-content-muted ${alignClass(
                    column.align
                  )} ${column.headerClassName ?? ''}`}
                >
                  {canSort ? (
                    <button
                      type="button"
                      onClick={tableColumn?.getToggleSortingHandler()}
                      className={`inline-flex items-center gap-1 transition-colors hover:text-content-primary ${
                        sorted ? 'text-content-primary' : ''
                      }`}
                    >
                      {column.header}
                      <SortIcon size={12} aria-hidden="true" className={sorted ? '' : 'opacity-40'} />
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
            {rowActions && <th scope="col" className="w-px border-b border-border px-3 py-2" />}
          </tr>
        </thead>

        <tbody>
          {modelRows.map((modelRow) => {
            const row = modelRow.original;
            const rowId = getRowId(row);
            const isSelected = selectedRowId === rowId;

            return (
              <tr
                key={rowId}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`group border-b border-border last:border-b-0 transition-colors ${
                  onRowClick ? 'cursor-pointer' : ''
                } ${isSelected ? 'bg-surface-3' : 'hover:bg-surface-3'}`}
              >
                {columns.map((column, columnIndex) => {
                  const content = column.cell ? column.cell(row) : String(column.value?.(row) ?? '');

                  return (
                    <td
                      key={column.id}
                      className={`relative h-row px-3 ${alignClass(column.align)} ${
                        column.mono ? 'font-mono tabular-nums' : ''
                      } ${column.cellClassName ?? ''}`}
                    >
                      {isSelected && columnIndex === 0 && (
                        <span className="absolute inset-y-0 left-0 w-0.5 bg-accent" aria-hidden="true" />
                      )}
                      {content}
                    </td>
                  );
                })}

                {rowActions && (
                  <td className="h-row whitespace-nowrap px-3 text-right">
                    {/* Opacity, never display:none - the buttons stay in the
                        keyboard order whether or not the pointer is here. */}
                    <span className="inline-flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                      {rowActions(row)}
                    </span>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      {modelRows.length === 0 && <EmptyState message={emptyMessage} />}
    </div>
  );
}
