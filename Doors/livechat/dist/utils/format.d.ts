/** Format time for display */
export declare function formatTime(date: Date): string;
/** Truncate text with ellipsis */
export declare function truncate(text: string, max: number): string;
/** Wrap text to width */
export declare function wrapText(text: string, width: number): string[];
/** Escape special chars for blessed tags */
export declare function escapeContent(text: string): string;
