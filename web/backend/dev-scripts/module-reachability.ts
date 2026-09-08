/**
 * Which files under `src/` does the running server actually load?
 *
 * The question sounds like one grep can answer it. It cannot, and on
 * 2026-09-08 two of mine disagreed with each other about the same file: a
 * basename appears in comments, in unrelated paths, and in three different
 * import spellings, while `handlers/command-execution.handler.ts` (live) and
 * `handlers/command-handler/command-execution.ts` (dead) differ by a directory.
 *
 * So this resolves instead of matching. It walks from the server's entry point,
 * following every specifier form this codebase actually uses - static
 * `import`/`export ... from`, `import()` and `require()` with a literal
 * argument - and reports what it never reaches.
 *
 * Dynamic requires matter here: much of the backend reaches back into other
 * handlers with `require('../x')` to break import cycles, and a graph built
 * from static imports alone would call those files dead. Only a LITERAL
 * argument can be followed; a computed one is reported separately, because it
 * is the one thing this tool cannot see and so the one thing that could make a
 * "dead" verdict wrong.
 */
import * as fs from 'fs';
import * as path from 'path';

const BACKEND = path.resolve(__dirname, '..');
const SRC = path.join(BACKEND, 'src');
const ENTRY = path.join(SRC, 'index.ts');

/** `from '...'`, `require('...')`, `import('...')` - literal arguments only. */
const SPECIFIER = /(?:\bfrom\s*|\brequire\s*\(\s*|\bimport\s*\(\s*)(['"])([^'"]+)\1/g;
/** A require/import whose argument is not a literal - the blind spot. */
const COMPUTED = /\b(?:require|import)\s*\(\s*[^'")\s]/g;

function readFileIfPresent(file: string): string | null {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

/** Node/TypeScript resolution, narrowed to what this project uses. */
function resolve(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null; // a package, not our source
  const base = path.resolve(path.dirname(fromFile), specifier);
  // TypeScript's NodeNext style: the source says `./DoorLoader.js` and means
  // `./DoorLoader.ts`. Much of this backend is written that way, and a
  // resolver that misses it declares the whole 68K emulation subtree dead -
  // which is how the first run of this tool reported 107 unreachable files
  // including the door engine that demonstrably works.
  const jsAsTs = base.replace(/\.jsx?$/, '');
  const candidates = [
    `${jsAsTs}.ts`,
    `${jsAsTs}.tsx`,
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
    path.join(base, 'index.js'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

export interface Reachability {
  reachable: Set<string>;
  unreachable: string[];
  computedCallSites: Array<{ file: string; count: number }>;
  unresolved: Array<{ file: string; specifier: string }>;
}

/**
 * Every way into this codebase, not just the server.
 *
 * `src/scripts/*` are standalone `npx tsx` entry points - the door corpus
 * runner, the Amiga importer, the info-file editor. Judging them against
 * `src/index.ts` alone would call 2500 lines of working tooling dead.
 */
export function entryPoints(root: string = SRC): string[] {
  const entries = [path.join(root, 'index.ts')];
  const scripts = path.join(root, 'scripts');
  if (fs.existsSync(scripts)) {
    for (const name of fs.readdirSync(scripts)) {
      if (/\.tsx?$/.test(name)) entries.push(path.join(scripts, name));
    }
  }
  return entries;
}

export function walk(entries: string | string[] = entryPoints(), root: string = SRC): Reachability {
  const reachable = new Set<string>();
  const unresolved: Array<{ file: string; specifier: string }> = [];
  const computedCallSites: Array<{ file: string; count: number }> = [];
  const queue = Array.isArray(entries) ? [...entries] : [entries];

  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (reachable.has(file)) continue;
    reachable.add(file);

    const source = readFileIfPresent(file);
    if (source === null) continue;

    const computed = source.match(COMPUTED);
    if (computed && computed.length > 0) {
      computedCallSites.push({ file, count: computed.length });
    }

    SPECIFIER.lastIndex = 0;
    let match: RegExpExecArray | null;
    // A fresh regex per file: a module-level /g regex shared across a walk
    // keeps its lastIndex between files and silently skips matches.
    const specifiers = new RegExp(SPECIFIER.source, 'g');
    while ((match = specifiers.exec(source)) !== null) {
      const specifier = match[2];
      if (!specifier.startsWith('.')) continue;
      const target = resolve(file, specifier);
      if (target === null) {
        unresolved.push({ file, specifier });
      } else if (!reachable.has(target)) {
        queue.push(target);
      }
    }
  }

  const all: string[] = [];
  const collect = (dir: string): void => {
    for (const entryName of fs.readdirSync(dir)) {
      const full = path.join(dir, entryName);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) collect(full);
      else if (/\.tsx?$/.test(entryName) && !/\.d\.ts$/.test(entryName)) all.push(full);
    }
  };
  collect(root);

  return {
    reachable,
    unreachable: all.filter((file) => !reachable.has(file)).sort(),
    computedCallSites,
    unresolved,
  };
}

if (require.main === module) {
  const result = walk();
  const rel = (file: string) => path.relative(BACKEND, file);
  console.log(`entry points: ${entryPoints().length} (src/index.ts + src/scripts/*)`);
  console.log(`reachable: ${result.reachable.size}`);
  console.log(`UNREACHABLE: ${result.unreachable.length}`);
  let deadLines = 0;
  for (const file of result.unreachable) {
    const lines = (readFileIfPresent(file) ?? '').split('\n').length;
    deadLines += lines;
    console.log(`  ${String(lines).padStart(5)}  ${rel(file)}`);
  }
  console.log(`dead lines: ${deadLines}`);
  console.log(`files with a computed require/import (this tool cannot follow those): ${result.computedCallSites.length}`);
  if (result.unresolved.length > 0) {
    console.log(`unresolved relative specifiers: ${result.unresolved.length}`);
    for (const item of result.unresolved.slice(0, 10)) {
      console.log(`  ${rel(item.file)} -> ${item.specifier}`);
    }
  }
}
