/**
 * Static scan: which repository paths does a test file actually name?
 *
 * The class of defect this exists to kill is documented on the test that uses
 * it (`tracked-fixtures.test.ts`). In one line: THIS REPOSITORY IS THE LIVE
 * BOARD, and most of the board's own data is gitignored. A test that reads
 * `user.data`, `Conf1/MsgBase/HeaderFile` or `Bulletins/bull8.txt` is green on
 * the sysop's machine and can never be green anywhere else, because CI checks
 * out only what git tracks.
 *
 * The scan folds the constant expressions a test uses to build a path -
 * `__dirname`, string literals, `path.join`/`path.resolve`, `+` concatenation,
 * and previously declared `const`s in the same file - and reports every result
 * that lands inside the checkout. It is deliberately a CONSTANT folder and
 * nothing more: a path assembled at run time is not resolvable by reading the
 * source, and the caller is told how many of those it had to give up on.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/** One repository path a test file names, resolved as far as constants allow. */
export interface PathReference {
  /** Test file, relative to the repository root, POSIX separators. */
  file: string;
  /** 1-based line of the expression that produced it. */
  line: number;
  /** Target, relative to the repository root, POSIX separators. */
  target: string;
  /** True when the expression was the path argument of a read-only fs call. */
  read: boolean;
  /** True when an interpolated segment had to be widened to `*`. */
  glob: boolean;
  /** True when the same file creates this path (or a directory above it). */
  provisioned: boolean;
  /**
   * True when the same file asks `fs.existsSync` about this path (or a
   * directory above it) - the test has said in code that it copes with the
   * path being absent, which is what the AREXX suites do for the
   * Commodore-copyrighted binaries that can never be tracked.
   */
  gated: boolean;
}

export interface ScanResult {
  references: PathReference[];
  /**
   * Expressions that looked like a path but could not be folded - a value from
   * `mkdtempSync`, a function parameter, an element of an array built above.
   * Only a count: the honest measure of what this check cannot see.
   */
  unresolved: number;
}

/** fs entry points whose FIRST argument is a path that must already exist. */
const READ_FNS = [
  'readFileSync',
  'readFile',
  'readdirSync',
  'readdir',
  'createReadStream',
  'statSync',
  'lstatSync',
  'opendirSync',
  'realpathSync',
  'readlinkSync',
];

/**
 * fs entry points that CREATE the path they are given, and which argument
 * carries it. A test that makes a directory and then reads inside it is not
 * depending on anything the repository has to track.
 */
const WRITE_FNS: Record<string, number> = {
  writeFileSync: 0,
  writeFile: 0,
  appendFileSync: 0,
  appendFile: 0,
  mkdirSync: 0,
  mkdir: 0,
  mkdtempSync: 0,
  createWriteStream: 0,
  copyFileSync: 1,
  copyFile: 1,
  cpSync: 1,
  cp: 1,
  renameSync: 1,
  rename: 1,
  symlinkSync: 1,
  linkSync: 1,
};

/**
 * Blank every comment, keeping the source's length and line breaks so offsets
 * and line numbers still line up. String and template literals are kept
 * intact - they are what we came for.
 */
