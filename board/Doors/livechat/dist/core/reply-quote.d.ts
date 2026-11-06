export interface ReplyParent {
    username: string;
    content: string;
}
/** `  > <parentUser>: <parent snippet>`, dim; one display row, no newlines. */
export declare function formatReplyQuote(parent: ReplyParent): string;
