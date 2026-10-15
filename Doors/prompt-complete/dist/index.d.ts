/**
 * PROMPTCOMPLETE - ghost-text completion for the BBS main prompt.
 *
 * "Just a discreet auto fill/complete with dark grey that you can tab to
 * complete words in the prompt", covering every door and every internal
 * BBS command, at the main prompt and nowhere else.
 *
 * ## Why this is a door
 *
 * So it is optional. Install it and the prompt completes; delete it and
 * the prompt is exactly what it was. The BBS asks whichever installed door
 * declares `PROMPTCOMPLETE=YES` in its .info for a suggestion, and asks
 * nobody if none is installed.
 *
 * It cannot work this way on real 68K AmiExpress, and that is worth
 * knowing before anyone tries: `express.e:28620` reads the whole line with
 * `lineInput()` and only reaches a door at `processCommand`
 * (`express.e:28647`), so a door there is handed a finished command and
 * never a keystroke. The Amiga version of this is a change to `lineInput`
 * itself - TAB is unused there today, so it would be additive. See
 * thoughts/shared/research/2026-09-01_doorrepo-back-navigation-and-a-prompt-autocomplete-door.md.
 *
 * ## What it does NOT do
 *
 * No list, no box, no second screen. The sysop asked for a grey tail after
 * the cursor and nothing else, and a door that draws a menu is the thing
 * that was explicitly rejected.
 *
 * ## Running it as a command
 *
 * Running PROMPTCOMPLETE from the menu prints what it is and whether it is
 * active. There is nothing to configure yet; the completion happens at the
 * prompt, not in here.
 */
import { suggestCommands, ghostFor, completeBuffer, completionCandidates, completeNth } from './completion.js';
/**
 * The interface the BBS calls. Kept deliberately small and pure - names in,
 * text out - so this door never needs the socket, the session, or an
 * opinion about where the BBS keeps its command list.
 */
export declare const promptCompleter: {
    /** The grey tail to draw after the cursor, or '' for nothing. */
    ghost(buffer: string, names: readonly string[]): string;
    /** The line after TAB is pressed. */
    complete(buffer: string, names: readonly string[]): string;
    /**
     * The line after the (index+1)th TAB. Pressing TAB again on the same word
     * advances through the candidates rather than repeating the first one.
     */
    completeNth(buffer: string, names: readonly string[], index: number): string;
    /** How many commands the typed word could still become. */
    candidates(buffer: string, names: readonly string[]): string[];
};
export { suggestCommands, ghostFor, completeBuffer, completionCandidates, completeNth };
interface DoorSession {
    user?: {
        username?: string;
    };
}
/**
 * The door's own screen. Deliberately a report rather than a UI: the
 * feature lives at the prompt, so there is nothing to drive in here.
 */
export declare function runDoor(bbs: any, _session?: DoorSession): Promise<void>;
export default runDoor;
//# sourceMappingURL=index.d.ts.map