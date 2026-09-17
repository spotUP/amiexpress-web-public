/**
 * Screen health: the reports, and the operations that touch the whole board.
 *
 * S7 of the screens rework. These lived as six tabs among eleven on the
 * Screens page, which made one route mean two jobs: an artist looking at
 * pictures and a sysop auditing 1,155 files. The sysop asked for the second
 * one to stop being in the artist's way ("only sysops should see files with no
 * art in them etc"), and the artist's page keeps the tabs that ARE art.
 *
 * Nothing here is new. The bodies are the same bodies, moved: Preview as a
 * caller, Commands and text, Not art, Codes, Duplicates, Read by nothing, and
 * the board-wide Export / Import / Repair. A row still opens the one dialog
 * every screen is opened through.
 */
import { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Gauge, AlertTriangle, Download, Upload } from 'lucide-react';

import { apiClient } from '../api/client';
import { useNotification } from '../contexts/NotificationContext';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { TabbedWorkspace, type TabDefinition } from '../components/ui/Tabs';
import { ArtistScreenDialog } from './ArtistScreenDialog';
import { ErrorPanel } from '../components/ui/states';
import { formatBytes } from '../lib/format';
import type { ArtistTheme } from './use-my-theme';
import {
  groupMciCodes, filterMciCodes, describeMciUsage,
  type MciCodeShape, type MciFamilyShape,
} from './screen-mci';
import {
  duplicateGroups, describeGroup, partitionDuplicates, type DuplicateGroup,
} from './screen-duplicates';
import {
  describeProblem, isDoorArt, isCommandsOnly, isNotArt,
  type ScreenFileShape, type ScreenIndexShape,
} from './screen-index-view';

/** Stable fallbacks: a fresh array each render invalidates the row model. */
const EMPTY_MCI: MciCodeShape[] = [];
const EMPTY_FAMILIES: MciFamilyShape[] = [];

