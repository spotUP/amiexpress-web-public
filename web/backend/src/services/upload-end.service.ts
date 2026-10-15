/**
 * WHERE AN UPLOAD ENDS - uploadaFile's RETURN.
 *
 * express.e's uploadaFile (18944-19550) is one procedure, and it returns to
 * whoever called it:
 *
 *   - the U command (internalCommandU, 25646-25658), which goes back to the
 *     menu;
 *   - saveNewMSG's X (10721-10740), which removes the message's F<n> when it
 *     stayed empty and then returns to ITS caller - the reader, the logon
 *     scan, the menu.
 *
 * On this board the upload is a sub-state machine driven one keystroke at a
 * time (the FileName/Okay prompts in command.handler, the transfer in
 * user-commands.handler, the description and filing in file-socket-handlers,
 * the stats in post-upload.service). Each of its ways out used to set the
 * menu state itself, so nothing could wait for an upload to finish.
 *
 * Every way out now calls `endUpload`, and this is the one place it ends:
 *
 *   - nobody waiting (the U command): `toMenu` runs - the exit's own menu
 *     state, exactly what it did before;
 *   - a procedure waiting (`awaitUploadEnd`, armed by uploadaFile's caller):
 *     the caller's sub-state comes back and its promise resolves with the
 *     result, and the caller carries on from the line after the upload.
 */
import type { BBSSession } from '../index';

/** uploadaFile's result as its callers read it: RESULT_SUCCESS, RESULT_FAILURE, RESULT_GOODBYE. */
export type UploadStat = 'success' | 'failure' | 'goodbye';

/** The caller waiting on an upload: its state, and where to hand the result. */
export interface UploadReturn {
  subState: BBSSession['subState'];
  resume: (stat: UploadStat) => void;
}

/**
 * Arm the return before the upload starts. Resolves once, when the upload
 * ends by any exit, with the caller's sub-state restored.
 */
export function awaitUploadEnd(session: BBSSession): Promise<UploadStat> {
  return new Promise<UploadStat>((resolve) => {
    session.uploadReturn = { subState: session.subState, resume: resolve };
  });
}

/**
 * The upload is over. `toMenu` is what this exit does when nobody is
 * waiting - the menu state it has always set.
 */
export function endUpload(session: BBSSession, stat: UploadStat, toMenu: () => void): void {
  const waiting = session.uploadReturn;
  if (!waiting) {
    toMenu();
    return;
  }
  session.uploadReturn = undefined;
  session.subState = waiting.subState;
  waiting.resume(stat);
}
