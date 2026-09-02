import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileImage, AlertTriangle, Download, Share2, Upload, Trash2, Pencil } from 'lucide-react';
import { apiClient, type ApiError } from '../api/client';
import { useNotification } from '../contexts/NotificationContext';
import { fanOutOptions, type FanOutOption } from './screen-write-plan';
import { describeScreen } from './screen-descriptions';
import { callSitesFor } from './screen-provenance';
import { summariseShare, type ShareSummary } from './screen-share-view';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { TabbedWorkspace, type TabDefinition } from '../components/ui/Tabs';
import { ScreenArt } from '../components/ScreenArt';
import { ScreenGallery, type GalleryItem } from '../components/ScreenGallery';
import { formatBytes } from '../lib/format';
import { ScreenEditor } from '../components/ScreenEditor';
import { Modal } from '../components/ui/Modal';
import { screenToCanvas } from './screen-bytes';
import { createSurface, type EditorSurface } from './screen-editor-state';
import {
  toScreenRows, filterScreenRows,
  type ScreenIndexShape, type ScreenRow, type ScreenIndexEntryShape,
  type ScopeResolutionShape, type ConferenceShape, type ScreenReaderShape,
  type MciReferenceShape, type ScreenFileShape, describeReader, describeProblem,
} from './screen-index-view';

/** Stable fallback: a fresh array each render invalidates the row model. */
const EMPTY_ROWS: ScreenRow[] = [];

/**
 * What a scope is called, in the board's own words.
 *
 * "Conf2" means nothing to a designer, and a renumbered board makes it worse:
 * conference 1 lives in Conf2 here. The conference's NAME is what a sysop
 * recognises - "Amiga Demoscene" - so it leads, with the number behind it.
 */
