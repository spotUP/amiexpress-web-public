/**
 * What a questionnaire script file IS, in one place.
 *
 * `express.e:30323 doNewUserQuestions()` reads `Node<n>/Script<baud>` after
 * the registration summary: a line ending in `~` is a question and the
 * caller's answer is appended to `Node<n>/Answers`; every other line is shown
 * as it is - including the `~CC_` codes this board's questionnaire carries, so
 * the file is a screen that also asks things.
 *
 * The convention was written down three times and disagreed with itself:
 *
 *   - `new-user.handler.ts` READS by preference - the caller's own baud, then
 *     57600, 38400, 33600, 28800, 19200, 14400, then any `script*`.
 *   - `questionnaire-routes.ts` WRITES a different list: 2400, 14400, 16800,
 *     19200, 38400, 57600, 115200.
 *   - The screen index knew nothing about either, so 281 files on this board
 *     were invisible to the manager.
 *
 * Reading and writing are different questions and both lists are right for
 * their own job, so both live here rather than one being bent into the other.
 * What matters is that there is now ONE definition of "this file is a
 * questionnaire script" and ONE answer to "which copy would the board run".
 */

/** The catalogue name. A screen, so the manager can carry it like any other. */
export const QUESTIONNAIRE_SCREEN = 'QUESTIONNAIRE';

/** The stem every copy shares. The baud follows it, with no separator. */
export const QUESTIONNAIRE_STEM = 'script';

/**
 * The bauds a save writes, which is what this board has always carried: one
 * questionnaire in seven copies per node.
 */
export const QUESTIONNAIRE_BAUDS = [
  '2400', '14400', '16800', '19200', '38400', '57600', '115200',
] as const;

/**
 * The order `findQuestionnaireScript` falls back through when the caller's own
 * baud has no file (new-user.handler.ts:1389). The index reports the copy this
 * names, because that is the one a caller actually meets.
 */
export const QUESTIONNAIRE_READ_ORDER = [
  '57600', '38400', '33600', '28800', '19200', '14400',
] as const;

/** `script2400` yes, `scriptures.txt` no. */
export function isQuestionnaireScript(fileName: string): boolean {
  return /^script\d+$/i.test(fileName);
}

/** The baud in a script file's name, or null when it is not one. */
export function baudOf(fileName: string): string | null {
  const match = /^script(\d+)$/i.exec(fileName);
  return match ? match[1] : null;
}

/**
 * Which of these copies the board would run for a caller whose own baud has
 * no file of its own - the same walk the new-user flow makes, then anything
 * beginning `script` as a last resort.
 */
export function preferredScript(names: string[]): string | null {
  const scripts = names.filter(isQuestionnaireScript);
  if (scripts.length === 0) return null;

  for (const baud of QUESTIONNAIRE_READ_ORDER) {
    const hit = scripts.find(name => baudOf(name) === baud);
    if (hit) return hit;
  }
  // The handler's own last resort: the first file beginning `script`.
  return scripts.slice().sort((a, b) => a.localeCompare(b))[0];
}
