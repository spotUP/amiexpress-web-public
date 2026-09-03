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
 * The three below them (`b`, `j`, `doorrepo`) are captures added on
 * 2026-09-03 with the doors they came from; their hashes are the FIRST
 * measurement of new inputs, not a re-measurement of old ones, and they are
 * frozen from here on under the same rule.
 */
const PINS: Record<string, Pin> = {
  aehelp: { renders: 21, bytes: 11883, sha256: 'af1abce9f143fff0ac3f81bab2f8ace2e3185fa24c2a417bf5c1b2ff3204d659' },
  six_status: { renders: 23, bytes: 15421, sha256: '2c489896be4561cdb50bdc8f4091b749fd38bf590c395698f8015b934a97e8bd' },
  kd_confstats: { renders: 29, bytes: 16339, sha256: '5509a4d347add4bb513395d530b0982e474be31af0350359610daf4a2af8fc40' },
  color_wall: { renders: 30, bytes: 9794, sha256: '5b27f9935589cdb32a342773deeea015bc24028ca9d02e9d3fc689277982322c' },
  who: { renders: 6, bytes: 906, sha256: '49802e5fc0cae0a1723e418fa4197b82665e23e1bb2e16875b54580837d90cc8' },
  ratiorep: { renders: 10, bytes: 3308, sha256: '2477a43e3a6b2632436d3780a75a32939c80bdaa3ab7949da5d7d245950da39e' },
  super_stats: { renders: 21, bytes: 10022, sha256: '3c2f62f6a51aefbe585c84022c719a9c8834973168bf2d6f34b2e2ee0df9f81d' },
  hststat: { renders: 12, bytes: 2484, sha256: '0746281e3871a50468228989d86b0ca69dbea5b7c3c9faaa90bb9d4a60485b2c' },
  rtw: { renders: 69, bytes: 142674, sha256: '39f110f486baab98efc7d167259390520dcd730f4fbe5a7f26b645d61014071c' },
  ustats: { renders: 217, bytes: 289249, sha256: 'b949a6d27a116714e7f0d9de40d025f0fbe7df10a701629cea416d45a23df28a' },
  what: { renders: 13, bytes: 1679, sha256: '5be96bf9b4b4bd8477aa3d0b6a6da486169042ac1d7c3b78b87e3030f7ee9467' },
  b: { renders: 17, bytes: 9737, sha256: '2e337396ac8fe2a5a07470c4fdf67b7ec038e8d091d90630582d5299dc89d575' },
  j: { renders: 39, bytes: 7249, sha256: '9d527cb2615b2bb54d24f90c13e0b609c4a35b3b0885fcbedbe7c06601c37aba' },
  doorrepo: { renders: 22, bytes: 12062, sha256: '5b563469b13ca9e76856a621d5aca463e4f5e7217db4da94049a864db4d7375a' },
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
