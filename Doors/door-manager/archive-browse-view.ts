/**
 * The archive browser: what is inside a door archive, from catalog data
 * rather than from lha.
 *
 * Moved out of app.ts when it reached the repo's 2000-line ceiling. It reads
 * the catalog's own column names - path, size, is_junk - so both sources
 * feed it the same shape: a local door_catalog row, or a listing fetched
 * from the door server by a consumer.
 */

import { BaseView, sanitizeForTags } from './ViewManager';

/**
 * Only the parts of DOORMAN's layout this view touches. Typed structurally
 * rather than imported: the layout class lives in app.ts, and app.ts imports
 * this file.
 */
export interface ArchiveBrowseLayout {
  screen: any;
  width: number;
  setInfo(content: string): void;
  setListLabel(label: string): void;
  setListItems(items: string[]): void;
  setListSelect(index: number): void;
  setFooter(content: string): void;
  showInstalledLayout(): void;
  showRepoLayout(): void;
  focusList(): void;
  render(): void;
}

// ── Archive Browser (from catalog, no lha needed) ────────────────────────────

export class ArchiveBrowseView extends BaseView {
  private layout: ArchiveBrowseLayout;
  private archiveName: string;
  private files: any[];

  constructor(layout: ArchiveBrowseLayout, archiveName: string, files: any[]) {
    super(); this.layout = layout; this.archiveName = archiveName; this.files = files;
  }

  enter(): void {
    // Hide filter panel (was shown in repo mode), use installed-style layout
    this.layout.showInstalledLayout();

    // Filter out hidden files (starting with . or __) and system files
    const visible = this.files.filter((f: any) => {
      const base = (f.path as string).split('/').pop() ?? f.path;
      return !base.startsWith('.') && !base.startsWith('__');
    });
    const junk = visible.filter((f: any) => f.is_junk).length;
    const items = visible.map((f: any) => {
      const sz = f.size < 1024 ? `${f.size}b` : `${Math.round(f.size / 1024)}k`;
      const mark = f.is_junk ? '!' : ' ';
      const w = this.layout.width - 7;
      const name = (f.path as string).length > w
        ? '<' + (f.path as string).slice((f.path as string).length - w + 1)
        : (f.path as string);
      return `${mark} ${name.padEnd(w)} ${sz.padStart(5)}`;
    });

    this.layout.setListLabel(` ${this.archiveName} (${visible.length} files) `);
    this.layout.setListItems(items);
    this.layout.setListSelect(0);
    this.layout.setInfo(
      `{yellow-fg}${this.archiveName}{/yellow-fg}\n\n` +
      `{white-fg}${visible.length} files{/white-fg}` +
      (junk > 0 ? `  {red-fg}${junk} ad files{/red-fg}` : '  {green-fg}clean{/green-fg}') +
      '\n\n{grey-fg}! = flagged as ad file{/grey-fg}'
    );
    this.layout.setFooter('{center}{yellow-fg}↑/↓{/yellow-fg} Navigate  {yellow-fg}ESC/Q{/yellow-fg} Back{/center}');
    this.layout.focusList();
    this.layout.render();

    this.keys.key(['q', 'Q'], () => this.vm.pop());
  }

  exit(): void {
    this.layout.showRepoLayout(); // restore repo layout on exit
    this.keys.release();
  }
}
