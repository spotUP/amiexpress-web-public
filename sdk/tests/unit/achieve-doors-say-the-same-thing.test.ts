/**
 * The two ACHIEVE doors are one door in two languages.
 *
 * SP4's third item asks for parity between the C door
 * (`sdk/c/examples/achieve/achieve.c`) and its TypeScript twin
 * (`Doors/achieve/`). A byte-for-byte comparison would be a lie: the C door
 * deliberately offers less - a 68K door cannot hold a JSON catalogue, and the
 * account flow needs a mail round trip and a keyboard - so what has to match
 * is the part they SHARE, and it has to match in the caller's own words.
 *
 * So this pins the wording. The twin writes "This board's scoreboard" at 80
 * columns and "Board scoreboard" at 40; the C door must say the same, at the
 * same widths, or the two doors are two doors.
 */
import * as fs from 'fs';
import * as path from 'path';

const REPO = path.resolve(__dirname, '../../..');
// The whole C door, every source it is built from: its words moved into
// achieve_rows.c (a09ea46da) and a test reading achieve.c alone went red
// while the two doors still said the same thing.
const C_DIR = path.join(REPO, 'sdk/c/examples/achieve');
const C_DOOR = fs.readdirSync(C_DIR)
  .filter((f) => f.endsWith('.c') || f.endsWith('.h'))
  .sort()
  .map((f) => fs.readFileSync(path.join(C_DIR, f), 'utf8'))
  .join('\n');
const TS_DOOR = fs.readFileSync(path.join(REPO, 'board', 'Doors/achieve/app.ts'), 'utf8');

/** The labels menuItems() writes, as `[wide, compact]` pairs. */
function twinLabels(): Array<{ id: string; wide: string; compact: string }> {
  const block = TS_DOOR.slice(TS_DOOR.indexOf('export function menuItems'));
  const rows: Array<{ id: string; wide: string; compact: string }> = [];
  const pattern = /\{ id: '(\w+)', label: short \? '([^']+)' : ('([^']+)'|"([^"]+)")/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(block)) !== null) {
    rows.push({ id: match[1], compact: match[2], wide: match[4] ?? match[5] });
  }
  return rows;
}

describe('the C door and its TypeScript twin', () => {
  it('reads the twin, so a rename of the twin is caught here', () => {
    const labels = twinLabels();
    expect(labels.map((l) => l.id)).toEqual(['profile', 'catalog', 'board', 'global', 'quit']);
  });

  it.each(['board', 'global', 'catalog', 'quit'])(
    'says the same as the twin for %s, at both widths',
    (id) => {
      const label = twinLabels().find((l) => l.id === id);
      expect(label).toBeDefined();
      expect({ id, wide: C_DOOR.includes(`"${label!.wide}"`) }).toEqual({ id, wide: true });
      expect({ id, compact: C_DOOR.includes(`"${label!.compact}"`) }).toEqual({ id, compact: true });
    },
  );

  /**
   * What the C door does NOT offer, said out loud rather than left to be
   * discovered: the profile needs the player's own email (which the board
   * holds, not the door) and the account flow needs a mail round trip. The
   * C door's account row points at the web terminal instead of pretending.
   */
  it('points at the web terminal for the account rather than offering it', () => {
    expect(C_DOOR).toContain('Account: on the web terminal');
    expect(C_DOOR).toContain('Linking your account needs the web terminal:');
  });

  it('reads the two text endpoints, which is why it can run on a 68K at all', () => {
    // A 68K door cannot hold the JSON catalogue in a static buffer; the
    // server offers these for exactly that reason.
    expect(C_DOOR).toContain('/achievements/v1/leaderboard.txt');
    expect(C_DOOR).toContain('/achievements/v1/catalog.txt');
  });

  /**
   * The row shapes are not asserted here on purpose. What the door does with
   * `<rank>|<handle>|<points>|<unlocks>` is only knowable by running it, and
   * it was: driven on the 68K emulator against a stub serving the server's
   * own format, it drew
   *
   *     BOARD SCOREBOARD
   *     >>  1  spot                 1200 pts    14 unlocked
   *         2  notorious             860 pts     9 unlocked
   *
   * A regex over the C source would have passed whatever that run produced.
   */
});
