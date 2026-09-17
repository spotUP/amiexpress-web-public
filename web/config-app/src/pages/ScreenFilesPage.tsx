import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileImage, AlertTriangle, Download, Share2, Upload } from 'lucide-react';
import { apiClient, type ApiError } from '../api/client';
import { useNotification } from '../contexts/NotificationContext';
import { describeScreen } from './screen-descriptions';
import { callSitesFor } from './screen-provenance';
import { summariseShare, type ShareSummary } from './screen-share-view';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { TabbedWorkspace, type TabDefinition } from '../components/ui/Tabs';
import { ScreenPreviewPanel } from '../components/ScreenPreviewPanel';
import { ScreenGallery, type GalleryItem } from '../components/ScreenGallery';
import { ScreenThumbnail } from '../components/ScreenThumbnail';
import { formatBytes } from '../lib/format';
import { DoorArtDialog } from './DoorArtDialog';
import { ArtistScreenDialog } from './ArtistScreenDialog';
import { ErrorPanel } from '../components/ui/states';
import type { ArtistTheme } from './use-my-theme';
import { DoorArtSlot, settingKeyOf } from './DoorArtSlot';
import {
  groupMciCodes, filterMciCodes, describeMciUsage,
  type MciCodeShape, type MciFamilyShape,
} from './screen-mci';
import {
  duplicateGroups, describeGroup, partitionDuplicates, type DuplicateGroup,
} from './screen-duplicates';
import {
  toScreenRows, filterScreenRows,
  type ScreenIndexShape, type ScreenRow, type ScreenIndexEntryShape,
  type ScopeResolutionShape, type ConferenceShape,
  type ScreenFileShape, buildGalleryItems, describeProblem,
  formatsPresent, missingFormats,
  isDoorArt, isCommandsOnly, isNotArt,
} from './screen-index-view';

/** Stable fallback: a fresh array each render invalidates the row model. */
const EMPTY_ROWS: ScreenRow[] = [];
const EMPTY_MCI: MciCodeShape[] = [];
const EMPTY_FAMILIES: MciFamilyShape[] = [];

/**
 * What a scope is called, in the board's own words.
 *
 * "Conf2" means nothing to a designer, and a renumbered board makes it worse:
 * conference 1 lives in Conf2 here. The conference's NAME is what a sysop
 * recognises - "Amiga Demoscene" - so it leads, with the number behind it.
 */
/**
 * The conference a file sits in, named the way a sysop knows it.
 *
 * The DIRECTORY number is not the conference number - express.e reads
 * `LOCATION.n` from ConfConfig.info, and on this board conference 1 lives in
 * `Conf2` - so this matches the directory against what each conference
 * declares rather than parsing the digits out of the path.
 */
export function conferenceOfPath(
  relPath: string | null,
  conferences?: ConferenceShape[],
): string | null {
  if (!relPath) return null;

  const dir = relPath.split(/[\\/]/)[0];
  if (!/^Conf\d+$/i.test(dir)) return null;

  const named = (conferences ?? []).find(c => c.dir?.toLowerCase() === dir.toLowerCase());
  if (named) return `${named.name} (conference ${named.id})`;

  // The board did not say - name the directory rather than invent a number.
  return dir;
}

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






/**
 * The format chips' rule lives in `screen-index-view` beside the gallery it
 * serves; re-exported here because three suites and the file dialog have
 * always asked this module for it.
 */
export { formatsPresent, missingFormats };


