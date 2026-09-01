/**
 * The two read-and-clean views: the document viewer (a door's .doc/.guide/
 * README) and the ad stripper.
 *
 * Split out of app.ts when it reached the 2000-line ceiling, the same way
 * install-core.ts and doorman-layout.ts were. Neither view imports app.ts,
 * so there is no cycle - both take the layout they draw into.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Panel, ScrollableBox } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { BaseView, sanitizeForTags, resolveBbsRoot } from './ViewManager';
import { DoormanLayout } from './doorman-layout';
import { showAmigaGuideViewer } from './AmigaGuideViewer';
import { getCatalogSvc, getStripLib } from './doorman-services';
import { wrapToInfoPane } from './repo-view-helpers';
import type { RepoClientConfig } from './repo-client';
import { T } from './door-theme';
import type { CatalogEntry as RepoCatalogEntry } from './repoDataSource';

type CatalogEntry = RepoCatalogEntry;

const PROJECT_ROOT = resolveBbsRoot(__dirname);

// ── Document Viewer ───────────────────────────────────────────────────────────

export class DocView extends BaseView {
  private layout: DoormanLayout;
  private title: string;
  private content: string;
  private panel: any; private hint: any;

  constructor(layout: DoormanLayout, title: string, content: string) {
    super(); this.layout = layout; this.title = title; this.content = content;
  }

  enter(): void {
    const isGuide = /^@(?:database|node)\b/im.test(this.content);
    if (isGuide) {
      showAmigaGuideViewer(this.layout.screen, this.content, this.title,
        () => this.vm.pop());
      return;
    }
    // Plain text viewer
    const { Panel, ScrollableBox } = require('@amiexpress/bbs-door-sdk/engines/ui/blessed');
    // Keeps 0x80+ for the same reason sanitizeForTags() does: Amiga door
    // documentation is drawn with high-bit glyphs, and dropping them pulls
    // the columns out of alignment. Tabs and newlines survive; other control
    // characters do not.
    const text = this.content.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '').replace(/[{}]/g, c => `\\${c}`);
    this.panel = new Panel({ parent: this.layout.screen, top: 0, left: 0, width: '100%',
      height: '100%-3', label: ` ${this.title} `, tags: true, style: { border:{ fg: T.accent } } } as any);
    const box = new ScrollableBox({ parent: this.panel, top: 1, left: 1, width: '100%-2',
      height: '100%-2', tags: false, scrollable: true, alwaysScroll: true, content: text } as any);
    this.hint = new Panel({ parent: this.layout.screen, bottom: 0, left: 0, width: '100%', height: 3,
      tags: true, content: '{center}[Q/ESC] Close  [↑/↓/PgUp/PgDn] Scroll{/center}',
      style: { fg: T.ink, bg: T.bar, border:{ fg: T.accentAlt } } } as any);
    this.layout.screen.render();
    this.keys.key(['up','down','pageup','pagedown'], (_: any, key: any) => {
      const n = key?.name ?? '';
      if (n==='up') (box as any).scroll(-1); else if (n==='down') (box as any).scroll(1);
      else if (n==='pageup') (box as any).scroll(-20); else if (n==='pagedown') (box as any).scroll(20);
      this.layout.render();
    });
    this.keys.key(['q','Q'], () => this.vm.pop());
  }

  exit(): void {
    this.keys.release();
    if (this.panel) { (this.panel as any).destroy(); this.panel = null; }
    if (this.hint) { (this.hint as any).destroy(); this.hint = null; }
    this.layout.render();
  }
}

// ── Strip Selector ────────────────────────────────────────────────────────────

export class StripView extends BaseView {
  private layout: DoormanLayout;
  private entry: CatalogEntry;
  private archivePath: string | null;
  private overrideDir?: string;
  private onDone: (stripped: number | null) => void;
  private checked: boolean[] = [];
  private files: any[] = [];
  private reasons: Record<string, string> = {};
  private origLabel = '';
  // True only when an installed directory backs this entry. DOORMAN strips
  // junk from an INSTALLED door's files (analyzeDirectory/
  // stripFilesFromDirectory — plain fs, no archive format concerns). It does
  // NOT rewrite archive files in place: there is no portable LHA writer
  // (lha.js only reads, lhasa on Linux has no `a` create command either),
  // and silently rewriting a .lha as ZIP bytes under the same filename would
  // mislead the sysop about what's actually on disk. See stripArchive's doc
  // comment in ami-stripper.lib.ts. When a door isn't installed yet, this
  // view still analyzes the archive (read-only, via the portable extractor
  // factory) so the sysop can preview what would be stripped, but [S] just
  // explains that installing comes first.
  private canStrip = false;
  /** Set when this strip would edit the repository archive rather than an
   *  installed directory; `reason` explains why it cannot, when it cannot. */
  private archiveStrip: { reason: string | null } | null = null;

  constructor(layout: DoormanLayout, entry: CatalogEntry, archivePath: string | null, overrideDir: string | undefined,
              onDone: (stripped: number | null) => void) {
    super(); this.layout = layout; this.entry = entry; this.archivePath = archivePath;
    this.overrideDir = overrideDir; this.onDone = onDone;
  }

  /** Loud-error convention (see reportInstallFailure in RepoView): log to
   * the process console for docker logs / journald visibility, and hold a
   * persistent message in the info panel instead of a message that quietly
   * self-clears. */
  private reportFailure(step: string, detail: string): void {
    console.log(`[DOORMAN] strip failed: ${step}: ${detail} (archive=${this.entry.archive_name})`);
    this.layout.setInfo(
      `{${T.alert}-fg}Strip failed{/${T.alert}-fg}\n\n` +
      `{${T.warn}-fg}Step:{/${T.warn}-fg} ${sanitizeForTags(step)}\n` +
      `{${T.warn}-fg}Detail:{/${T.warn}-fg} ${sanitizeForTags(detail)}\n` +
      `{${T.warn}-fg}Archive:{/${T.warn}-fg} ${sanitizeForTags(this.entry.archive_name)}\n`
    );
    this.layout.render();
  }

  enter(): void {
    const lib = getStripLib();
    if (!lib) {
      console.log(`[DOORMAN] strip failed: lib-unavailable (archive=${this.entry.archive_name})`);
      this.layout.setFooter(`{center}{${T.alert}-fg}Stripper library not available{/${T.alert}-fg}{/center}`);
      this.vm.pop();
      return;
    }
    const installDir = this.overrideDir;
    // Two ways to strip. An installed door's DIRECTORY is edited in place
    // (always possible, pure fs). A repository ARCHIVE is edited in place by
    // the lha binary, which works for .lha/.lzh and not for .lzx - so a door
    // that was never installed can still be cleaned on the server, which is
    // the whole point of curating the repo rather than each install.
    this.canStrip = !!installDir;
    this.archiveStrip = null;
    if (!installDir && this.archivePath) {
      const svc = getCatalogSvc();
      const capability = svc?.canStripArchiveOnServer?.(this.archivePath);
      if (capability?.ok) {
        this.canStrip = true;
        this.archiveStrip = { reason: null };
      } else if (capability?.reason) {
        this.archiveStrip = { reason: capability.reason };
      }
    }

    this.layout.setFooter(`{center}{${T.accent}-fg}Analyzing...{/${T.accent}-fg}{/center}`); this.layout.render();
    (installDir ? lib.analyzeDirectory(installDir) : lib.analyzeArchive(this.archivePath))
      .then((result: any) => {
        if (result.stripped.length === 0) {
          this.layout.setInfo(`{${T.ok}-fg}No ad files found — archive is clean.{/${T.ok}-fg}`);
          this.layout.render();
          setTimeout(() => this.vm.pop(), 1200);
          return;
        }
        this.files = result.stripped;
        this.reasons = result.reason;
        this.checked = new Array(this.files.length).fill(true);
        this.origLabel = '';
        try { this.origLabel = (this.layout.listPanel as any).options?.label ?? ''; } catch {}
        this.renderFiles();
        this.keys.key([' '], () => {
          const idx = this.layout.listSelected;
          if (idx < this.checked.length) { this.checked[idx] = !this.checked[idx]; this.renderFiles(); }
        });
        this.keys.key(['a','A'], () => { this.checked.fill(true); this.renderFiles(); });
        this.keys.key(['n','N'], () => { this.checked.fill(false); this.renderFiles(); });
        this.keys.key(['l','L'], () => { this.learnSelected(); });
        this.keys.key(['s','S'], () => {
          if (this.canStrip && !this.overrideDir && this.archiveStrip) {
            this.doStripArchive();
            return;
          }
          if (!this.canStrip) {
            // Wrapped to the pane rather than hard-wrapped at a guessed
            // width: the old fixed line breaks re-broke mid-word on a
            // narrower pane ("fi les", "thi s platform").
            const why = this.archiveStrip?.reason
              ?? "This archive cannot be edited in place on this server.";
            this.layout.setInfo(
              `{${T.warn}-fg}Cannot strip this archive.{/${T.warn}-fg}\n\n` +
              wrapToInfoPane(why, this.layout) + '\n\n' +
              wrapToInfoPane(
                `Install ${sanitizeForTags(this.entry.archive_name)} first and strip the ` +
                `installed copy instead.`, this.layout
              )
            );
            this.layout.render();
            return;
          }
          this.doStrip(lib, installDir as string);
        });
        this.keys.key(['q','Q'], () => { this.vm.pop(); this.onDone(null); });
      })
      .catch((e: any) => {
        this.reportFailure('analyze', e?.message ?? String(e));
        setTimeout(() => this.vm.pop(), 2500);
      });
  }

  private renderFiles(): void {
    const items = this.files.map((f: any, i: number) => {
      const box = this.checked[i] ? '[X]' : '[ ]';
      const fpath = f.path as string;
      const name = fpath.length > 24 ? '<' + fpath.slice(fpath.length - 23) : fpath.padEnd(24);
      return `${box} ${name}`;
    });
    const selCount = this.checked.filter(Boolean).length;
    const modeTag = this.canStrip ? '' : ' (preview)';
    (this.layout.listPanel as any).setLabel(` ${this.entry.archive_name} — Strip Ads${modeTag} `);
    this.layout.setListItems(items);
    const sel = this.files[this.layout.listSelected];
    const hint = this.canStrip
      ? `\n{${T.dim}-fg}[Space] Toggle  [A] All  [N] None  [S] Strip  [ESC/Q] Cancel{/${T.dim}-fg}`
      : `\n{${T.dim}-fg}[Space] Toggle  [A] All  [N] None  Not installed — [S] shows how  [ESC/Q] Cancel{/${T.dim}-fg}`;
    this.layout.setInfo(
      `{${T.warn}-fg}${selCount}/${this.files.length} selected{/${T.warn}-fg}\n\n` +
      (sel ? `{${T.accent}-fg}${(sel.path as string)}{/${T.accent}-fg}\nReason: ${this.reasons[sel.path] ?? '?'}\n` : '') +
      hint
    );
    this.layout.setFooter(this.canStrip
      ? `{center}{${T.warn}-fg}Space{/${T.warn}-fg}=Toggle  {${T.warn}-fg}A{/${T.warn}-fg}=All  {${T.warn}-fg}N{/${T.warn}-fg}=None  {${T.warn}-fg}S{/${T.warn}-fg}=Strip  {${T.warn}-fg}ESC/Q{/${T.warn}-fg}=Cancel{/center}`
      : `{center}{${T.warn}-fg}Space{/${T.warn}-fg}=Toggle  {${T.warn}-fg}A{/${T.warn}-fg}=All  {${T.warn}-fg}N{/${T.warn}-fg}=None  {${T.dim}-fg}Preview only{/${T.dim}-fg}  {${T.warn}-fg}ESC/Q{/${T.warn}-fg}=Cancel{/center}`
    );
    this.layout.render();
  }

  /**
   * Learn the currently selected file as a junk pattern. This teaches the
   * central classifier to recognise this filename in future archives.
   * Re-runs the analysis afterward so the sysop sees the updated verdict.
   */
  private learnSelected(): void {
    const idx = this.layout.listSelected;
    const sel = this.files[idx];
    if (!sel) return;
    const filePath = sel.path as string;

    const { learnPattern } = require('./repo-client') as typeof import('./repo-client');
    const { resolveDoorRepoMode, consumerCacheFilePath } = require('./repoDataSource') as typeof import('./repoDataSource');
    const mode = resolveDoorRepoMode();
    if (mode.kind !== 'consumer') {
      this.layout.setInfo(`{${T.warn}-fg}No door-repo config — cannot learn patterns.{/${T.warn}-fg}`);
      this.layout.render();
      return;
    }
    const cfg: RepoClientConfig = { url: mode.url, cacheFile: consumerCacheFilePath(PROJECT_ROOT) };

    this.layout.setFooter(`{center}{${T.accent}-fg}Learning pattern...{/${T.accent}-fg}{/center}`);
    this.layout.render();

    learnPattern(cfg, filePath, mode.learnKey, this.entry.archive_name, filePath)
      .then((result: { ok: boolean; duplicate?: boolean }) => {
        if (result.ok) {
          const msg = result.duplicate ? 'Pattern already known' : `Learned: ${filePath}`;
          this.layout.setInfo(`{${T.ok}-fg}${msg}{/${T.ok}-fg}`);
        } else {
          this.layout.setInfo(`{${T.warn}-fg}Learn failed — server may not have DOORREPO_LEARN_KEY set.{/${T.warn}-fg}`);
        }
        this.layout.render();
        setTimeout(() => { this.layout.setInfo(''); this.layout.render(); }, 1500);
      })
      .catch(() => {
        this.layout.setInfo(`{${T.warn}-fg}Learn failed.{/${T.warn}-fg}`);
        this.layout.render();
      });
  }

  /**
   * Strip the REPOSITORY archive in place: the published bytes change, so
   * the backend re-describes the row (size, digests, junk rows) in the same
   * step. Every other sysop downloads this file, which is why it is worth
   * doing here rather than making each of them strip their own copy.
   */
  private doStripArchive(): void {
    const toStrip = this.files.filter((_: any, i: number) => this.checked[i]);
    if (toStrip.length === 0) { this.vm.pop(); this.onDone(null); return; }

    const svc = getCatalogSvc();
    if (!svc?.stripArchiveOnServer) {
      this.reportFailure('strip', 'catalog service unavailable');
      setTimeout(() => { this.vm.pop(); this.onDone(null); }, 2500);
      return;
    }

    this.layout.setFooter(`{center}{${T.accent}-fg}Stripping archive...{/${T.accent}-fg}{/center}`);
    this.layout.render();

    let result: { ok: boolean; removed?: number; reason?: string };
    try {
      result = svc.stripArchiveOnServer(this.entry.id, toStrip.map((f: any) => f.path));
    } catch (e: any) {
      this.reportFailure('strip', e?.message ?? String(e));
      setTimeout(() => { this.vm.pop(); this.onDone(null); }, 2500);
      return;
    }

    if (!result.ok) {
      this.reportFailure('strip', result.reason ?? 'unknown error');
      setTimeout(() => { this.vm.pop(); this.onDone(null); }, 2500);
      return;
    }

    this.vm.pop();
    this.onDone(result.removed ?? toStrip.length);
  }

  private doStrip(lib: any, installDir: string): void {
    const toStrip = this.files.filter((_: any, i: number) => this.checked[i]);
    if (toStrip.length === 0) { this.vm.pop(); this.onDone(null); return; }
    this.layout.setFooter(`{center}{${T.accent}-fg}Stripping...{/${T.accent}-fg}{/center}`); this.layout.render();
    (async () => {
      try {
        lib.stripFilesFromDirectory(installDir, toStrip.map((f: any) => f.path));
        const svc = getCatalogSvc();
        if (svc) {
          try { svc.updateJunkCount(this.entry.id, this.files.length - toStrip.length); } catch {}
          try { svc.removeArchiveFiles(this.entry.id, toStrip.map((f: any) => f.path)); } catch {}
        }
        this.vm.pop();
        this.onDone(toStrip.length);
      } catch (e: any) {
        this.reportFailure('strip', e?.message ?? String(e));
        setTimeout(() => { this.vm.pop(); this.onDone(null); }, 2500);
      }
    })();
  }

  exit(): void {
    if (this.origLabel) try { (this.layout.listPanel as any).setLabel(this.origLabel); } catch {}
    this.keys.release();
  }

  onEsc(): void { this.vm.pop(); this.onDone(null); }
}