export function maskComments(source: string): string {
  const out = source.split('');
  const len = source.length;
  let i = 0;
  const blank = (from: number, to: number): void => {
    for (let k = from; k < to && k < len; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  while (i < len) {
    const c = source[i];
    if (c === '/' && source[i + 1] === '/') {
      let j = i;
      while (j < len && source[j] !== '\n') j++;
      blank(i, j);
      i = j;
    } else if (c === '/' && source[i + 1] === '*') {
      let j = i + 2;
      while (j < len && !(source[j] === '*' && source[j + 1] === '/')) j++;
      blank(i, Math.min(j + 2, len));
      i = j + 2;
    } else if (c === "'" || c === '"') {
      i = skipQuoted(source, i, c);
    } else if (c === '`') {
      i = skipTemplate(source, i);
    } else {
      i++;
    }
  }
  return out.join('');
}

function skipQuoted(s: string, start: number, quote: string): number {
  let i = start + 1;
  while (i < s.length) {
    if (s[i] === '\\') i += 2;
    else if (s[i] === quote || s[i] === '\n') return i + 1;
    else i++;
  }
  return i;
}

function skipTemplate(s: string, start: number): number {
  let i = start + 1;
  let depth = 0;
  while (i < s.length) {
    if (s[i] === '\\') i += 2;
    else if (s[i] === '$' && s[i + 1] === '{') {
      depth++;
      i += 2;
    } else if (s[i] === '}' && depth > 0) {
      depth--;
      i++;
    } else if (s[i] === '`' && depth === 0) return i + 1;
    else i++;
  }
  return i;
}

/**
 * The spans of every string / template literal that sits at CODE level.
 *
 * Anything inside one of them is text, not code - which matters here because
 * the suite that uses this scanner embeds sample test sources as template
 * literals, and a scanner that read them as code would convict itself.
 */
export function topLevelLiteralSpans(masked: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  let i = 0;
  while (i < masked.length) {
    const c = masked[i];
    if (c === "'" || c === '"' || c === '`') {
      const end = skipAny(masked, i);
      spans.push([i, end]);
      i = end;
    } else {
      i++;
    }
  }
  return spans;
}

/** Skip past whichever literal starts at `i`, else return `i + 1`. */
function skipAny(s: string, i: number): number {
  const c = s[i];
  if (c === "'" || c === '"') return skipQuoted(s, i, c);
  if (c === '`') return skipTemplate(s, i);
  return i + 1;
}

/** Top-level argument spans of the call whose `(` is at `open`. */
function argumentSpans(s: string, open: number): Array<[number, number]> | null {
  const spans: Array<[number, number]> = [];
  let depth = 0;
  let i = open;
  let argStart = open + 1;
  while (i < s.length) {
    const c = s[i];
    if (c === "'" || c === '"' || c === '`') {
      i = skipAny(s, i);
      continue;
    }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') {
      depth--;
      if (depth === 0) {
        const tail = s.slice(argStart, i);
        if (tail.trim().length > 0) spans.push([argStart, i]);
        return spans;
      }
    } else if (c === ',' && depth === 1) {
      spans.push([argStart, i]);
      argStart = i + 1;
    }
    i++;
  }
  return null;
}

/** Split on top-level `+`, so `root + '/Conf1'` folds too. */
function concatParts(s: string, start: number, end: number): Array<[number, number]> {
  const parts: Array<[number, number]> = [];
  let depth = 0;
  let i = start;
  let partStart = start;
  while (i < end) {
    const c = s[i];
    if (c === "'" || c === '"' || c === '`') {
      i = skipAny(s, i);
      continue;
    }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === '+' && depth === 0 && s[i + 1] !== '+' && s[i - 1] !== '+') {
      parts.push([partStart, i]);
      partStart = i + 1;
    }
    i++;
  }
  parts.push([partStart, end]);
  return parts;
}

function unescape(literal: string): string {
  return literal.replace(/\\(.)/g, (_m, ch: string) =>
    ch === 'n' ? '\n' : ch === 't' ? '\t' : ch,
  );
}

interface Value {
  text: string;
  glob: boolean;
}

interface Context {
  dirname: string;
  consts: Map<string, Value>;
  /** local name -> the module and export it came from. */
  imports: Map<string, { spec: string; exported: string }>;
  /** Folds `export const NAME` out of a sibling module. */
  fromModule: (dirname: string, spec: string, exported: string) => Value | null;
}

