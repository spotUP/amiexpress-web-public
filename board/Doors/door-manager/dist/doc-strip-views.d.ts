/**
 * The two read-and-clean views: the document viewer (a door's .doc/.guide/
 * README) and the ad stripper.
 *
 * Split out of app.ts when it reached the 2000-line ceiling, the same way
 * install-core.ts and doorman-layout.ts were. Neither view imports app.ts,
 * so there is no cycle - both take the layout they draw into.
 */
import { BaseView } from './ViewManager';
import { DoormanLayout } from './doorman-layout';
import type { CatalogEntry as RepoCatalogEntry } from './repoDataSource';
type CatalogEntry = RepoCatalogEntry;
export declare class DocView extends BaseView {
    private layout;
    private title;
    private content;
    private panel;
    private hint;
    constructor(layout: DoormanLayout, title: string, content: string);
    enter(): void;
    exit(): void;
}
export declare class StripView extends BaseView {
    private layout;
    private entry;
    private archivePath;
    private overrideDir?;
    private onDone;
    private checked;
    private files;
    private reasons;
    private origLabel;
    private canStrip;
    /** Set when this strip would edit the repository archive rather than an
     *  installed directory; `reason` explains why it cannot, when it cannot. */
    private archiveStrip;
    constructor(layout: DoormanLayout, entry: CatalogEntry, archivePath: string | null, overrideDir: string | undefined, onDone: (stripped: number | null) => void);
    /** Loud-error convention (see reportInstallFailure in RepoView): log to
     * the process console for docker logs / journald visibility, and hold a
     * persistent message in the info panel instead of a message that quietly
     * self-clears. */
    private reportFailure;
    enter(): void;
    private renderFiles;
    /**
     * Learn the currently selected file as a junk pattern. This teaches the
     * central classifier to recognise this filename in future archives.
     * Re-runs the analysis afterward so the sysop sees the updated verdict.
     */
    private learnSelected;
    /**
     * Strip the REPOSITORY archive in place: the published bytes change, so
     * the backend re-describes the row (size, digests, junk rows) in the same
     * step. Every other sysop downloads this file, which is why it is worth
     * doing here rather than making each of them strip their own copy.
     */
    private doStripArchive;
    private doStrip;
    exit(): void;
    onEsc(): void;
}
export {};
//# sourceMappingURL=doc-strip-views.d.ts.map