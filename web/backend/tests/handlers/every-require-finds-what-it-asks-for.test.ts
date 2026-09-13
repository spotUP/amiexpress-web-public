/**
 * Every `require()` in the backend must find the name it asks for.
 *
 * `require()` is the right call here - it is how a module reaches anything
 * holding a cache or injected dependencies without cycling through index.ts.
 * The cost is that `tsc --noEmit` does not follow it. Delete an export and
 * nothing goes red: the require yields `undefined`, and the call site becomes
 * `undefined(...)` - a runtime TypeError in a file that type-checks clean.
 *
 * On 2026-09-08 d1a297411 dropped the `export` from `scanConferenceForNewMail`
 * while tidying that handler's own callers. `xim/msgfeed.ts` asks for it by
 * require to build AEW_MSGQUERY's "new for me" set, and msgfeed's catch -
 * written so a door never hangs on an unreadable base - ate the TypeError.
 * STAT answered "<total>|0|..." to every caller in every base for five days:
 * the SUBS door telling the whole board they had no new mail while it held it.
 * Both sides of that seam had green suites the entire time.
 *
 * A broad catch does not merely hide a failure - it turns a crash into a
 * plausible WRONG ANSWER. Zero is a legal unread count; nobody reports it.
 *
 * So this does not pin one pair. It walks every relative require in src/ and
 * checks each destructured name against what the target module really exports,
 * which is the only way to keep the whole class closed.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as path from 'path';

const SRC = path.join(__dirname, '..', '..', 'src');

/**
 * Sites that are genuinely broken but sit in code NOTHING IMPORTS, so no
 * caller can reach them. Listed rather than silently skipped: each is real
 * debt, and the entry is what makes it visible. Delete the dead file and
 * delete its line here - never add a line to quiet a LIVE site.
 *
 * Reachability for each was checked by grepping every importer of the file
 * (and, for the class method, every dispatch of the method name).
 */
const DEAD_CODE_WITH_NO_IMPORTERS: ReadonlyArray<{ file: string; why: string }> = [
  {
    file: 'handlers/command-handler/index.ts',
    why: 'No importer anywhere, and nothing imports the directory (every other '
      + 'file in it is imported by name), so this index never resolves. Its '
      + 'five setter requires - setMenuDependencies, setCommandExecution* - '
      + 'name functions that no longer exist.',
  },
  {
    file: 'handlers/operations/navigation-quick.handler.ts',
    why: 'Orphan duplicate of the < and > conference commands. The live ones '
      + 'are handlePreviousConferenceCommand / handleNextConferenceCommand in '
      + 'commands/navigation-commands.handler, dispatched at '
      + 'command.handler.ts:5095. This copy requires handleJoinConferenceCommand '
      + 'from ./conference.handler, which does not have it.',
  },
  {
    file: 'amiga-emulation/xim/system-commands.ts',
    why: 'Its handleMCI is never dispatched - XIMProtocol.ts:956 routes JH_MCI '
      + 'to ioHandler.handleMCI (io.ts:1370 -> xim/mci-handler.ts), which is a '
      + 'real implementation. This copy calls parseMCI, a name that has never '
      + 'existed (the function is parseMciCodes); written 2025-11-30 over code '
      + 'that emitted the raw text, which is what its catch still does.',
  },
  {
    file: 'index.ts',
    why: 'Destructures handleChatCommand, which exists in no module, and never '
      + 'calls it - a leftover name in an otherwise live require.',
  },
  {
    file: 'handlers/command.handler.ts',
    why: 'checkScreenClear exists in no module; the site guards it with '
      + "typeof === 'function', so it silently never runs. A real parity gap "
      + '(express.e clears the screen before MENU) but not a crash.',
  },
];

const DEAD_FILES = new Set(DEAD_CODE_WITH_NO_IMPORTERS.map((d) => d.file));

const REQ_DESTRUCTURE = /(?:const|let|var)\s*\{([^}]*)\}\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/g;

const EXPORT_PATTERNS = [
  /^\s*export\s+(?:declare\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/gm,
  /^\s*export\s+(?:declare\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/gm,
  /^\s*export\s+(?:declare\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm,
  /^\s*export\s+(?:declare\s+)?(?:type|interface|enum)\s+([A-Za-z_$][\w$]*)/gm,
  /^\s*exports\.([A-Za-z_$][\w$]*)\s*=/gm,
];
const EXPORT_LIST = /^\s*export\s*\{([^}]*)\}/gm;
const STAR_REEXPORT = /^\s*export\s*\*\s*from\s*['"]([^'"]+)['"]/gm;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '__mocks__') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)) out.push(full);
  }
  return out;
}

