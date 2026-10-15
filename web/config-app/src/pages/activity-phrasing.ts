/**
 * What an event says, in words a person reads.
 *
 * The feed described events in the board's own shorthand: "U in conference 2",
 * "entered FROGGER", "Tetris.ans (3.3 KB)". Every one of those is the raw
 * payload with punctuation around it - the sysop has to know that U is upload
 * and that conference 2 is Amiga Elite before the line means anything.
 *
 * The command names are taken from the dispatch in
 * `web/backend/src/handlers/command.handler.ts`, where each case carries the
 * AmiExpress name in a comment. They are phrased as something a user DID.
 */

/**
 * Command letter to what the user did.
 *
 * A command with no entry falls back to its letter, which is still better
 * than nothing and is how a door command or a sysop's own addition reads.
 */
const COMMAND_PHRASE: Record<string, string> = {
  '?': 'Showed the menu',
  '0': 'Opened the remote shell',
  '1': 'Edited an account',
  '2': 'Viewed the callers log',
  '3': 'Edited directory files',
  '4': 'Edited a file',
  '5': 'Changed directory',
  A: 'Altered flags',
  B: 'Read a bulletin',
  C: 'Left a comment for the sysop',
  CF: 'Changed conference flags',
  CM: 'Opened conference maintenance',
  D: 'Started a download',
  DB: 'Started a batch download',
  DS: 'Started a download with status',
  E: 'Started writing a message',
  F: 'Browsed the file listings',
  FM: 'Opened file maintenance',
  FR: 'Browsed the raw file listings',
  FS: 'Checked file status',
  G: 'Logged off',
  GR: 'Read the greetings',
  H: 'Asked for help',
  J: 'Joined',
  JM: 'Joined a message base',
  M: 'Toggled ANSI colour',
  MS: 'Scanned for mail',
  N: 'Looked for new files',
  NM: 'Opened node management',
  O: 'Paged the sysop',
  OLM: 'Sent an online message',
  Q: 'Toggled quiet mode',
  R: 'Read messages',
  RL: 'Relogged on',
  RZ: 'Started a Zmodem upload',
  S: 'Checked their statistics',
  T: 'Checked the time',
  U: 'Started an upload',
  UP: 'Checked node uptime',
  US: 'Started a sysop upload',
  V: 'Viewed a text file',
  VER: 'Checked the version',
  VO: 'Opened the voting booth',
  VS: 'Viewed statistics',
};

/** Commands whose phrase reads naturally with " in <conference>" after it. */
const TAKES_CONFERENCE = new Set([
  'U', 'US', 'RZ', 'D', 'DB', 'DS', 'F', 'FR', 'FS', 'FM', 'N',
  'R', 'E', 'MS', 'JM', 'CF', 'B',
]);

/** `J` names the conference it joined rather than the one it started in. */
const JOINS_A_CONFERENCE = 'J';

export function describeCommand(
  command: string | undefined,
  conferenceName: string | undefined,
): string {
  const letter = (command ?? '').toUpperCase();
  if (!letter) return '';

  const phrase = COMMAND_PHRASE[letter];
  if (!phrase) {
    // A door's own command, or one a sysop added, has no entry. "FROGGER in
    // Amiga Warez!" reads like a fragment; "Ran FROGGER" is what happened.
    return conferenceName ? `Ran ${letter} in ${conferenceName}` : `Ran ${letter}`;
  }

  if (letter === JOINS_A_CONFERENCE) {
    return conferenceName ? `${phrase} ${conferenceName}` : 'Joined a conference';
  }

  if (conferenceName && TAKES_CONFERENCE.has(letter)) {
    return `${phrase} in ${conferenceName}`;
  }

  return phrase;
}

/**
 * A door, said as what the user is doing in it.
 *
 * "entered FROGGER" is the payload; "Started a game of FROGGER" is what
 * happened. Only a door the board knows to be a game gets the game wording -
 * calling DOORMAN or LINKWALL a game would be worse than the shorthand.
 */
export function describeDoorActivity(
  doorName: string | undefined,
  action: string | undefined,
  isGame: boolean,
): string {
  const name = doorName ?? 'a door';
  const stopped = action === 'exited';

  if (isGame) {
    return stopped ? `Stopped playing ${name}` : `Started a game of ${name}`;
  }
  return stopped ? `Left ${name}` : `Opened ${name}`;
}

/** An upload or a download, with the area it went to. */
export function describeTransfer(
  direction: 'upload' | 'download',
  fileName: string | undefined,
  humanSize: string | undefined,
  conferenceName: string | undefined,
): string {
  const verb = direction === 'upload' ? 'Uploaded' : 'Downloaded';
  const preposition = direction === 'upload' ? 'to' : 'from';
  const name = fileName ?? 'a file';

  const where = conferenceName ? ` ${preposition} ${conferenceName}` : '';
  const size = humanSize ? ` (${humanSize})` : '';

  return `${verb} ${name}${where}${size}`;
}

/**
 * Is this a door someone PLAYS?
 *
 * Mirrors `normaliseCategory` in web/backend/src/doors/door-category.ts. The
 * declared values are inconsistent by hand - "Games", "game", "utility",
 * "Utilities" - because until now nothing read them.
 */
export function isGameCategory(category: string | null | undefined): boolean {
  const value = String(category ?? '').trim().toLowerCase();
  return value === 'game' || value === 'games';
}
