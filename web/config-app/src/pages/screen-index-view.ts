/**
 * The screens list, as rows.
 *
 * Screens first, files underneath: the top level is what AmiExpress knows -
 * LOGON, BBSTITLE, MENU, BULL - and each row answers the question a sysop
 * actually has, which is "does this reach my callers, on which nodes, and is
 * anything about it broken". The files are one level down because a file only
 * matters through the screen it serves.
 *
 * Pure functions, so the counting is tested without rendering anything.
 */

export interface MciReferenceShape {
  code: 'CC' | 'SS' | 'SR' | 'CL';
  target: string;
  resolves: boolean;
  scopeSpecific: boolean;
}

import { describeScreen } from './screen-descriptions';

export interface ScreenFileShape {
  relPath: string;
  bytes: number;
  format: 'ansi' | 'text' | 'rip' | 'petscii';
  sha256: string;
  mci: MciReferenceShape[];
}

export interface ScopeResolutionShape {
  scope: 'node' | 'conf' | 'board';
  id: number | null;
  dir: string;
  dirIsShared: boolean;
  file: string | null;
  variants: string[];
}

export interface ScreenIndexEntryShape {
  screen: string;
  dirType: 'node' | 'conf' | 'global';
  resolutions: ScopeResolutionShape[];
  missingScopes: number;
  duplicateGroups: { sha256: string; paths: string[] }[];
}

export interface ScreenIndexShape {
  screens: ScreenIndexEntryShape[];
  unused: ScreenFileShape[];
  files: Record<string, ScreenFileShape>;
  builtAt: string;
}

export interface ScreenRow {
  screen: string;
  /** What KIND of screen this is - the page shows one tab per kind. */
  dirType: ScreenIndexEntryShape['dirType'];
  scopeLabel: string;
  resolvedCount: number;
  missingCount: number;
  distinctContents: number;
  brokenReferences: number;
}

const SCOPE_LABELS: Record<ScreenIndexEntryShape['dirType'], string> = {
  node: 'node scope',
  conf: 'conference scope',
  global: 'board root',
};

export function toScreenRows(index: ScreenIndexShape): ScreenRow[] {
  return index.screens.map(entry => {
    const resolved = entry.resolutions.filter(r => r.file);
    const files = resolved
      .map(r => index.files[r.file as string])
      .filter((f): f is ScreenFileShape => !!f);

    return {
      screen: entry.screen,
      dirType: entry.dirType,
      scopeLabel: SCOPE_LABELS[entry.dirType],
      resolvedCount: resolved.length,
      missingCount: entry.missingScopes,
      distinctContents: new Set(files.map(f => f.sha256)).size,
      // A ~CC_ pointing at a door that is gone is a menu item that fails only
      // when a caller presses the key. Counting it here puts it in the list.
      brokenReferences: files.reduce(
        (total, file) => total + file.mci.filter(ref => !ref.resolves).length,
        0,
      ),
    };
  });
}

/**
 * Search the description as well as the name.
 *
 * A sysop looking for "the screen shown when you join a conference" does not
 * know it is called CONF_BULL - that is the whole reason the descriptions
 * exist. Searching only the name hides the answer behind the question.
 */
export function filterScreenRows(rows: ScreenRow[], query: string): ScreenRow[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter(row =>
    row.screen.toLowerCase().includes(needle)
    || describeScreen(row.screen).toLowerCase().includes(needle));
}
