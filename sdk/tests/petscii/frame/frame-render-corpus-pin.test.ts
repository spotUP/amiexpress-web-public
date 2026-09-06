/**
 * BYTE PIN: renderDiff's exact output over every adapter corpus fixture.
 *
 * Captured BEFORE renderDiff became an adapter over the shared run differ
 * (`sdk/common/run-diff.ts`), so the refactor is provably byte-for-byte: a
 * sha256 over the whole render chain of each fixture, plus the render count
 * and the byte count, as inline expectations. Nothing here may be edited to
 * make the refactor pass - a changed hash IS the regression.
 *
 * The chain is the one the C64 door adapter drives: every frame the
 * reconstructor passes through, adapted to 40x25, rendered as a diff against
 * the frame before it (the first render has no previous frame, so it is the
 * full-paint path with the clear+home prefix).
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { FrameReconstructor } from '../../../petscii/frame/ansi-screen';
import { adaptFrame } from '../../../petscii/frame/adapt';
import { renderDiff } from '../../../petscii/frame/frame-render';
import { Frame } from '../../../petscii/frame/types';

const DIR = path.join(__dirname, 'fixtures');

interface ManifestEntry {
  /** Golden fixtures (`<id>.txt`) are 8-bit door output and must be read as latin1. */
  encoding?: 'latin1';
}

const manifest: Record<string, ManifestEntry> = JSON.parse(
  fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'),
);

interface Pin {
  renders: number;
  bytes: number;
  sha256: string;
}

/**
 * Every fixture, pinned.
 *
 * The ELEVEN captured before the shared-run-differ refactor are frozen: a
 * changed hash among them IS the regression this file exists to catch, and
 * none of them may be re-measured to make anything pass.
 *
 * The thirteen below them are captures added on 2026-09-03 with the doors
 * they were taken from; their hashes are the FIRST measurement of new inputs,
 * not a re-measurement of old ones, and they are frozen from here on under the
 * same rule.
 *
 * SEVEN more were RE-MEASURED later on 2026-09-06, under the same rule and for
 * the same reason: `recordFields` dropped its "the right field contains no
 * blank" guard, because that guard cost `GWALL` its two-word handles and cost
 * `what` the whole of `Total bytes: [ 0 ]`. Which fixtures were allowed to move
 * was decided by measurement first: every row of every frame of every fixture
 * was run through `chooseRule` before and after, exactly these seven change -
 * `six_status`, `kd_confstats`, `ratiorep`, `super_stats`, `what`, `b`, `j` -
 * and every changed row was read as 40-column cells and confirmed to gain
 * characters, never lose them (`what` keeps its byte count, `kd_confstats`
 * keeps `AmiExpress-Web` instead of `Ami>`). The other 16 hashes are untouched.
 *
 * FOUR were re-measured for the LAST change of 2026-09-06, `narrowRow` shrinking
 * DECORATION before CONTENT: `color_wall`, `super_stats`, `rtw` and `gwall`.
 * Measured the same way and it is the sharpest measurement of the set, because
 * this change moves NO row to a different rule at all - every frame of all 28
 * fixtures chooses exactly what it chose before - it only changes WHICH column
 * inside a narrowed row gives up its cells. So the rule census says nothing and
 * these hashes are the evidence. Sixteen rows render differently and every one
 * of them gains: `color_wall` keeps `cOLORWALL v1.3` where it read `cOLO>`,
 * `super_stats` keeps `[D-zign by Recall/-U!]` where it read
 * `[D-zign by Recal>`, nine `rtw` rows keep more of their menu labels, and
 * `gwall`'s footer keeps more of its credits. `rtw` grows 1301 bytes because
 * its logo rows now carry more glyphs, not fewer. The other 24 are untouched.
 *
 * THREE more with the `prose` rung, last on 2026-09-06: `kd_confstats`, `what`
 * and `ulist`. Measured the same way; exactly three fixtures have a row that
 * changes rule, each of them a SINGLE-column box row `narrow` was cutting off -
 * `ulist`'s is the board's own phone number, `+49-30>`. The other 20 are
 * untouched.
 *
 * THREE were re-measured again with the `stat` rung (also 2026-09-06):
 * `kd_confstats`, `super_stats` and `size`. Same rule, same order - measured
 * first, and exactly these three have a row that changes rule. Every changed
 * row is a `Label: value` row whose VALUE `narrow` was shortening
 * (`Kickstart.......: 3>`, `Sysop Name...: Sys>`, `Directory 2: > 650450 Bytes
 * >`); each is now two complete rows. The other 20 hashes are untouched.
 *
 * THREE were RE-MEASURED for the second half of the same report, "the blue
 * pipes are cut off in gwall": `recordFields` now drops the pair of '|' cells
 * enclosing a BOXED record, the same border `narrow`, `stat` and `prose` have
 * always dropped. Named by measurement before a hash was touched - `gwall`,
 * `six_status` and `what` are the only fixtures with such a row - and each
 * loses exactly two glyphs of decoration per record row while GAINING two
 * columns for the caller's own words: `gwall`'s longest comment, `Thanks to Up
 * Rough for creating the repo`, now fits one row where it needed two. No
 * fixture's adapted row count changes. The guard against reading a multi-cell
 * box row this way (`kd_confstats`, `ulist`) is measured in `recordFields`.
 *
 * EIGHT were RE-MEASURED for the sysop's 2026-09-06 folding report, and the
 * eight were named by measurement before a single hash was touched.
 *
 * TWO of them - `ctop` and `kd_confstats` - are the ladder asking `stat` before
 * `record` (adapt.ts `chooseRule`). Every row of every frame of all 29 fixtures
 * was run through `chooseRule` before and after: exactly two source rows change
 * rung, and both are rows where `record` had chosen a run of blanks INSIDE a
 * bracketed value as its separator and reflowed the label across the row
 * boundary. `ctop` reads `Total Uploaded Files: [ 0 ]` / `Total Uploaded Bytes:
 * [ 0 ]` where it read `... ]   Total` / `Uploaded Bytes: [        0 ]`;
 * `kd_confstats` reads `Board Name...: AmiExpress-Web` / `Task Priority...:
 * ________` where the second row began with a stranded `          | `. Both
 * fixtures lose bytes because a squeezed row is shorter, not because a
 * character was dropped.
 *
 * SIX are `splitRow` no longer cutting through a word: `olm`, `ratiorep`,
 * `six_status`, `super_stats`, `ustats` and `who`. Named the same way - the
 * whole corpus was walked for row boundaries that put an alphanumeric at
 * column 39 and its own successor at column 0 of the next row, which found 103
 * such boundaries over 7 distinct source rows, and after the change it finds
 * none. Every changed row keeps every character: `who` reads `GfX by Byteandi`
 * where it read `G` / `fX by Byteandi`, `ratiorep` `Captain Caveman` where it
 * read `Cap` / `tain Caveman`, `super_stats` `[Unregistered!]`, `ustats`
 * `BOHEMiaN/FTU` and its phone number, and `olm` `.-(·LOCATION·)` where the
 * sysop saw `.-(·LOCATIO` / `N·)` - his "the header box is broken". `olm`
 * spends one adapted row on that (29 -> 30) and so shows one fewer masthead
 * row, which is why its byte count falls; `ratiorep` gains bytes. The other 21
 * hashes are untouched.
 *
 * `wall` and `dtagwall` were RE-MEASURED on 2026-09-06, and this is the one
 * kind of re-measurement the rule above allows: the ladder gained a rung
 * (`record`, adapt.ts), so the FRAMES changed by design and renderDiff faithfully
 * renders the new ones. The pin exists to catch a renderer that stopped being
 * byte-identical under a REFACTOR, not to freeze the adapter's output. Which
 * fixtures were allowed to move was decided by measurement, not by whichever
 * ones went red: every frame of all 23 fixtures was run through `chooseRule`
 * before and after, and exactly these two doors' rows change rule - `rtw`'s
 * half-painted menu row was the third, and the rung was tightened until it was
 * excluded rather than the pin re-measured to accept it. The remaining 21
 * hashes are untouched and stay frozen.
 */
