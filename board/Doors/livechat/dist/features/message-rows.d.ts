/**
 * Replace or remove the display rows of one message.
 *
 * The log is one entry per display row (see appendLineToLog), each row
 * carrying its message id, so a message is the run of rows with its id.
 * Both functions edit the two parallel arrays in place and return whether the
 * message was found. The caller re-registers the animated rows afterwards,
 * because splicing shifts every row index behind the message.
 */
export declare function replaceMessageRows(rows: string[], ids: (string | null)[], messageId: string, newRows: string[]): boolean;
export declare function removeMessageRows(rows: string[], ids: (string | null)[], messageId: string): boolean;
