/**
 * No repo BBSCmd icon may say ACCESS=0.
 *
 * express.e:4702-4703 `IF access=0 THEN RETURN TRUE` - the door never runs and
 * the internal command of the same name answers. A door open to everyone has
 * NO ACCESS tooltype (readToolTypeInt answers -1 for an absent one). GLC, MAG,
 * THEMEC, TIP and TIPLOGIN carried ACCESS=0 while the board ran them for
 * everyone, and went dead the day the gate followed express.e.
 *
 * Commands/SysCmd/ANSI.info (ACCESS=0 -> internal ANSI) is outside this scan.
 */
import * as fs from 'fs';
import * as path from 'path';

const BBSCMD = path.resolve(__dirname, '../../../../board/Commands/BBSCmd');

/** Icons that deliberately switch their own door off. Keep empty unless the sysop asks. */
const ALLOWED_ACCESS_ZERO: string[] = [];

describe('Commands/BBSCmd icons', () => {
  it('none says ACCESS=0 (a door for everyone has no ACCESS tooltype)', () => {
    const offenders = fs
      .readdirSync(BBSCMD)
      .filter(n => /\.info/i.test(n) && !ALLOWED_ACCESS_ZERO.includes(n))
      .filter(n => {
        const text = fs.readFileSync(path.join(BBSCMD, n)).toString('latin1');
        return /(^|[^A-Za-z_])ACCESS=0(?![0-9])/.test(text);
      });
    expect(offenders).toEqual([]);
  });
});