const CALL_RE = /\bpath\s*\.\s*(join|resolve)\s*\(/g;

/**
 * Fold one expression to a string. `null` means "not a constant" - which is
 * the normal, correct answer for `mkdtempSync(...)`, a parameter, or anything
 * else whose value only exists at run time.
 */
function fold(s: string, start: number, end: number, ctx: Context): Value | null {
  const parts = concatParts(s, start, end);
  if (parts.length > 1) {
    let text = '';
    let glob = false;
    for (const [a, b] of parts) {
      const v = fold(s, a, b, ctx);
      if (!v) return null;
      text += v.text;
      glob = glob || v.glob;
    }
    return { text, glob };
  }

  let i = start;
  while (i < end && /\s/.test(s[i])) i++;
  let j = end;
  while (j > i && /\s/.test(s[j - 1])) j--;
  if (i >= j) return null;
  const text = s.slice(i, j);

  const c = s[i];
  if (c === "'" || c === '"') {
    if (skipQuoted(s, i, c) !== j) return null;
    return { text: unescape(s.slice(i + 1, j - 1)), glob: false };
  }
  if (c === '`') {
    if (skipTemplate(s, i) !== j) return null;
    const body = s.slice(i + 1, j - 1);
    // Every interpolation becomes `*`: the segment is real, its value is not
    // knowable here.
    const widened = body.replace(/\$\{[^}]*\}/g, '*');
    return { text: unescape(widened), glob: widened.includes('*') };
  }
  if (text === '__dirname') return { text: ctx.dirname, glob: false };
  if (/^[A-Za-z_$][\w$]*$/.test(text)) {
    const local = ctx.consts.get(text);
    if (local) return local;
    // `import { REPO_ROOT } from '../live-data-guard'` is how the guard suite
    // names the live tree, and it is precisely the suite this check had to
    // catch. One level of module indirection is therefore not optional.
    const imported = ctx.imports.get(text);
    if (imported) return ctx.fromModule(ctx.dirname, imported.spec, imported.exported);
    return null;
  }

  const call = /^path\s*\.\s*(join|resolve)\s*\(/.exec(text);
  if (call) {
    const open = i + call[0].length - 1;
    const spans = argumentSpans(s, open);
    if (!spans) return null;
    return foldCall(s, call[1] as 'join' | 'resolve', spans, ctx);
  }
  return null;
}

function foldCall(
  s: string,
  kind: 'join' | 'resolve',
  spans: Array<[number, number]>,
  ctx: Context,
): Value | null {
  const segments: string[] = [];
  let glob = false;
  for (const [a, b] of spans) {
    const v = fold(s, a, b, ctx);
    if (!v) return null;
    segments.push(v.text);
    glob = glob || v.glob;
  }
  if (segments.length === 0) return null;
  const text = kind === 'resolve' ? path.resolve(...segments) : path.join(...segments);
  return { text, glob };
}

function lineOf(source: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < source.length; i++) if (source[i] === '\n') line++;
  return line;
}

/** `import { A, B as C } from '<spec>'` - the only import form that matters. */
function collectImports(s: string, ctx: Context, inLiteral: (i: number) => boolean): void {
  const re = /\bimport\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (inLiteral(m.index)) continue;
    const spec = m[2];
    for (const clause of m[1].split(',')) {
      const parts = clause.trim().split(/\s+as\s+/);
      const exported = parts[0].trim();
      const local = (parts[1] ?? parts[0]).trim();
      if (/^[A-Za-z_$][\w$]*$/.test(local) && /^[A-Za-z_$][\w$]*$/.test(exported)) {
        ctx.imports.set(local, { spec, exported });
      }
    }
  }
}

/** Fold every `const NAME = <constant expression>` into `ctx.consts`. */
function collectConsts(s: string, ctx: Context, inLiteral: (i: number) => boolean): void {
  // Source order, so a later expression can use an earlier name. Using a const
  // before its declaration is not valid anyway, so one pass is enough.
  const declRe = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]+)?=\s*/g;
  for (let m = declRe.exec(s); m; m = declRe.exec(s)) {
    if (inLiteral(m.index)) continue;
    const name = m[1];
    const start = m.index + m[0].length;
    let end = start;
    let depth = 0;
    while (end < s.length) {
      const c = s[end];
      if (c === "'" || c === '"' || c === '`') {
        end = skipAny(s, end);
        continue;
      }
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') {
        if (depth === 0) break;
        depth--;
      } else if ((c === ';' || c === '\n' || c === ',') && depth === 0) break;
      end++;
    }
    const value = fold(s, start, end, ctx);
    if (value) ctx.consts.set(name, value);
  }
}

