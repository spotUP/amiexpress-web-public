/**
 * AmigaGuide viewer for the DOORMAN blessed UI.
 *
 * Parses AmigaGuide hypertext (.guide) documents into named nodes,
 * renders inline markup to blessed tags, and provides node navigation
 * (links, Next/Prev/Toc, history stack).
 *
 * Reference: http://www.lysator.liu.se/amiga/code/guide/amigaguide.guide
 */
export interface AgLink {
    text: string;
    target: string;
}
export interface AgNode {
    name: string;
    title: string;
    rendered: string;
    links: AgLink[];
    next?: string;
    prev?: string;
    toc?: string;
}
export interface AgDocument {
    dbTitle: string;
    nodes: Map<string, AgNode>;
    firstNode: string;
}
export declare function parseAmigaGuide(raw: string): AgDocument;
export declare function showAmigaGuideViewer(screen: any, raw: string, title: string, onDone: () => void): void;
//# sourceMappingURL=AmigaGuideViewer.d.ts.map