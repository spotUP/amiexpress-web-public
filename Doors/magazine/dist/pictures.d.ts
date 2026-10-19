/**
 * A story's pictures as rows the reader sets in a column (plan
 * 2026-10-19-mag-linked-media-ascii, M9). The converted rows live in the
 * story's sidecar (written by the backend); this turns the one stored at the
 * caller's column width into painted rows, reusing the art row readers so an
 * ANSI picture and a .seq picture reach the screen exactly as board art does.
 */
import { type StoryMedia, type StoryMediaSidecar } from '@amiexpress/bbs-door-sdk/formats/magazine';
/** The sidecar and the caller's terminal: what buildArticle needs to place pictures. */
export interface ArticleMedia {
    sidecar: StoryMediaSidecar | null;
    /** True when the caller reads .seq rows (a C64, or a screen of forty columns or fewer). */
    petscii: boolean;
}
export interface PictureRow {
    raw: string;
    text: string;
}
/** The rendering for `colWidth`: the exact width, else the widest narrower one. Null when none. */
export declare function pictureRows(sidecar: StoryMediaSidecar | null, mediaIndex: number, petscii: boolean, colWidth: number): PictureRow[] | null;
/**
 * The fullscreen rendering the viewer shows (D11): 80x24 ANSI or 40x24 PETSCII,
 * always at the stored size (the viewer centres it). Null when the sidecar has none.
 */
export declare function fullscreenRows(sidecar: StoryMediaSidecar | null, mediaIndex: number, petscii: boolean): {
    cols: number;
    rows: PictureRow[];
} | null;
/** What the item is and where it comes from (D7): `IMG site` or `VIDEO site`. */
export declare function mediaCredit(media: StoryMedia): string;
/** `>> IMG site  [V] view` / `>> VIDEO site  [V] play`, in the source trailer's style (D11). */
export declare function creditLine(media: StoryMedia): string;
//# sourceMappingURL=pictures.d.ts.map