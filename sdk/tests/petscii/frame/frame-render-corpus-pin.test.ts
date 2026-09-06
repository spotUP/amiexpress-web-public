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
  six_status: { renders: 23, bytes: 18434, sha256: 'ea04de48389e1bd1f2975bcc2bf7d0153b458f765c8e4f3811cd5774a593896e' },
  kd_confstats: { renders: 29, bytes: 16549, sha256: '0c0288199c99c149bfceaf91384f1344b8280850b5c02f9e8a21d17fc8bbca6f' },
  color_wall: { renders: 30, bytes: 9794, sha256: '5b27f9935589cdb32a342773deeea015bc24028ca9d02e9d3fc689277982322c' },
  who: { renders: 6, bytes: 906, sha256: '49802e5fc0cae0a1723e418fa4197b82665e23e1bb2e16875b54580837d90cc8' },
  ratiorep: { renders: 10, bytes: 2910, sha256: '53db616b0045b7afdfe5ecb247ccfd64663b1ca600c54548d49c524c498a0cc8' },
  super_stats: { renders: 21, bytes: 7076, sha256: '4537ebb7b949ce0b9517bfa1465a4d6b47756725dc4c137c0b9bcf5e92e5b6ef' },
  hststat: { renders: 12, bytes: 2484, sha256: '0746281e3871a50468228989d86b0ca69dbea5b7c3c9faaa90bb9d4a60485b2c' },
  rtw: { renders: 69, bytes: 142674, sha256: '39f110f486baab98efc7d167259390520dcd730f4fbe5a7f26b645d61014071c' },
  ustats: { renders: 217, bytes: 289249, sha256: 'b949a6d27a116714e7f0d9de40d025f0fbe7df10a701629cea416d45a23df28a' },
  what: { renders: 13, bytes: 3534, sha256: 'c30bed914bdf9ba54613bc8df831787cc2d616f7929e65bf196a702e4ac3d885' },
  b: { renders: 17, bytes: 10269, sha256: '1914422b391657000fde0ad5e71e69d37b7d89704c92e2b88d73834d26ff5eeb' },
  j: { renders: 39, bytes: 7195, sha256: 'aa3db3f50277a2eb56a0cfc3a230847c9ae9eefd679bcda0cc4ab8dba5772bd8' },
  doorrepo: { renders: 22, bytes: 12062, sha256: '5b563469b13ca9e76856a621d5aca463e4f5e7217db4da94049a864db4d7375a' },
  size: { renders: 9, bytes: 1837, sha256: '48b7306611e685a35602657f982250fe6386cd1ae7cd4fd5c8d8a1fdae854313' },
  ulist: { renders: 22, bytes: 6297, sha256: '509706f398c52cefa712d390ef03b4002318a798e475e098f150e40213c39eb1' },
  wall: { renders: 3, bytes: 4782, sha256: '9d880fb46142bd6d40283592e90836b25ef3caa679174c54fcf12cd36a0f0624' },
  chat: { renders: 49, bytes: 37701, sha256: '94ce198cd0f6fc7edf28d9e78610e631b9583e4620a5220a3ee932ddd7892bea' },
  mrcstat1: { renders: 7, bytes: 951, sha256: '014fe8e6fed2a87b056ae76ee41457ec10fbfcd195261959d3b266738ebd0271' },
  pager5d: { renders: 18, bytes: 1417, sha256: '7ed6b3f50c15a12f54cf79540cb718ac54286baa7664b576cc23e7ec3de0e92e' },
  dtagwall: { renders: 26, bytes: 6112, sha256: 'cf637615bc8d5935c8a9a56a3a9e1251c1c164bc20c836c105589f6265183a34' },
  avhbc: { renders: 6, bytes: 373, sha256: 'f83aad48906dfa640bfe4372866394b973c5ce94bab6cec9d7815865423ea0c6' },
  hackcheck: { renders: 12, bytes: 1624, sha256: 'aa25e1dfa09db75b8b854410bc0e0831f89741e4c777805ac0f64e264cdecc3a' },
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
