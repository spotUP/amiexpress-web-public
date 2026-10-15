/**
 * A COMMITTED TEST NEVER DEPENDS ON A FILE THE REPO DOES NOT TRACK.
 *
 * This repository IS the sysop's live board. `user.data`, `user.keys`,
 * every `ConfN/MsgBase` message file, `bbsConfig.info` and most of the board's own
 * state sit at the checkout root and are GITIGNORED. They are on this machine
 * and in no clone. So a test that reads one of them is green here, forever,
 * and can never be green in CI, in a worktree cut with `git archive`, in the
 * Docker image, or on any other developer's disk.
 *
 * Three of these landed in a single night, all written by someone who ran the
 * suite locally, saw green, and pushed:
 *
 *   1. `tests/handlers/olm-sysop-access.test.ts` read the real `user.data`
 *      (.gitignore:339) to get the sysop's account. Pushed; failed 5 of 5 in
 *      CI. Rewritten onto fixtures in 444ff0cff, which is the model: build the
 *      bytes, point the code under test at a temp board.
 *   2. `tests/guards/live-data-guard.test.ts` read `Conf1/MsgBase/HeaderFile`
 *      for its "reads are still allowed" case. Two cases went ENOENT in any
 *      clean checkout. It now uses `Conf.DB`, which is equally live, equally
 *      protected by the guard, and TRACKED.
 *   3. `tests/handlers/bulletin-reflow-drive.test.ts` read `Bulletins/bull8.txt`
 *      when only `bull1..bull6` are tracked - and bull8 was not even on the
 *      author's disk any more, so it was red everywhere and stayed that way.
 *
 * WHAT THIS FILE DOES. It reads every `.ts` file under `web/backend/tests/`,
 * folds the constant expressions that build a path (`__dirname`, string
 * literals, `path.join`/`path.resolve`, `+`, `const`s, and one level of
 * `import { REPO_ROOT } from '...'`), and convicts a file on two rules:
 *
 *   1. it names a path that IS on this disk and is NOT tracked - the invisible
 *      one, green here and absent in CI;
 *   2. it READS a path that is neither tracked nor on this disk - already red
 *      everywhere, listed so it gets fixed rather than tolerated.
 *
 * WHAT IT CANNOT DO, stated plainly because the next person will want to know
 * whether a green run means anything:
 *
 *   - A path built at RUN TIME slips through. `path.join(root, name)` inside a
 *     loop, a value out of `mkdtempSync`, a name from a fixture table - none
 *     of them are readable from the source. The sweep reports how many such
 *     expressions it had to give up on; the number is in the thousands, and
 *     most of them are temp boards, which is the correct answer.
 *   - An INTERPOLATED segment is widened to `*`. `Bulletins/bull${n}.txt`
 *     becomes `Bulletins/bull*.txt`, which matches the six tracked bulletins,
 *     so rule 1 is not applied to it. That is precisely how instance 3 above
 *     would have got past this check - it is a static analyser, not a run.
 *   - A path the test asks `fs.existsSync` about first is exempt: the test has
 *     said in code that it copes with the file being absent. That is how the
 *     AREXX suites treat the Commodore-copyrighted binaries, which can never
 *     be tracked, and how `bbs-config-round-trip` treats `bbsConfig.info`.
 *   - It says nothing about a test that reaches live data through the BBS
 *     code rather than through `fs`. `tests/live-data-guard.ts` is what stops
 *     that, at run time, and it is the layer that matters for WRITES.
 *
 * Modelled on `repo/case-collisions.test.ts`, which does the same job for a
 * different class of defect and runs in the same CI glob.
 */
import * as fs from 'fs';
import * as path from 'path';

import {
  Offence,
  PathReference,
  describe as describeOffence,
  maskComments,
  offences,
  scanSource,
  sourceFiles,
  trackedPaths,
} from './tracked-path-scan';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const TESTS_ROOT = path.resolve(__dirname, '..');

/** A pretend checkout, so the unit cases below need no files on disk. */
const FAKE_ROOT = '/pretend/checkout';
const FAKE_DIR = `${FAKE_ROOT}/web/backend/tests/handlers`;

function scan(source: string, loader?: (file: string) => string | null) {
  return scanSource(source, FAKE_DIR, FAKE_ROOT, 'sample.test.ts', loader);
}

function targets(source: string): string[] {
  return scan(source)
    .references.map((r) => `${r.target}${r.read ? ' [read]' : ''}`)
    .sort();
}

