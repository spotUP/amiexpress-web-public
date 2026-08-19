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
