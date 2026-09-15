import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileImage, AlertTriangle, Download, Share2, Upload, Trash2, Pencil, History } from 'lucide-react';
import { apiClient, type ApiError } from '../api/client';
import { useNotification } from '../contexts/NotificationContext';
import {
  everyCopyOption,
  fanOutOptions,
  writeEverywhereLabel,
  type FanOutOption,
} from './screen-write-plan';
import { describeScreen } from './screen-descriptions';
import { callSitesFor } from './screen-provenance';
import { summariseShare, type ShareSummary } from './screen-share-view';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { TabbedWorkspace, type TabDefinition } from '../components/ui/Tabs';
import { ScreenArt } from '../components/ScreenArt';
import { ScreenPreviewPanel } from '../components/ScreenPreviewPanel';
import { ScreenGallery, type GalleryItem } from '../components/ScreenGallery';
import { ScreenThumbnail } from '../components/ScreenThumbnail';
import { formatBytes } from '../lib/format';
import { ScreenEditor } from '../components/ScreenEditor';
import { RipScreenEditor } from '../components/RipScreenEditor';
import { PetsciiScreenEditor } from '../components/PetsciiScreenEditor';
import { CodeChip } from '../components/CodeChip';
import { Modal } from '../components/ui/Modal';
import { ScreenRevisionsPanel } from './ScreenRevisionsPanel';
import { DoorArtDialog } from './DoorArtDialog';
import { DoorArtSlot, settingKeyOf } from './DoorArtSlot';
import { screenToCanvas } from './screen-bytes';
import { createSurface, type EditorSurface } from './screen-editor-state';
import {
  groupMciCodes, filterMciCodes, describeMciUsage, describeCarry,
  type MciCodeShape, type MciFamilyShape, type CarryVerdict,
} from './screen-mci';
import {
  duplicateGroups, describeGroup, partitionDuplicates, type DuplicateGroup,
} from './screen-duplicates';
import {
  toScreenRows, filterScreenRows,
  type ScreenIndexShape, type ScreenRow, type ScreenIndexEntryShape,
  type ScopeResolutionShape, type ConferenceShape, type ScreenReaderShape,
  type MciReferenceShape, type ScreenFileShape, buildGalleryItems, describeReader, describeProblem,
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
 * The other FORMATS of the screen that is open, from the index.
 *
 * A screen is one thing a caller sees and several files: `BBSTITLE.txt` for an
 * ANSI caller, `BBSTITLE.SEQ` for a C64, `bbstitle.rip` for RIPscrip. Those are
 * one axis and belong in a tab strip.
 *
 * SECURITY LEVEL IS A DIFFERENT AXIS AND IS DELIBERATELY NOT HERE. `MENU250` is
 * not "the RIP version of MENU" - it is the menu a level-250 caller gets, its
 * own screen with its own formats. Putting the two on one strip would have a
 * sysop editing the sysop menu believing they were switching format.
 */
function formatSiblings(
  openPath: string | null,
  screens: Array<{ resolutions: Array<{ variants: string[] }> }> | undefined,
): string[] {
  if (!openPath) return [];
  const name = openPath.slice(openPath.lastIndexOf('/') + 1).toLowerCase();
  const dir = openPath.slice(0, openPath.lastIndexOf('/') + 1);

  for (const entry of screens ?? []) {
    for (const res of entry.resolutions) {
      if (res.variants.some(v => v.toLowerCase() === name)) {
        return res.variants.map(v => `${dir}${v}`);
      }
    }
  }
  return [];
}



/** `BBSTITLE.SEQ` -> `PETSCII`, for a tab a designer can read. */
function formatLabel(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.seq')) return 'PETSCII';
  if (lower.endsWith('.rip')) return 'RIP';
  if (lower.endsWith('.gr')) return 'Amiga ANSI';
  /*
   * Teletext is not "ANSI / text", and saying so put TWO tabs with the same
   * name on one screen - Node0 carries BBSTITLE.txt and BBSTITLE.ttx, and the
   * sysop had no way to tell which tab was which (2026-09-14). `.ttx` is this
   * board's ANSI teletext, drawn like ANSI by the TDAText face; `.tti` is
   * native packet-level teletext, which is listed and never parsed here.
   */
  if (lower.endsWith('.ttx')) return 'Teletext';
  if (lower.endsWith('.tti')) return 'Teletext (native)';
  if (lower.endsWith('.ibm')) return 'IBM ANSI';
  return 'ANSI / text';
}

/** The last segment of a board path, for a download's fallback filename. */
function baseName(filePath: string): string {
  const parts = filePath.split(/[\\/]/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : 'screen.txt';
}

/**
 * The format chips' rule lives in `screen-index-view` beside the gallery it
 * serves; re-exported here because three suites and the file dialog have
 * always asked this module for it.
 */
export { formatsPresent, missingFormats };

/**
 * The write that has only one destination: it happens, and says so.
 *
 * Rendered instead of the "where?" dialog when the fan-out offers a single
 * target. It fires ONCE - a write is not idempotent and a re-render must not
 * repeat it - and shows a line of text while it does, so the save is not a
 * silent nothing between pressing Save and the panel closing.
 */
function SingleDestinationWrite(
  { option, onDone }: { option: FanOutOption; onDone: (option: FanOutOption) => void | Promise<void> },
) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    void onDone(option);
  }, [option, onDone]);

  return (
    <p className="p-4 text-sm text-content-secondary">Saving...</p>
  );
}

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
   * A door's art block living inside its config file (Bulls' Title logo in
   * Bulls.CFG) — no screen path, so the file dialog cannot open it. Opened
   * in the door-art dialog on the same canvas instead.
   */
  const [openArt, setOpenArt] = useState<{
    command: string; doorName: string; file: string; section: string;
    label: string; maxLines: number; maxLineLength: number;
  } | null>(null);
  const [pendingUpload, setPendingUpload] = useState<{ bytes: string; name: string } | null>(null);
  /**
   * Whether the "what is this file" control is showing on a file the manager
   * already reads as art. It is the rare correction, so it is not on screen
   * until the sysop says the guess is wrong.
   */
  const [kindOpen, setKindOpen] = useState(false);
  /** The sibling path a chosen file will be written to as a NEW format of the open screen. */
  const [addingFormat, setAddingFormat] = useState<{ ext: string; label: string; path: string } | null>(null);
  const addFormatInput = useRef<HTMLInputElement | null>(null);
  /**
   * What replacing this file would do to its MCI codes, from the board's own
   * dry run - and what the sysop chose to do about it.
   *
   * A screen is a program, and an ANSI editor writes no `~CC_`. Replacing a
   * file used to drop every code in it without a word: the menu still painted
   * and the keys stopped working.
   */
  const [carryVerdict, setCarryVerdict] = useState<CarryVerdict | null>(null);
  const [carryCodes, setCarryCodes] = useState<'none' | 'above' | 'below'>('above');
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
  /**
   * Art on the volume that no screen, node, conference or bulletin reads.
   *
   * Off by default: "i see a lot of read by nothing in the gallery the artists
   * are not interested in those". It is still one checkbox away, and the whole
   * list has a tab of its own - a file the manager refuses to show is a file a
   * sysop cannot find.
   */
  const [showUnread, setShowUnread] = useState(false);
  /**
   * Why the last action on the open file failed.
   *
   * Reported as "i deleted a screen file but the dialog did not close and the
   * gallery was not refreshed" - which is what a REFUSED delete looks like:
   * the toast says why and then goes away, and the dialog is still sitting
   * there with the file in it. The reason belongs where the action was taken.
   */
  const [fileError, setFileError] = useState<string | null>(null);
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
  /**
   * A .rip screen open in the RIP editor.
   *
   * Kept apart from `editing` because the two editors hold different things:
   * the ANSI one owns a canvas of cells, the RIP one owns a parsed document.
   * A .rip file has no cells - it is a vector program - so routing it into
   * the ANSI editor would show a blank 80x25 and save that over the artwork.
   */
  const [editingRip, setEditingRip] = useState(false);
  const [editingPetscii, setEditingPetscii] = useState(false);

  /**
   * Put every editor away.
   *
   * Three booleans decide which editor is mounted and nothing cleared them
   * together, so one left set by a previous file outlived the file it was
   * editing.
   */
  const closeEditors = () => {
    setEditing(null);
    setEditingRip(false);
    setEditingPetscii(false);
    setEditorWrite(false);
  };

  /**
   * AN EDITOR BELONGS TO THE FILE IT WAS OPENED FOR.
   *
   * Clearing them by hand at each place the open file changes is the shape
   * that failed: there are ten such places, `closeEditors` was called from
   * one, and the modal's own onClose cleared two of the three booleans -
   * PETSCII was added last and that list never grew. So an artist who edited
   * a `.seq`, closed the dialog and opened anything else got the PETSCII
   * editor over the new file's bytes, with no format strip to leave by, and a
   * Save would have written C64 screen codes over their ANSI.
   *
   * Reported by the sysop on `Utils/samilog/samilog.header.txt.gr`
   * (2026-09-14): "samilog opened as petscii and there are no buttons to
   * switch after i had nother petscii screen loaded before".
   *
   * Binding it to the open file makes the stale case unreachable rather than
   * merely handled: the editor that opens next is the one the routing effect
   * below chooses for THIS file.
   */
  useEffect(() => { closeEditors(); }, [openFile]);
  const detailRef = useRef<HTMLElement>(null);
  const [showRevisions, setShowRevisions] = useState(false);

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

  const { data: file } = useQuery({
    // Through the theme being VIEWED: a theme's own file is read by nothing in
    // the board's index, which is why every redrawn screen used to claim "No
    // screen on this board reads this file".
    queryKey: ['screen-file', openFile, theme],
    queryFn: async () => (await apiClient.getScreenFile(openFile as string, theme)).data,
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
    // Routed by FORMAT, because the four screen types are different media and
    // one editor cannot serve them: a .rip is a vector program, a .seq is
    // PETSCII bytes, ANSI and plain text are cells.
    if (file.format === 'rip') {
      setEditing(null);
      setEditingPetscii(false);
      setEditingRip(true);
      setPendingEdit(null);
      return;
    }
    if (file.format === 'petscii') {
      setEditing(null);
      setEditingRip(false);
      // A .seq is screen codes and colour RAM, not cells - so it does not go
      // through screenToCanvas below, the same way a .rip does not.
      setEditingPetscii(true);
      setPendingEdit(null);
      return;
    }
    if (file.format !== 'ansi' && file.format !== 'text') {
      // Nothing here edits it, and whatever is open belongs to another file:
      // it must not stay on screen over this one.
      setEditing(null);
      setPendingEdit(null);
      return;
    }
    setEditingRip(false);
    setEditingPetscii(false);

    let cancelled = false;
    screenToCanvas(file.content).then(canvas => {
      if (cancelled) return;
      setEditing(createSurface(canvas));
      setPendingEdit(null);
    });
    return () => { cancelled = true; };
  }, [pendingEdit, file, openFile]);

  const entry: ScreenIndexEntryShape | undefined = data?.screens.find(s => s.screen === openScreen);

  /**
   * The fan-out choices for whatever file is open.
   *
   * `openScreen` is set by a row in the tables and NOT by the gallery, and the
   * gallery is how a designer reaches a screen. Without a screen name there
   * were no options at all, so a replacement picked from the gallery had
   * nothing to click: the file was chosen and the write could not be applied.
   * `fanOutOptions` always offers "this file only", so the name is passed as
   * empty rather than the whole list being skipped.
   */
  const options: FanOutOption[] = useMemo(
    () => (data && openFile ? fanOutOptions(data, openScreen ?? '', openFile) : []),
    [data, openScreen, openFile],
  );

  /*
   * What the page DOES, and what it merely offers.
   *
   * A screen exists once per node because AmiExpress keeps it that way, not
   * because a sysop wants forty-one different titles, so writing every copy
   * is the action and the rest are alternatives beside it.
   */
  const everyCopy = useMemo(() => everyCopyOption(options), [options]);
  const otherWrites = useMemo(
    () => options.filter(option => option.choice !== everyCopy?.choice),
    [options, everyCopy],
  );

  /** Every destination the save could go to, the write-everywhere one first. */
  const writeOptions = useMemo(
    () => [...(everyCopy ? [everyCopy] : []), ...otherWrites],
    [everyCopy, otherWrites],
  );

  /** Read the chosen file as base64 - bytes, never text, all the way through. */
  const readAsBase64 = (chosen: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
      reader.readAsDataURL(chosen);
    });

  /**
   * Ask the board what replacing this file would do to its codes.
   *
   * A dry run: it answers 200 with the verdict and writes nothing, so it is
   * safe to run the moment a file is picked and before anything is chosen.
   * The verdict is for the file being replaced; every other target of a
   * fan-out keeps its OWN codes, which is the board's rule and not this
   * page's.
   */
  const previewCarry = async (filePath: string, bytes: string) => {
    try {
      const res = await apiClient.putScreenFile(filePath, bytes, [filePath], {
        carryCodes: 'above',
        dryRun: true,
      });
      setCarryVerdict((res.data?.targets ?? [])[0] ?? null);
    } catch {
      // A verdict is an aid, not a gate. If the board cannot answer, the
      // replace still works exactly as it did before this existed.
      setCarryVerdict(null);
    }
  };

  /**
   * Write a chosen file as the open screen's missing format - to every node
   * that has the open file, so a .seq added to BBSTITLE reaches all forty
   * copies and not only Node1's. No MCI carry: there is no existing file of
   * this format to carry from.
   */
  const addFormat = async (chosen: File) => {
    if (!addingFormat || !openFile) return;
    try {
      const bytes = await readAsBase64(chosen);
      // The same rule the upload uses, so a new format lands on the same set
      // of files the sysop would have written the screen itself to.
      const copies = everyCopy?.targets ?? [openFile];
      const swap = (p: string) => p.replace(/\.[^./]+$/, '') + '.' + addingFormat.ext;
      const targets = [...new Set(copies.map(swap))];
      await apiClient.putScreenFile(addingFormat.path, bytes, targets, { carryCodes: 'none' });
      showSuccess(`Added the ${addingFormat.label} version - ${targets.length} file${targets.length === 1 ? '' : 's'}`);
      queryClient.invalidateQueries({ queryKey: ['screen-index'] });
      setOpenFile(addingFormat.path);
    } catch (error) {
      showError((error as Error).message);
    } finally {
      setAddingFormat(null);
    }
  };

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
      // Per target: node 1's copy names Node1 and node 7's names Node7, so the
      // board reads each target's own file rather than one plan for all.
      await apiClient.putScreenFile(openFile, pendingUpload.bytes, targets, { carryCodes });
      showSuccess(`Wrote ${targets.length} file${targets.length === 1 ? '' : 's'}`);
      setPendingUpload(null);
      setCarryVerdict(null);
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
   * What the sysop says a file IS, over what the manager guessed.
   *
   * The classification is a heuristic - by name, and by the signature of the
   * tool that writes a file - and this board has been told once already that
   * its live screens were read by nothing.
   */
  const flagFile = async (target: string, flag: 'backup' | 'runtime' | 'art' | null) => {
    try {
      const res = await apiClient.flagScreen(target, flag);
      showSuccess(res.message ?? 'Marked');
      queryClient.invalidateQueries({ queryKey: ['screen-index'] });
      queryClient.invalidateQueries({ queryKey: ['screen-file', target] });
    } catch (error) {
      showError((error as Error).message);
    }
  };

  const repairFile = async (target: string) => {
    setFileError(null);

    try {
      const res = await apiClient.repairScreenFile(target);
      showSuccess(res.message ?? 'Repaired');
      queryClient.invalidateQueries({ queryKey: ['screen-index'] });
      queryClient.invalidateQueries({ queryKey: ['screen-file', target] });
    } catch (error) {
      const status = (error as ApiError).status;
      setFileError(status ? `${(error as Error).message} (HTTP ${status})` : (error as Error).message);
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

      <TabbedWorkspace tabs={tabs} />

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
              setOpenFile(res.file);
              const format = data?.files[res.file]?.format;
              // `petscii` joined this list on 2026-09-14, when a PETSCII
              // editor first existed to route to. Without it a .seq row
              // opened the read-only view and there was no way onward, which
              // reads as "no editor, just a preview" (sysop, same day).
              if (format === 'ansi' || format === 'text' || format === 'rip' || format === 'petscii') {
                setPendingEdit(res.file);
              }
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
          // Closing clears the open file; the effect above puts the editors
          // away. This used to list them itself and miss PETSCII.
          setOpenFile(null);
          setPendingUpload(null);
        }}
      >
        {/*
          The format strip lives ABOVE the editor modes, not inside the
          read-only view: clicking a file opens it straight into the editor,
          and a sysop drawing BBSTITLE's ANSI is exactly the person who needs
          "+ PETSCII" and "+ RIP" in front of them.
        */}
        {openFile && file && !pendingUpload && (
          <>
        {(formatSiblings(openFile, data?.screens).length > 1
          || missingFormats(openFile, formatSiblings(openFile, data?.screens)).length > 0) && (
          <div className="flex flex-wrap gap-1 border-b border-surface-3 pb-2" role="tablist">
            {formatSiblings(openFile, data?.screens).map(sibling => (
              <button
                key={sibling}
                type="button"
                role="tab"
                aria-selected={sibling === openFile}
                /*
                 * A TAB ROUTES LIKE A ROW DOES.
                 *
                 * It used only to change the open file, so whichever editor
                 * was already on screen stayed: open an ANSI screen, click the
                 * PETSCII tab, and the ANSI editor was still mounted, drawing
                 * the .seq bytes as text - "petscii selected it shows ansi"
                 * (sysop, 2026-09-14), the PETSCII art arriving as scattered
                 * dots. The FORMAT decides the editor, so changing format has
                 * to re-decide it.
                 */
                onClick={() => { closeEditors(); setOpenFile(sibling); setPendingEdit(sibling); }}
                className={
                  sibling === openFile
                    ? 'px-3 py-1 text-sm rounded-t bg-surface-3 text-content-primary'
                    : 'px-3 py-1 text-sm rounded-t text-content-secondary hover:text-content-primary transition-colors'
                }
                title={sibling}
              >
                {formatLabel(sibling)}
              </button>
            ))}
            {!isDoorArt(file) && missingFormats(openFile, formatSiblings(openFile, data?.screens)).map(missing => (
              <button
                key={missing.ext}
                type="button"
                className="px-3 py-1 text-sm rounded-t text-content-secondary hover:text-content-primary transition-colors border border-dashed border-surface-3"
                title={`Upload a .${missing.ext} file as ${missing.path}`}
                onClick={() => { setAddingFormat(missing); addFormatInput.current?.click(); }}
              >
                + {missing.label}
              </button>
            ))}
            <input
              ref={addFormatInput}
              type="file"
              data-testid="screen-add-format"
              className="hidden"
              accept={addingFormat ? `.${addingFormat.ext}` : undefined}
              onChange={async e => {
                const chosen = e.target.files?.[0];
                e.target.value = '';
                if (chosen) await addFormat(chosen);
              }}
            />
          </div>
        )}
          </>
        )}
        {editingRip && !pendingUpload && file && (
          <RipScreenEditor
            content={file.content}
            filePath={openFile ?? undefined}
            // The same exit an ANSI edit takes: bytes into the fan-out, with
            // the same backup, the same targets and the same refusals. A RIP
            // screen is not a second write path.
            onSave={bytes => {
              setPendingUpload({ bytes, name: 'the edited screen' });
              setEditorWrite(true);
            }}
            onCancel={() => { setEditingRip(false); setEditorWrite(false); }}
          />
        )}

        {editingPetscii && !pendingUpload && file && (
          <PetsciiScreenEditor
            content={file.content}
            filePath={openFile ?? undefined}
            mci={file.mci ?? []}
            // The same exit every other edit takes: bytes into the fan-out,
            // with the same backup, the same targets and the same refusals.
            // A PETSCII screen is not a second write path.
            onSave={bytes => {
              setPendingUpload({ bytes, name: 'the edited screen' });
              setEditorWrite(true);
            }}
            onCancel={() => { setEditingPetscii(false); setEditorWrite(false); }}
          />
        )}

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
            onDownload={
              openFile
                ? () =>
                    downloadScreen(
                      `/api/screens/file?path=${encodeURIComponent(openFile)}&download=1`,
                      baseName(openFile),
                    )
                : undefined
            }
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

        {/*
          A QUESTION WITH ONE ANSWER IS NOT A QUESTION.
      
          The editor saves through the upload's fan-out on purpose - same
          backup, same refusals, no second write path - and that fan-out asks
          WHERE because most screens on this board exist in many copies (forty
          one nodes, a theme's mirror). A file that has exactly one copy has
          nothing to choose: `Utils/samilog/samilog.header.txt.gr` offered a
          single button reading "Write this file" and then a way back, which
          the sysop met as "why does it ask this???" (2026-09-14).
      
          So one destination writes itself and the dialog never opens. Two or
          more still ask, because then the answer matters.
        */}
        {editorWrite && pendingUpload && writeOptions.length === 1 && (
          <SingleDestinationWrite
            option={writeOptions[0]}
            onDone={async option => {
              await applyWrite(option);
              setEditing(null);
              setEditorWrite(false);
              setOpenFile(null);
            }}
          />
        )}

        {editorWrite && pendingUpload && writeOptions.length > 1 && (
          <div className="space-y-2 p-4">
            <p className="text-sm text-content-primary">
              Write <span className="font-mono">{openFile}</span> where?
            </p>
            {writeOptions.map((option, at) => (
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
                {at === 0 && everyCopy ? writeEverywhereLabel(option) : option.label}
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
        {openFile && !file && !editing && (
          <div className="p-4 space-y-2" data-testid="file-skeleton">
            <div className="h-3 w-1/3 animate-pulse rounded bg-surface-2" />
            <div className="h-40 animate-pulse bg-surface-2" />
          </div>
        )}

        {openFile && file && !editing && !editingRip && !editingPetscii && !editorWrite && (
          <div className="space-y-3 p-4">
            {/*
              One tab per FORMAT of this screen. Before this the other formats
              were listed as text in the table and could not be opened at all,
              so a board's PETSCII and RIP art was invisible here.
            */}
            {fileError && (
              <p className="text-sm text-status-danger">
                That did not work: {fileError}
              </p>
            )}
            {/*
              Which conference this file belongs to, by NAME.
              `Conf3/bull20.txt` says nothing about which board section a
              designer is about to replace - and the directory number is not
              the conference number: on this board conference 1 lives in
              Conf2. The name is the only thing a sysop recognises.
            */}
            {conferenceOfPath(openFile, data?.conferences) && (
              <p className="text-sm text-content-primary">
                {conferenceOfPath(openFile, data?.conferences)}
              </p>
            )}
            <p className="text-sm text-content-secondary">
              {file.bytes} bytes, {file.format}
              {file.sauce?.width && file.sauce?.height
                ? `, ${file.sauce.width}x${file.sauce.height}`
                : ''}
            </p>

            {/* The artist signed it; the manager should say so. */}
            {file.sauce && (file.sauce.title || file.sauce.author) && (
              <p className="text-sm text-content-primary">
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
              file.theme && theme !== file.theme ? (
                <p className="text-sm text-content-secondary">
                  Belongs to the theme <span className="font-mono">{file.theme}</span> - shown to
                  callers wearing it in place of the board&apos;s screen. Select that theme above to
                  see exactly where it is served.
                </p>
              ) : (
                <p className="text-sm text-status-warn">
                  No screen on this board reads this file - at any security level,
                  in any screen type, and no other screen includes it.
                  {theme !== 'default' && (
                    <> Looked at through <span className="font-mono">{theme}</span>; the board&apos;s
                    own view may read it.</>
                  )}
                </p>
              )
            )}

            <div className="flex items-center gap-3 text-sm">
              <input
                ref={uploadInput}
                type="file"
                data-testid="screen-upload"
                className="hidden"
                onChange={async e => {
                  const chosen = e.target.files?.[0];
                  if (!chosen) return;
                  const bytes = await readAsBase64(chosen);
                  setPendingUpload({ bytes, name: chosen.name });
                  setCarryCodes('above');
                  if (openFile) await previewCarry(openFile, bytes);
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
              {/*
                A .rip screen opens in the RIP editor. Its own button rather
                than a branch inside the ANSI one: the artwork is a vector
                program that no canvas of cells can hold, and what is editable
                about it is where a caller can click.
              */}
              {file.format === 'rip' && (
                <button
                  className="inline-flex items-center gap-1 underline"
                  aria-label="Edit this file"
                  onClick={() => setEditingRip(true)}
                >
                  <Pencil size={14} /> Edit
                </button>
              )}
              <button
                type="button"
                className="inline-flex items-center gap-1 underline"
                onClick={() =>
                  downloadScreen(
                    `/api/screens/file?path=${encodeURIComponent(openFile)}&download=1`,
                    baseName(openFile),
                  )
                }
              >
                <Download size={14} /> Download
              </button>
              <button
                className="inline-flex items-center gap-1 underline"
                onClick={() => setShowRevisions(v => !v)}
              >
                <History size={14} /> Revisions
              </button>
              <button
                className="inline-flex items-center gap-1 underline text-status-danger"
                onClick={() => removeFile(openFile)}
              >
                <Trash2 size={14} /> Delete
              </button>
            </div>

            {pendingUpload && !editorWrite && (
              <div className="card space-y-4 text-sm">
                <div>
                  <h4 className="text-base text-content-primary">Replace this screen</h4>
                  <p className="text-content-secondary">
                    <span className="font-mono">{openFile}</span> becomes{' '}
                    <span className="font-mono">{pendingUpload.name}</span>
                  </p>
                </div>

                {/*
                  A screen is a program and an ANSI editor writes no ~CC_. What
                  a replace would cost is said BEFORE the fan-out is chosen,
                  because the cost is the same whichever fan-out it is.
                */}
                {carryVerdict && (carryVerdict.carried.length > 0 || carryVerdict.lost.length > 0) && (
                  <div className="space-y-2">
                    <p className={carryVerdict.lost.length ? 'text-status-warn' : 'text-content-secondary'}>
                      {describeCarry(carryVerdict)}
                    </p>
                    {carryVerdict.carried.length > 0 && (
                      <ul className="space-y-1 border-l-2 border-border pl-3">
                        {carryVerdict.carried.map(line => (
                          <li key={line}><CodeChip>{line}</CodeChip></li>
                        ))}
                      </ul>
                    )}
                    <div>
                      <label className="label" htmlFor="carry-placement">Keep these codes</label>
                      <select
                        id="carry-placement"
                        className="input-field"
                        value={carryCodes}
                        onChange={e => setCarryCodes(e.target.value as 'none' | 'above' | 'below')}
                      >
                        <option value="above">where they were, around the art</option>
                        <option value="below">all together, after the art</option>
                        <option value="none">do not keep them</option>
                      </select>
                    </div>
                  </div>
                )}

                {/*
                  ONE action, not a question with four answers.
                  "when do i not want to replace the 41 files for the
                  bbstitle?" (sysop) - almost never, so the page writes every
                  copy and keeps the rest as alternatives rather than asking
                  which of four before anything happens.
                */}
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    {everyCopy && (
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => applyWrite(everyCopy)}
                      >
                        {writeEverywhereLabel(everyCopy)}
                      </button>
                    )}
                    {otherWrites.map(option => (
                      <button
                        key={option.choice}
                        type="button"
                        className="btn-secondary"
                        onClick={() => applyWrite(option)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 border-t border-border pt-3">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => { setPendingUpload(null); setCarryVerdict(null); }}
                  >
                    Cancel
                  </button>
                  <span className="text-content-muted">
                    Every file written is backed up beside itself first.
                  </span>
                </div>
              </div>
            )}

            {/*
              THE MANAGER'S GUESS, and only where it can be wrong about
              something the sysop can see.
              "this stuff is a bit weird as well - artist can only edit the
              editable ones anyway?" (sysop, 2026-09-14). It read as a
              permission because "art a designer edits" names a person; it is
              really "what IS this file", and it decides whether the gallery
              shows the file or files it away as something the board wrote.
              On a file the manager already reads as art - almost all of them -
              it is a control with nothing to do, so it waits behind a link.
            */}
            {file.generated ? (
              <div className="space-y-2 text-sm">
                <p className="text-status-warn">
                  {file.generated === 'runtime'
                    ? 'The manager thinks the board writes this file, so the gallery keeps it out of the way.'
                    : 'The manager thinks this is an old copy kept beside the real file, so the gallery keeps it out of the way.'}
                </p>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => flagFile(openFile, 'art')}
                >
                  It is art - show it
                </button>
              </div>
            ) : kindOpen ? (
              <div className="flex flex-wrap items-end gap-2 text-sm">
                <div>
                  <label className="label" htmlFor="screen-kind">This file is</label>
                  <select
                    id="screen-kind"
                    className="input-field"
                    value={file.generated ?? 'art'}
                    onChange={e => flagFile(openFile, e.target.value as 'backup' | 'runtime' | 'art')}
                  >
                    <option value="art">art a designer edits</option>
                    <option value="runtime">written by the board</option>
                    <option value="backup">an old copy kept beside the real one</option>
                  </select>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => flagFile(openFile, null)}
                >
                  Use the manager's guess
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="text-sm text-content-secondary underline"
                onClick={() => setKindOpen(true)}
              >
                Not art?
              </button>
            )}

            {file.problems && file.problems.length > 0 && (
              <div className="text-sm space-y-1">
                <ul className="text-status-warn">
                  {file.problems.map((problem: string) => (
                    <li key={problem}>{describeProblem(problem)}</li>
                  ))}
                </ul>
                {/*
                  The damage is mechanical - a CSI sequence with its ESC gone -
                  so the repair is too. A backup is written first, and the
                  board refuses the file if it holds any escape byte, because
                  then a bare [ may be art.
                */}
                {file.problems.includes('colour-codes-without-escape') && (
                  <button className="underline text-accent" onClick={() => repairFile(openFile)}>
                    Put the escape byte back
                  </button>
                )}
              </div>
            )}

            {file.format === 'ansi' || file.format === 'text' ? (
              // The editor's own renderer, so the view and the edit cannot
              // disagree about what the file looks like.
              // Tall art scrolls inside its own viewport rather than pushing
              // everything below it off the page - the same treatment the
              // editor's canvas gets.
              <ScreenArt
                content={file.content}
                className="max-h-[60vh]"
                /*
                 * Tall art scrolls; a 3,019-line changelog is not art. Without
                 * a ceiling this canvas is 96,608 pixels high, past what any
                 * browser will allocate, and the page freezes. 200 rows is
                 * eight screenfuls - more than any real piece on this board.
                 */
                maxRows={200}
              />
            ) : file.format === 'rip' ? (
              // Drawn by the same RIPtermJS a RIP caller's terminal uses, with
              // this screen's clickable regions over it. The same component the
              // Edit button opens, read-only - a viewer and an editor that draw
              // a file differently is the bug class this page keeps hitting.
              <RipScreenEditor content={file.content} filePath={openFile ?? undefined} readOnly />
            ) : file.format === 'petscii' ? (
              // The same PetsciiMachine + PetsciiCanvas a C64 caller's terminal
              // draws with. The apology that stood here predated both: the
              // renderer exists, so showing nothing was the misleading part.
              //
              // And it is now the EDITOR, read-only, for the reason the RIP
              // branch above gives: the component the artist studio opens is
              // the component that shows the file here, so a viewer and an
              // editor cannot drift apart.
              <PetsciiScreenEditor content={file.content} filePath={openFile ?? undefined} readOnly />
            ) : (
              <p className="text-sm text-content-secondary">
                No preview for this format.
              </p>
            )}

            {file.mci?.length > 0 && (
              <div className="text-sm">
                <h4 className="text-content-primary">
                  This screen runs things - {file.mci.length} MCI reference
                  {file.mci.length === 1 ? '' : 's'}
                </h4>
                <ul className="mt-1 space-y-1">
                  {file.mci.map((ref: MciReferenceShape, i: number) => (
                    <li key={i} className="flex flex-wrap items-baseline gap-2">
                      <CodeChip dead={!ref.resolves}>
                        ~{ref.code}{ref.target ? `_${ref.target}` : ''}
                      </CodeChip>
                      {ref.targetName && (
                        <span className="text-content-secondary">{ref.targetName}</span>
                      )}
                      {!ref.resolves && (
                        <span className="text-status-danger">points at nothing</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Revisions panel */}
            {showRevisions && <ScreenRevisionsPanel path={openFile} onClose={() => setShowRevisions(false)} />}
          </div>
        )}
      </Modal>

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
