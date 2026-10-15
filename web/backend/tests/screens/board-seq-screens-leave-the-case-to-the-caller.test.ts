/**
 * The board's own C64 screens do not switch the caller to lower case.
 *
 * A PETSCII caller chooses his case with CTRL+L (the C*Base convention,
 * thoughts/shared/plans/2026-10-04-petscii-ctrl-l-case-toggle.md). A screen
 * that opens with `$0E` (switch to lower case) undoes that choice every time
 * it is shown, so the sysop decided on 2026-10-04 to take the byte out of the
 * board's own `.seq` screens.
 *
 * "Leading" is the PETSCII sense: before the art's first printable character.
 * A screen may open with the board's MCI gate (`~D|`, `~f|`, never sent to
 * the machine) and with codes that print nothing - colours, clear, home,
 * reverse, cursor moves; a `$0E` among those is still the screen's opening
 * case switch. A `$0E` after the first printable character is art and stays.
 *
 * Every tracked board screen: Screens/, Conf<n>/, Themes/ and the Node<n>/
 * directories the image collapses into Screens/Node/.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const REPO = path.resolve(__dirname, '../../../..');

const NON_PRINTING = new Set([
  0x05, 0x11, 0x12, 0x13, 0x1c, 0x1d, 0x1e, 0x1f, 0x81, 0x8e, 0x90, 0x91, 0x92, 0x93,
  0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0x9b, 0x9c, 0x9d, 0x9e, 0x9f,
]);
const GATES = ['~D|', '~f|'].map(g => Buffer.from(g, 'latin1'));

/** Where the screen's opening `$0E` is, or -1 when it has none. */
function leadingLowerCase(bytes: Buffer): number {
  let i = 0;
  while (i < bytes.length) {
    const gate = GATES.find(g => bytes.subarray(i, i + g.length).equals(g));
    if (gate) { i += gate.length; continue; }
    if (bytes[i] === 0x0e) return i;
    if (NON_PRINTING.has(bytes[i])) { i++; continue; }
    return -1;
  }
  return -1;
}

function boardSeqScreens(): string[] {
  const listed = execFileSync('git', ['ls-files', '-z', '--', 'Screens', 'Themes', 'Conf*', 'Node*'], {
    cwd: REPO, encoding: 'latin1', maxBuffer: 64 * 1024 * 1024,
  });
  return listed.split('\0').filter(f => /\.seq$/i.test(f) && /^(Screens|Themes|Conf\d+|Node\d+)\//.test(f));
}

describe('the board\'s C64 screens', () => {
  const files = boardSeqScreens();

  it('are found (the walk itself is not empty)', () => {
    expect(files.length).toBeGreaterThan(40);
  });

  it('none opens with $0E, so the caller\'s CTRL+L case survives a screen', () => {
    const opening = files.filter(f => leadingLowerCase(fs.readFileSync(path.join(REPO, f))) >= 0);
    expect(opening).toEqual([]);
  });

  it('the opening switch may follow the MCI gate and a clear; a $0E after a printable character is art', () => {
    expect(leadingLowerCase(Buffer.from([0x7e, 0x44, 0x7c, 0x93, 0x0e, 0x41]))).toBe(4);
    expect(leadingLowerCase(Buffer.from([0x41, 0x0e, 0x42]))).toBe(-1);
  });
});
