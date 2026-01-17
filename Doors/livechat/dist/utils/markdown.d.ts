/** Parse markdown formatting for blessed tags */
export declare function parseMarkdown(text: string): string;
/** Parse color tags {color}text{/color} and {bg:color}text{/bg} */
export declare function parseColors(text: string): string;
/** Parse code blocks */
export declare function parseCodeBlock(text: string): string;
/** Parse links [text](url) */
export declare function parseLinks(text: string): string;
/** Parse emotes :name: */
export declare function parseEmotes(text: string): string;
/** Full markdown parsing (excludes animations - those are parsed separately) */
export declare function parseContent(text: string): string;