export function ScreenHealthPage() {
  const queryClient = useQueryClient();
  const { showSuccess, showError, confirm } = useNotification();
  const [query, setQuery] = useState('');
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [importPlan, setImportPlan] = useState<{ path: string; action: string; bytes: number }[] | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const importInput = useRef<HTMLInputElement>(null);

  /**
   * Download through the API CLIENT, never through an `<a href>`.
   *
   * The endpoints below are behind the same auth as every other admin route,
   * and a link cannot carry an Authorization header - which is why clicking
   * Download used to answer `{"error":"Access token required"}`.
   */
  const downloadScreen = async (url: string, fallbackName: string) => {
    try {
      await apiClient.downloadFile(url, fallbackName);
    } catch (err) {
      showError(`Download failed: ${(err as Error).message}`);
    }
  };

  /*
   * THE BOARD'S OWN SCREENS, always. A theme is an artist's overlay and this
   * page is the board's audit - "1,155 files, 34 of them unique" is a fact
   * about the volume, not about what one caller is served.
   */
  const theme = 'default';
  const boardTheme: ArtistTheme = {
    slug: 'default', title: "The board's own", dir: '', mine: false, owner: '',
  } as ArtistTheme;

  const { data, isLoading, error } = useQuery({
    queryKey: ['screen-index', theme],
    queryFn: async () => (await apiClient.getScreenIndex(theme)).data as ScreenIndexShape,
  });

  /**
   * The MCI codes. Loaded with the page rather than on the tab, because the
   * count beside each code comes from the same index the tables are drawn
   * from and the answer is cached either way.
   */
  const { data: mci } = useQuery({
    queryKey: ['mci-catalog'],
    queryFn: async () => (await apiClient.getMciCatalog()).data as {
      families: MciFamilyShape[];
      codes: MciCodeShape[];
      enablingTilde: { uses: number; files: number };
    },
  });

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

  /**
   * Every damaged screen in one pass, after saying which ones and asking.
   *
   * 41 of this board's 47 are copies of one NODE_BULL.TXT, so one at a time is
   * forty clicks for a single decision - but it is still a write to forty
   * files, so the names come first and the sysop confirms them.
   */
  const repairAll = async () => {
    setFileError(null);

    try {
      const preview = await apiClient.repairAllScreens(true);
      const damaged: string[] = preview.data?.damaged ?? [];
      if (!damaged.length) {
        showSuccess('No screen on this board has colour codes missing their escape byte.');
        return;
      }

      const ok = await confirm({
        title: `Repair ${damaged.length} screen${damaged.length === 1 ? '' : 's'}?`,
        message: `${damaged.slice(0, 12).join(', ')}${damaged.length > 12 ? `, and ${damaged.length - 12} more` : ''}. Each is backed up beside itself first.`,
        confirmText: 'Repair them',
      });
      if (!ok) return;

      const res = await apiClient.repairAllScreens(false);
      const refused: { path: string; reason: string }[] = res.data?.refused ?? [];
      showSuccess(res.message ?? 'Repaired');
      if (refused.length) {
        setFileError(`Refused: ${refused.map(r => `${r.path} (${r.reason})`).join('; ')}`);
      }
      queryClient.invalidateQueries({ queryKey: ['screen-index'] });
      // Every thumbnail as well as the index: the gallery draws each card from
      // ['screen-file', path], and a repaired screen that still LOOKS broken
      // is the bug being fixed.
      queryClient.invalidateQueries({ queryKey: ['screen-file'] });
    } catch (error) {
      setFileError((error as Error).message);
      showError((error as Error).message);
    }
  };

  /**
   * The code list, in the catalog's family order and filtered by the same
   * search box as everything else on this page.
   */
  const mciSections = useMemo(
    () => groupMciCodes(filterMciCodes(mci?.codes ?? EMPTY_MCI, query), mci?.families ?? EMPTY_FAMILIES),
    [mci, query],
  );

  const mciColumns: DataTableColumn<MciCodeShape>[] = [
    {
      id: 'code',
      header: 'Code',
      value: row => row.code,
      sortable: true,
      mono: true,
      // The tilde and the terminator ARE part of the answer: `~CL.` written as
      // `~CL|` prints the letters "CL" at the caller.
      cell: (row: MciCodeShape) =>
        `${row.takesWidth ? '~[width]' : '~'}${row.code}`
        + (row.argument.kind === 'none' ? '' : `<${row.argument.label ?? row.argument.kind}>`)
        + row.terminator,
    },
    { id: 'summary', header: 'What it does', value: row => row.summary, sortable: true },
    {
      id: 'uses',
      header: 'On this board',
      value: row => row.uses,
      align: 'right',
      sortable: true,
      cell: (row: MciCodeShape) => describeMciUsage(row),
    },
    {
      // Where the code comes from, NOT the line it is implemented on: the
      // admin is a sysop's tool, and a file:line citation on screen was
      // reported once as comments left on the page.
      id: 'source',
      header: 'Comes from',
      value: row => (row.aliasOf ? `alias ${row.aliasOf}` : row.source === 'web' ? 'web' : 'amiexpress'),
      sortable: true,
      cell: (row: MciCodeShape) =>
        row.aliasOf
          ? `Another way to write ~${row.aliasOf}`
          : row.source === 'web' ? 'This board only' : 'AmiExpress',
    },
  ];

  /**
   * The board as pieces of art rather than as files.
   *
   * 1,155 screen files here and 34 of them unique. Original AmiExpress
   * addressed 32 nodes; this port addresses 255, which turns a per-node copy
   * from an annoyance into 800 files nobody can maintain by hand.
   */
  const duplicates = useMemo(() => (data ? duplicateGroups(data) : []), [data]);
  // The Duplicates tab shows the REAL exceptions - screens whose content drifted
  // across their copies - and auto-collapses the identical-across-nodes groups
  // (the expected "one screen on N nodes") into a summary line. `showAllDuplicates`
  // reveals those on demand.
  const [showAllDuplicates, setShowAllDuplicates] = useState(false);
  const { drifted, identicalCount } = useMemo(() => partitionDuplicates(duplicates), [duplicates]);

  const duplicateColumns: DataTableColumn<DuplicateGroup>[] = [
    { id: 'name', header: 'Screen', value: row => row.name, sortable: true, mono: true },
    {
      id: 'copies', header: 'Copies', value: row => row.fileCount, align: 'right', sortable: true,
    },
    {
      id: 'versions',
      header: 'Versions',
      value: row => row.versions.length,
      align: 'right',
      sortable: true,
      // More than one version of the same screen means somebody edited a few
      // copies and the rest drifted - which is the thing worth seeing.
      cell: (row: DuplicateGroup) => describeGroup(row),
    },
    {
      id: 'read',
      header: 'Who sees it',
      value: row => row.versions[0]?.readership ?? '',
      sortable: true,
      cell: (row: DuplicateGroup) => row.versions
        .map(v => `${v.readership}${row.uniform ? '' : ` (${v.paths.length})`}`)
        .join('; '),
    },
    {
      id: 'edit',
      header: '',
      cell: (row: DuplicateGroup) => row.versions[0]?.editPath ?? '',
      mono: true,
    },
  ];

  const commandColumns: DataTableColumn<ScreenFileShape>[] = [
    {
      id: 'path',
      header: 'File',
      sortable: true,
      value: item => item.relPath,
      cell: item => <span className="font-mono underline">{item.relPath}</span>,
    },
    {
      id: 'includes',
      header: 'Runs',
      sortable: true,
      value: item => item.mci?.length ?? 0,
      cell: item => (
        <span className="font-mono text-content-secondary">
          {(item.mci ?? []).map(ref => `~${ref.code}_${ref.target}`).join(' ') || 'no codes'}
        </span>
      ),
    },
    { id: 'bytes', header: 'Size', align: 'right', sortable: true, value: item => item.bytes,
      cell: item => formatBytes(item.bytes) },
  ];

  const unusedColumns: DataTableColumn<ScreenFileShape>[] = [
    {
      id: 'path',
      header: 'File',
      sortable: true,
      value: item => item.relPath,
      cell: item => <span className="font-mono underline">{item.relPath}</span>,
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
    /*
      NO DELETE ON THE ROW. It was a fourth copy of one act - the dialog a row
      opens carries the sysop's delete, worded for deleting the board's screen
      rather than dropping an artist's own. Two buttons for one job on one
      screen is the duplication this rework exists to remove.
    */
  ];


  const buckets = useMemo(() => {
    const all = Object.values(data?.files ?? {});
    return {
      door: all.filter(isDoorArt).sort((a, b) => a.relPath.localeCompare(b.relPath)),
      commands: all.filter(f => !isDoorArt(f) && isCommandsOnly(f))
        .sort((a, b) => a.relPath.localeCompare(b.relPath)),
      notArt: all.filter(f => !isDoorArt(f) && isNotArt(f))
        .sort((a, b) => a.relPath.localeCompare(b.relPath)),
    };
  }, [data]);

  const tabs: TabDefinition[] = [
    {
      id: 'commands',
      label: `Commands and text ${buckets.commands.length}`,
      render: () => (
        <div className="space-y-2 text-sm">
          <p className="text-content-secondary">
            Screens with no art in them - nothing but the codes the board runs.
            <span className="font-mono"> AWAITSCREEN.TXT </span> is one command;
            <span className="font-mono"> LOGON10.TXT </span> is a few includes
            and a pause. A sysop edits these to change what the board DOES. An
            artist should not: the picture is in the file these codes pull in,
            and the Includes column says which.
          </p>
          <DataTable
            columns={commandColumns}
            rows={buckets.commands.filter(item =>
              !query.trim() || item.relPath.toLowerCase().includes(query.trim().toLowerCase()))}
            getRowId={item => item.relPath}
            initialSort={[{ id: 'path', desc: false }]}
            isLoading={isLoading}
            error={error as Error | null}
            emptyMessage="Every screen on this board carries art of its own."
            onRowClick={item => setOpenFile(item.relPath)}
          />
        </div>
      ),
    },    {
      id: 'not-art',
      label: `Not art ${buckets.notArt.length}`,
      render: () => (
        <div className="space-y-2 text-sm">
          <p className="text-content-secondary">
            Leftovers, files the board rewrites for itself, and empty files.
            Listed so they can be found and deleted - never drawn in the
            gallery, because an edit here is either lost at the next write or
            changes nothing a caller sees.
          </p>
          <DataTable
            columns={unusedColumns}
            rows={buckets.notArt.filter(item =>
              !query.trim() || item.relPath.toLowerCase().includes(query.trim().toLowerCase()))}
            getRowId={item => item.relPath}
            initialSort={[{ id: 'bytes', desc: true }]}
            isLoading={isLoading}
            error={error as Error | null}
            emptyMessage="Nothing on this board is a leftover."
            onRowClick={item => setOpenFile(item.relPath)}
          />
        </div>
      ),
    },    {
      id: 'codes',
      label: `Codes ${mci?.codes?.length ?? 0}`,
      render: () => (
        <div className="space-y-3 text-sm">
          <p className="text-content-secondary">
            A screen file is a program: these are every code it can carry. The
            board runs all of them - the count beside each one says how many of
            YOUR files use it, and most of this list has never been tried here.
          </p>
          <p className="text-content-secondary">
            None of them run unless the file's FIRST line starts with a tilde.
            {' '}
            {mci?.enablingTilde ? `${mci.enablingTilde.files} of this board's files carry it.` : ''}
          </p>
          {mciSections.length === 0 && (
            <p className="text-content-secondary">No code matches that.</p>
          )}
          {mciSections.map(section => (
            <section key={section.family} className="space-y-1">
              <h3 className="text-content-primary">{section.label}</h3>
              <DataTable
                columns={mciColumns}
                rows={section.codes}
                getRowId={item => item.code}
                emptyMessage="No code matches that."
              />
            </section>
          ))}
        </div>
      ),
    },    {
      id: 'duplicates',
      label: `Duplicates ${drifted.length}`,
      render: () => (
        <div className="space-y-2 text-sm">
          <p className="text-content-secondary">
            The REAL exceptions: screens whose content DRIFTED across their
            copies - somebody edited a few nodes and the rest fell behind. The
            {' '}{identicalCount}{' '}screens that are identical across their nodes
            are the expected "one screen on N nodes" and are auto-collapsed out of
            this list; the board shares them, one edit reaching every copy.
          </p>
          <p className="text-content-secondary">
            Click a row to open the copy that callers actually see.
          </p>
          {(identicalCount > 0 || showAllDuplicates) && (
            <p className="text-content-secondary">
              {showAllDuplicates
                ? `Showing all ${duplicates.length} duplicate groups.`
                : `${identicalCount} more ${identicalCount === 1 ? 'screen is' : 'screens are'} identical across their nodes (auto-collapsible; hidden).`}
              {' '}
              <button
                type="button"
                className="underline text-content-secondary hover:text-content-primary"
                onClick={() => setShowAllDuplicates(v => !v)}
              >
                {showAllDuplicates ? 'show only drift' : 'show all'}
              </button>
            </p>
          )}
          <DataTable
            columns={duplicateColumns}
            rows={(showAllDuplicates ? duplicates : drifted).filter(g =>
              !query.trim() || g.name.toLowerCase().includes(query.trim().toLowerCase()))}
            getRowId={item => item.name}
            initialSort={[{ id: 'copies', desc: true }]}
            emptyMessage={showAllDuplicates
              ? 'Every screen on this board exists exactly once.'
              : 'No drift: every duplicated screen is identical across its copies.'}
            // The file is what opens. The share planner - "point every node at
            // one directory" - is still on the Screens page and moves here
            // with the rest of the board-wide operations; until it does,
            // there is nothing on THIS page for the screen name to arm.
            onRowClick={item => setOpenFile(item.versions[0]?.editPath ?? null)}
          />
        </div>
      ),
    },    {
      id: 'unused',
      // Files nothing resolves to. Not a screen list: these are files on the
      // volume that no screen, node or conference reads.
      label: `Read by nothing ${(data?.unused ?? []).filter(f => !isDoorArt(f)).length}`,
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
            rows={(data?.unused ?? []).filter(item => !isDoorArt(item))}
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
        <Gauge size={20} />
        <h1 className="text-xl text-content-primary">Screen health</h1>
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
        <button
          type="button"
          className="inline-flex items-center gap-1 underline"
          onClick={() => downloadScreen('/api/screens/export?scope=all', 'screens.zip')}
        >
          <Download size={14} /> Export every screen
        </button>
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
        <button className="inline-flex items-center gap-1 underline" onClick={repairAll}>
          <AlertTriangle size={14} /> Repair every damaged screen
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

      {fileError && <ErrorPanel message={fileError} />}
      {error && <ErrorPanel message={(error as Error).message} />}
      {isLoading && <p className="text-sm text-content-secondary">Reading the board...</p>}

      <TabbedWorkspace tabs={tabs} defaultTab="duplicates" />

      <ArtistScreenDialog
        path={openFile}
        theme={boardTheme}
        index={data}
        sysop
        onClose={() => setOpenFile(null)}
        onOpenPath={setOpenFile}
      />
    </div>
  );
}
