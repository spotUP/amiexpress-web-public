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

/** The first word of the line, lowercased, or null once a space is typed. */
function verbOf(buffer: string): string | null {
  let i = 0;
  while (i < buffer.length && (buffer[i] === ' ' || buffer[i] === '\t')) i++;
  const rest = buffer.slice(i);
  if (rest.length === 0) return '';
  const space = rest.search(/[ \t]/);
  // A space means the verb is finished and an argument is being typed.
  if (space !== -1) return null;
  return rest.toLowerCase();
}

/**
 * Every command worth offering for what has been typed, best first.
 *
 * An empty buffer returns everything: that is what makes the prompt
 * discoverable rather than a guessing game.
 */
export function suggestCommands(buffer: string, names: readonly string[]): string[] {
  const verb = verbOf(buffer);
  if (verb === null) return [];
  if (verb === '') return [...names];

  const starts: string[] = [];
  const contains: string[] = [];
  for (const name of names) {
    const lower = name.toLowerCase();
    if (lower.startsWith(verb)) {
      starts.push(name);
    } else if (lower.includes(verb)) {
      contains.push(name);
    }
  }
  return [...starts, ...contains];
}

/**
 * The grey tail shown after the cursor, or '' when there is nothing honest
 * to offer.
 *
 * Only a PREFIX match produces one. A name the typed letters merely appear
 * inside is offered in `suggestCommands` but never completed to.
 */
export function ghostFor(buffer: string, names: readonly string[]): string {
  const verb = verbOf(buffer);
  if (verb === null || verb === '') return '';

  // The first CANDIDATE, so the grey tail always shows what the next TAB
  // will actually do. Reading one name and being given another is worse
  // than no suggestion at all.
  const first = completionCandidates(buffer, names)[0];
  // Slice by the typed LENGTH, so the offer keeps the name's own casing
  // rather than echoing back what was typed.
  return first ? first.slice(verb.length) : '';
}

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
export function completeBuffer(buffer: string, names: readonly string[]): string {
  const verb = verbOf(buffer);
  if (verb === null || verb === '') return buffer;

  const first = completionCandidates(buffer, names)[0];
  if (!first) return buffer;
  const indent = buffer.slice(0, buffer.length - buffer.trimStart().length);
  return indent + first;
}

/**
 * Every command the typed word could still become, best first.
 *
 * Prefix matches ONLY - these are the candidates TAB will cycle through,
 * and completing to a name the letters merely appear inside would put a
 * word on the line nobody asked for. `suggestCommands` is the wider list
 * (it also offers contains-matches, for a menu that wanted to show them);
 * this is the narrower one that may be typed FOR you.
 */
export function completionCandidates(buffer: string, names: readonly string[]): string[] {
  const verb = verbOf(buffer);
  if (verb === null || verb === '') return [];

  // SHORTEST first, then alphabetically.
  //
  // Alphabetical order alone answered "do" with DONKEYKONG and put DOORS
  // fifth, behind DOOR, DOORMAN and DOORREPO - reported as "it autocompletes
  // door, donkeykong, but not doors", because nobody presses TAB five times.
  //
  // The shortest completion is the least presumptuous: it adds the fewest
  // letters that were not typed, and it is almost always the plain command
  // that the longer names are variants of.
  return names
    .filter(name => name.toLowerCase().startsWith(verb))
    .sort((a, b) => (a.length - b.length) || a.localeCompare(b));
}

/**
 * The nth candidate, wrapping round.
 *
 * TAB on "do" answers DOOR, which is the first of DOOR, DOORREPO, DOORS -
 * and if DOOR is not what was wanted there has to be a way forward other
 * than deleting and typing more. Pressing TAB again advances, the way
 * readline's menu-complete does. `index` wraps, so the fourth press on a
 * three-candidate word is the first candidate again.
 */
export function completeNth(
  buffer: string,
  names: readonly string[],
  index: number
): string {
  const candidates = completionCandidates(buffer, names);
  if (candidates.length === 0) return buffer;

  const wrapped = ((index % candidates.length) + candidates.length) % candidates.length;
  const indent = buffer.slice(0, buffer.length - buffer.trimStart().length);
  return indent + candidates[wrapped];
}
