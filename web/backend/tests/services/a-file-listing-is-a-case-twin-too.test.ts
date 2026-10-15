/**
 * Two listings with one name is one listing too many.
 *
 * The entrypoint already swept conference directories for files that differ
 * only by case - but it filtered on SCREEN extensions, and an AmiExpress file
 * listing is `DIR1` with no extension at all. So listings were never swept.
 *
 * Found on live 2026-09-15: Conf3, Conf4 and Conf5 each carried `DIR1` AND
 * `Dir1`. The board serves whichever it resolves first, QuickNew's config named
 * the lowercase one, and the uploads had gone to the other - which is part of
 * why the new-files screen said nothing was ever uploaded.
 *
 * Driven through the real entrypoint's own `case` pattern and, where the
 * filesystem can hold two such names at once, through the real function.
 *
 * NOTE ON PLATFORM. This repo is developed on macOS, whose default volume is
 * case-INSENSITIVE: creating `DIR1` and `Dir1` in one directory is impossible
 * there - the second write lands on the first - so the behavioural half cannot
 * run and is skipped with a reason. The container runs ext4 and runs all of it.
 * The classifier half runs everywhere, because it is what actually changed.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ENTRYPOINT = path.join(__dirname, '..', '..', '..', '..', 'docker-entrypoint.sh');

/** `dedupe_case_twins` and the hash helper it leans on, lifted verbatim. */
function extractDedupe(): string {
  const source = fs.readFileSync(ENTRYPOINT, 'utf8');
  const hashStart = source.indexOf('file_hash()');
  const start = source.indexOf('dedupe_case_twins() {');
  const end = source.indexOf('sync_tracked() {', start);
  if (hashStart === -1 || start === -1 || end === -1) throw new Error('dedupe_case_twins not found');
  return source.slice(hashStart, source.indexOf('}', hashStart) + 1) + '\n' + source.slice(start, end);
}

function run(dir: string): string {
  const script = [
    'CASE_TWINS_REMOVED=0; CASE_TWINS_CONFLICTING=0',
    extractDedupe(),
    'dedupe_case_twins "$1"',
    'echo "removed=$CASE_TWINS_REMOVED conflicting=$CASE_TWINS_CONFLICTING"',
  ].join('\n');
  return execFileSync('sh', ['-c', script, 'dedupe', dir], { encoding: 'utf8' });
}

/** Can this filesystem even hold a case twin? macOS usually cannot. */
function caseSensitiveHere(): boolean {
  const probe = fs.mkdtempSync(path.join(os.tmpdir(), 'case-probe-'));
  try {
    fs.writeFileSync(path.join(probe, 'AA'), 'a');
    fs.writeFileSync(path.join(probe, 'aa'), 'b');
    return fs.readdirSync(probe).length === 2;
  } finally {
    fs.rmSync(probe, { recursive: true, force: true });
  }
}

const CASE_SENSITIVE = caseSensitiveHere();
const onlyOnCaseSensitive = CASE_SENSITIVE ? describe : describe.skip;

/** The entrypoint's own `case` arm, asked directly whether it claims a name. */
function sweeps(name: string): boolean {
  const source = fs.readFileSync(ENTRYPOINT, 'utf8');
  const start = source.indexOf('        case "$entry" in');
  const end = source.indexOf('esac', start) + 4;
  const arm = source.slice(start, end);
  const script = `entry="$1"\n${arm}\necho NO; exit 0`
    .replace(/prev_lower=""; prev_path=""; continue ;;/, 'echo NO; exit 0 ;;')
    .replace(/\) ;;\n/g, ') echo YES; exit 0 ;;\n');
  return execFileSync('sh', ['-c', script, 'classify', name], { encoding: 'utf8' }).includes('YES');
}

function aConference(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conf-twins-'));
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), body);
  return dir;
}

const names = (dir: string) => fs.readdirSync(dir).sort();

describe('what the sweep claims', () => {
  it('claims an AmiExpress file listing, which it never did before', () => {
    expect(sweeps('DIR1')).toBe(true);
    expect(sweeps('Dir1')).toBe(true);
    expect(sweeps('dir2')).toBe(true);
  });

  it('still claims the screens it always did', () => {
    expect(sweeps('BULL.TXT')).toBe(true);
    expect(sweeps('logo.ans')).toBe(true);
  });

  it('does not claim a door binary or anything else without a dot', () => {
    // The pattern is `DIR<n>`, not "anything without an extension" - sweeping
    // a door's executable and its lowercase twin is not this rule's business.
    expect(sweeps('MyDoor')).toBe(false);
    expect(sweeps('QuickNew')).toBe(false);
    expect(sweeps('DIRECTORY')).toBe(false);
  });
});

onlyOnCaseSensitive('case-twin file listings', () => {
  it('drops the duplicate when both listings hold the same bytes', () => {
    // Conf5 on live: DIR1 and Dir1, both 7362 bytes.
    const dir = aConference({ DIR1: 'the same listing', Dir1: 'the same listing' });

    const out = run(dir);

    expect(names(dir)).toHaveLength(1);
    expect(out).toMatch(/removed=1/);
  });

  it('keeps the AmiExpress spelling, which is what a batch line names', () => {
    const dir = aConference({ DIR1: 'same', Dir1: 'same' });

    run(dir);

    expect(names(dir)).toEqual(['DIR1']);
  });

  it('keeps BOTH and says so when they differ, rather than picking for the sysop', () => {
    // Losing an upload log to a tidy-up would be far worse than a warning.
    const dir = aConference({ DIR1: 'the real uploads', Dir1: 'something else' });

    const out = run(dir);

    expect(names(dir)).toEqual(['DIR1', 'Dir1']);
    expect(out).toMatch(/conflicting=1/);
  });

  it('sweeps a second listing in the same conference', () => {
    const dir = aConference({ DIR1: 'a', Dir1: 'a', DIR2: 'b', Dir2: 'b' });

    run(dir);

    expect(names(dir)).toEqual(['DIR1', 'DIR2']);
  });

  it('still sweeps the screens it always did', () => {
    const dir = aConference({ 'BULL.TXT': 'art', 'bull.txt': 'art' });

    run(dir);

    expect(names(dir)).toHaveLength(1);
  });

  it('leaves files that are not listings or screens alone', () => {
    // The pattern is AmiExpress's `DIR<n>`, not "anything without a dot" - a
    // door binary and its lowercase twin are not this rule's business.
    const dir = aConference({ MyDoor: 'binary', mydoor: 'binary' });

    run(dir);

    expect(names(dir)).toHaveLength(2);
  });

  it('does nothing to a conference with no twins at all', () => {
    const dir = aConference({ DIR1: 'a', DIR2: 'b', 'BULL.TXT': 'c' });

    const out = run(dir);

    expect(names(dir)).toEqual(['BULL.TXT', 'DIR1', 'DIR2']);
    expect(out).toMatch(/removed=0 conflicting=0/);
  });
});
