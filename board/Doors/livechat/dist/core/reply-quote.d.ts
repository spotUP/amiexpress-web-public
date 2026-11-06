export interface ReplyParent {
    username: string;
    content: string;
}
/**
 * What the context menu's Quote puts in the input box: `> <user>: <text> `,
 * plain text, cursor after it, ready for the caller's own words. Quote used to
 * put only `> ` there, so the sent line said nothing about what was quoted.
 */
export declare function quoteInputText(parent: ReplyParent): string;
/** `  > <parentUser>: <parent snippet>`, dim; one display row, no newlines. */
export declare function formatReplyQuote(parent: ReplyParent): string;
