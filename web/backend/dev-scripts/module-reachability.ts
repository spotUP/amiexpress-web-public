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

/**
 * `from '...'`, `require('...')`, `import('...')`, and the bare side-effect
 * `import '...';` - literal arguments only.
 *
 * The side-effect form has no `from` and is easy to leave out, which is how
 * this tool first reported `src/doors/door-catalog.service.ts` dead one line
 * after it had been wired up with exactly that syntax.
 */
const SPECIFIER = /(?:\bfrom\s*|\brequire\s*\(\s*|\bimport\s*\(\s*|^\s*import\s+)(['"])([^'"]+)\1/gm;
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
  entries.push(...crossPackageEntries(root));
  entries.push(...repoScriptEntries(root));
  return entries;
}

/**
 * The repo's own tooling, which imports backend source directly.
 *
 * `dev/scripts/door-corpus/*` builds the door catalogue with
 * `door-catalog.service.ts`'s `resolveArchivePath` and
 * `utils/lha-list-parser.ts`'s `parseLhaList`, by relative path across the
 * package boundary. Without these entry points the tool calls both dead, and
 * the 2026-09-08 audit had to carry them as hand-written exceptions - which is
 * the kind of note that rots into a wrong deletion.
 */
export function repoScriptEntries(root: string = SRC): string[] {
  const scripts = path.resolve(root, '..', '..', '..', 'dev', 'scripts');
  const entries: string[] = [];
  const collect = (dir: string): void => {
    let names: string[];
    try { names = fs.readdirSync(dir); } catch { return; }
    for (const name of names) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) collect(full);
      else if (/\.tsx?$/.test(name) && !/\.d\.ts$/.test(name)) entries.push(full);
    }
  };
  collect(scripts);
  return entries;
}

/**
 * Backend modules the ADMIN UI imports.
 *
 * `web/config-app` reaches into this package through a path alias -
 * `@bbs/screens/*` and `@bbs/config-services/*` (its tsconfig.json and
 * vite.config.ts) - so a file can be live in the browser while no backend
 * entry point touches it. `src/screens/rip-document.ts` is exactly that: the
 * RIP screen editor imports it, and the first version of this tool called it
 * dead. Deleting it on that verdict would have broken the editor.
 *
 * Read from the aliased DIRECTORIES rather than by parsing the config-app's
 * imports: those directories are the shared surface by declaration, and a file
 * in one is reachable to anything that adds an import tomorrow.
 */
export function crossPackageEntries(root: string = SRC): string[] {
  const shared = [path.join(root, 'screens'), path.join(root, 'services', 'config-services')];
  const entries: string[] = [];
  for (const dir of shared) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (/\.tsx?$/.test(name) && !/\.d\.ts$/.test(name)) entries.push(path.join(dir, name));
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
    // Flags too, not just the source: SPECIFIER is multiline (the bare
    // side-effect `import '...'` is anchored to the start of a line), and
    // rebuilding it with 'g' alone silently anchored ^ to the whole file.
    const specifiers = new RegExp(SPECIFIER.source, SPECIFIER.flags);
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
  // A VENDORED PROJECT IS NOT OUR CENSUS. `cpu/moira-source/` is an upstream
  // checkout that carries its own package.json and tsconfig.json, and its
  // `Runner/Bartman/dasm.ts` is upstream's disassembler - unreachable from
  // this server by design and not ours to delete. Only the CENSUS skips these
  // directories: `walk` above follows imports wherever they lead, so a
  // vendored file the backend really does import still counts as reachable.
  const isVendoredProject = (dir: string): boolean =>
    fs.existsSync(path.join(dir, 'package.json')) || fs.existsSync(path.join(dir, 'tsconfig.json'));
  const collect = (dir: string): void => {
    for (const entryName of fs.readdirSync(dir)) {
      const full = path.join(dir, entryName);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        if (isVendoredProject(full)) continue;
        collect(full);
      } else if (/\.tsx?$/.test(entryName) && !/\.d\.ts$/.test(entryName)) all.push(full);
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
  console.log(`entry points: ${entryPoints().length} (src/index.ts, src/scripts/*, and the @bbs/* surface the admin UI imports)`);
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
