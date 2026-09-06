/**
 * TWO FILES THAT DIFFER ONLY IN CASE CAN NEVER BOTH BE TRACKED.
 *
 * This is the repo-wide version of the rule that
 * `tests/doors/command-registration-identity.test.ts` already pins for
 * `Commands/` and `Doors/` only. Four separate incidents, all in one day, all
 * outside or partly outside those two directories:
 *
 *   1. `Doors/THEMEC` + `Doors/ThemeC` - one door registering as another.
 *   2. `Doors/GWall/GWALL.cfg` vs `gwall.cfg` - the door's REAL server config
 *      (`SERVERHOST=scenewall.bbs.io`, opened by the binary as
 *      `PROGDIR:GWALL.cfg`) was destroyed by the door's 21-byte ENV settings
 *      file landing on the same name, and nobody noticed for weeks.
 *   3. `Commands/BBSCmd/GL.info` + `gl.info`, `N.info` + `n.info` - duplicate
 *      registrations resolving to one command.
 *   4. A cherry-pick onto a fresh worktree aborting with "untracked working
 *      tree files would be overwritten" for `Doors/GWall/GWALL.cfg`, because
 *      the parent commit tracked `gwall.cfg` and macOS cannot hold both.
 *
 * THE MECHANISM, measured rather than assumed. The checkout is macOS/APFS
 * (case-INSENSITIVE); the board deploys to a Linux container
 * (case-SENSITIVE); git is neither - it stores a path as bytes. With
 * `core.ignorecase=false` (which is what this repo and the sysop's global
 * gitconfig both set) `git add GWALL.cfg` while `gwall.cfg` is tracked writes
 * a SECOND index entry. Proven in a scratch repo:
 *
 *     ignorecase=false -> index holds BOTH GWALL.cfg and gwall.cfg
 *     ignorecase=true  -> index holds gwall.cfg only, content updated
 *
 * So the collision is not something git does to you; it is something one
 * config value permits. Both halves are pinned below.
 *
 * NOTE ON THE OTHER HALF OF THE PROBLEM. The emulated Amiga filesystem is
 * legitimately case-insensitive by design and MUST stay that way - that is
 * what the amigafs shim (`resolveExistingAncestors`, `resolvePath`) is for,
 * and it is correct. This file says nothing about how a path RESOLVES at
 * runtime. It is only about what git TRACKS, which is the half no shim can
 * help with.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface CaseCollision {
  paths: string[];
  kind: 'file' | 'directory';
}

interface CaseChecker {
  findCaseCollisions(paths: string[]): CaseCollision[];
  explain(repoRoot: string, wanted: string): string;
  trackedPaths(repoRoot: string): string[];
  filesystemFoldsCase(repoRoot: string): boolean;
  ignoreCaseSetting(repoRoot: string): string;
  describe(collisions: CaseCollision[]): string;
}

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

// The SAME implementation the pre-commit hook runs, so the hook and the suite
// can never disagree about what a collision is.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const checker: CaseChecker = require(path.join(REPO_ROOT, 'dev/scripts/check-case-collisions.cjs'));

describe('two files that differ only in case can never both be tracked', () => {
  it('finds no case collision anywhere in the repository', () => {
    const collisions = checker.findCaseCollisions(checker.trackedPaths(REPO_ROOT));
    expect({
      collisions: collisions.map((c) => `[${c.kind}] ${c.paths.join(' == ')}`),
      whatToDo:
        collisions.length > 0
          ? checker.describe(collisions)
          : 'none',
    }).toEqual({ collisions: [], whatToDo: 'none' });
  });

  it('catches a collision that hides in a DIRECTORY component, not a filename', () => {
    // `Doors/THEMEC/theme-picker` and `Doors/ThemeC/theme-picker` share every
    // filename; only the directory differs. A check that folded filenames
    // alone would call this pair clean, and it is the pair that cost a day.
    const collisions = checker.findCaseCollisions([
      'Doors/THEMEC/theme-picker',
      'Doors/ThemeC/theme-picker',
    ]);
    expect(collisions.map((c) => `[${c.kind}] ${c.paths.join(' == ')}`)).toEqual([
      '[directory] Doors/THEMEC == Doors/ThemeC',
      '[file] Doors/THEMEC/theme-picker == Doors/ThemeC/theme-picker',
    ]);
  });

  it('catches the four collisions that actually happened', () => {
    const collisions = checker.findCaseCollisions([
      'Commands/BBSCmd/GL.info',
      'Commands/BBSCmd/gl.info',
      'Commands/BBSCmd/N.info',
      'Commands/BBSCmd/n.info',
      'Doors/GWall/GWALL.cfg',
      'Doors/GWall/gwall.cfg',
      'Doors/THEMEC/themec',
      'Doors/ThemeC/themec',
    ]);
    expect(collisions.map((c) => c.paths.join(' == '))).toEqual([
      'Commands/BBSCmd/GL.info == Commands/BBSCmd/gl.info',
      'Commands/BBSCmd/N.info == Commands/BBSCmd/n.info',
      'Doors/GWall/GWALL.cfg == Doors/GWall/gwall.cfg',
      'Doors/THEMEC == Doors/ThemeC',
      'Doors/THEMEC/themec == Doors/ThemeC/themec',
    ]);
  });

  it('does not cry collision over paths that merely share a lower-case word', () => {
    expect(
      checker.findCaseCollisions([
        'Doors/GWall/GWALL.cfg',
        'System/Prefs/Env-Archive/GWall.cfg',
        'configs/tagwall.dat',
        'Commands/BBSCmd/GWALL.info',
      ])
    ).toEqual([]);
  });
});

describe('every tracked path is spelled on disk the way git spells it', () => {
  // The silent half of the same bug: git can track `GWALL.cfg` while the disk
  // holds `gwall.cfg`. On a case-insensitive filesystem every read SUCCEEDS
  // and returns the other file's bytes, so nothing goes red - the wrong
  // content just ships. `git ls-files` will not tell you; only comparing the
  // index spelling against the real directory entry will.
  it('has no tracked path whose real directory entry differs in case', () => {
    const listings = new Map<string, Set<string> | null>();
    const listingOf = (dir: string): Set<string> | null => {
      if (!listings.has(dir)) {
        try {
          listings.set(dir, new Set(fs.readdirSync(path.join(REPO_ROOT, dir) || REPO_ROOT)));
        } catch {
          listings.set(dir, null);
        }
      }
      return listings.get(dir) ?? null;
    };

    const mismatched: string[] = [];
    for (const tracked of checker.trackedPaths(REPO_ROOT)) {
      const parts = tracked.split('/');
      let dir = '';
      for (const part of parts) {
        const entries = listingOf(dir);
        if (!entries) break; // a directory git tracks but disk lacks - a different fault
        if (!entries.has(part)) {
          const variant = [...entries].find((e) => e.toLowerCase() === part.toLowerCase());
          if (variant) mismatched.push(`index ${tracked} -> disk ${dir ? `${dir}/` : ''}${variant}`);
          break;
        }
        dir = dir ? `${dir}/${part}` : part;
      }
    }

    expect({
      mismatched,
      whatToDo: mismatched.length
        ? 'git tracks one spelling and the disk holds another. Every read here quietly ' +
          'returns the OTHER file. Rename the working copy to match the index with ' +
          '`git mv -f`, never an editor - .info and .cfg are Amiga binaries and a UTF-8 ' +
          'round trip destroys their high-bit bytes. Byte-verify with `cmp` afterwards.'
        : 'none',
    }).toEqual({ mismatched: [], whatToDo: 'none' });
  });
});

describe('git is configured so a second spelling cannot enter the index', () => {
  it('sets core.ignorecase on a filesystem that folds case', () => {
    if (!checker.filesystemFoldsCase(REPO_ROOT)) {
      // Linux/CI: the filesystem itself keeps the spellings apart, and
      // core.ignorecase=false is correct there. Nothing to assert.
      expect(checker.filesystemFoldsCase(REPO_ROOT)).toBe(false);
      return;
    }
    expect({
      'core.ignorecase': checker.ignoreCaseSetting(REPO_ROOT),
      whatToDo:
        checker.ignoreCaseSetting(REPO_ROOT) === 'false'
          ? 'core.ignorecase=false on a case-insensitive disk is what LETS a duplicate ' +
            'spelling into the index: `git add GWALL.cfg` while `gwall.cfg` is tracked adds ' +
            'a second entry instead of updating the first. `true` is the value git ' +
            'autodetects for APFS. Run ./dev/hooks/install.sh, or: git config core.ignorecase true'
          : 'none',
    }).toEqual({ 'core.ignorecase': 'true', whatToDo: 'none' });
  });
});

describe("a door's config keeps its own name", () => {
  // GWall is the case that cost data, so it gets pinned by name. Two DIFFERENT
  // files wanted the same lower-cased path: the server config the door reads
  // out of PROGDIR:, and the settings the door writes into ENV:/ENVARC:.
  const SERVER_CONFIG = 'Doors/GWall/GWALL.cfg';
  const ENV_SETTINGS = 'System/Prefs/Env-Archive/GWall.cfg';
  const DOOR_BINARY = 'Doors/GWall/GWall';

  const tracked = (): string[] => checker.trackedPaths(REPO_ROOT);

  it('tracks the server config under the name the binary opens', () => {
    // Evidence, not preference: the binary asks AmigaDOS for this exact name.
    const image = fs.readFileSync(path.join(REPO_ROOT, DOOR_BINARY)).toString('latin1');
    expect(image).toContain('PROGDIR:GWALL.cfg');
    expect(tracked()).toContain(SERVER_CONFIG);
  });

  it('keeps the server config, not the door settings, at that name', () => {
    const contents = fs.readFileSync(path.join(REPO_ROOT, SERVER_CONFIG), 'latin1');
    expect(contents).toContain('SERVERHOST=');
    expect(contents).toContain('SERVERPORT=');
  });

  it('leaves the door settings in ENVARC:, where the binary writes them', () => {
    const image = fs.readFileSync(path.join(REPO_ROOT, DOOR_BINARY)).toString('latin1');
    expect(image).toContain('ENVARC:GWall.cfg');
    expect(tracked()).toContain(ENV_SETTINGS);
    // The whole incident in one assertion: these two must not be the same
    // bytes. When they were, the settings file had eaten the server config.
    const settings = fs.readFileSync(path.join(REPO_ROOT, ENV_SETTINGS));
    const server = fs.readFileSync(path.join(REPO_ROOT, SERVER_CONFIG));
    expect(settings.equals(server)).toBe(false);
  });

  it('never tracks a second spelling of either', () => {
    const foldedTargets = new Set([SERVER_CONFIG.toLowerCase(), ENV_SETTINGS.toLowerCase()]);
    const spellings = tracked().filter((p) => foldedTargets.has(p.toLowerCase()));
    expect(spellings.sort()).toEqual([SERVER_CONFIG, ENV_SETTINGS].sort());
  });
});

describe('you cannot see a collision by looking, so there is a way to ask', () => {
  // A live report on 2026-09-06: "Commands/BBSCmd/Olm.info AND OLM.info both
  // exist and both register the command." They do not. There is ONE file,
  // `Olm.info`. The report was honest and the evidence was the problem:
  // `test -f`, `ls` and `cat` all succeed for EVERY spelling on this disk, so
  // probing by name proves nothing either way. That cost time on a hunt for a
  // duplicate registration that was never there.
  it('says which spelling really exists when the name is asked with the wrong case', () => {
    const answer = checker.explain(REPO_ROOT, 'Commands/BBSCmd/OLM.info');
    expect(answer).toContain('tracked by git (1): Commands/BBSCmd/Olm.info');
    expect(answer).toContain('real directory entries (1): Commands/BBSCmd/Olm.info');
    expect(answer).toContain('There is no');
    expect(answer).not.toContain('COLLISION:');
  });

  it('demonstrates the illusion it exists to dispel', () => {
    // Both of these are true, and only one file is there. This assertion is
    // the reason the probe exists; if it ever goes red the disk stopped
    // folding case and half this file is moot.
    expect(fs.existsSync(path.join(REPO_ROOT, 'Commands/BBSCmd/OLM.info'))).toBe(true);
    expect(fs.existsSync(path.join(REPO_ROOT, 'Commands/BBSCmd/Olm.info'))).toBe(true);
    expect(fs.readdirSync(path.join(REPO_ROOT, 'Commands/BBSCmd')).filter((e) => e.toLowerCase() === 'olm.info')).toEqual([
      'Olm.info',
    ]);
  });

  it("the one Olm.info that exists is the one today's 40-column mark landed in", () => {
    // If the mark had gone into a second spelling the board does not read,
    // OLM would not really be a 40-column door. One file, so it did.
    const info = fs.readFileSync(path.join(REPO_ROOT, 'Commands/BBSCmd/Olm.info'), 'latin1');
    expect(info).toContain('C64_ADAPT=40');
    expect(info).toContain('TYPE=XIM');
  });
});

describe('the guard runs where it can stop a bad commit', () => {
  it('is wired into the pre-commit hook, before the hook can exit early', () => {
    const hook = fs.readFileSync(path.join(REPO_ROOT, 'dev/hooks/pre-commit'), 'utf8');
    const checkAt = hook.indexOf('check-case-collisions.cjs');
    expect(checkAt).toBeGreaterThan(-1);
    // The hook returns 0 as soon as no TypeScript file is staged. A case
    // collision is usually a .info, a .cfg or a whole directory and stages no
    // .ts at all, so a check placed after that line would never run on the
    // very commits it exists for.
    const firstEarlyExit = hook.indexOf('No TypeScript files to check');
    expect(firstEarlyExit).toBeGreaterThan(-1);
    expect(checkAt).toBeLessThan(firstEarlyExit);
  });

  it('is wired into the DEPLOY, which no test suite can block', () => {
    // Measured, not assumed: `deploy-hetzner.yml` and `backend-tests.yml` are
    // two independent push-triggered workflows. The deploy has no `needs:` on
    // the tests and `main` has no branch protection, so a red suite does not
    // stop, delay or roll back a deploy - by the time jest finishes, the
    // Hetzner script has usually built and recreated the container. And the
    // image is built ON THE HOST from `git reset --hard origin/main` on ext4,
    // so a collision that is invisible on the mac becomes TWO REAL FILES in
    // the image, then two real files on the Doors volume, which the
    // entrypoint's tar sync can only ever add to and never delete from.
    //
    // Hence a second copy of the rule, in shell, inside the deploy script.
    // This test is what stops that copy being quietly removed - same job
    // `services/deploy-orphans-list.test.ts` does for the ORPHANS list.
    const workflow = fs.readFileSync(
      path.join(REPO_ROOT, '.github/workflows/deploy-hetzner.yml'),
      'utf8'
    );
    expect(workflow).toContain('== case-collision check ==');
    expect(workflow).toContain('refusing to deploy - two tracked paths differ only in case');

    // Position is the whole point. It must run AFTER the SHA is pinned (so it
    // checks what is actually being deployed) and BEFORE the image is built
    // and the container recreated (so a bad commit costs a red workflow and
    // no downtime).
    const shaPinned = workflow.indexOf('HEAD ($ACTUAL_SHA) != origin/main');
    const check = workflow.indexOf('== case-collision check ==');
    const build = workflow.indexOf('docker compose build');
    expect(shaPinned).toBeGreaterThan(-1);
    expect(build).toBeGreaterThan(-1);
    expect(check).toBeGreaterThan(shaPinned);
    expect(check).toBeLessThan(build);
  });

  it('is the same implementation the suite uses, not a second copy of the rule', () => {
    const hook = fs.readFileSync(path.join(REPO_ROOT, 'dev/hooks/pre-commit'), 'utf8');
    expect(hook).toContain('dev/scripts/check-case-collisions.cjs');
    expect(fs.existsSync(path.join(REPO_ROOT, 'dev/scripts/check-case-collisions.cjs'))).toBe(true);
  });

  it('the installed hook matches the tracked one', () => {
    // dev/hooks/install.sh copies these into .git/hooks. A fix that lives only
    // in .git/hooks exists on one machine; a fix that lives only in dev/hooks
    // never runs. Both, or it is not wired.
    const gitDir = execFileSync('git', ['rev-parse', '--git-common-dir'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }).trim();
    const installed = path.resolve(REPO_ROOT, gitDir, 'hooks', 'pre-commit');
    if (!fs.existsSync(installed)) return; // a fresh clone before install.sh - not a failure
    expect(fs.readFileSync(installed, 'utf8')).toBe(
      fs.readFileSync(path.join(REPO_ROOT, 'dev/hooks/pre-commit'), 'utf8')
    );
  });
});
