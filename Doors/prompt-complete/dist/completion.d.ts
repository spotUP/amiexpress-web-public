/**
 * What to offer after what has been typed at the BBS prompt.
 *
 * The rules are not invented here. They are the ones already written and
 * tested in C for DOORREPO's command bar (`examples/doorrepo-c/flow.c`,
 * `flow_command_suggest` / `flow_command_ghost`), because the two are the
 * same feature on two targets and must not drift:
 *
 *   - what the typed letters START beats what merely contains them, so
 *     typing "install" offers INSTALLED before UNINSTALL;
 *   - a line with a space in it is an ARGUMENT being typed, not a verb, so
 *     nothing is offered once the command word is finished;
 *   - a match in the MIDDLE of a name is never completed to, because
 *     completing there puts a word on the line that was never asked for.
 *
 * Deliberately pure: no BBS, no socket, no I/O. The caller supplies the
 * command names, which is what lets this be tested against the C suite's
 * cases and what keeps the door from needing an opinion about where the
 * BBS keeps its commands.
 */
/**
 * Every command worth offering for what has been typed, best first.
 *
 * An empty buffer returns everything: that is what makes the prompt
 * discoverable rather than a guessing game.
 */
export declare function suggestCommands(buffer: string, names: readonly string[]): string[];
/**
 * The grey tail shown after the cursor, or '' when there is nothing honest
 * to offer.
 *
 * Only a PREFIX match produces one. A name the typed letters merely appear
 * inside is offered in `suggestCommands` but never completed to.
 */
export declare function ghostFor(buffer: string, names: readonly string[]): string;
/**
 * The line after TAB is pressed.
 *
 * Replaces the typed word with the command's OWN spelling rather than
 * appending the tail to it. Appending produced "doOR" from "do" - the
 * user's lower case welded to the board's upper case - and the BBS
 * upper-cases the command before running it anyway, so the canonical name
 * is both what will run and what should be on screen.
 *
 * Leading whitespace is preserved: it is the user's, not ours.
 */
export declare function completeBuffer(buffer: string, names: readonly string[]): string;
/**
 * Every command the typed word could still become, best first.
 *
 * Prefix matches ONLY - these are the candidates TAB will cycle through,
 * and completing to a name the letters merely appear inside would put a
 * word on the line nobody asked for. `suggestCommands` is the wider list
 * (it also offers contains-matches, for a menu that wanted to show them);
 * this is the narrower one that may be typed FOR you.
 */
export declare function completionCandidates(buffer: string, names: readonly string[]): string[];
/**
 * The nth candidate, wrapping round.
 *
 * TAB on "do" answers DOOR, which is the first of DOOR, DOORREPO, DOORS -
 * and if DOOR is not what was wanted there has to be a way forward other
 * than deleting and typing more. Pressing TAB again advances, the way
 * readline's menu-complete does. `index` wraps, so the fourth press on a
 * three-candidate word is the first candidate again.
 */
export declare function completeNth(buffer: string, names: readonly string[], index: number): string;
//# sourceMappingURL=completion.d.ts.map