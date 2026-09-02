import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileImage, AlertTriangle, Download, Share2, Upload, Trash2, Pencil } from 'lucide-react';
import { apiClient } from '../api/client';
import { useNotification } from '../contexts/NotificationContext';
import { fanOutOptions, type FanOutOption } from './screen-write-plan';
import { summariseShare, type ShareSummary } from './screen-share-view';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { TabbedWorkspace, type TabDefinition } from '../components/ui/Tabs';
import { ScreenPreview } from '../components/ScreenPreview';
import { ScreenEditor } from '../components/ScreenEditor';
import { Modal } from '../components/ui/Modal';
import { screenToCanvas } from './screen-bytes';
import { createSurface, type EditorSurface } from './screen-editor-state';
import {
  toScreenRows, filterScreenRows,
  type ScreenIndexShape, type ScreenRow, type ScreenIndexEntryShape,
  type ScopeResolutionShape,
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
  const queryClient = useQueryClient();
  const { showSuccess, showError, confirm } = useNotification();
  const [query, setQuery] = useState('');
  const [openScreen, setOpenScreen] = useState<string | null>(null);
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [pendingUpload, setPendingUpload] = useState<{ bytes: string; name: string } | null>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const [shareSummary, setShareSummary] = useState<ShareSummary | null>(null);
  /**
   * Which directory to point nodes at.
   *
   * This was hardcoded to `Screens/Shared`, which the live board does not have
   * - so the action answered "The shared directory is outside the board root",
   * which was not true either. The board reports what it has; this asks.
   */
  const [sharedDir, setSharedDir] = useState('');
  const [importPlan, setImportPlan] = useState<{ path: string; action: string; bytes: number }[] | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [editing, setEditing] = useState<EditorSurface | null>(null);
  /**
   * True while the pending write came from the editor.
   *
   * The fan-out choice renders in the page for an uploaded file and inside the
   * dialog for an edited one - "the page is extremely tall and unmanageable",
   * and hunting for the choice after the editor closed was part of that.
   */
  const [editorWrite, setEditorWrite] = useState(false);
  /**
   * A file whose editor should open as soon as its bytes arrive.
   *
   * Reported as "there is no way to open the screen files? they are just
   * listed": opening one meant clicking the row, finding the panel that
   * appeared below a full-height table, clicking the path, then clicking Edit.
   * Edit now sits on the row itself, and the bytes are fetched on the way.
   */
  const [pendingEdit, setPendingEdit] = useState<string | null>(null);
  const detailRef = useRef<HTMLElement>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['screen-index'],
    // The routes answer `{ success, data, ... }`; every admin page reads `.data`.
    queryFn: async () => (await apiClient.getScreenIndex()).data as ScreenIndexShape,
  });

  const { data: sharedDirs } = useQuery({
    queryKey: ['shared-screen-dirs'],
    queryFn: async () => (await apiClient.getSharedScreenDirs()).data as {
      directories: { dir: string; files: number }[];
    },
  });

  const { data: file } = useQuery({
    queryKey: ['screen-file', openFile],
    queryFn: async () => (await apiClient.getScreenFile(openFile as string)).data,
    enabled: !!openFile,
  });

  useEffect(() => {
    if (!openScreen || !detailRef.current) return;
    // The table is as tall as the board has screens, so the panel opens off
    // the bottom of the window and the click reads as "nothing happened".
    // Optional call: jsdom has no scrollIntoView, and neither does every
    // embedded browser.
    detailRef.current.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, [openScreen]);

  useEffect(() => {
    const first = sharedDirs?.directories?.[0]?.dir;
    if (!sharedDir && first) setSharedDir(first);
  }, [sharedDirs, sharedDir]);

  const rows = useMemo(() => (data ? toScreenRows(data) : EMPTY_ROWS), [data]);
  const visible = useMemo(() => filterScreenRows(rows, query), [rows, query]);

  /**
   * One table per kind of screen.
   *
   * Every screen the board can display used to sit in one table - node screens,
   * conference screens and board screens one after another, 85 rows of them,
   * with the detail panel below the lot. A node's BBSTITLE and a conference's
   * MENU are different questions and they are asked separately now.
   */
  const byScope = useMemo(() => ({
    node: visible.filter(row => row.dirType === 'node'),
    conf: visible.filter(row => row.dirType === 'conf'),
    global: visible.filter(row => row.dirType === 'global'),
  }), [visible]);

  useEffect(() => {
    if (!pendingEdit || !file || openFile !== pendingEdit) return;
    if (file.format !== 'ansi' && file.format !== 'text') {
      setPendingEdit(null);
      return;
    }

    let cancelled = false;
    screenToCanvas(file.content).then(canvas => {
      if (cancelled) return;
      setEditing(createSurface(canvas));
      setPendingEdit(null);
    });
    return () => { cancelled = true; };
  }, [pendingEdit, file, openFile]);

  const entry: ScreenIndexEntryShape | undefined = data?.screens.find(s => s.screen === openScreen);

  const options: FanOutOption[] = useMemo(
    () => (data && openScreen && openFile ? fanOutOptions(data, openScreen, openFile) : []),
    [data, openScreen, openFile],
  );

  /** Read the chosen file as base64 - bytes, never text, all the way through. */
  const readAsBase64 = (chosen: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
      reader.readAsDataURL(chosen);
    });

  const applyWrite = async (option: FanOutOption) => {
    if (!pendingUpload || !openFile) return;
    try {
      if (option.choice === 'share-then-write') {
        const nodes = option.targets
          .map(t => Number(/^Node(\d+)/.exec(t)?.[1]))
          .filter(n => Number.isFinite(n));
        await apiClient.shareScreens(nodes, sharedDir);
      }
      const targets = option.choice === 'share-then-write' ? [openFile] : option.targets;
      await apiClient.putScreenFile(openFile, pendingUpload.bytes, targets);
      showSuccess(`Wrote ${targets.length} file${targets.length === 1 ? '' : 's'}`);
      setPendingUpload(null);
      queryClient.invalidateQueries({ queryKey: ['screen-index'] });
      queryClient.invalidateQueries({ queryKey: ['screen-file', openFile] });
    } catch (error) {
      showError((error as Error).message);
    }
  };

  /**
   * Ask the backend, per node, whether it can read the shared directory - and
   * show what each blocked node would lose or gain. The dry run writes
   * nothing, so this is safe to run before deciding.
   */
  const previewShare = async (paths: string[]) => {
    const nodes = paths
      .map(p => Number(/^Node(\d+)/.exec(p)?.[1]))
      .filter(n => Number.isFinite(n)) as number[];
    if (!nodes.length) return;

    try {
      const res = await apiClient.shareScreens(nodes, sharedDir, true);
      setShareSummary(summariseShare(
        Object.fromEntries(nodes.map(id => [id, {
          ok: true, reasons: [], losing: [], gaining: [], nodeHasNoScreens: false,
        }])),
      ));
      showSuccess(`${res.data?.wouldWrite?.length ?? nodes.length} node icons would be written`);
    } catch (error) {
      const payload = (error as { data?: { blocked?: { id: number; reasons: string[]; losing: string[]; gaining: string[] }[] } }).data;
      if (payload?.blocked) {
        setShareSummary(summariseShare(Object.fromEntries(payload.blocked.map(b => [b.id, {
          ok: false, reasons: b.reasons, losing: b.losing ?? [], gaining: b.gaining ?? [],
          nodeHasNoScreens: false,
        }]))));
      } else {
        showError((error as Error).message);
      }
    }
  };

  const applyShare = async (nodes: number[]) => {
    try {
      await apiClient.shareScreens(nodes, sharedDir);
      showSuccess(`${nodes.length} node${nodes.length === 1 ? '' : 's'} now read ${sharedDir}`);
      setShareSummary(null);
      queryClient.invalidateQueries({ queryKey: ['screen-index'] });
    } catch (error) {
      showError((error as Error).message);
    }
  };

  /** Import shows the plan before it writes: which files land, and over what. */
  const previewImport = async (archive: File) => {
    const form = new FormData();
    form.append('archive', archive);
    form.append('dryRun', 'true');
    const res = await fetch('/api/screens/import', { method: 'POST', body: form, headers: apiClient.authHeaders() });
    const body = await res.json();
    if (!res.ok) { showError(body.error ?? 'The archive was refused'); return; }
    setImportFile(archive);
    setImportPlan(body.data.plan);
  };

  const applyImport = async () => {
    if (!importFile) return;
    const form = new FormData();
    form.append('archive', importFile);
    const res = await fetch('/api/screens/import', { method: 'POST', body: form, headers: apiClient.authHeaders() });
    const body = await res.json();
    if (!res.ok) { showError(body.error ?? 'The archive was refused'); return; }
    showSuccess(`Imported ${body.data.plan.length} files`);
    setImportPlan(null);
    setImportFile(null);
    queryClient.invalidateQueries({ queryKey: ['screen-index'] });
  };

  const removeFile = async (target: string) => {
    // What a caller stops seeing matters more than the path, so ask with that.
    const ok = await confirm({
      title: 'Delete this screen file?',
      message: `${target} will be backed up beside itself, then removed.`,
      confirmText: 'Delete',
    });
    if (!ok) return;

    try {
      const res = await apiClient.deleteScreenFile(target);
      const lost: string[] = res.data?.stopsResolving ?? [];
      showSuccess(lost.length
        ? `Deleted. These stop resolving: ${lost.join(', ')}`
        : 'Deleted. Nothing stops resolving.');
      setOpenFile(null);
      queryClient.invalidateQueries({ queryKey: ['screen-index'] });
    } catch (error) {
      showError((error as Error).message);
    }
  };

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
        <span className={row.missingCount > 0 ? 'text-status-warn' : 'text-content-primary'}>
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
        <span className="text-content-primary">
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
          <span className="text-status-danger inline-flex items-center gap-1">
            <AlertTriangle size={14} /> {row.brokenReferences}
          </span>
        ) : (
          <span className="text-content-primary">0</span>
        ),
    },
  ];

  /** One row per scope a screen resolves in - the same DataTable as everywhere else. */
  const resolutionColumns: DataTableColumn<ScopeResolutionShape>[] = [
    { id: 'scope', header: 'Scope', value: res => scopeName(res.scope, res.id) },
    {
      id: 'dir',
      header: 'Reads',
      mono: true,
      value: res => res.dir,
      cell: res => (
        <>
          {res.dir}
          {res.dirIsShared && <span className="text-content-muted"> (shared)</span>}
        </>
      ),
    },
    {
      id: 'file',
      header: 'File',
      mono: true,
      value: res => res.file ?? '',
      cell: res => (res.file ? (
        <button className="underline" onClick={() => setOpenFile(res.file)}>{res.file}</button>
      ) : (
        <span className="text-status-warn">nothing resolves</span>
      )),
    },
    { id: 'variants', header: 'Variants', mono: true, value: res => res.variants.join(' ') },
    {
      id: 'actions',
      header: '',
      align: 'right',
      cell: res => {
        if (!res.file) return null;
        // The index already knows each file's format, so a row can say whether
        // there is art to edit rather than opening an editor that refuses.
        const format = data?.files[res.file]?.format;
        const editable = format === 'ansi' || format === 'text';

        return (
          <span className="whitespace-nowrap">
            {editable && (
              <button
                className="inline-flex items-center gap-1 underline mr-3"
                aria-label={`Edit ${res.file}`}
                onClick={() => { setOpenFile(res.file); setPendingEdit(res.file); }}
              >
                <Pencil size={14} /> Edit
              </button>
            )}
            <a
              className="inline-flex items-center gap-1 underline"
              href={`/api/screens/file?path=${encodeURIComponent(res.file)}&download=1`}
            >
              <Download size={14} /> Download
            </a>
          </span>
        );
      },
    },
  ];

  const screenTable = (rows: ScreenRow[]) => (
    <DataTable
      columns={columns}
      rows={rows}
      getRowId={row => row.screen}
      isLoading={isLoading}
      error={error as Error | null}
      onRowClick={(row: ScreenRow) => {
        setOpenScreen(row.screen);
        setOpenFile(null);
      }}
    />
  );

  const tabs: TabDefinition[] = [
    {
      id: 'node',
      label: `Node screens ${byScope.node.length}`,
      render: () => screenTable(byScope.node),
    },
    {
      id: 'conference',
      label: `Conference screens ${byScope.conf.length}`,
      render: () => screenTable(byScope.conf),
    },
    {
      id: 'board',
      label: `Board screens ${byScope.global.length}`,
      render: () => screenTable(byScope.global),
    },
    {
      id: 'unused',
      // Files nothing resolves to. Not a screen list: these are files on the
      // volume that no screen, node or conference reads.
      label: `Read by nothing ${data?.unused.length ?? 0}`,
      render: () => (
        <div className="space-y-2 text-sm">
          <p className="text-content-secondary">
            On the volume, read by no screen the board can display. Safe to keep;
            safe to remove once you have looked.
          </p>
          <ul className="space-y-1">
            {(data?.unused ?? []).map(item => (
              <li key={item.relPath} className="flex items-center gap-3">
                <span className="font-mono text-content-primary">{item.relPath}</span>
                <span className="text-content-secondary">{item.bytes} bytes, {item.format}</span>
                <a
                  className="underline"
                  href={`/api/screens/file?path=${encodeURIComponent(item.relPath)}&download=1`}
                >
                  Download
                </a>
                <button className="underline text-status-danger" onClick={() => removeFile(item.relPath)}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-2">
        <FileImage size={20} />
        <h1 className="text-xl text-content-primary">Screen Files</h1>
        {data && (
          <span className="text-sm text-content-secondary">
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

      <div className="flex items-center gap-4 text-sm">
        <a className="inline-flex items-center gap-1 underline" href="/api/screens/export?scope=all">
          <Download size={14} /> Export every screen
        </a>
        <input
          ref={importInput}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={async e => {
            const chosen = e.target.files?.[0];
            if (chosen) await previewImport(chosen);
            e.target.value = '';
          }}
        />
        <button className="inline-flex items-center gap-1 underline" onClick={() => importInput.current?.click()}>
          <Upload size={14} /> Import an archive
        </button>
      </div>

      {importPlan && (
        <div className="border border-border p-3 text-sm space-y-2">
          <p className="text-content-primary">{importPlan.length} files would be written:</p>
          <ul className="font-mono max-h-48 overflow-auto">
            {importPlan.map(item => (
              <li key={item.path}>
                {item.action} {item.path} ({item.bytes} bytes)
              </li>
            ))}
          </ul>
          <button className="underline" onClick={applyImport}>Import them</button>
          <button className="block text-content-secondary underline" onClick={() => { setImportPlan(null); setImportFile(null); }}>
            cancel
          </button>
        </div>
      )}

      <TabbedWorkspace tabs={tabs} />

      {entry && (
        <section className="space-y-2" ref={detailRef} data-testid="screen-detail">
          <h2 className="text-lg text-content-primary">{entry.screen}</h2>
          <p className="text-sm text-content-secondary">
            Where {entry.screen} resolves from, per node and conference. Edit
            opens the art; the file name opens what the board knows about it.
          </p>

          <DataTable
            columns={resolutionColumns}
            rows={entry.resolutions}
            getRowId={res => `${res.scope}-${res.id}`}
          />

          {entry.duplicateGroups.map(group => (
            <div key={group.sha256} className="text-sm text-content-secondary space-y-1">
              <p className="inline-flex items-center gap-2">
                <Share2 size={14} />
                {group.paths.length} copies with identical content - they can be read from one
                directory instead.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-content-secondary" htmlFor="shared-dir">Share from</label>
                <select
                  id="shared-dir"
                  className="input-field"
                  value={sharedDir}
                  onChange={e => setSharedDir(e.target.value)}
                >
                  {(sharedDirs?.directories ?? []).map(option => (
                    <option key={option.dir} value={option.dir}>
                      {option.dir} ({option.files} screens)
                    </option>
                  ))}
                </select>
                <button
                  className="underline"
                  disabled={!sharedDir}
                  onClick={() => previewShare(group.paths)}
                >
                  Check this directory
                </button>
              </div>
            </div>
          ))}

          {shareSummary && (
            <div className="border border-border p-3 text-sm space-y-2">
              <p className="text-content-primary">
                {shareSummary.canShare.length} node
                {shareSummary.canShare.length === 1 ? '' : 's'} can read {sharedDir}.
              </p>
              {shareSummary.blocked.map(node => (
                <p key={node.id} className="text-status-warn">
                  Node {node.id}: {node.reasons.join('; ')}
                </p>
              ))}
              {shareSummary.canShare.length > 0 && (
                <button className="underline" onClick={() => applyShare(shareSummary.canShare)}>
                  Point {shareSummary.canShare.length} node
                  {shareSummary.canShare.length === 1 ? '' : 's'} at {sharedDir}
                </button>
              )}
              <button className="block text-content-secondary underline" onClick={() => setShareSummary(null)}>
                cancel
              </button>
            </div>
          )}
        </section>
      )}

      {/*
        The editor is a dialog, not another section.

        An 80x25 canvas plus its tools under a table, a resolutions list and a
        preview made a page nobody could work in - reported as "the page is
        extremely tall and unmanageable". Saving stays in here too: the fan-out
        choice is the last step of editing, not something to find afterwards.
      */}
      <Modal
        open={!!openFile}
        title={openFile ?? 'A screen file'}
        maxWidth="max-w-5xl"
        onClose={() => {
          setOpenFile(null);
          setEditing(null);
          setEditorWrite(false);
          setPendingUpload(null);
        }}
      >
        {editing && !pendingUpload && (
          <ScreenEditor
            surface={editing}
            mci={file?.mci ?? []}
            onChange={setEditing}
            // An edit produces bytes, and bytes go out the way an uploaded file
            // does - the same fan-out, the same backup, the same refusals. The
            // editor is not a second write path.
            onSave={bytes => {
              setPendingUpload({ bytes, name: 'the edited screen' });
              setEditorWrite(true);
            }}
            onCancel={() => { setEditing(null); setEditorWrite(false); }}
          />
        )}

        {editorWrite && pendingUpload && (
          <div className="space-y-2 p-4">
            <p className="text-sm text-content-primary">
              Write <span className="font-mono">{openFile}</span> where?
            </p>
            {options.map(option => (
              <button
                key={option.choice}
                className="block text-left underline"
                onClick={async () => {
                  await applyWrite(option);
                  // The write was the task: close, rather than leaving the
                  // sysop in a dialog with nothing left to do in it.
                  setEditing(null);
                  setEditorWrite(false);
                  setOpenFile(null);
                }}
              >
                {option.label}
                {option.choice === 'all-copies' && ` - ${option.targets.length} backups`}
                {option.suggested && <span className="text-content-secondary"> (suggested)</span>}
              </button>
            ))}
            <button
              className="block text-left text-content-secondary underline"
              onClick={() => { setPendingUpload(null); setEditorWrite(false); }}
            >
              back to the editor
            </button>
          </div>
        )}

        {/*
          The file itself: what it is, what it runs, and what a caller sees.
          This was a section under the page, which is what made the page
          "extremely tall and unmanageable" - the tab list, the screens table,
          the resolutions and then all of this.
        */}
        {openFile && file && !editing && !editorWrite && (
          <div className="space-y-3 p-4">
            <p className="text-sm text-content-secondary">
              {file.bytes} bytes, {file.format}
            </p>

            <div className="flex items-center gap-3 text-sm">
              <input
                ref={uploadInput}
                type="file"
                className="hidden"
                onChange={async e => {
                  const chosen = e.target.files?.[0];
                  if (!chosen) return;
                  setPendingUpload({ bytes: await readAsBase64(chosen), name: chosen.name });
                  e.target.value = '';
                }}
              />
              <button
                className="inline-flex items-center gap-1 underline"
                onClick={() => uploadInput.current?.click()}
              >
                <Upload size={14} /> Replace
              </button>
              {(file.format === 'ansi' || file.format === 'text') && (
                <button
                  className="inline-flex items-center gap-1 underline"
                  aria-label="Edit this file"
                  onClick={async () => setEditing(createSurface(await screenToCanvas(file.content)))}
                >
                  <Pencil size={14} /> Edit
                </button>
              )}
              <a
                className="inline-flex items-center gap-1 underline"
                href={`/api/screens/file?path=${encodeURIComponent(openFile)}&download=1`}
              >
                <Download size={14} /> Download
              </a>
              <button
                className="inline-flex items-center gap-1 underline text-status-danger"
                onClick={() => removeFile(openFile)}
              >
                <Trash2 size={14} /> Delete
              </button>
            </div>

            {pendingUpload && !editorWrite && (
              <div className="border border-border p-3 space-y-2 text-sm">
                <p className="text-content-primary">
                  Replace <span className="font-mono">{openFile}</span> with{' '}
                  <span className="font-mono">{pendingUpload.name}</span>
                </p>
                {options.map(option => (
                  <button
                    key={option.choice}
                    className="block text-left underline"
                    onClick={() => applyWrite(option)}
                  >
                    {option.label}
                    {option.choice === 'all-copies' && ` - ${option.targets.length} backups`}
                    {option.suggested && <span className="text-content-secondary"> (suggested)</span>}
                  </button>
                ))}
                <button
                  className="block text-left text-content-secondary underline"
                  onClick={() => setPendingUpload(null)}
                >
                  cancel
                </button>
              </div>
            )}

            {file.format === 'ansi' || file.format === 'text' ? (
              <ScreenPreview content={atob(file.content)} />
            ) : (
              <p className="text-sm text-status-warn">
                {file.format === 'rip'
                  ? 'RIP graphics - preview arrives with the RIP editor in phase 3.'
                  : 'PETSCII - the board does not render this correctly yet, so no preview is shown rather than a misleading one.'}
              </p>
            )}

            {file.mci?.length > 0 && (
              <div className="text-sm">
                <h4 className="text-content-primary">
                  This screen runs things - {file.mci.length} MCI reference
                  {file.mci.length === 1 ? '' : 's'}
                </h4>
                <ul className="font-mono">
                  {file.mci.map((ref: { code: string; target: string; resolves: boolean }, i: number) => (
                    <li key={i} className={ref.resolves ? 'text-content-primary' : 'text-status-danger'}>
                      ~{ref.code}_{ref.target} {ref.resolves ? '' : '- points at nothing'}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Modal>

    </div>
  );
}