describe('a committed test never depends on a file the repo does not track', () => {
  const tracked = trackedPaths(REPO_ROOT);
  const files = sourceFiles(TESTS_ROOT);
  const references: PathReference[] = [];
  let unresolved = 0;
  for (const file of files) {
    const label = path.relative(REPO_ROOT, file).split(path.sep).join('/');
    const result = scanSource(fs.readFileSync(file, 'utf8'), path.dirname(file), REPO_ROOT, label);
    references.push(...result.references);
    unresolved += result.unresolved;
  }

  it('finds no test under web/backend/tests that reads an untracked path', () => {
    const found: Offence[] = offences(references, REPO_ROOT, tracked);
    expect({
      offenders: found.map(describeOffence),
      whatToDo: found.length
        ? 'This checkout IS the live board and most of its data is gitignored, so a ' +
          'test that touches one of those files is green here and impossible in CI. ' +
          'Build the bytes in the test, or add a small tracked fixture under ' +
          'web/backend/tests/fixtures/, and point the code under test at a temp board ' +
          '(set BBS_ROOT and BBS_DATA_DIR BEFORE importing it). The worked example is ' +
          'commit 444ff0cff. Do NOT commit live board data to make a test pass, and do ' +
          'NOT weaken this check - read the header for what it already cannot see.'
        : 'none',
    }).toEqual({ offenders: [], whatToDo: 'none' });
  });

  it('actually looked at the whole suite, not at nothing', () => {
    // A scanner that silently found no files would also report no offenders.
    expect(files.length).toBeGreaterThan(500);
    expect(references.length).toBeGreaterThan(100);
    expect(tracked === null || tracked.size > 1000).toBe(true);
  });

  it('says out loud how many path expressions it could not read', () => {
    // Not an assertion about the number - an assertion that the number is
    // known and non-trivial, so nobody mistakes a green run for a proof.
    expect(unresolved).toBeGreaterThan(0);
  });
});

