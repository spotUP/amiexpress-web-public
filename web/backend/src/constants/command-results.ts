/**
 * Command result codes - express.e's RESULT_* constants.
 *
 * express.e gives every command a numeric result. The dispatcher, not the
 * command, decides what the caller is told about it:
 *
 *   processInternalCommand (express.e:28285-28402)
 *     res := internalCommandXXX(...)          -> each handler RETURNs a code
 *     ...
 *     IF ((res=RESULT_NOT_ALLOWED) AND (privcmd=FALSE)) THEN higherAccess()
 *
 * That last line (express.e:28400) is the ONLY thing an internal command's
 * refusal prints. `internalCommandOLM` (25416), `internalCommandV` (25676),
 * `internalCommandZ` (26130), `internalCommandLT`/`GT` (24531/24550),
 * `internalCommandA` (24602), `internalCommandFS` (24873) and
 * `internalCommandD` (24854) are all a bare
 * `IF checkSecurity(...)=FALSE THEN RETURN RESULT_NOT_ALLOWED` - not one of
 * them emits a byte of its own.
 *
 * This port had no way to carry that code out of an internal handler (the
 * switch in `command.handler.ts` returned void), so eight handlers invented
 * their own "Permission denied." / "Access denied." strings instead. These
 * constants and `InternalCommandResult` are how a handler says "refused"
 * without saying it to the caller.
 */

/** express.e RESULT_SUCCESS - the command ran. */
export const RESULT_SUCCESS = 0 as const;

/** express.e RESULT_FAILURE - the command was found but did not complete. */
export const RESULT_FAILURE = -1 as const;

/**
 * express.e RESULT_NOT_ALLOWED - the caller's access level or ACS grant
 * refuses this command. Returned, never printed: the dispatcher prints
 * (express.e:28400 for the internal tier, express.e:4705 for SYSCMD/BBSCMD).
 */
export const RESULT_NOT_ALLOWED = -2 as const;

/**
 * What an internal command handler may return.
 *
 * `void` is "ran" - the overwhelming majority of handlers, which stay exactly
 * as they were. `RESULT_NOT_ALLOWED` is a refusal travelling out to the
 * dispatcher. Nothing else: express.e's internal commands return
 * RESULT_FAILURE too, but a failure prints its own error at the point it
 * happens and needs no dispatcher help, so widening this type would only
 * invite handlers to route ordinary errors through the access message.
 */
export type InternalCommandResult = void | typeof RESULT_NOT_ALLOWED;