/** `i` falls inside a string or template literal, so it is text, not code. */
function literalTest(masked: string): (i: number) => boolean {
  const spans = topLevelLiteralSpans(masked);
  return (i: number) => spans.some(([a, b]) => i > a && i < b);
}

/** Reads a module's source; overridable so the unit tests need no files. */
export type ModuleLoader = (file: string) => string | null;

const defaultLoader: ModuleLoader = (file) => {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
};

const MAX_IMPORT_DEPTH = 3;

function makeModuleResolver(loader: ModuleLoader): Context['fromModule'] {
  const cache = new Map<string, Map<string, Value>>();
  const pending = new Map<string, string>();
  const inFlight = new Set<string>();
  let depth = 0;

  const resolve = (dirname: string, spec: string, exported: string): Value | null => {
    if (!spec.startsWith('.') || depth >= MAX_IMPORT_DEPTH) return null;
    const base = path.resolve(dirname, spec);
    const candidates = [`${base}.ts`, path.join(base, 'index.ts'), base];
    const file = candidates.find((c) => {
      if (cache.has(c)) return true;
      const text = loader(c);
      if (text === null) return false;
      cache.set(c, new Map());
      pending.set(c, text);
      return true;
    });
    if (!file) return null;
    if (inFlight.has(file)) return null; // import cycle
    const text = pending.get(file);
    if (text !== undefined) {
      pending.delete(file);
      inFlight.add(file);
      depth++;
      const sub: Context = {
        dirname: path.dirname(file),
        consts: cache.get(file) as Map<string, Value>,
        imports: new Map(),
        fromModule: resolve,
      };
      const masked = maskComments(text);
      const subInLiteral = literalTest(masked);
      collectImports(masked, sub, subInLiteral);
      collectConsts(masked, sub, subInLiteral);
      depth--;
      inFlight.delete(file);
    }
    return cache.get(file)?.get(exported) ?? null;
  };

  return resolve;
}

/**
 * Scan one test file's source.
 *
 * `fileDir` is the directory the file lives in (what `__dirname` would be) and
 * `repoRoot` the checkout root; both absolute.
 */
