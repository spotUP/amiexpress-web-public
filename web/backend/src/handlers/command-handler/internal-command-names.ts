/**
 * The commands the BBS answers itself, which are not files on disk.
 *
 * A door is a registration in a command directory and can be listed by
 * reading one. These cannot: `express.e:4732` dispatches them internally,
 * and the web port answers them from a switch in `command.handler.ts`. So
 * a prompt that completes "every door and every BBS command" has to carry
 * this half of the list explicitly.
 *
 * **Kept honest by a test, not by discipline.** A hand-maintained copy of a
 * switch statement drifts the first time somebody adds a case;
 * `tests/handlers/internal-command-names.test.ts` re-parses that switch and
 * fails when the two disagree. Add a case, run the tests, add it here.
 */
export const INTERNAL_COMMAND_NAMES: readonly string[] = [
  'D',
  'DS',
  'DB',
  'U',
  'UP',
  'US',
  '0',
  '1',
  '2',
  '3',
  '4',
  '5',
  'MS',
  'OLM',
  'LIVECHAT',
  'ROOM',
  'Q',
  'RL',
  'RZ',
  'S',
  'V',
  'VS',
  'VO',
  'VER',
  'W',
  'WHD',
  'X',
  'Z',
  'ZOOM',
  'R',
  'A',
  'E',
  'EALL',
  'J',
  'JM',
  'F',
  'FR',
  'FM',
  'FS',
  'N',
  'O',
  'T',
  'B',
  'H',
  'M',
  'NM',
  'CM',
  'WEBHOOK',
  'G',
  'GR',
  'C',
  'CF',
  '?',
  'DOOR',
  'DOORS',
];
