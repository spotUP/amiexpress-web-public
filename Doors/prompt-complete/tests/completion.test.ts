/**
 * The completion rules, pinned against the C suite they came from.
 *
 * These are the same cases `examples/doorrepo-c/tests/test_flow.c` runs
 * against `flow_command_suggest` / `flow_command_ghost`. Two targets, one
 * behaviour: if these two suites ever disagree, one of them is wrong.
 */
import assert from 'assert';
import { suggestCommands, ghostFor, completeBuffer, completionCandidates, completeNth } from '../completion';

/** The DoorRepo command set, so the C cases transfer unchanged. */
const NAMES = [
  'help', 'get', 'install', 'uninstall', 'files', 'doc', 'archive', 'strip',
  'access', 'config', 'history', 'installed', 'find', 'type', 'reset',
  'hide', 'owner', 'patterns', 'quit',
];

export async function everythingIsOfferedBeforeALetterIsTyped(): Promise<void> {
  // The point of the feature: an empty prompt knows what it can do.
  assert.strictEqual(suggestCommands('', NAMES).length, NAMES.length);
}

export async function theListNarrowsAsTheLettersArrive(): Promise<void> {
  const got = suggestCommands('in', NAMES);
  assert.ok(got.includes('install'), 'install offered');
  assert.ok(got.includes('installed'), 'installed offered');
  assert.ok(!got.includes('quit'), 'quit is not a match');
}

export async function whatTheLettersStartComesFirst(): Promise<void> {
  // The case that tells the two rules apart: UNINSTALL contains "install"
  // and sits earlier in the list than INSTALLED, which starts with it.
  const got = suggestCommands('install', NAMES);
  assert.strictEqual(got[0], 'install', 'the exact word leads');
  assert.ok(
    got.indexOf('installed') < got.indexOf('uninstall'),
    `starts-with must beat contains: ${got.join(',')}`
  );
}

export async function nothingIsOfferedOnceAnArgumentIsBeingTyped(): Promise<void> {
  // "find dung" is a search for dung. Completing the word after the space
  // would fight the typing.
  assert.deepStrictEqual(suggestCommands('find ', NAMES), []);
  assert.deepStrictEqual(suggestCommands('find dung', NAMES), []);
  assert.strictEqual(ghostFor('find dung', NAMES), '');
}

export async function theGhostIsTheRestOfTheBestMatch(): Promise<void> {
  assert.strictEqual(ghostFor('in', NAMES), 'stall');
  assert.strictEqual(ghostFor('un', NAMES), 'install');
  assert.strictEqual(ghostFor('help', NAMES), '', 'nothing left to add');
}

export async function theGhostIsSilentWhenItWouldBeAGuess(): Promise<void> {
  // "stall" appears inside install, but nobody typing it asked for install.
  assert.strictEqual(ghostFor('stall', NAMES), '');
  assert.strictEqual(ghostFor('', NAMES), '');
  assert.strictEqual(ghostFor('zzz', NAMES), '');
}

export async function theGhostIgnoresCase(): Promise<void> {
  assert.strictEqual(ghostFor('HEL', NAMES), 'p');
  assert.strictEqual(ghostFor('InS', NAMES), 'tall');
}

export async function theGhostKeepsTheCommandsOwnCasing(): Promise<void> {
  // A board's commands are upper case. Typing lower case must not offer a
  // tail that renders the name in two cases at once.
  assert.strictEqual(ghostFor('jo', ['JOIN', 'JUMP']), 'IN');
}

export async function tabUsesTheCommandsOwnSpelling(): Promise<void> {
  // Appending the tail welded the user's lower case to the board's upper
  // case - "do" completed to "doOR". The BBS upper-cases the command
  // before running it, so the canonical name is both what will run and
  // what belongs on screen.
  assert.strictEqual(completeBuffer('do', ['DOOR', 'DOORREPO']), 'DOOR');
  assert.strictEqual(completeBuffer('jo', ['JOIN']), 'JOIN');
  assert.strictEqual(completeBuffer('  jo', ['JOIN']), '  JOIN', 'indent is the user\'s');
}

export async function tabCompletesTheWholeLine(): Promise<void> {
  assert.strictEqual(completeBuffer('in', NAMES), 'install');
  assert.strictEqual(completeBuffer('help', NAMES), 'help', 'already complete');
  assert.strictEqual(completeBuffer('zzz', NAMES), 'zzz', 'nothing to complete to');
  assert.strictEqual(completeBuffer('find dung', NAMES), 'find dung', 'an argument is left alone');
}

export async function leadingSpacesDoNotHideTheVerb(): Promise<void> {
  assert.strictEqual(ghostFor('  in', NAMES), 'stall');
}

export async function anEmptyCommandListIsHarmless(): Promise<void> {
  // A board mid-startup, or a user with access to nothing.
  assert.deepStrictEqual(suggestCommands('in', []), []);
  assert.strictEqual(ghostFor('in', []), '');
  assert.strictEqual(completeBuffer('in', []), 'in');
}

export async function tabCyclesWhenTheFirstGuessIsWrong(): Promise<void> {
  // "the autocomplete door doesnt autocomplete DOORS, it autocompletes to
  // DOOR". Both are real commands and "do" is genuinely ambiguous, so the
  // first answer cannot always be right - what matters is that there is a
  // way forward that is not deleting and typing more.
  const names = ['DOOR', 'DOORREPO', 'DOORS'];

  assert.strictEqual(completeNth('do', names, 0), 'DOOR');
  assert.strictEqual(completeNth('do', names, 1), 'DOORREPO');
  assert.strictEqual(completeNth('do', names, 2), 'DOORS');
}

export async function cyclingWrapsRatherThanRunningOut(): Promise<void> {
  const names = ['DOOR', 'DOORS'];
  assert.strictEqual(completeNth('do', names, 2), 'DOOR', 'back to the first');
  assert.strictEqual(completeNth('do', names, 3), 'DOORS');
  assert.strictEqual(completeNth('do', names, -1), 'DOORS', 'and backwards');
}

export async function cyclingOnlyOffersPrefixMatches(): Promise<void> {
  // A name the letters merely appear INSIDE must never be typed for you.
  const names = ['UNINSTALL', 'INSTALL'];
  assert.deepStrictEqual(completionCandidates('install', names), ['INSTALL']);
}

export async function cyclingLeavesAnArgumentAlone(): Promise<void> {
  assert.deepStrictEqual(completionCandidates('find dung', ['FIND']), []);
  assert.strictEqual(completeNth('find dung', ['FIND'], 0), 'find dung');
}