/** Resolve a relative specifier the way node would, for .ts sources. */
function resolveSpec(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;   // package - not ours to police
  const base = path.normalize(path.join(path.dirname(fromFile), spec));
  for (const cand of [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand;
  }
  return null;
}

const exportCache = new Map<string, Set<string>>();

/** Named exports of a module, following `export * from` a few levels. */
function exportsOf(file: string, depth = 0): Set<string> {
  const cached = exportCache.get(file);
  if (cached) return cached;
  const names = new Set<string>();
  exportCache.set(file, names);            // cycle guard, filled in below
  const src = fs.readFileSync(file, 'utf8');

  for (const pattern of EXPORT_PATTERNS) {
    pattern.lastIndex = 0;                 // module-level /g regexes are stateful
    for (let m = pattern.exec(src); m; m = pattern.exec(src)) names.add(m[1]);
  }
  EXPORT_LIST.lastIndex = 0;
  for (let m = EXPORT_LIST.exec(src); m; m = EXPORT_LIST.exec(src)) {
    for (const piece of m[1].split(',')) {
      const name = piece.trim().split(/\s+as\s+/).pop()?.trim();
      if (name) names.add(name);
    }
  }
  if (depth < 3) {
    STAR_REEXPORT.lastIndex = 0;
    for (let m = STAR_REEXPORT.exec(src); m; m = STAR_REEXPORT.exec(src)) {
      const target = resolveSpec(file, m[1]);
      if (target) for (const n of exportsOf(target, depth + 1)) names.add(n);
    }
  }
  return names;
}

interface Miss {
  file: string;
  line: number;
  spec: string;
  name: string;
}

function findMisses(): Miss[] {
  const misses: Miss[] = [];
  for (const file of walk(SRC)) {
    const src = fs.readFileSync(file, 'utf8');
    REQ_DESTRUCTURE.lastIndex = 0;
    for (let m = REQ_DESTRUCTURE.exec(src); m; m = REQ_DESTRUCTURE.exec(src)) {
      const target = resolveSpec(file, m[2]);
      if (!target) continue;
      const have = exportsOf(target);
      for (const piece of m[1].split(',')) {
        const raw = piece.trim();
        if (!raw || raw.startsWith('...')) continue;
        // `a: b` binds b but asks for a; `a as b` likewise.
        const want = raw.split(':')[0].split(/\s+as\s+/)[0].trim();
        if (want && !have.has(want)) {
          misses.push({
            file: path.relative(SRC, file),
            line: src.slice(0, m.index).split('\n').length,
            spec: m[2],
            name: want,
          });
        }
      }
    }
  }
  return misses;
}

describe('destructured requires across the backend', () => {
  const misses = findMisses();

  it('finds requires to check, or the walker has stopped working', () => {
    // A silent zero here would make every assertion below vacuous.
    const files = walk(SRC);
    expect(files.length).toBeGreaterThan(200);
    const sites = files
      .map((f) => fs.readFileSync(f, 'utf8').match(/=\s*require\(/g)?.length ?? 0)
      .reduce((a, b) => a + b, 0);
    expect(sites).toBeGreaterThan(100);
  });

  it('every name asked for in LIVE code is actually exported', () => {
    const live = misses.filter((m) => !DEAD_FILES.has(m.file));
    const report = live
      .map((m) => `  ${m.file}:${m.line}  require('${m.spec}') has no export '${m.name}'`)
      .join('\n');

    // A miss here is `undefined(...)` at runtime, and a nearby catch may turn
    // it into a wrong answer rather than a crash. Point the require at the
    // module that really has the name - do NOT loosen this test.
    expect(report).toBe('');
  });

  it('the dead-code exemptions are still dead, and still broken', () => {
    // If a file here stops producing misses it has been fixed or deleted -
    // remove its entry. This keeps the list from silently outliving its
    // reason and quietly covering a live site in the same file later.
    for (const { file } of DEAD_CODE_WITH_NO_IMPORTERS) {
      expect(misses.some((m) => m.file === file)).toBe(true);
    }
  });

  it('the mail scan the message feed reaches is still exported', () => {
    // The original. msgfeed.ts reaches it through a NAMESPACE require
    // (`scan.scanConferenceForNewMail`), which the destructure walk above
    // cannot see, so it is asserted directly.
    const scan = require(path.join(SRC, 'handlers/message/message-scan.handler'));
    const feed = fs.readFileSync(path.join(SRC, 'amiga-emulation/xim/msgfeed.ts'), 'utf8');

    expect(typeof scan.scanConferenceForNewMail).toBe('function');
    expect(feed).toMatch(/scan\.scanConferenceForNewMail\(/);
    expect(scan.scanConferenceForNewMail.length).toBe(5);
  });
});
