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