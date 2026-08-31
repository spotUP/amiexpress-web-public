/**
 * What the info panel shows once a delete has finished.
 *
 * The panel had three writers and the last one won: refresh() redrew it for
 * the newly selected door, and then the success message painted "Deleted"
 * over the top. So after deleting a door the list moved to the next one,
 * highlighted it, and the panel beside it went on describing the delete
 * until the sysop moved the cursor. Reported from the live board on
 * 2026-08-31.
 *
 * The rule, stated once here rather than three times in the handler: a
 * delete that WORKED has nothing left to say in the panel - the log panel
 * carries every step and the header flashes the outcome - so the panel goes
 * back to describing whatever door is selected now. A delete that FAILED, or
 * one that removed the files and left the door registered, has something the
 * sysop needs to read, and keeps the panel.
 */
export type DeleteOutcomeView = {
    kind: 'showSelectedDoor';
} | {
    kind: 'message';
    text: string;
};
export interface DeleteOutcome {
    /** what deleteDoor() reported */
    success: boolean;
    /** whether the command is STILL in the door list afterwards */
    stillListed: boolean;
    /** the command that was deleted, for the message */
    command: string;
    /** deleteDoor()'s own message, shown when it failed */
    message?: string;
}
export declare function deleteOutcomeView(outcome: DeleteOutcome): DeleteOutcomeView;
//# sourceMappingURL=delete-outcome.d.ts.map