function scopeName(scope: string, id: number | null, conferences?: ConferenceShape[]): string {
  if (scope === 'node') return `Node ${id}`;
  if (scope === 'conf') {
    const conf = conferences?.find(c => c.id === id);
    return conf ? `${conf.name} (conference ${id})` : `Conference ${id}`;
  }
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
  /**
   * Whether to draw files a designer never edits.
   *
   * "It shows generated screens as well. those are not relevant." Off by
   * default; a toggle rather than a filter in the code, because a file the
   * manager refuses to show is a file nobody can find.
   */
  const [showGenerated, setShowGenerated] = useState(false);
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

    /** The board's per-node verdicts, in the shape summariseShare reads. */
    const verdicts = (
      canShare: number[],
      blocked: { id: number; reasons: string[]; losing?: string[]; gaining?: string[] }[],
    ) => ({
      ...Object.fromEntries(canShare.map(id => [id, {
        ok: true, reasons: [], losing: [], gaining: [], nodeHasNoScreens: false,
      }])),
      ...Object.fromEntries(blocked.map(b => [b.id, {
        ok: false, reasons: b.reasons, losing: b.losing ?? [], gaining: b.gaining ?? [],
        nodeHasNoScreens: false,
      }])),
    });

    try {
      // A dry run ANSWERS - including "these five cannot, here is why" - so the
      // whole verdict arrives on the success path. It used to come back as a
      // 409, which the browser logged as a failed request and the page had to
      // read out of an exception.
      const res = await apiClient.shareScreens(nodes, sharedDir, true);
      const data = res.data as {
        blocked?: { id: number; reasons: string[]; losing?: string[]; gaining?: string[] }[];
        canShare?: number[];
        wouldWrite?: string[];
      } | undefined;

      const blocked = data?.blocked ?? [];
      const canShare = data?.canShare ?? (blocked.length ? [] : nodes);
      setShareSummary(summariseShare(verdicts(canShare, blocked)));

      if (!blocked.length) {
        showSuccess(`${data?.wouldWrite?.length ?? nodes.length} node icons would be written`);
      }
    } catch (error) {
      // A real refusal still arrives as an error, and still carries the facts.
      const payload = (error as ApiError).data as {
        blocked?: { id: number; reasons: string[]; losing?: string[]; gaining?: string[] }[];
        canShare?: number[];
      } | undefined;

      if (payload?.blocked) {
        setShareSummary(summariseShare(verdicts(payload.canShare ?? [], payload.blocked)));
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
    {
      id: 'screen',
      header: 'Screen',
      value: row => row.screen,
      sortable: true,
      cell: row => (
        <span>
          <span className="font-topaz text-content-primary">{row.screen}</span>
          {/* The name is what the board calls the file; this is what the sysop
              was looking for. "I can't see the screen files that are shown when
              i join a conference" - they were CONF_BULL and MENU. */}
          {describeScreen(row.screen) && (
            <span className="block text-xs text-content-secondary">{describeScreen(row.screen)}</span>
          )}
        </span>
      ),
    },
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
    {
      id: 'scope',
      header: 'Where',
      value: res => scopeName(res.scope, res.id, data?.conferences),
      sortable: true,
    },
    {
      id: 'dir',
      header: 'Reads',
      value: res => res.dir,
      cell: res => (
        <span className="font-topaz">
          {res.dir}
          {res.dirIsShared && <span className="text-content-muted"> (shared)</span>}
        </span>
      ),
    },
    {
      id: 'file',
      header: 'File',
      value: res => res.file ?? '',
      cell: res => (res.file ? (
        <span className="font-topaz underline">{res.file}</span>
      ) : (
        <span className="text-status-warn">nothing resolves</span>
      )),
    },
    {
      id: 'variants',
      header: 'Variants',
      value: res => res.variants.join(' '),
      cell: res => <span className="font-topaz">{res.variants.join(' ')}</span>,
    },
  ];

  /** The files nothing reads - a table, because a list of 400 paths is not one. */
  const unusedColumns: DataTableColumn<ScreenFileShape>[] = [
    {
      id: 'path',
      header: 'File',
      sortable: true,
      value: item => item.relPath,
      cell: item => <span className="font-topaz underline">{item.relPath}</span>,
    },
    { id: 'format', header: 'Format', sortable: true, value: item => item.format },
    { id: 'bytes', header: 'Size', align: 'right', sortable: true, value: item => item.bytes,
      cell: item => formatBytes(item.bytes) },
    {
      id: 'problems',
      header: 'State',
      sortable: true,
      value: item => (item.problems ?? []).join(' '),
      cell: item => (
        <span className={item.problems?.length ? 'text-status-warn' : 'text-content-secondary'}>
          {item.problems?.length ? item.problems.map(describeProblem).join('; ') : 'looks fine'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      align: 'right',
      cell: item => (
        <button
          className="underline text-status-danger"
          onClick={event => { event.stopPropagation(); removeFile(item.relPath); }}
        >
          Delete
        </button>
      ),
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

  /**
   * Every screen on the board as a picture.
   *
   * "How can we make it easy for artists to find everything? render mugshots
   * of all screen files?" A designer recognises the art, never the path.
   */
  const galleryItems: GalleryItem[] = useMemo(() => {
    if (!data) return [];

    const bulletinTitles = new Map((data.bulletins ?? []).map(b => [b.file, b] as const));

    const drawable = Object.values(data.files)
      .filter(file => file.format === 'ansi' || file.format === 'text')
      .filter(file => showGenerated || !file.generated);

    /**
     * One card per piece of ART, not per file.
     *
     * This board has 71 identical Node<n>/BBSTITLE.txt - one screen,
     * provisioned per node - and 43 more copies under Node<n>/Screens. Drawing
     * each as its own card buries the art nobody has seen in the art everybody
     * has. Grouped by content hash, which is what "identical" means here.
     */
    const byContent = new Map<string, ScreenFileShape[]>();
    for (const file of drawable) {
      byContent.set(file.sha256, [...(byContent.get(file.sha256) ?? []), file]);
    }

    return [...byContent.values()]
      .map(copies => {
        // The copy a screen actually resolves to leads; failing that, the first.
        const file = copies.find(c => c.readBy?.some(r => r.via === 'resolved')) ?? copies[0];
        const bulletin = bulletinTitles.get(file.relPath);
        const reader = file.readBy?.[0];

        const label = bulletin
          ? `Bulletin ${bulletin.number}${bulletin.title ? ` - ${bulletin.title}` : ''}`
          : reader?.screen ?? file.relPath;

        const detail = file.generated
          ? file.generated === 'backup' ? 'a leftover copy' : 'written by the board'
          : file.problems?.length
            ? file.problems.map(describeProblem).join('; ')
            : reader
              ? describeReader(reader, data.callersByLevel)
              : 'read by nothing';

        return {
          path: file.relPath,
          label,
          detail: copies.length > 1
            ? `${detail} - and ${copies.length - 1} identical ${copies.length === 2 ? 'copy' : 'copies'}`
            : detail,
          credit: file.sauce?.author
            ? `${file.sauce.title || 'untitled'} by ${file.sauce.author}`
            : undefined,
          problem: (file.problems?.length ?? 0) > 0,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [data, showGenerated]);

  const tabs: TabDefinition[] = [
    {
      id: 'gallery',
      label: `Gallery ${galleryItems.length}`,
      render: () => (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-content-secondary">
              Every screen and bulletin on the board, drawn - identical copies
              shown once. Click one to open it; thumbnails load as you scroll.
            </p>
            <label className="flex items-center gap-2 text-sm text-content-secondary">
              <input
                type="checkbox"
                checked={showGenerated}
                onChange={e => setShowGenerated(e.target.checked)}
              />
              Show leftovers and files the board writes
            </label>
          </div>
          <ScreenGallery
            items={query.trim()
              ? galleryItems.filter(item =>
                  item.label.toLowerCase().includes(query.trim().toLowerCase())
                  || item.path.toLowerCase().includes(query.trim().toLowerCase()))
              : galleryItems}
            onOpen={setOpenFile}
          />
        </div>
      ),
    },
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
            No screen reads these - at any security level, in any screen type,
            and no other screen includes them. Everything a variant serves
            (BULL20 for a level-20 caller, MENU250.TXT.GR for a sysop on a
            graphics terminal) counts as read and is NOT in this list. Click a
            row to see the art before deciding.
          </p>
          <DataTable
            columns={unusedColumns}
            rows={data?.unused ?? []}
            getRowId={item => item.relPath}
            initialSort={[{ id: 'bytes', desc: true }]}
            emptyMessage="Every screen file on this board is read by something."
            onRowClick={item => setOpenFile(item.relPath)}
          />
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
          <h2 className="text-lg text-content-primary">
            <span className="font-topaz">{entry.screen}</span>
            {describeScreen(entry.screen) && (
              <span className="ml-3 text-sm text-content-secondary">
                {describeScreen(entry.screen)}
              </span>
            )}
          </h2>
          <p className="text-sm text-content-secondary">
            Where it resolves from, per node and conference. Edit opens the art;
            the file name opens what the board knows about it.
          </p>

          {/* Generated from express.e, so the claim cites the source this port
              is 1:1 with rather than somebody's memory of AmiExpress. */}
          {callSitesFor(entry.screen).length > 0 && (
            <p className="text-xs text-content-muted">
              Shown by {callSitesFor(entry.screen)
                .map(site => `${site.proc}() - express.e:${site.line}`)
                .join(', ')}
            </p>
          )}

          {/*
            The ROW opens the art. "Make all screens open the edit dialog when
            i click their lines in the table" - so there is no Edit button to
            find, and a scope where nothing resolves has nothing to open.
          */}
          <DataTable
            columns={resolutionColumns}
            rows={entry.resolutions}
            getRowId={res => `${res.scope}-${res.id}`}
            onRowClick={res => {
              if (!res.file) return;
              setOpenFile(res.file);
              const format = data?.files[res.file]?.format;
              if (format === 'ansi' || format === 'text') setPendingEdit(res.file);
            }}
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
            filePath={openFile ?? undefined}
            // The page owns the CP437 bridge, so it decodes the picked file and
            // hands the editor a surface. Nothing is written until Save.
            onLoadFile={async chosen => {
              const bytes = await readAsBase64(chosen);
              setEditing(createSurface(await screenToCanvas(bytes)));
            }}
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
              Write <span className="font-topaz">{openFile}</span> where?
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
              {file.sauce?.width && file.sauce?.height
                ? `, ${file.sauce.width}x${file.sauce.height}`
                : ''}
            </p>

            {/* The artist signed it; the manager should say so. */}
            {file.sauce && (file.sauce.title || file.sauce.author) && (
              <p className="text-sm text-content-primary font-topaz">
                {file.sauce.title || 'Untitled'}
                {file.sauce.author && ` by ${file.sauce.author}`}
                {file.sauce.group && ` of ${file.sauce.group}`}
                {file.sauce.date && (
                  <span className="text-content-secondary"> ({file.sauce.date})</span>
                )}
              </p>
            )}

            {/*
              What this file IS, before anything else. A path like
              Conf2/bull20.txt does not say "the bulletin a caller meets on
              joining Amiga Demoscene, if their security level is 20 to 24" -
              and that is the sentence a sysop or a designer needs.
            */}
            {file.readBy && file.readBy.length > 0 ? (
              <div className="text-sm">
                <h4 className="text-content-primary">Read by</h4>
                <ul className="text-content-secondary">
                  {file.readBy.map((reader: ScreenReaderShape, i: number) => (
                    <li key={i}>{describeReader(reader, data?.callersByLevel)}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-status-warn">
                No screen on this board reads this file - at any security level,
                in any screen type, and no other screen includes it.
              </p>
            )}

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
                  Replace <span className="font-topaz">{openFile}</span> with{' '}
                  <span className="font-topaz">{pendingUpload.name}</span>
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

            {file.problems && file.problems.length > 0 && (
              <ul className="text-sm text-status-warn">
                {file.problems.map((problem: string) => (
                  <li key={problem}>{describeProblem(problem)}</li>
                ))}
              </ul>
            )}

            {file.format === 'ansi' || file.format === 'text' ? (
              // The editor's own renderer, so the view and the edit cannot
              // disagree about what the file looks like.
              <ScreenArt content={file.content} />
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
                <ul className="font-topaz text-base">
                  {file.mci.map((ref: MciReferenceShape, i: number) => (
                    <li key={i} className={ref.resolves ? 'text-content-primary' : 'text-status-danger'}>
                      ~{ref.code}_{ref.target}
                      {ref.targetName && (
                        <span className="text-content-secondary"> - {ref.targetName}</span>
                      )}
                      {ref.resolves ? '' : ' - points at nothing'}
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
