import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileImage, AlertTriangle, Download, Share2 } from 'lucide-react';
import { apiClient } from '../api/client';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { ScreenPreview } from '../components/ScreenPreview';
import {
  toScreenRows, filterScreenRows,
  type ScreenIndexShape, type ScreenRow, type ScreenIndexEntryShape,
} from './screen-index-view';

/** Stable fallback: a fresh array each render invalidates the row model. */
const EMPTY_ROWS: ScreenRow[] = [];

function scopeName(scope: string, id: number | null): string {
  if (scope === 'node') return `Node ${id}`;
  if (scope === 'conf') return `Conference ${id}`;
  return 'Board root';
}

/**
 * Every screen the board can display, where it resolves from, and what it
 * looks like.
 *
 * Screens first, files underneath: a file only matters through the screen it
 * serves, and "which file does node 7 display for BBSTITLE" is the question
 * nobody could answer before this page.
 */
export function ScreenFilesPage() {
  const [query, setQuery] = useState('');
  const [openScreen, setOpenScreen] = useState<string | null>(null);
  const [openFile, setOpenFile] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['screen-index'],
    queryFn: async () => (await apiClient.getScreenIndex()).data as ScreenIndexShape,
  });

  const { data: file } = useQuery({
    queryKey: ['screen-file', openFile],
    queryFn: async () => (await apiClient.getScreenFile(openFile as string)).data,
    enabled: !!openFile,
  });

  const rows = useMemo(() => (data ? toScreenRows(data) : EMPTY_ROWS), [data]);
  const visible = useMemo(() => filterScreenRows(rows, query), [rows, query]);

  const entry: ScreenIndexEntryShape | undefined = data?.screens.find(s => s.screen === openScreen);

  const columns: DataTableColumn<ScreenRow>[] = [
    { id: 'screen', header: 'Screen', value: row => row.screen, mono: true, sortable: true },
    { id: 'scope', header: 'Reads from', value: row => row.scopeLabel, sortable: true },
    { id: 'resolved', header: 'Resolves', value: row => row.resolvedCount, align: 'right', sortable: true },
    {
      id: 'missing',
      header: 'Missing',
      align: 'right',
      sortable: true,
      value: row => row.missingCount,
      cell: row => (
        <span className={row.missingCount > 0 ? 'text-amber-400' : 'text-bbs-text'}>
          {row.missingCount}
        </span>
      ),
    },
    {
      id: 'distinct',
      header: 'Distinct contents',
      align: 'right',
      sortable: true,
      value: row => row.distinctContents,
      cell: row => (
        <span className="text-bbs-text">
          {row.distinctContents}
          {row.distinctContents === 1 && row.resolvedCount > 1 ? ' (all identical)' : ''}
        </span>
      ),
    },
    {
      id: 'broken',
      header: 'Broken references',
      align: 'right',
      sortable: true,
      value: row => row.brokenReferences,
      cell: row =>
        row.brokenReferences > 0 ? (
          <span className="text-red-400 inline-flex items-center gap-1">
            <AlertTriangle size={14} /> {row.brokenReferences}
          </span>
        ) : (
          <span className="text-bbs-text">0</span>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-2">
        <FileImage size={20} />
        <h1 className="text-xl text-bbs-text">Screen Files</h1>
        {data && (
          <span className="text-sm text-bbs-muted">
            {Object.keys(data.files).length} files, {data.unused.length} read by nothing
          </span>
        )}
      </header>

      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search screens"
        className="input-field w-full max-w-sm"
      />

      <DataTable
        columns={columns}
        rows={visible}
        getRowId={row => row.screen}
        isLoading={isLoading}
        error={error as Error | null}
        onRowClick={(row: ScreenRow) => {
          setOpenScreen(row.screen);
          setOpenFile(null);
        }}
      />

      {entry && (
        <section className="space-y-2">
          <h2 className="text-lg text-bbs-text">{entry.screen}</h2>

          <table className="w-full text-sm">
            <thead>
              <tr className="text-bbs-muted text-left">
                <th className="py-1">Scope</th>
                <th>Reads</th>
                <th>File</th>
                <th>Variants</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {entry.resolutions.map(res => (
                <tr key={`${res.scope}-${res.id}`} className="border-t border-bbs-border">
                  <td className="py-1">{scopeName(res.scope, res.id)}</td>
                  <td className="font-mono">
                    {res.dir}
                    {res.dirIsShared && <span className="text-bbs-muted"> (shared)</span>}
                  </td>
                  <td className="font-mono">
                    {res.file ? (
                      <button className="underline" onClick={() => setOpenFile(res.file)}>
                        {res.file}
                      </button>
                    ) : (
                      <span className="text-amber-400">nothing resolves</span>
                    )}
                  </td>
                  <td className="font-mono text-bbs-muted">{res.variants.join(' ')}</td>
                  <td className="text-right">
                    {res.file && (
                      <a
                        className="inline-flex items-center gap-1 underline"
                        href={`/api/screens/file?path=${encodeURIComponent(res.file)}&download=1`}
                      >
                        <Download size={14} /> Download
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {entry.duplicateGroups.map(group => (
            <p key={group.sha256} className="text-sm text-bbs-muted inline-flex items-center gap-2">
              <Share2 size={14} />
              {group.paths.length} copies with identical content - they can be read from one
              directory instead.
            </p>
          ))}
        </section>
      )}

      {openFile && file && (
        <section className="space-y-2">
          <h3 className="text-bbs-text font-mono">{openFile}</h3>
          <p className="text-sm text-bbs-muted">
            {file.bytes} bytes, {file.format}
          </p>

          {file.format === 'ansi' || file.format === 'text' ? (
            <ScreenPreview content={atob(file.content)} />
          ) : (
            <p className="text-sm text-amber-400">
              {file.format === 'rip'
                ? 'RIP graphics - preview arrives with the RIP editor in phase 3.'
                : 'PETSCII - the board does not render this correctly yet, so no preview is shown rather than a misleading one.'}
            </p>
          )}

          {file.mci?.length > 0 && (
            <div className="text-sm">
              <h4 className="text-bbs-text">
                This screen runs things - {file.mci.length} MCI reference
                {file.mci.length === 1 ? '' : 's'}
              </h4>
              <ul className="font-mono">
                {file.mci.map((ref: any, i: number) => (
                  <li key={i} className={ref.resolves ? 'text-bbs-text' : 'text-red-400'}>
                    ~{ref.code}_{ref.target} {ref.resolves ? '' : '- points at nothing'}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
