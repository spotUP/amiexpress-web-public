"use strict";
/**
 * The two read-and-clean views: the document viewer (a door's .doc/.guide/
 * README) and the ad stripper.
 *
 * Split out of app.ts when it reached the 2000-line ceiling, the same way
 * install-core.ts and doorman-layout.ts were. Neither view imports app.ts,
 * so there is no cycle - both take the layout they draw into.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.StripView = exports.DocView = void 0;
const ViewManager_1 = require("./ViewManager");
const AmigaGuideViewer_1 = require("./AmigaGuideViewer");
const doorman_services_1 = require("./doorman-services");
const repo_view_helpers_1 = require("./repo-view-helpers");
const door_theme_1 = require("./door-theme");
const PROJECT_ROOT = (0, ViewManager_1.resolveBbsRoot)(__dirname);
// ── Document Viewer ───────────────────────────────────────────────────────────
class DocView extends ViewManager_1.BaseView {
    constructor(layout, title, content) {
        super();
        this.layout = layout;
        this.title = title;
        this.content = content;
    }
    enter() {
        const isGuide = /^@(?:database|node)\b/im.test(this.content);
        if (isGuide) {
            (0, AmigaGuideViewer_1.showAmigaGuideViewer)(this.layout.screen, this.content, this.title, () => this.vm.pop());
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
            height: '100%-3', label: ` ${this.title} `, tags: true, style: { border: { fg: door_theme_1.T.accent } } });
        const box = new ScrollableBox({ parent: this.panel, top: 1, left: 1, width: '100%-2',
            height: '100%-2', tags: false, scrollable: true, alwaysScroll: true, content: text });
        this.hint = new Panel({ parent: this.layout.screen, bottom: 0, left: 0, width: '100%', height: 3,
            tags: true, content: '{center}[Q/ESC] Close  [↑/↓/PgUp/PgDn] Scroll{/center}',
            style: { fg: door_theme_1.T.ink, bg: door_theme_1.T.bar, border: { fg: door_theme_1.T.accentAlt } } });
        this.layout.screen.render();
        this.keys.key(['up', 'down', 'pageup', 'pagedown'], (_, key) => {
            const n = key?.name ?? '';
            if (n === 'up')
                box.scroll(-1);
            else if (n === 'down')
                box.scroll(1);
            else if (n === 'pageup')
                box.scroll(-20);
            else if (n === 'pagedown')
                box.scroll(20);
            this.layout.render();
        });
        this.keys.key(['q', 'Q'], () => this.vm.pop());
    }
    exit() {
        this.keys.release();
        if (this.panel) {
            this.panel.destroy();
            this.panel = null;
        }
        if (this.hint) {
            this.hint.destroy();
            this.hint = null;
        }
        this.layout.render();
    }
}
exports.DocView = DocView;
// ── Strip Selector ────────────────────────────────────────────────────────────
class StripView extends ViewManager_1.BaseView {
    constructor(layout, entry, archivePath, overrideDir, onDone) {
        super();
        this.checked = [];
        this.files = [];
        this.reasons = {};
        this.origLabel = '';
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
        this.canStrip = false;
        /** Set when this strip would edit the repository archive rather than an
         *  installed directory; `reason` explains why it cannot, when it cannot. */
        this.archiveStrip = null;
        this.layout = layout;
        this.entry = entry;
        this.archivePath = archivePath;
        this.overrideDir = overrideDir;
        this.onDone = onDone;
    }
    /** Loud-error convention (see reportInstallFailure in RepoView): log to
     * the process console for docker logs / journald visibility, and hold a
     * persistent message in the info panel instead of a message that quietly
     * self-clears. */
    reportFailure(step, detail) {
        console.log(`[DOORMAN] strip failed: ${step}: ${detail} (archive=${this.entry.archive_name})`);
        this.layout.setInfo(`{${door_theme_1.T.alert}-fg}Strip failed{/${door_theme_1.T.alert}-fg}\n\n` +
            `{${door_theme_1.T.warn}-fg}Step:{/${door_theme_1.T.warn}-fg} ${(0, ViewManager_1.sanitizeForTags)(step)}\n` +
            `{${door_theme_1.T.warn}-fg}Detail:{/${door_theme_1.T.warn}-fg} ${(0, ViewManager_1.sanitizeForTags)(detail)}\n` +
            `{${door_theme_1.T.warn}-fg}Archive:{/${door_theme_1.T.warn}-fg} ${(0, ViewManager_1.sanitizeForTags)(this.entry.archive_name)}\n`);
        this.layout.render();
    }
    enter() {
        const lib = (0, doorman_services_1.getStripLib)();
        if (!lib) {
            console.log(`[DOORMAN] strip failed: lib-unavailable (archive=${this.entry.archive_name})`);
            this.layout.setFooter(`{center}{${door_theme_1.T.alert}-fg}Stripper library not available{/${door_theme_1.T.alert}-fg}{/center}`);
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
            const svc = (0, doorman_services_1.getCatalogSvc)();
            const capability = svc?.canStripArchiveOnServer?.(this.archivePath);
            if (capability?.ok) {
                this.canStrip = true;
                this.archiveStrip = { reason: null };
            }
            else if (capability?.reason) {
                this.archiveStrip = { reason: capability.reason };
            }
        }
        this.layout.setFooter(`{center}{${door_theme_1.T.accent}-fg}Analyzing...{/${door_theme_1.T.accent}-fg}{/center}`);
        this.layout.render();
        (installDir ? lib.analyzeDirectory(installDir) : lib.analyzeArchive(this.archivePath))
            .then((result) => {
            if (result.stripped.length === 0) {
                this.layout.setInfo(`{${door_theme_1.T.ok}-fg}No ad files found — archive is clean.{/${door_theme_1.T.ok}-fg}`);
                this.layout.render();
                setTimeout(() => this.vm.pop(), 1200);
                return;
            }
            this.files = result.stripped;
            this.reasons = result.reason;
            this.checked = new Array(this.files.length).fill(true);
            this.origLabel = '';
            try {
                this.origLabel = this.layout.listPanel.options?.label ?? '';
            }
            catch { }
            this.renderFiles();
            this.keys.key([' '], () => {
                const idx = this.layout.listSelected;
                if (idx < this.checked.length) {
                    this.checked[idx] = !this.checked[idx];
                    this.renderFiles();
                }
            });
            this.keys.key(['a', 'A'], () => { this.checked.fill(true); this.renderFiles(); });
            this.keys.key(['n', 'N'], () => { this.checked.fill(false); this.renderFiles(); });
            this.keys.key(['l', 'L'], () => { this.learnSelected(); });
            this.keys.key(['s', 'S'], () => {
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
                    this.layout.setInfo(`{${door_theme_1.T.warn}-fg}Cannot strip this archive.{/${door_theme_1.T.warn}-fg}\n\n` +
                        (0, repo_view_helpers_1.wrapToInfoPane)(why, this.layout) + '\n\n' +
                        (0, repo_view_helpers_1.wrapToInfoPane)(`Install ${(0, ViewManager_1.sanitizeForTags)(this.entry.archive_name)} first and strip the ` +
                            `installed copy instead.`, this.layout));
                    this.layout.render();
                    return;
                }
                this.doStrip(lib, installDir);
            });
            this.keys.key(['q', 'Q'], () => { this.vm.pop(); this.onDone(null); });
        })
            .catch((e) => {
            this.reportFailure('analyze', e?.message ?? String(e));
            setTimeout(() => this.vm.pop(), 2500);
        });
    }
    renderFiles() {
        const items = this.files.map((f, i) => {
            const box = this.checked[i] ? '[X]' : '[ ]';
            const fpath = f.path;
            const name = fpath.length > 24 ? '<' + fpath.slice(fpath.length - 23) : fpath.padEnd(24);
            return `${box} ${name}`;
        });
        const selCount = this.checked.filter(Boolean).length;
        const modeTag = this.canStrip ? '' : ' (preview)';
        this.layout.listPanel.setLabel(` ${this.entry.archive_name} — Strip Ads${modeTag} `);
        this.layout.setListItems(items);
        const sel = this.files[this.layout.listSelected];
        const hint = this.canStrip
            ? `\n{${door_theme_1.T.dim}-fg}[Space] Toggle  [A] All  [N] None  [S] Strip  [ESC/Q] Cancel{/${door_theme_1.T.dim}-fg}`
            : `\n{${door_theme_1.T.dim}-fg}[Space] Toggle  [A] All  [N] None  Not installed — [S] shows how  [ESC/Q] Cancel{/${door_theme_1.T.dim}-fg}`;
        this.layout.setInfo(`{${door_theme_1.T.warn}-fg}${selCount}/${this.files.length} selected{/${door_theme_1.T.warn}-fg}\n\n` +
            (sel ? `{${door_theme_1.T.accent}-fg}${sel.path}{/${door_theme_1.T.accent}-fg}\nReason: ${this.reasons[sel.path] ?? '?'}\n` : '') +
            hint);
        this.layout.setFooter(this.canStrip
            ? `{center}{${door_theme_1.T.warn}-fg}Space{/${door_theme_1.T.warn}-fg}=Toggle  {${door_theme_1.T.warn}-fg}A{/${door_theme_1.T.warn}-fg}=All  {${door_theme_1.T.warn}-fg}N{/${door_theme_1.T.warn}-fg}=None  {${door_theme_1.T.warn}-fg}S{/${door_theme_1.T.warn}-fg}=Strip  {${door_theme_1.T.warn}-fg}ESC/Q{/${door_theme_1.T.warn}-fg}=Cancel{/center}`
            : `{center}{${door_theme_1.T.warn}-fg}Space{/${door_theme_1.T.warn}-fg}=Toggle  {${door_theme_1.T.warn}-fg}A{/${door_theme_1.T.warn}-fg}=All  {${door_theme_1.T.warn}-fg}N{/${door_theme_1.T.warn}-fg}=None  {${door_theme_1.T.dim}-fg}Preview only{/${door_theme_1.T.dim}-fg}  {${door_theme_1.T.warn}-fg}ESC/Q{/${door_theme_1.T.warn}-fg}=Cancel{/center}`);
        this.layout.render();
    }
    /**
     * Learn the currently selected file as a junk pattern. This teaches the
     * central classifier to recognise this filename in future archives.
     * Re-runs the analysis afterward so the sysop sees the updated verdict.
     */
    learnSelected() {
        const idx = this.layout.listSelected;
        const sel = this.files[idx];
        if (!sel)
            return;
        const filePath = sel.path;
        const { learnPattern } = require('./repo-client');
        const { resolveDoorRepoMode, consumerCacheFilePath } = require('./repoDataSource');
        const mode = resolveDoorRepoMode();
        if (mode.kind !== 'consumer') {
            this.layout.setInfo(`{${door_theme_1.T.warn}-fg}No door-repo config — cannot learn patterns.{/${door_theme_1.T.warn}-fg}`);
            this.layout.render();
            return;
        }
        const cfg = { url: mode.url, cacheFile: consumerCacheFilePath(PROJECT_ROOT) };
        this.layout.setFooter(`{center}{${door_theme_1.T.accent}-fg}Learning pattern...{/${door_theme_1.T.accent}-fg}{/center}`);
        this.layout.render();
        learnPattern(cfg, filePath, mode.learnKey, this.entry.archive_name, filePath)
            .then((result) => {
            if (result.ok) {
                const msg = result.duplicate ? 'Pattern already known' : `Learned: ${filePath}`;
                this.layout.setInfo(`{${door_theme_1.T.ok}-fg}${msg}{/${door_theme_1.T.ok}-fg}`);
            }
            else {
                this.layout.setInfo(`{${door_theme_1.T.warn}-fg}Learn failed — server may not have DOORREPO_LEARN_KEY set.{/${door_theme_1.T.warn}-fg}`);
            }
            this.layout.render();
            setTimeout(() => { this.layout.setInfo(''); this.layout.render(); }, 1500);
        })
            .catch(() => {
            this.layout.setInfo(`{${door_theme_1.T.warn}-fg}Learn failed.{/${door_theme_1.T.warn}-fg}`);
            this.layout.render();
        });
    }
    /**
     * Strip the REPOSITORY archive in place: the published bytes change, so
     * the backend re-describes the row (size, digests, junk rows) in the same
     * step. Every other sysop downloads this file, which is why it is worth
     * doing here rather than making each of them strip their own copy.
     */
    doStripArchive() {
        const toStrip = this.files.filter((_, i) => this.checked[i]);
        if (toStrip.length === 0) {
            this.vm.pop();
            this.onDone(null);
            return;
        }
        const svc = (0, doorman_services_1.getCatalogSvc)();
        if (!svc?.stripArchiveOnServer) {
            this.reportFailure('strip', 'catalog service unavailable');
            setTimeout(() => { this.vm.pop(); this.onDone(null); }, 2500);
            return;
        }
        this.layout.setFooter(`{center}{${door_theme_1.T.accent}-fg}Stripping archive...{/${door_theme_1.T.accent}-fg}{/center}`);
        this.layout.render();
        let result;
        try {
            result = svc.stripArchiveOnServer(this.entry.id, toStrip.map((f) => f.path));
        }
        catch (e) {
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
    doStrip(lib, installDir) {
        const toStrip = this.files.filter((_, i) => this.checked[i]);
        if (toStrip.length === 0) {
            this.vm.pop();
            this.onDone(null);
            return;
        }
        this.layout.setFooter(`{center}{${door_theme_1.T.accent}-fg}Stripping...{/${door_theme_1.T.accent}-fg}{/center}`);
        this.layout.render();
        (async () => {
            try {
                lib.stripFilesFromDirectory(installDir, toStrip.map((f) => f.path));
                const svc = (0, doorman_services_1.getCatalogSvc)();
                if (svc) {
                    try {
                        svc.updateJunkCount(this.entry.id, this.files.length - toStrip.length);
                    }
                    catch { }
                    try {
                        svc.removeArchiveFiles(this.entry.id, toStrip.map((f) => f.path));
                    }
                    catch { }
                }
                this.vm.pop();
                this.onDone(toStrip.length);
            }
            catch (e) {
                this.reportFailure('strip', e?.message ?? String(e));
                setTimeout(() => { this.vm.pop(); this.onDone(null); }, 2500);
            }
        })();
    }
    exit() {
        if (this.origLabel)
            try {
                this.layout.listPanel.setLabel(this.origLabel);
            }
            catch { }
        this.keys.release();
    }
    onEsc() { this.vm.pop(); this.onDone(null); }
}
exports.StripView = StripView;
//# sourceMappingURL=doc-strip-views.js.map