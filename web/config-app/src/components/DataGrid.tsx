import type { ReactNode } from 'react';

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

export function DataGrid<T>({
  columns,
  rows,
  sortKey,
  sortDir,
  onSort,
  emptyMessage = 'No results found.',
  getRowKey,
}: DataGridProps<T>) {
  const template = `repeat(${columns.length}, minmax(0, 1fr))`;

  return (
    <div className="card overflow-x-auto">
      <div className="min-w-full">
        <div
          className="grid gap-3 font-semibold text-bbs-text border-b border-bbs-border pb-2 text-sm"
          style={{ gridTemplateColumns: template }}
        >
          {columns.map((column) => {
            const isSorted = sortKey === column.key;
            const indicator = isSorted ? (sortDir === 'asc' ? '▲' : '▼') : '';
            const sortable = onSort && column.sortable;
            const headerContent = (
              <span className="flex items-center space-x-1">
                <span>{column.header}</span>
                {indicator && <span>{indicator}</span>}
              </span>
            );

            if (sortable) {
              return (
                <button
                  key={column.key}
                  onClick={() => onSort?.(column.key)}
                  className="text-left hover:text-bbs-accent transition-colors"
                >
                  {headerContent}
                </button>
              );
            }

            return (
              <span key={column.key} className="text-left">
                {headerContent}
              </span>
            );
          })}
        </div>

        {rows.map((row, index) => (
          <div
            key={getRowKey ? getRowKey(row, index) : index}
            className="grid gap-3 items-center py-2 border-b border-bbs-border text-sm"
            style={{ gridTemplateColumns: template }}
          >
            {columns.map((column) => (
              <div
                key={column.key}
                className={`${column.className || ''} ${
                  column.align === 'right'
                    ? 'text-right'
                    : column.align === 'center'
                      ? 'text-center'
                      : 'text-left'
                }`}
              >
                {column.render(row)}
              </div>
            ))}
          </div>
        ))}

        {rows.length === 0 && <div className="text-center text-bbs-muted py-6">{emptyMessage}</div>}
      </div>
    </div>
  );
}
