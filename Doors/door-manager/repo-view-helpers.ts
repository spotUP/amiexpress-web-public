/**
 * Pure presentation helpers for DOORMAN's repository view.
 *
 * Split out of app.ts when that file hit the repo's 2000-line ceiling. These
 * are the pieces with no blessed, no filesystem and no catalog behind them -
 * text wrapping, selection clamping, the footer hint string and the hotkey
 * registration table - which is also why they are the parts worth unit
 * testing. app.ts re-exports them so existing importers and tests are
 * unaffected.
 */
import type { KeyBinder } from './ViewManager';
import type { DoorRepoMode } from './repoDataSource';

/**
 * Wraps text to the info pane's real width, breaking on spaces.
 *
 * Messages used to carry their own line breaks at a guessed width, which
 * re-broke mid-word whenever the pane was narrower than the guess - the
 * live BBS showed "fi les" and "thi s platform". Only the pane knows how
 * wide it is.
 */
export function wrapText(text: string, width: number): string {
  const safeWidth = Math.max(8, Math.floor(width));
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (!line.length) {
        line = word;
      } else if (line.length + 1 + word.length <= safeWidth) {
        line += ` ${word}`;
      } else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out.join('\n');
}

export function wrapToInfoPane(text: string, layout: any): string {
  // -4 for the panel border and the padding the info box already applies.
  const width = (layout?.infoWidth ?? layout?.width ?? 60) - 4;
  return wrapText(text, width);
}

export function clampSelection(index: number, count: number): number {
  if (count <= 0) return 0;
  if (!Number.isFinite(index) || index < 0) return 0;
  return Math.min(Math.floor(index), count - 1);
}

export function repoViewCurationAllowed(mode: DoorRepoMode): boolean {
  return mode.kind !== 'consumer';
}

/** RepoView's per-entry footer hint string, gated by repo mode. Byte-
 * identical to DOORMAN's pre-Task-8 string in owner mode (and disabled
 * mode, which reads identically) -- only consumer mode differs, by omitting
 * the Strip hint entirely rather than advertising a key that does nothing. */
export function repoViewFooterParts(
  mode: DoorRepoMode,
  opts: { installed: boolean; hasJunk: boolean; hasDoc: boolean }
): string {
  const inst = opts.installed ? 'Uninst' : 'Inst';
  const curationAllowed = repoViewCurationAllowed(mode);
  // Every hint is "KEY=Label". It used to mix that with bare words whose
  // active letter was marked only by a colour highlight ("Strip", "Archive",
  // "Quit") - which is invisible on plenty of real terminals, and led to
  // "it doesn't say anywhere that S is used to strip".
  const parts = [
    `{yellow-fg}R{/yellow-fg}=${inst}`,
    (opts.hasJunk && curationAllowed) ? `{yellow-fg}S{/yellow-fg}=Strip` : null,
    opts.hasDoc  ? `{yellow-fg}V{/yellow-fg}=Doc` : null,
    `{yellow-fg}A{/yellow-fg}=Archive`,
    curationAllowed ? `{yellow-fg}D{/yellow-fg}=Delete` : null,
    `{yellow-fg}F{/yellow-fg}=Filter`,
    `{yellow-fg}C{/yellow-fg}=System`,
    `{yellow-fg}ESC{/yellow-fg}=Back`,
    `{yellow-fg}Q{/yellow-fg}=Quit`,
  ].filter(Boolean).join('  ');
  return `{center}${parts}{/center}`;
}

/**
 * Whether [V]iew doc has anything to open for this entry.
 *
 * An owner's row carries the documentation itself (doc_raw). A consumer's
 * row carries only the manifest's has_doc flag until something fetches the
 * text - and reading doc_raw alone is what left the footer silent about
 * [V] on every consumer row, months after the key started working.
 */
export function entryHasDoc(entry: { doc_raw?: string | null; has_doc?: boolean } | null): boolean {
  if (!entry) return false;
  return !!entry.doc_raw || entry.has_doc === true;
}

