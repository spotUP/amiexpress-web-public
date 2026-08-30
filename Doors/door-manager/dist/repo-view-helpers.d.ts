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
export declare function wrapText(text: string, width: number): string;
export declare function wrapToInfoPane(text: string, layout: any): string;
export declare function clampSelection(index: number, count: number): number;
export declare function repoViewCurationAllowed(mode: DoorRepoMode): boolean;
/** RepoView's per-entry footer hint string, gated by repo mode. Byte-
 * identical to DOORMAN's pre-Task-8 string in owner mode (and disabled
 * mode, which reads identically) -- only consumer mode differs, by omitting
 * the Strip hint entirely rather than advertising a key that does nothing. */
export declare function repoViewFooterParts(mode: DoorRepoMode, opts: {
    installed: boolean;
    hasJunk: boolean;
    hasDoc: boolean;
}): string;
/**
 * Whether [V]iew doc has anything to open for this entry.
 *
 * An owner's row carries the documentation itself (doc_raw). A consumer's
 * row carries only the manifest's has_doc flag until something fetches the
 * text - and reading doc_raw alone is what left the footer silent about
 * [V] on every consumer row, months after the key started working.
 */
export declare function entryHasDoc(entry: {
    doc_raw?: string | null;
    has_doc?: boolean;
} | null): boolean;
/** One row of an archive listing, in either source's spelling: the local
 *  catalog service returns door_catalog_files rows (`is_junk`, 0 or 1), the
 *  door server's detail endpoint returns `isJunk`. */
export interface ArchiveFileRow {
    path: string;
    size: number;
    is_junk?: number | boolean;
    isJunk?: boolean;
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
export declare function renderFileLines(files: ArchiveFileRow[], limit?: number): string;
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
export declare function formatSuggestedTooltypes(raw: string | null | undefined): string[];
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
export declare function registerRepoViewActionKeys(keys: KeyBinder, mode: DoorRepoMode, handlers: RepoViewHotkeyHandlers): void;
//# sourceMappingURL=repo-view-helpers.d.ts.map