const PINS: Record<string, Pin> = {
  aehelp: { renders: 21, bytes: 11883, sha256: 'af1abce9f143fff0ac3f81bab2f8ace2e3185fa24c2a417bf5c1b2ff3204d659' },
  six_status: { renders: 23, bytes: 18176, sha256: '61af6dafacf0aba411707dc7cbbc9131878a59b3a6d01dc6fea40342a41280b5' },
  kd_confstats: { renders: 29, bytes: 24221, sha256: '5dd38a08afccbc632cfe41cd92e10fd2244a0892a482e4d81b40603007ac695a' },
  color_wall: { renders: 30, bytes: 9786, sha256: '4195cfcc3c36fcd345696af0f021d283381a047db502d7f0980932ac65bd5b28' },
  who: { renders: 6, bytes: 875, sha256: '0dd4a5c3c4df233caa23321afa048833fab577bd9dd914735b5f0fbbf6457643' },
  ratiorep: { renders: 10, bytes: 2930, sha256: '23532d3965f685894e081c83854ac1668c99d7f43282bcfae8d9165f452a31e8' },
  super_stats: { renders: 21, bytes: 10315, sha256: '3369da21e831138c23dedfe41665ea642cdc6aa4197ee50bffca22f3742f2eef' },
  hststat: { renders: 12, bytes: 2484, sha256: '0746281e3871a50468228989d86b0ca69dbea5b7c3c9faaa90bb9d4a60485b2c' },
  rtw: { renders: 69, bytes: 143975, sha256: '3cb53e6eeaf2ebca2ddfa1150cce30bee1e0b7235a3e4cba6aa577b8af629ed9' },
  ustats: { renders: 217, bytes: 287701, sha256: '5a084d2f207ff792fc329a472d287f958a1b5074930d27a155eae14a4115a60a' },
  what: { renders: 13, bytes: 3581, sha256: '51c81e728a9d1304aed398510fad03bca0079497188882ff7977242f2251cdee' },
  b: { renders: 17, bytes: 10269, sha256: '1914422b391657000fde0ad5e71e69d37b7d89704c92e2b88d73834d26ff5eeb' },
  j: { renders: 39, bytes: 7195, sha256: 'aa3db3f50277a2eb56a0cfc3a230847c9ae9eefd679bcda0cc4ab8dba5772bd8' },
  doorrepo: { renders: 22, bytes: 12062, sha256: '5b563469b13ca9e76856a621d5aca463e4f5e7217db4da94049a864db4d7375a' },
  size: { renders: 9, bytes: 2743, sha256: '5ffebb7e61299e0d9fb9f4a393ffd1265ea3f5ccd5c377f6ede9600cd47f91a0' },
  ulist: { renders: 22, bytes: 8597, sha256: '62bfa960fce306ad3efa3ec54350c7646594ceb0bfdcddecc4ef73b0dbfb0e44' },
  wall: { renders: 3, bytes: 4782, sha256: '9d880fb46142bd6d40283592e90836b25ef3caa679174c54fcf12cd36a0f0624' },
  chat: { renders: 49, bytes: 37701, sha256: '94ce198cd0f6fc7edf28d9e78610e631b9583e4620a5220a3ee932ddd7892bea' },
  mrcstat1: { renders: 7, bytes: 951, sha256: '014fe8e6fed2a87b056ae76ee41457ec10fbfcd195261959d3b266738ebd0271' },
  pager5d: { renders: 18, bytes: 1417, sha256: '7ed6b3f50c15a12f54cf79540cb718ac54286baa7664b576cc23e7ec3de0e92e' },
  dtagwall: { renders: 26, bytes: 6112, sha256: 'cf637615bc8d5935c8a9a56a3a9e1251c1c164bc20c836c105589f6265183a34' },
  avhbc: { renders: 6, bytes: 373, sha256: 'f83aad48906dfa640bfe4372866394b973c5ce94bab6cec9d7815865423ea0c6' },
  // First measurement of a new input, frozen from here on under the rule above.
  gwall: { renders: 22, bytes: 8921, sha256: '39c384ff1bf1e4338df8824c76aca9afa3f9e167b994a701e30e99ddb484c8dc' },
  hackcheck: { renders: 12, bytes: 1624, sha256: 'aa25e1dfa09db75b8b854410bc0e0831f89741e4c777805ac0f64e264cdecc3a' },
  ctop: { renders: 25, bytes: 8496, sha256: 'd0132c864ed0360f25d549dda45f2991936b7fe715093c5fed239005150d8dd8' },
  conftop: { renders: 22, bytes: 9137, sha256: 'a87497003d9779c8031cf2fb4bbb609bd83cae277e64bac5805f37713f2ba171' },
  sysinfo: { renders: 22, bytes: 5732, sha256: 'b52efd325c043e34026c5728d930cf40b5ac8d956758959a502cafadd003b7a0' },
  games: { renders: 21, bytes: 18770, sha256: 'bc8ebf20627f33003f02090eace28e87af4f10c782fc71cd941804aa3510715f' },
  olm: { renders: 32, bytes: 9782, sha256: 'c2c4df72eee434d44a16df1144235f50594811384a3e952e58e5a29f7dacccf0' },
};

function renderChain(id: string): Pin {
  const entry = manifest[id];
  const file = path.join(DIR, `${id}.${entry.encoding === 'latin1' ? 'txt' : 'ans'}`);
  const text = fs.readFileSync(file).toString(entry.encoding ?? 'utf8');

  const reconstructor = new FrameReconstructor();
  const renders: string[] = [];
  let previous: Frame | null = null;

  for (const chunk of text.split(/(?<=\n)/)) {
    reconstructor.write(chunk);
    const adapted = adaptFrame(reconstructor.snapshot());
    renders.push(renderDiff(previous, adapted));
    previous = adapted;
  }

  const joined = renders.join('');
  return {
    renders: renders.length,
    bytes: joined.length,
    sha256: crypto.createHash('sha256').update(joined, 'utf8').digest('hex'),
  };
}

describe('renderDiff byte pin (adapter corpus)', () => {
  it('renders every corpus fixture to the same bytes it did before the shared run differ', () => {
    const actual: Record<string, Pin> = {};
    for (const id of Object.keys(manifest)) actual[id] = renderChain(id);
    expect(actual).toEqual(PINS);
  });
});