/** One row of an archive listing, in either source's spelling: the local
 *  catalog service returns door_catalog_files rows (`is_junk`, 0 or 1), the
 *  door server's detail endpoint returns `isJunk`. */
export interface ArchiveFileRow {
  path: string;
  size: number;
  is_junk?: number | boolean;
  isJunk?: boolean;
}

function isJunkRow(file: ArchiveFileRow): boolean {
  return file.isJunk === true || file.is_junk === 1 || file.is_junk === true;
}

/**
 * The info pane's file-listing block, identical for both sources: the local
 * catalog's door_catalog_files rows (owner mode) and the door server's
 * detail rows (consumer mode). One renderer, so a consumer's listing cannot
 * drift from an owner's.
 *
 * Returns '' for an empty list -- the pane simply shows nothing rather than
 * an empty box, which is what it did when only the local source existed.
 */
export function renderFileLines(files: ArchiveFileRow[], limit = 25): string {
  if (files.length === 0) return '';
  const junk = files.filter(isJunkRow).length;
  const junkTag = junk > 0 ? `  {red-fg}${junk} ad files{/red-fg}` : '  {green-fg}clean{/green-fg}';
  let out = `\n\n{grey-fg}─── ${files.length} files${junkTag}{/grey-fg}  {grey-fg}──────────────────────{/grey-fg}\n`;
  for (const f of files.slice(0, limit)) {
    const sz = f.size < 1024 ? `${f.size}b` : `${Math.round(f.size / 1024)}k`;
    const junkMark = isJunkRow(f) ? '{red-fg}!{/red-fg}' : ' ';
    const name = f.path.length > 34 ? '<' + f.path.slice(f.path.length - 33) : f.path;
    out += `${junkMark} ${name.padEnd(34)} ${sz.padStart(5)}\n`;
  }
  if (files.length > limit) out += `{grey-fg}  ... and ${files.length - limit} more{/grey-fg}\n`;
  return out;
}

/**
 * The catalog's suggested tooltypes, as readable NAME=value lines.
 *
 * Stored as a JSON object of tooltype name -> value, read out of whatever
 * the scanner could find - an archive's own icon, or its documentation.
 * Plenty of rows are partial or plainly wrong ("LOCATION":"<dir>-",
 * "TYPE":"XIM."), which is why this is only ever SHOWN to the sysop: an
 * installed door's .info comes from the archive's own icon, never from
 * here.
 *
 * Anything that is not a JSON object is returned as its own single line, so
 * a differently-shaped row still tells the sysop something instead of
 * vanishing.
 */
export function formatSuggestedTooltypes(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return [trimmed];
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [trimmed];
  return Object.entries(parsed as Record<string, unknown>).map(
    ([key, value]) => `${key}=${value == null ? '' : String(value)}`
  );
}

export interface RepoViewHotkeyHandlers {
  onInstallUninstall: () => void;
  onStrip: () => void;
  onViewDoc: () => void;
  onBrowseArchive: () => void;
  onCycleFilter: () => void;
  onDelete: () => void;
}

/** Registers RepoView's per-entry action hotkeys (R/S/V/A/C), gated by repo
 * mode: consumer mode omits the [S]trip binding entirely -- see
 * repoViewCurationAllowed. Install/uninstall (R), view doc (V), browse
 * archive contents (A), and the system-type filter (C) register in every
 * mode. */
export function registerRepoViewActionKeys(
  keys: KeyBinder,
  mode: DoorRepoMode,
  handlers: RepoViewHotkeyHandlers
): void {
  keys.key(['r', 'R'], () => handlers.onInstallUninstall());
  if (repoViewCurationAllowed(mode)) {
    keys.key(['s', 'S'], () => handlers.onStrip());
    // Deleting removes the archive from the repository permanently. A
    // consumer browses somebody else's catalog, so the binding must not
    // exist for them at all rather than be refused at the far end.
    keys.key(['d', 'D'], () => handlers.onDelete());
  }
  keys.key(['v', 'V'], () => handlers.onViewDoc());
  keys.key(['a', 'A'], () => handlers.onBrowseArchive());
  keys.key(['c', 'C'], () => handlers.onCycleFilter());
}
