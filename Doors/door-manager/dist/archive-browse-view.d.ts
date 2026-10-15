/**
 * The archive browser: what is inside a door archive, from catalog data
 * rather than from lha.
 *
 * Moved out of app.ts when it reached the repo's 2000-line ceiling. It reads
 * the catalog's own column names - path, size, is_junk - so both sources
 * feed it the same shape: a local door_catalog row, or a listing fetched
 * from the door server by a consumer.
 */
import { BaseView } from './ViewManager';
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
export declare class ArchiveBrowseView extends BaseView {
    private layout;
    private archiveName;
    private files;
    constructor(layout: ArchiveBrowseLayout, archiveName: string, files: any[]);
    enter(): void;
    exit(): void;
}
//# sourceMappingURL=archive-browse-view.d.ts.map