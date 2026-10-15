/**
 * HOW LONG THE BOT WAITS FOR THE BOARD.
 *
 * Node's axios has NO default timeout: a request to a board that accepted the
 * socket and then stopped answering never settles. Every Discord slash
 * command is handled inside an interaction that Discord expires, so a hung
 * read left the user staring at "thinking..." until it turned into "The
 * application did not respond", with the handler still pending behind it.
 *
 * One number for every client here, matching the feed's own login timeout.
 */
export const BOARD_HTTP_TIMEOUT_MS = 10000;
