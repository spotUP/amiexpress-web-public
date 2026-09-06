#!/usr/bin/env node
/**
 * TWO FILES THAT DIFFER ONLY IN CASE CAN NEVER BOTH BE TRACKED.
 *
 * The sysop's checkout is macOS/APFS, which is CASE-INSENSITIVE. The board
 * deploys into a Linux container, which is CASE-SENSITIVE. Git itself is
 * neither: it stores a path as bytes, so it will happily track
 * `Doors/GWall/GWALL.cfg` AND `Doors/GWall/gwall.cfg` at the same time. On the
 * mac only one of those two can exist on disk, so every checkout, cherry-pick,
 * worktree and Docker context silently picks a winner - and which one wins
 * varies. This has cost real time four separate times:
 *
 *   - `Doors/THEMEC` + `Doors/ThemeC`, one door registering as another;
 *   - `Doors/GWall/GWALL.cfg` (the real server config: SERVERHOST/SERVERPORT,
 *     which the door opens as `PROGDIR:GWALL.cfg`) destroyed by
 *     `Doors/GWall/gwall.cfg` (the door's ENV settings, 21 bytes) landing on
 *     top of it - unnoticed for weeks;
 *   - `Commands/BBSCmd/GL.info` + `gl.info` and `N.info` + `n.info`, duplicate
 *     command registrations resolving to one file;
 *   - a cherry-pick onto a fresh worktree aborting with "untracked working
 *     tree files would be overwritten", because the parent commit tracked the
 *     other spelling.
 *
 * The Amiga side of the code is SUPPOSED to resolve case-insensitively - that
 * is what the amigafs shim is for, and it is correct. This check is about the
 * other half: what git tracks. The repo must never contain a collision in the
 * first place.
 *
 * Usage:
 *   node dev/scripts/check-case-collisions.cjs                    # check the index
 *   node dev/scripts/check-case-collisions.cjs --quiet             # exit code only
 *   node dev/scripts/check-case-collisions.cjs --explain <path>    # what is really there
 *
 * `--explain` exists because you CANNOT answer "do both spellings exist?" by
 * looking. On this disk `test -f Commands/BBSCmd/OLM.info` and
 * `test -f Commands/BBSCmd/olm.info` are BOTH true when the only file is
 * `Olm.info`, and `cat` happily prints it under any spelling. A report of
 * "Olm.info AND OLM.info both exist and both register the command" was raised
 * on exactly that evidence and was wrong: one file, one registration. Only the
 * directory listing and `git ls-files` can tell you, so ask them.
 *
 * Exit 0 = clean, exit 1 = collision found (message on stderr names both
 * paths), exit 2 = the check itself could not run.
 *
 * The jest test `web/backend/tests/repo/case-collisions.test.ts` and the
 * pre-commit hook (`dev/hooks/pre-commit`) both call into THIS file, so there
 * is one implementation of the rule and not two that can drift.
 */
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Every path prefix of `p`, longest last: `a/b/c` -> `a`, `a/b`, `a/b/c`.
 * Directories matter as much as files - `Doors/GWall` vs `Doors/Gwall` is a
 * collision even when no single filename under them differs in case.
 */
function prefixesOf(p) {
  const parts = p.split('/');
  const out = [];
  for (let i = 1; i <= parts.length; i += 1) out.push(parts.slice(0, i).join('/'));
  return out;
}

/**
 * Groups of two or more paths that fold to the same lower-case string.
 * Pure: takes the path list, returns the groups. `kind` says whether the
 * colliding thing is a tracked file or a directory the paths pass through.
 */
function findCaseCollisions(trackedPaths) {
  const byFolded = new Map();
  const isFile = new Set(trackedPaths);
  for (const p of trackedPaths) {
    for (const prefix of prefixesOf(p)) {
      const key = prefix.toLowerCase();
      const seen = byFolded.get(key);
      if (seen) seen.add(prefix);
      else byFolded.set(key, new Set([prefix]));
    }
  }
  const collisions = [];
  for (const [, variants] of byFolded) {
    if (variants.size < 2) continue;
    const paths = [...variants].sort();
    collisions.push({ paths, kind: paths.every((x) => isFile.has(x)) ? 'file' : 'directory' });
  }
  return collisions.sort((a, b) => a.paths[0].localeCompare(b.paths[0]));
}