describe('the two rules, on sources written to break them', () => {
  it('convicts a test that reads the live user.data', () => {
    // Instance 1, verbatim in shape.
    const source = [
      "import * as fs from 'fs';",
      "import * as path from 'path';",
      "const BOARD_ROOT = path.resolve(__dirname, '../../../..');",
      "const LIVE_USER_DATA = path.join(BOARD_ROOT, 'user.data');",
      'const bytes = fs.readFileSync(LIVE_USER_DATA);',
    ].join('\n');
    expect(targets(source)).toEqual(['user.data [read]']);
  });

  it('convicts a test that reads a live message base file', () => {
    // Instance 2.
    const source = [
      "import * as path from 'path';",
      "import { REPO_ROOT } from '../live-data-guard';",
      "const header = path.join(REPO_ROOT, 'Conf1', 'MsgBase', 'HeaderFile');",
      'const bytes = fs.readFileSync(header);',
    ].join('\n');
    // The root arrives through an IMPORT, which is how the guard suite names
    // it and why cross-module folding is not optional.
    const loader = (file: string): string | null =>
      file.endsWith('live-data-guard.ts')
        ? "export const REPO_ROOT = path.resolve(__dirname, '../../..');"
        : null;
    expect(
      scan(source, loader)
        .references.map((r) => `${r.target} ${r.read}`)
        .sort(),
    ).toEqual(['Conf1/MsgBase/HeaderFile true']);
  });

  it('convicts a test that reads a bulletin the repo does not have', () => {
    // Instance 3, with the bulletin number written out. Interpolated, it is a
    // declared blind spot - see the case below.
    const source = [
      "import * as path from 'path';",
      "const REPO = path.resolve(__dirname, '../../../..');",
      "const bull = fs.readFileSync(path.join(REPO, 'Bulletins', 'bull8.txt'));",
    ].join('\n');
    expect(targets(source)).toEqual(['Bulletins/bull8.txt [read]']);
  });

  it('marks a widened bulletin name as a glob, and says so', () => {
    const source = [
      "import * as path from 'path';",
      "const REPO = path.resolve(__dirname, '../../../..');",
      'const bull = fs.readFileSync(path.join(REPO, `Bulletins/bull${n}.txt`));',
    ].join('\n');
    const [reference] = scan(source).references;
    expect(reference.target).toBe('Bulletins/bull*.txt');
    expect(reference.glob).toBe(true);
  });

  it('leaves alone a test that builds its own board in a temp directory', () => {
    const source = [
      "import * as os from 'os';",
      "import * as path from 'path';",
      "const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-'));",
      "fs.mkdirSync(path.join(root, 'Conf1', 'MsgBase'), { recursive: true });",
      "fs.readFileSync(path.join(root, 'Conf1', 'MsgBase', '1'));",
    ].join('\n');
    // Nothing resolves to a repository path at all, which is the whole point
    // of a temp board.
    expect(targets(source)).toEqual([]);
    expect(scan(source).unresolved).toBeGreaterThan(0);
  });

  it('leaves alone a file the test creates and then reads', () => {
    const source = [
      "import * as path from 'path';",
      "const dir = path.join(__dirname, '../fixtures/scratch');",
      'fs.mkdirSync(dir, { recursive: true });',
      "fs.writeFileSync(path.join(dir, 'a.txt'), 'x');",
      "fs.readFileSync(path.join(dir, 'a.txt'));",
    ].join('\n');
    const scanned = scan(source).references;
    expect(scanned.every((r) => r.provisioned)).toBe(true);
    expect(offences(scanned, FAKE_ROOT, new Set())).toEqual([]);
  });

  it('leaves alone a path the test guards with existsSync', () => {
    const source = [
      "import * as path from 'path';",
      "const REPO = path.resolve(__dirname, '../../../..');",
      "const rexx = path.join(REPO, 'System/RexxMast');",
      'const have = fs.existsSync(rexx);',
      'const bytes = have ? fs.readFileSync(rexx) : null;',
    ].join('\n');
    const scanned = scan(source).references;
    expect(scanned.map((r) => [r.target, r.gated])).toEqual([['System/RexxMast', true]]);
  });

  it('does not read a path expression that is written inside a string', () => {
    // This very file embeds sample sources as literals. A scanner that read
    // them as code would convict itself, which is the sort of thing that gets
    // a check deleted rather than fixed.
    const source = ['const sample = `', "  fs.readFileSync(path.join(REPO, 'user.data'));", '`;'].join(
      '\n',
    );
    expect(targets(source)).toEqual([]);
  });

  it('does not read a path expression that is written inside a comment', () => {
    const source = [
      "import * as path from 'path';",
      "const REPO = path.resolve(__dirname, '../../../..');",
      "// fs.readFileSync(path.join(REPO, 'user.data'))",
      "/* path.join(REPO, 'user.keys') */",
    ].join('\n');
    expect(targets(source)).toEqual([]);
    expect(maskComments(source)).toContain('const REPO');
    expect(maskComments(source)).not.toContain('user.keys');
  });
});

describe('the rules, applied to a tracked set', () => {
  const reference = {
    file: 'sample.test.ts',
    line: 1,
    target: 'Conf.DB',
    read: true,
    glob: false,
    provisioned: false,
    gated: false,
  };

  it('says nothing about a live path that git tracks', () => {
    expect(offences([reference], REPO_ROOT, new Set(['Conf.DB']))).toEqual([]);
  });

  it('convicts the same path once git stops tracking it', () => {
    const found = offences([reference], REPO_ROOT, new Set(['package.json']));
    expect(found.map((o) => o.kind)).toEqual(['present-but-untracked']);
    expect(describeOffence(found[0])).toContain('git does NOT track it');
    expect(describeOffence(found[0])).toContain('sample.test.ts:1');
  });

  it('names the file, the path and what to do instead', () => {
    const found = offences(
      [{ ...reference, target: 'Bulletins/bull8.txt' }],
      REPO_ROOT,
      new Set(['Bulletins/bull1.txt']),
    );
    const message = describeOffence(found[0]);
    expect(message).toContain('sample.test.ts:1');
    expect(message).toContain('Bulletins/bull8.txt');
    expect(message).toContain('web/backend/tests/fixtures/');
  });

  it('resolves a path by the spelling the DIRECTORY uses, not the one asked for', () => {
    // APFS folds case, so `Commands/BBSCmd/OLM.info` resolves to the tracked
    // `Olm.info`. Comparing the asked-for spelling against the index would
    // call a tracked file untracked and make this check unusable on a mac.
    const asked = {
      ...reference,
      target: 'Commands/BBSCmd/OLM.info',
      read: false,
    };
    const index = trackedPaths(REPO_ROOT);
    if (!index) return; // not a git work tree - the sweep above covers that case
    expect(offences([asked], REPO_ROOT, index)).toEqual([]);
  });
});