export function scanSource(
  source: string,
  fileDir: string,
  repoRoot: string,
  fileLabel: string,
  loader: ModuleLoader = defaultLoader,
): ScanResult {
  const s = maskComments(source);
  const ctx: Context = {
    dirname: fileDir,
    consts: new Map(),
    imports: new Map(),
    fromModule: makeModuleResolver(loader),
  };
  const references: PathReference[] = [];
  const seen = new Map<string, PathReference>();
  let unresolved = 0;

  const relativise = (value: Value): string | null => {
    if (!path.isAbsolute(value.text)) return null;
    const rel = path.relative(repoRoot, value.text);
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return null;
    return rel.split(path.sep).join('/');
  };

  const record = (value: Value | null, offset: number, read: boolean): void => {
    if (!value) {
      unresolved++;
      return;
    }
    const target = relativise(value);
    if (target === null) return;
    const existing = seen.get(target);
    if (existing) {
      existing.read = existing.read || read;
      return;
    }
    const reference: PathReference = {
      file: fileLabel,
      line: lineOf(source, offset),
      target,
      read,
      glob: value.glob,
      provisioned: false,
      gated: false,
    };
    seen.set(target, reference);
    references.push(reference);
  };

  const inLiteral = literalTest(s);
  collectImports(s, ctx, inLiteral);
  collectConsts(s, ctx, inLiteral);

  // Paths this file CREATES. Collected first so a read below can be recognised
  // as reading the file's own scratch.
  const provisioned: string[] = [];
  const writeRe = new RegExp(`\\b(?:${Object.keys(WRITE_FNS).join('|')})\\s*\\(`, 'g');
  for (let m = writeRe.exec(s); m; m = writeRe.exec(s)) {
    if (inLiteral(m.index)) continue;
    const which = WRITE_FNS[m[0].replace(/\s*\($/, '')];
    const spans = argumentSpans(s, m.index + m[0].length - 1);
    if (!spans || spans.length <= which) continue;
    const value = fold(s, spans[which][0], spans[which][1], ctx);
    if (!value) continue;
    const target = relativise(value);
    if (target !== null) provisioned.push(target);
  }

  // Read calls: the first argument names a file that must already be there.
  const readSpans: Array<[number, number]> = [];
  const readRe = new RegExp(`\\b(?:${READ_FNS.join('|')})\\s*\\(`, 'g');
  for (let m = readRe.exec(s); m; m = readRe.exec(s)) {
    if (inLiteral(m.index)) continue;
    const spans = argumentSpans(s, m.index + m[0].length - 1);
    if (!spans || spans.length === 0) continue;
    readSpans.push(spans[0]);
    record(fold(s, spans[0][0], spans[0][1], ctx), spans[0][0], true);
  }

  // Every other constant path expression in the file.
  CALL_RE.lastIndex = 0;
  for (let m = CALL_RE.exec(s); m; m = CALL_RE.exec(s)) {
    const at = m.index;
    if (inLiteral(at)) continue;
    const spans = argumentSpans(s, at + m[0].length - 1);
    if (!spans) continue;
    const inRead = readSpans.some(([a, b]) => at >= a && at < b);
    record(foldCall(s, m[1] as 'join' | 'resolve', spans, ctx), at, inRead);
  }

  // Paths the file asks about before using: an explicit "may be absent".
  const gates: string[] = [];
  const gateRe = /\bexistsSync\s*\(/g;
  for (let m = gateRe.exec(s); m; m = gateRe.exec(s)) {
    if (inLiteral(m.index)) continue;
    const spans = argumentSpans(s, m.index + m[0].length - 1);
    if (!spans || spans.length === 0) continue;
    const value = fold(s, spans[0][0], spans[0][1], ctx);
    if (!value) continue;
    const target = relativise(value);
    if (target !== null) gates.push(target);
  }

  const covers = (list: string[], target: string): boolean =>
    list.some((w) => target === w || target.startsWith(`${w}/`));

  for (const reference of references) {
    reference.provisioned = covers(provisioned, reference.target);
    reference.gated = covers(gates, reference.target);
  }

  return { references, unresolved };
}

/** Every `.ts` file under a directory. */
export function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') continue;
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.ts')) out.push(full);
    }
  };
  walk(dir);
  return out.sort();
}

/**
 * Everything git tracks, POSIX-relative to the root. `null` when this is not a
 * git work tree at all - which is exactly what a `git archive` extraction is,
 * and the clean-checkout rehearsal for CI. The caller falls back to "is it on
 * disk", which in such a tree answers the same question.
 */
export function trackedPaths(repoRoot: string): Set<string> | null {
  try {
    const out = execFileSync('git', ['-C', repoRoot, 'ls-files', '-z'], {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    });
    const set = new Set(out.split(String.fromCharCode(0)).filter(Boolean));
    return set.size > 0 ? set : null;
  } catch {
    return null;
  }
}

function globToRe(target: string): RegExp {
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, (ch) =>
    ch === '*' ? '[^/]*' : `\\${ch}`,
  );
  return new RegExp(`^${escaped}$`);
}

/** Does git track this path, or anything under it (it may be a directory)? */
export function isTracked(target: string, tracked: Set<string>): boolean {
  if (target.includes('*')) {
    const re = globToRe(target);
    for (const p of tracked) {
      if (re.test(p)) return true;
      const cut = p.indexOf('/', target.length);
      if (cut > 0 && re.test(p.slice(0, cut))) return true;
    }
    return false;
  }
  if (tracked.has(target)) return true;
  const prefix = `${target}/`;
  for (const p of tracked) if (p.startsWith(prefix)) return true;
  return false;
}

const listings = new Map<string, string[]>();

function listing(dir: string): string[] {
  let entries = listings.get(dir);
  if (!entries) {
    try {
      entries = fs.readdirSync(dir);
    } catch {
      entries = [];
    }
    listings.set(dir, entries);
  }
  return entries;
}