export function ScreenFilesPage() {
  const queryClient = useQueryClient();
  const { showSuccess, showError, confirm } = useNotification();

  /**
   * Download through the API CLIENT, never through an `<a href>`.
   *
   * The endpoints below are behind the same auth as every other admin
   * route, and a link cannot carry an Authorization header - which is why
   * clicking Download used to answer `{"error":"Access token required"}`.
   */
  const downloadScreen = async (url: string, fallbackName: string) => {
    try {
      await apiClient.downloadFile(url, fallbackName);
    } catch (err) {
      showError(`Download failed: ${(err as Error).message}`);
    }
  };
  const [query, setQuery] = useState('');
  const [openScreen, setOpenScreen] = useState<string | null>(null);
  const [openFile, setOpenFile] = useState<string | null>(null);
  /**
   * The last failure from a board-wide action, shown on the page itself.
   *
   * It used to be rendered inside this page's own modal, which the one dialog
   * replaced. The actions that set it - repair, delete, the share planner -
   * are the page's, not the dialog's, so the message belongs on the page.
   */
  const [fileError, setFileError] = useState<string | null>(null);
  /**
   * A door's art block living inside its config file (Bulls' Title logo in
   * Bulls.CFG) — no screen path, so the file dialog cannot open it. Opened
   * in the door-art dialog on the same canvas instead.
   */
  const [openArt, setOpenArt] = useState<{
    command: string; doorName: string; file: string; section: string;
    label: string; maxLines: number; maxLineLength: number;
  } | null>(null);
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
  /**
   * Art on the volume that no screen, node, conference or bulletin reads.
   *
   * Off by default: "i see a lot of read by nothing in the gallery the artists
   * are not interested in those". It is still one checkbox away, and the whole
   * list has a tab of its own - a file the manager refuses to show is a file a
   * sysop cannot find.
   */
  const [showUnread, setShowUnread] = useState(false);
  const [importPlan, setImportPlan] = useState<{ path: string; action: string; bytes: number }[] | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);


  const detailRef = useRef<HTMLElement>(null);

  /**
   * Which theme the page is looking through. `default` is the board's own
   * screens; any other slug rebuilds the whole page - gallery, tables,
   * duplicates, preview - as a caller wearing that theme is served. Asked for
   * in these words: "a select button on the screen files page that lets the
   * user select among his themes and the gallery etc updates".
   */
  const [theme, setTheme] = useState('default');
  /*
   * The SAME key and the SAME shape as ScreenThemesPage's query.
   *
   * This cached the unwrapped payload while that page caches the ENVELOPE and
   * unwraps at the use site. React Query keys the cache, not the shape, so
   * whichever ran last won - and the Screens workspace opens on THIS tab, so
   * the themes page then read `data.data`, got undefined, and decided the
   * sysop could not create a theme. The New theme button vanished.
   */
  const { data: themeEnvelope } = useQuery({
    queryKey: ['screen-themes'],
    queryFn: () => apiClient.getScreenThemes(),
  });
  const themeList = (themeEnvelope as { data?: { themes?: Array<{ slug: string; title: string; status: string }> } } | undefined)?.data;
  /**
   * The theme the dialog is standing in, as an object.
   *
   * The page picks a theme by SLUG, in its "Viewing" selector; the dialog
   * takes the whole theme, because it names the theme in its own sentences
   * ("Redraw this in ..."). `default` is the board itself and has no entry in
   * the registry, which is why it is spelled out here rather than looked up.
   */
  const dialogTheme: ArtistTheme = useMemo(() => {
    const found = themeList?.themes?.find(t => t.slug === theme);
    if (found) return found as ArtistTheme;
    return {
      slug: 'default',
      title: "the board's own screens",
      status: 'live',
      dir: '',
      owner: '',
      screens: null,
      // A sysop on this page may write the board, which is what `default` is.
      mine: true,
    };
  }, [themeList, theme]);

  const themeTitle = theme === 'default'
    ? 'the board itself'
    : (themeList?.themes?.find(t => t.slug === theme)?.title ?? theme);

  const { data, isLoading, error } = useQuery({
    queryKey: ['screen-index', theme],
    // The routes answer `{ success, data, ... }`; every admin page reads `.data`.
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

  const { data: sharedDirs } = useQuery({
    queryKey: ['shared-screen-dirs'],
    queryFn: async () => (await apiClient.getSharedScreenDirs()).data as {
      directories: { dir: string; files: number }[];
    },
  });

  /**
   * Art blocks living inside door config files. Small and few (doors declare
   * them in their manifests), so loaded with the page like the MCI catalog.
   */
  const { data: doorArt } = useQuery({
    queryKey: ['door-art'],
    queryFn: async () => (await apiClient.listDoorArt()).data as Array<{
      command: string;
      name: string;
      sections: Array<{
        file: string; section: string; label: string; lines: number;
        maxLines: number; maxLineLength: number;
        // A slot backed by a whole FILE the door's setting names, rather than
        // a section of its config: it can be missing, and it has alternates.
        missing?: boolean;
        choices?: Array<{ file: string; lines: number }>;
      }>;
    }>,
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


  const entry: ScreenIndexEntryShape | undefined = data?.screens.find(s => s.screen === openScreen);





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



  const removeFile = async (target: string) => {
    /*
     * WHAT BREAKS, ASKED BEFORE THE DELETE RATHER THAN REPORTED AFTER IT.
     *
     * A screen is pulled into others by `~SS_BBS:screens/<name>`, and deleting
     * the target leaves them drawing nothing where the logo was - silently.
     * The sysop is being asked to decide, so he gets the count and what can be
     * tidied; the answer arriving with the DELETE would be a report, not a
     * decision.
     */
    let refs: Array<{ from: string; line: number; removable: boolean }> = [];
    try {
      const found = await apiClient.getScreenReferences(target);
      refs = found.data?.references ?? [];
    } catch {
      // A lookup failing must not block a delete; it only means the sysop
      // decides with less in front of him.
    }
    const removable = refs.filter(r => r.removable).length;
    const inline = refs.length - removable;
    const screens = [...new Set(refs.map(r => r.from))];

    const impact = refs.length === 0
      ? 'Nothing else on the board includes it.'
      : [
        `${screens.length} ${screens.length === 1 ? 'screen includes' : 'screens include'} it: ${screens.slice(0, 4).join(', ')}${screens.length > 4 ? ` and ${screens.length - 4} more` : ''}.`,
        removable > 0
          ? `${removable} of those ${removable === 1 ? 'line exists' : 'lines exist'} only to include it and will be removed - each file keeps a revision you can restore.`
          : '',
        inline > 0
          ? `${inline} ${inline === 1 ? 'is' : 'are'} inside a drawing and will be LEFT ALONE - those screens will draw a gap until you edit them.`
          : '',
      ].filter(Boolean).join(' ');

    const ok = await confirm({
      title: 'Delete this screen file?',
      message: `${target} will be backed up beside itself, then removed. ${impact}`,
      confirmText: removable > 0 ? `Delete and tidy ${removable} ${removable === 1 ? 'line' : 'lines'}` : 'Delete',
    });
    if (!ok) return;

    setFileError(null);

    try {
      const res = await apiClient.deleteScreenFile(target, removable > 0);
      const lost: string[] = res.data?.stopsResolving ?? [];
      const fixed: Array<{ file: string }> = res.data?.fixed ?? [];
      const tidied = fixed.length
        ? ` Tidied ${fixed.length} ${fixed.length === 1 ? 'screen' : 'screens'}.`
        : '';
      showSuccess((lost.length
        ? `Deleted. These stop resolving: ${lost.join(', ')}`
        : 'Deleted. Nothing stops resolving.') + tidied);
      setOpenFile(null);
      // Both queries: the index decides the tables, and the gallery is drawn
      // from the same answer.
      queryClient.invalidateQueries({ queryKey: ['screen-index'] });
      queryClient.invalidateQueries({ queryKey: ['screen-file', target] });
    } catch (error) {
      const status = (error as ApiError).status;
      const message = (error as Error).message;
      setFileError(status ? `${message} (HTTP ${status})` : message);
      showError(message);
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

  const columns: DataTableColumn<ScreenRow>[] = [
    {
      /*
       * The picture first, in every tab.
       *
       * Asked for directly: "it would be nice with thumbnails for all screen
       * files in all the tabs". A designer recognises the art and never the
       * path, and that was true of the gallery long before it was true of
       * these tables - the tables listed BBSTITLE, MENU, CONF_BULL and left a
       * person to guess which picture each one is.
       *
       * Affordable now: a thumbnail draws at thumbnail size and gives its
       * pixels back when it scrolls away, so a table of 872 rows costs what
       * is on screen rather than everything ever scrolled past.
       */
      id: 'art',
      header: 'Art',
      value: row => row.previewPath ?? '',
      cell: row => (
        row.previewPath
          ? (
            <div className="h-16 w-28 overflow-hidden bg-black">
              <ScreenThumbnail path={row.previewPath} scale={0.14} className="h-full" theme={theme} />
            </div>
          )
          // A screen that resolves nowhere has nothing to draw, and saying so
          // is the row's most important fact.
          : <span className="text-xs text-content-muted">nothing to draw</span>
      ),
    },
    {
      id: 'screen',
      header: 'Screen',
      value: row => row.screen,
      sortable: true,
      cell: row => (
        <span>
          <span className="font-mono text-content-primary">{row.screen}</span>
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
        <span className="font-mono">
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
        <span className="font-mono underline">{res.file}</span>
      ) : (
        <span className="text-status-warn">nothing resolves</span>
      )),
    },
    {
      id: 'variants',
      header: 'Variants',
      value: res => res.variants.join(' '),
      // Each variant OPENS. They were plain text, so a screen's PETSCII and RIP
      // variants were listed and unreachable - the row opened the file the
      // resolver picked, which for an ANSI caller is always the .txt. That is
      // why the board's .seq and .rip art looked absent from this page.
      cell: res => (
        <span className="font-mono space-x-2">
          {res.variants.map(variant => {
            const dir = (res.file ?? '').includes('/')
              ? (res.file as string).slice(0, (res.file as string).lastIndexOf('/') + 1)
              : '';
            const target = `${dir}${variant}`;
            return (
              <button
                key={variant}
                type="button"
                onClick={event => { event.stopPropagation(); setOpenFile(target); }}
                className="underline hover:text-content-primary transition-colors"
                title={`Open ${target}`}
              >
                {variant}
              </button>
            );
          })}
        </span>
      ),
    },
  ];

  /** The files nothing reads - a table, because a list of 400 paths is not one. */
  /**
   * A door's file, named by the door first: a sysop looking for "the art GWALL
   * draws" knows the door, never the path inside it.
   */
  const doorColumns: DataTableColumn<ScreenFileShape>[] = [
    { id: 'door', header: 'Door', sortable: true, value: item => item.door ?? '',
      cell: item => <span className="text-content-primary">{item.door}</span> },
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
  ];

  /**
   * A plumbing screen, with the codes it runs shown as the reason it holds no
   * art. The count is what tells a sysop whether it is one command or a whole
   * logon sequence.
   */
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
    {
      id: 'actions',
      header: '',
      align: 'right',
      cell: item => (
        <span className="flex items-center justify-end gap-3">
          <button
            className="underline text-status-danger"
            onClick={event => { event.stopPropagation(); removeFile(item.relPath); }}
          >
            Delete
          </button>
        </span>
      ),
    },
  ];

  const screenTable = (rows: ScreenRow[]) => (
    <DataTable
      columns={columns}
      /*
       * The same rule the gallery uses, so a screen cannot be art in one tab
       * and plumbing in the next. Asked for directly: "so the ansi artists
       * only see the screens they should touch".
       */
      rows={showGenerated ? rows : rows.filter(row => row.hasArt)}
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
  /** Which format the gallery's thumbnails are drawn in; empty is whatever
   *  each screen resolves to, which is how it behaved before the choice. */
  const [thumbnailFormat, setThumbnailFormat] = useState('');

  const galleryItems: GalleryItem[] = useMemo(
    () => (data
      ? buildGalleryItems(data, {
        theme, showGenerated, showUnread,
        ...(thumbnailFormat ? { thumbnailFormat } : {}),
      })
      : []),
    [data, showGenerated, showUnread, theme, thumbnailFormat],
  );

  /**
   * The three kinds of file that are NOT a piece of the board's art, each
   * with a tab of its own.
   *
   * Asked for together: door art apart from board art, "screens that have no
   * art only commands" in their own place, and a gallery holding "only valid
   * art that the artists actually should edit".
   */
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
            <label className="flex items-center gap-2 text-sm text-content-secondary">
              <input
                type="checkbox"
                checked={showUnread}
                onChange={e => setShowUnread(e.target.checked)}
              />
              Show art nothing reads
            </label>
            <label className="flex items-center gap-2 text-sm text-content-secondary">
              Draw as
              <select
                aria-label="Draw thumbnails as"
                className="input-field"
                value={thumbnailFormat}
                onChange={e => setThumbnailFormat(e.target.value)}
              >
                <option value="">What the screen resolves to</option>
                <option value="ansi">ANSI</option>
                <option value="petscii">PETSCII (.seq)</option>
                <option value="rip">RIP</option>
                <option value="teletext">Teletext (.ttx)</option>
              </select>
            </label>
          </div>
          <ScreenGallery
            isLoading={isLoading}
            items={query.trim()
              ? galleryItems.filter(item =>
                  item.label.toLowerCase().includes(query.trim().toLowerCase())
                  || item.path.toLowerCase().includes(query.trim().toLowerCase()))
              : galleryItems}
            onOpen={setOpenFile}
            theme={theme}
          />
        </div>
      ),
    },
    {
      id: 'preview',
      label: 'Preview as a caller',
      render: () => (
        <ScreenPreviewPanel
          theme={theme}
          themeTitle={themeTitle}
          screenNames={(data?.screens ?? []).map(entry => entry.screen)}
        />
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
      id: 'doors',
      label: `Door screens ${buckets.door.length}`,
      render: () => (
        <div className="space-y-2 text-sm">
          <p className="text-content-secondary">
            Art that belongs to a door, not to the board. A door opens these
            files itself, so none of the board's screen rules reach them: no
            security variants, no per-node or per-conference copies, no
            <span className="font-mono"> .GR </span> routing. Editing one
            changes what that door draws, and nothing else.
          </p>
          {(Array.isArray(doorArt) ? doorArt : []).map(door => (
            <div key={door.command} className="border border-border rounded p-2 space-y-1">
              <p className="text-content-primary">
                <span className="font-mono">{door.command}</span>
                <span className="text-content-secondary"> — {door.name}</span>
              </p>
              {door.sections.map(section => settingKeyOf(section.section) !== null ? (
                <DoorArtSlot
                  key={`${section.file}#${section.section}`}
                  command={door.command}
                  slot={section}
                  onOpen={slot => setOpenArt({
                    command: door.command, doorName: door.name,
                    file: slot.file, section: slot.section, label: slot.label,
                    maxLines: slot.maxLines, maxLineLength: slot.maxLineLength,
                  })}
                />
              ) : (
                <div key={`${section.file}#${section.section}`} className="flex flex-wrap items-center gap-2 pl-2">
                  <span className="text-content-primary">{section.label}</span>
                  <span className="font-mono text-xs text-content-secondary">
                    {section.file} [{section.section}] — {section.lines} of {section.maxLines} lines
                  </span>
                  <button
                    onClick={() => setOpenArt({
                      command: door.command, doorName: door.name,
                      file: section.file, section: section.section, label: section.label,
                      maxLines: section.maxLines, maxLineLength: section.maxLineLength,
                    })}
                    className="px-2 py-1 text-accent hover:underline text-sm"
                  >
                    Open in ANSI editor
                  </button>
                </div>
              ))}
            </div>
          ))}
          <DataTable
            columns={doorColumns}
            rows={buckets.door.filter(item =>
              !query.trim() || item.relPath.toLowerCase().includes(query.trim().toLowerCase()))}
            getRowId={item => item.relPath}
            initialSort={[{ id: 'door', desc: false }]}
            isLoading={isLoading}
            error={error as Error | null}
            emptyMessage="No installed door ships art of its own."
            onRowClick={item => setOpenFile(item.relPath)}
          />
        </div>
      ),
    },
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
    },
    {
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
    },
    {
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
    },
    {
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
            onRowClick={item => {
              // Both: the file is what opens, and the SCREEN is what makes the
              // fan-out able to offer sharing - pointing every node at one
              // directory, which is the fix that makes the next edit one file
              // instead of eighty.
              setOpenFile(item.versions[0]?.editPath ?? null);
              setOpenScreen(item.screen ?? null);
            }}
          />
        </div>
      ),
    },
    {
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
        <FileImage size={20} />
        <h1 className="text-xl text-content-primary">Screen Files</h1>
        <label htmlFor="screen-theme-select" className="label ml-2">Viewing</label>
        <select
          id="screen-theme-select"
          className="input-field"
          value={theme}
          onChange={e => { setTheme(e.target.value); setOpenScreen(null); setOpenFile(null); }}
        >
          <option value="default">The board (default)</option>
          {(themeList?.themes ?? []).filter(t => t.slug !== 'default').map(t => (
            <option key={t.slug} value={t.slug}>{t.title}{t.status !== 'live' ? ` (${t.status})` : ''}</option>
          ))}
        </select>
        {data && (
          <span className="text-sm text-content-secondary">
            {Object.keys(data.files).length} files, {data.unused.length} read by nothing
          </span>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-4">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search screens"
          className="input-field w-full max-w-sm"
        />
        {/*
          Page-wide, not per tab. The filter applies to the gallery AND the
          three screen tables, so a control that lived in the gallery left a
          sysop on the Node tab with rows hidden and no way to say otherwise.
        */}
        <label className="flex items-center gap-2 text-sm text-content-secondary">
          <input
            type="checkbox"
            checked={showGenerated}
            onChange={e => setShowGenerated(e.target.checked)}
          />
          Show plumbing: screens that are only codes, leftovers, and files the
          board writes
        </label>
      </div>

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

      {/*
        This page is itself a tab of the Screens workspace, so its own strip
        owns a DIFFERENT key. Sharing `tab` meant clicking any tab here wrote a
        value the workspace strip did not recognise, which sent the workspace
        back to its default and made these tabs impossible to link to.
      */}
      {fileError && (
        <ErrorPanel message={fileError} onRetry={() => setFileError(null)} />
      )}

      <TabbedWorkspace tabs={tabs} param="view" />

      {entry && (
        <section className="space-y-2" ref={detailRef} data-testid="screen-detail">
          <h2 className="text-lg text-content-primary">
            <span className="font-mono">{entry.screen}</span>
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
              setFileError(null);
              /*
               * OPENING IS ALL THIS DOES NOW.
               *
               * It used to decide, from the file's format, whether to route
               * into an editor - and the list it decided from is how a .seq
               * row came to open read-only with no way onward ("no editor,
               * just a preview", sysop 2026-09-14). The dialog knows its own
               * formats and says in a sentence what it can do with each, so
               * a caller no longer has to know before it opens.
               */
              setOpenFile(res.file);
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
        ONE DIALOG OVER A SCREEN, and this page used to carry a second.
        `ArtistScreenDialog` already renders the identity, the sentence naming
        what the slot is, and every way forward - and it already takes `sysop`,
        `auditing` and `onSwitchTheme`, because it was built to be the sysop's
        dialog too. This page's own modal answered the same questions by
        different rules: an inspector, a format strip, three editor mounts and
        a fan-out write picker, roughly seven hundred lines of them.

        "two dialogs over the same files, behind two levels of tabs, answering
        the same question by different rules" - the diagnosis in
        thoughts/shared/plans/2026-09-14-screens-one-page-one-dialog-design.md,
        whose step 3 this is.
      */}
      <ArtistScreenDialog
        path={openFile}
        theme={dialogTheme}
        index={data}
        sysop
        onClose={() => setOpenFile(null)}
        onOpenPath={setOpenFile}
        onSwitchTheme={setTheme}
        auditing={theme !== 'default'}
      />


      {openArt && (
        <DoorArtDialog
          command={openArt.command}
          doorName={openArt.doorName}
          file={openArt.file}
          section={openArt.section}
          label={openArt.label}
          maxLines={openArt.maxLines}
          maxLineLength={openArt.maxLineLength}
          onClose={() => setOpenArt(null)}
        />
      )}

    </div>
  );
}