/** The paths git currently tracks (index entries - what a commit would carry). */
function trackedPaths(repoRoot) {
  return execFileSync('git', ['ls-files', '-z'], {
    cwd: repoRoot,
    maxBuffer: 64 * 1024 * 1024,
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean);
}

/** True when this checkout sits on a filesystem that folds case (macOS/APFS, NTFS). */
function filesystemFoldsCase(repoRoot) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'case-probe-'));
  try {
    fs.writeFileSync(path.join(dir, 'CaseProbe'), '');
    return fs.existsSync(path.join(dir, 'caseprobe'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * `core.ignorecase=false` on a case-folding filesystem is what LETS the
 * collision be created: `git add GWALL.cfg` while `gwall.cfg` is tracked then
 * writes a SECOND index entry instead of recognising the same file. With
 * `true` - the value git autodetects for APFS - git collapses onto the
 * spelling already tracked and no duplicate can be born. Measured, not
 * assumed: see the header of the jest test.
 */
function ignoreCaseSetting(repoRoot) {
  try {
    return execFileSync('git', ['config', '--get', 'core.ignorecase'], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim();
  } catch {
    return ''; // unset - git falls back to its own probe, which is fine
  }
}

function describe(collisions) {
  const lines = [];
  lines.push('CASE COLLISION: git tracks two paths that differ only in case.');
  lines.push('');
  for (const { paths, kind } of collisions) {
    lines.push(`  [${kind}] ${paths.join('\n          == ')}`);
  }
  lines.push('');
  lines.push('WHY THIS IS BLOCKED');
  lines.push('  Your disk is case-INSENSITIVE (macOS/APFS) and the board runs on a');
  lines.push('  case-SENSITIVE Linux container. Both spellings exist in the container,');
  lines.push('  only one exists here, and which one you get out of a checkout,');
  lines.push('  cherry-pick, worktree or Docker build is luck. This is how the real');
  lines.push('  GWall server config was destroyed by the door\'s settings file.');
  lines.push('');
  lines.push('WHAT TO DO');
  lines.push('  0. See what is really there - `ls` and `test -f` cannot tell you on this');
  lines.push('     disk, they succeed for every spelling:');
  for (const { paths } of collisions) {
    lines.push(`       node dev/scripts/check-case-collisions.cjs --explain ${paths[0]}`);
  }
  lines.push('  1. Decide which spelling the BOARD uses - do not guess. The evidence is');
  lines.push('     the .info LOCATION tooltype, the strings in the door binary');
  lines.push('     (`strings -a Doors/<door>/<binary> | grep -i .cfg`), and how the');
  lines.push('     door opens it (`PROGDIR:GWALL.cfg` is upper-case, on purpose).');
  lines.push('  2. If the two paths have DIFFERENT CONTENT, STOP. They are two');
  lines.push('     different files that collided, not a duplicate. Ask the sysop before');
  lines.push('     removing either - one of them is data.');
  lines.push('  3. Drop the wrong spelling from the index, keeping the right one:');
  lines.push('       git rm --cached <the wrong spelling>');
  lines.push('     Renaming instead? Use `git mv`, never an editor: .info and .cfg are');
  lines.push('     Amiga binaries and a UTF-8 round trip destroys their high-bit bytes.');
  lines.push('  4. Byte-verify what survived with `cmp` before you commit.');
  return lines.join('\n');
}

/**
 * What is REALLY at this path: the spellings git tracks, and the spellings the
 * disk holds. `fs.existsSync` cannot answer either question here.
 */
function explain(repoRoot, wanted) {
  const folded = wanted.replace(/^\.\//, '').toLowerCase();
  const tracked = trackedPaths(repoRoot).filter((p) => p.toLowerCase() === folded);

  const parts = folded.split('/');
  let dir = repoRoot;
  let real = '';
  const onDisk = [];
  for (let i = 0; i < parts.length; i += 1) {
    let entries;
    try {
      entries = fs.readdirSync(dir);
    } catch {
      break;
    }
    const matches = entries.filter((e) => e.toLowerCase() === parts[i]);
    if (matches.length === 0) break;
    if (i === parts.length - 1) {
      for (const m of matches) onDisk.push(real ? `${real}/${m}` : m);
      break;
    }
    // A case-insensitive disk can only hold one, so there is nothing to branch on.
    real = real ? `${real}/${matches[0]}` : matches[0];
    dir = path.join(dir, matches[0]);
  }

  const lines = [];
  lines.push(`asked about: ${wanted}`);
  lines.push(
    `tracked by git (${tracked.length}): ${tracked.length ? tracked.join(', ') : '- nothing -'}`
  );
  lines.push(
    `real directory entries (${onDisk.length}): ${onDisk.length ? onDisk.join(', ') : '- nothing -'}`
  );
  if (onDisk.length === 1 && onDisk[0] !== wanted) {
    lines.push('');
    lines.push(
      `NOTE: the ONLY file here is \`${onDisk[0]}\`. \`test -f\`, \`cat\` and \`ls\` all ` +
        `succeed for\n      \`${wanted}\` on this case-insensitive disk and tell you nothing. ` +
        `There is no\n      second file.`
    );
  }
  if (onDisk.length > 1 || tracked.length > 1) {
    lines.push('');
    lines.push('COLLISION: more than one spelling. On the Linux container both are real files.');
    lines.push(
      'For a Commands/*.info registration, BOTH get scanned and the later one in\n' +
        'readdir order wins - arbitrary. See tests/doors/command-registration-identity.'
    );
  }
  return lines.join('\n');
}

function main(argv) {
  const quiet = argv.includes('--quiet');
  const explainAt = argv.indexOf('--explain');
  if (explainAt !== -1) {
    const wanted = argv[explainAt + 1];
    if (!wanted) {
      process.stderr.write('check-case-collisions --explain <path-relative-to-repo-root>\n');
      return 2;
    }
    const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
    process.stdout.write(`${explain(root, wanted)}\n`);
    return 0;
  }
  let repoRoot;
  try {
    repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  } catch {
    process.stderr.write('check-case-collisions: not inside a git repository\n');
    return 2;
  }

  const tracked = trackedPaths(repoRoot);
  const collisions = findCaseCollisions(tracked);
  if (collisions.length > 0) {
    process.stderr.write(`${describe(collisions)}\n`);
    return 1;
  }

  if (!quiet) {
    const folds = filesystemFoldsCase(repoRoot);
    const ignorecase = ignoreCaseSetting(repoRoot);
    if (folds && ignorecase === 'false') {
      process.stderr.write(
        'WARNING: core.ignorecase=false on a case-insensitive filesystem. That setting is\n' +
          'what lets a duplicate spelling into the index in the first place. Fix it with:\n' +
          '  git config core.ignorecase true\n' +
          '(or run ./dev/hooks/install.sh, which sets it)\n'
      );
    }
    process.stdout.write(`[OK] no case collisions among ${tracked.length} tracked paths\n`);
  }
  return 0;
}

module.exports = {
  findCaseCollisions,
  prefixesOf,
  trackedPaths,
  filesystemFoldsCase,
  ignoreCaseSetting,
  describe,
  explain,
};

if (require.main === module) process.exit(main(process.argv.slice(2)));