/**
 * What is on disk under this (possibly globbed) target, spelled the way the
 * DIRECTORY spells it.
 *
 * The spelling matters: this checkout is APFS, which folds case, so
 * `existsSync('Commands/BBSCmd/OLM.info')` is true while the entry git tracks
 * is `Olm.info`. Comparing the asked-for spelling against the index would call
 * a tracked file untracked. `case-collisions.test.ts` covers the other half -
 * that only one spelling is ever tracked.
 */
export function onDisk(repoRoot: string, target: string): string[] {
  let candidates = [''];
  for (const segment of target.split('/')) {
    const next: string[] = [];
    const re = segment.includes('*') ? globToRe(segment) : null;
    for (const base of candidates) {
      const entries = listing(path.join(repoRoot, base));
      for (const entry of entries) {
        const hit = re ? re.test(entry) : entry.toLowerCase() === segment.toLowerCase();
        if (hit) next.push(base ? `${base}/${entry}` : entry);
      }
    }
    candidates = next;
    if (candidates.length === 0) return [];
  }
  return candidates;
}

export type OffenceKind = 'present-but-untracked' | 'read-of-a-path-that-is-not-there';

export interface Offence {
  kind: OffenceKind;
  reference: PathReference;
  /** For a glob, the on-disk matches that git does not track. */
  untracked: string[];
}

/**
 * The two rules.
 *
 *  1. `present-but-untracked` - the test names a path that IS on this disk and
 *     is NOT tracked. This is the invisible one: green here, absent in CI.
 *     It fires whatever the test does with the path, because merely resolving
 *     a live-board path in a committed test is the landmine.
 *
 *  2. `read-of-a-path-that-is-not-there` - the test READS a path that git does
 *     not track and that is not on the disk either. Already red everywhere;
 *     listed so it is fixed rather than tolerated.
 *
 * A path a test CREATES is not an offence: it is not on disk at rest, and it
 * is not being read.
 */
export function offences(
  references: PathReference[],
  repoRoot: string,
  tracked: Set<string> | null,
): Offence[] {
  const out: Offence[] = [];
  for (const reference of references) {
    // An installed dependency is untracked by design and is not board data.
    if (/(^|\/)node_modules(\/|$)/.test(reference.target)) continue;
    // The test itself says it copes with this path being absent.
    if (reference.gated) continue;
    const present = onDisk(repoRoot, reference.target);
    if (tracked) {
      // A widened `bull${n}.txt` matches files the test may never open, so it
      // cannot convict one of them. Only exact references are judged here;
      // `ScanResult.unresolved` and this flag are the declared blind spot.
      const untracked = reference.glob ? [] : present.filter((p) => !isTracked(p, tracked));
      if (untracked.length > 0) {
        out.push({ kind: 'present-but-untracked', reference, untracked });
        continue;
      }
      if (
        reference.read &&
        !reference.provisioned &&
        present.length === 0 &&
        !isTracked(reference.target, tracked)
      ) {
        out.push({ kind: 'read-of-a-path-that-is-not-there', reference, untracked: [] });
      }
    } else if (reference.read && !reference.provisioned && present.length === 0) {
      // No git here (a `git archive` rehearsal of CI): absent IS untracked.
      out.push({ kind: 'read-of-a-path-that-is-not-there', reference, untracked: [] });
    }
  }
  return out;
}

/** One line per offence, for the assertion message. Tired-reader format. */
export function describe(offence: Offence): string {
  const { reference } = offence;
  const where = `${reference.file}:${reference.line}`;
  if (offence.kind === 'present-but-untracked') {
    return (
      `${where} depends on ${offence.untracked.join(', ')} - git does NOT track it. ` +
      `It is on this disk because this checkout IS the sysop's live board; CI clones ` +
      `only tracked files, so this test is green here and can never be green there. ` +
      `FIX: build the bytes inside the test, or add a small fixture under ` +
      `web/backend/tests/fixtures/, and point the code under test at a temp board ` +
      `(BBS_ROOT/BBS_DATA_DIR). Never commit live board data to make a test pass.`
    );
  }
  return (
    `${where} reads ${reference.target} - git does not track it and it is not on this ` +
    `disk either, so the test is red everywhere. FIX: build the bytes inside the test, ` +
    `or add a tracked fixture under web/backend/tests/fixtures/.`
  );
}
