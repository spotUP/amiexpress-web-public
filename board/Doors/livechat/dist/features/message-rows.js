"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.replaceMessageRows = replaceMessageRows;
exports.removeMessageRows = removeMessageRows;
/**
 * Replace or remove the display rows of one message.
 *
 * The log is one entry per display row (see appendLineToLog), each row
 * carrying its message id, so a message is the run of rows with its id.
 * Both functions edit the two parallel arrays in place and return whether the
 * message was found. The caller re-registers the animated rows afterwards,
 * because splicing shifts every row index behind the message.
 */
function replaceMessageRows(rows, ids, messageId, newRows) {
    const first = ids.indexOf(messageId);
    if (first < 0)
        return false;
    let count = 0;
    while (ids[first + count] === messageId)
        count++;
    rows.splice(first, count, ...newRows);
    ids.splice(first, count, ...newRows.map(() => messageId));
    return true;
}
function removeMessageRows(rows, ids, messageId) {
    return replaceMessageRows(rows, ids, messageId, []);
}
