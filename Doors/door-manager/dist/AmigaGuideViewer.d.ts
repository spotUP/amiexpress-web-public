/**
 * AmigaGuide viewer — full command support.
 *
 * Global:  @database @$VER @author @(c) @font @width @height @help @index
 *          @toc @macro @rem @remark @master @wordwrap @smartwrap
 * Node:    @node @endnode @next @prev @toc @help @title @keywords
 *          @onopen @onclose @wordwrap @smartwrap
 * Inline:  @{b}/@{ub}  @{i}/@{ui}  @{u}/@{uu}
 *          @{fg <col>}/@{bg <col>}  @{pard}
 *          @{jleft}/@{jright}/@{jcenter}
 *          @{lindent N}/@{rindent N}/@{pari N}
 *          @{settabs N…}/@{cleartabs}/@{tab N}/@{line}/@{clear}
 *          @{"text" link/alink/system/rx/rxs "target"}
 *          @{macroname}
 */
export interface AgLink {
    text: string;
    target: string;
    kind: 'link' | 'alink' | 'system' | 'rx' | 'external';
}
export interface AgNode {
    name: string;
    title: string;
    rendered: string;
    links: AgLink[];
    next?: string;
    prev?: string;
    toc?: string;
    help?: string;
}
export interface AgDocument {
    dbTitle: string;
    nodes: Map<string, AgNode>;
    firstNode: string;
    globalToc?: string;
    globalHelp?: string;
}
export declare function parseAmigaGuide(raw: string): AgDocument;
export declare function showAmigaGuideViewer(screen: any, raw: string, title: string, onDone: () => void): void;
//# sourceMappingURL=AmigaGuideViewer.d.ts.map