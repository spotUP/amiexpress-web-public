/**
 * The 40-column file view's layout, which is DATA rather than code.
 *
 * C*Base's listing routine prints no format string of its own: it calls
 * numbered prompts out of a sysop-editable file built from MCI tab commands,
 * so a sysop re-columnises the whole listing by editing one line. This board
 * adopts that (docs/superpowers/specs/2026-09-03-c64-file-view-design.md,
 * "The layout is data"), expressed in the MCI it already has - `~t<nn>|` for
 * the columns and a scoped `~F_*` family for the record's fields.
 *
 * WHAT THIS MODULE IS, AND IS NOT. It loads, validates and caches the
 * template; it renders nothing. The interpreter that turns a record plus a
 * layout into rows is pure and lives in the SDK, and it takes the compiled
 * layout as an ARGUMENT - that is what keeps the SDK free of file access and
 * what lets one test drive a fixture layout through both the internal listing
 * and the door adapter to prove they agree.
 *
 * THE RULE THE WHOLE SPEC RUNS ON: never a broken listing. A missing file, a
 * missing section and a malformed section all end with a usable layout, and
 * the built-in default is byte-identical to the shipped file, so a board with
 * no Prompts/ prints exactly what a board with the shipped one prints.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/** The four sections a layout file may carry. */
export type FileLayoutSection = 'header' | 'row' | 'footer' | 'record';

export interface CompiledFileLayout {
  readonly header: readonly string[];
  readonly row: readonly string[];
  readonly footer: readonly string[];
  readonly record: readonly string[];
  /**
   * sha1 of the SOURCE BYTES this was compiled from, or of the built-in
   * default when the file is absent. Two renderers holding the same sha1 are
   * holding the same layout, which is what the byte-identity test asserts
   * rather than merely that their output matches today.
   */
  readonly sha1: string;
  /** Sections that fell back to the built-in default, if any. */
  readonly fellBack: readonly FileLayoutSection[];
  /** Why each fallback happened, for the sysop-facing diagnostic. */
  readonly diagnostics: readonly string[];
}

/**
 * THE SHIPPED DEFAULT, verbatim from the spec.
 *
 * `Prompts/FILEVIEW.40` is GENERATED from this constant by
 * `dev-scripts/generate-fileview-layout.ts`, and a drift test asserts the two
 * are equal. That is what makes "the file is absent" a valid state rather than
 * a degraded one.
 */
export const BUILT_IN_FILEVIEW_LAYOUT = `; AmiExpress-Web - the 40-column file view layout.
; Columns are 0-based. ~tNN pads forward with spaces and never truncates.
; Fields: ~F_NUM ~F_NAME ~F_SIZE ~F_BLOCKS ~F_FLAG ~F_NEW ~F_DATE
;         ~F_VERSION ~F_DESC ~F_GROUP ~F_AUTHOR
; A line whose every field is empty and which has no other printable
; character is not printed at all.
[HEADER]
~c7|#~t05|Size~t13|Filename~t31|Date
~c4|▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔
[ROW]
~c7|~4F_NUM|~t05|~c2|~6F_SIZE|~t11|~c3|~1F_FLAG|~1F_NEW|~t13|~c6|~12F_NAME|~t31|~c4|~9F_DATE|
[FOOTER]
~c4|▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔
[RECORD]
~c6|~F_GROUP|
~c7|~F_DESC|
~c3|~F_NAME| ~F_VERSION|
~c2|~F_SIZE| ~F_FLAG|~t31|~c4|~F_DATE|
`;

/**
 * The record fields, scoped - they are NOT in the global MCI dispatch, so
 * `~F_NAME|` on a MENU.TXT means nothing and gets express.e's fall-through
 * rather than a stale value.
 *
 * The `F_` prefix is not stylistic. `~FD`, `~FC`, `~FF`, `~FL` and `~FU` are
 * already taken in the global dispatch (files downloaded, flagged count,
 * flagged list, flagged files, files uploaded), so a two-letter `~F*` family
 * would collide with five live codes. `F_` collides with none.
 */
export const FILE_RECORD_FIELDS = [
  'NUM', 'NAME', 'SIZE', 'BLOCKS', 'FLAG', 'NEW',
  'DATE', 'VERSION', 'DESC', 'GROUP', 'AUTHOR',
] as const;

export type FileRecordField = (typeof FILE_RECORD_FIELDS)[number];

/** How many template lines each section accepts. More is malformed. */
const SECTION_LINE_BUDGET: Record<FileLayoutSection, number> = {
  header: 4,
  row: 1,
  footer: 4,
  record: 8,
};

const SECTION_NAMES: Record<string, FileLayoutSection> = {
  HEADER: 'header',
  ROW: 'row',
  FOOTER: 'footer',
  RECORD: 'record',
};

/** `~F_<SUFFIX>|`, with an optional width prefix. */
const FIELD_CODE_RE = /~\d*F_([A-Za-z0-9_]*)\|?/g;
/** `~t<nn>|`, with the two digits the spec requires. */
const TAB_CODE_RE = /~(\d*)t([^|]*)\|/gi;

interface ParsedSections {
  sections: Partial<Record<FileLayoutSection, string[]>>;
  /** Set when the file is malformed AS A WHOLE - an unknown [SECTION]. */
  fatal?: string;
}

/**
 * Split a layout file into its sections.
 *
 * A comment is a line whose FIRST character is `;`. To begin a template line
 * with a literal `;`, prefix it with `~t00|` - a tab to column 0 emits nothing
 * when the cursor is already there. That is the documented escape, and it
 * needs no new syntax.
 */
export function parseFileLayout(source: string): ParsedSections {
  const sections: Partial<Record<FileLayoutSection, string[]>> = {};
  let current: FileLayoutSection | undefined;

  for (const raw of source.split(/\r?\n/)) {
    const line = raw.replace(/\r$/, '');
    if (line.startsWith(';')) continue;

    const header = line.trim().match(/^\[([^\]]*)\]$/);
    if (header) {
      const name = SECTION_NAMES[header[1].trim().toUpperCase()];
      if (!name) {
        // An unrecognised section header makes the file malformed AS A WHOLE:
        // a layout with a section nobody can render is not a layout with a
        // hole in it, it is a file the sysop mistyped.
        return { sections: {}, fatal: `unknown section [${header[1]}]` };
      }
      current = name;
      sections[name] = sections[name] ?? [];
      continue;
    }

    if (!current) continue;   // preamble before the first section
    sections[current]!.push(line);
  }

  // Trailing blank lines are the text editor's, not the sysop's.
  for (const name of Object.keys(sections) as FileLayoutSection[]) {
    const lines = sections[name]!;
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
  }

  return { sections };
}

/**
 * Why a section is refused, or undefined when it is fine.
 *
 * "Malformed" is defined narrowly so the rule cannot be read two ways: an
 * unknown `~F_*` code, a `~t<nn>|` whose nn is not two digits in 00..39, or
 * more template lines than the section's budget. Anything else the tokenizer
 * already handles by express.e fall-through, and that behaviour is unchanged.
 */
export function sectionFault(name: FileLayoutSection, lines: readonly string[]): string | undefined {
  if (lines.length > SECTION_LINE_BUDGET[name]) {
    return `[${name.toUpperCase()}] has ${lines.length} lines, budget is ${SECTION_LINE_BUDGET[name]}`;
  }

  for (const line of lines) {
    for (const match of line.matchAll(FIELD_CODE_RE)) {
      const suffix = match[1].toUpperCase();
      if (!(FILE_RECORD_FIELDS as readonly string[]).includes(suffix)) {
        return `[${name.toUpperCase()}] uses unknown field ~F_${match[1]}|`;
      }
    }
    for (const match of line.matchAll(TAB_CODE_RE)) {
      const digits = match[2];
      if (!/^\d{2}$/.test(digits) || parseInt(digits, 10) > 39) {
        return `[${name.toUpperCase()}] has a bad column tab ~t${digits}|`;
      }
    }
  }

  return undefined;
}

/**
 * Compile a layout from source bytes, falling back per section.
 *
 * A section that is absent, or refused whole, takes the built-in default for
 * that section - never a partial acceptance and never a repair, because a hole
 * in a listing is exactly the identity-field loss the file view exists to stop.
 */
export function compileFileLayout(source: string | undefined): CompiledFileLayout {
  const builtIn = parseFileLayout(BUILT_IN_FILEVIEW_LAYOUT).sections;
  const fellBack: FileLayoutSection[] = [];
  const diagnostics: string[] = [];

  let parsed: Partial<Record<FileLayoutSection, string[]>> = {};
  if (source !== undefined) {
    const result = parseFileLayout(source);
    if (result.fatal) {
      diagnostics.push(`${result.fatal} - the whole file was refused`);
    } else {
      parsed = result.sections;
    }
  }

  const pick = (name: FileLayoutSection): readonly string[] => {
    const lines = parsed[name];
    if (!lines || lines.length === 0) {
      if (source !== undefined) fellBack.push(name);
      return builtIn[name] ?? [];
    }
    const fault = sectionFault(name, lines);
    if (fault) {
      fellBack.push(name);
      diagnostics.push(fault);
      return builtIn[name] ?? [];
    }
    return lines;
  };

  const layout: CompiledFileLayout = {
    header: Object.freeze(pick('header').slice()),
    row: Object.freeze(pick('row').slice()),
    footer: Object.freeze(pick('footer').slice()),
    record: Object.freeze(pick('record').slice()),
    sha1: crypto.createHash('sha1').update(source ?? BUILT_IN_FILEVIEW_LAYOUT, 'utf8').digest('hex'),
    fellBack: Object.freeze(fellBack.slice()),
    diagnostics: Object.freeze(diagnostics.slice()),
  };

  return Object.freeze(layout);
}

// ---------------------------------------------------------------------------
// The cache, and its mtime guard
// ---------------------------------------------------------------------------

let cached: CompiledFileLayout | undefined;
let cachedStamp = '';
let loggedSha = '';

/** `Prompts/FILEVIEW.40`, resolved case-insensitively like every other path. */
export function fileViewLayoutPath(bbsRoot: string): string {
  const dir = path.join(bbsRoot, 'Prompts');
  try {
    const entries = fs.readdirSync(dir);
    const found = entries.find((e) => e.toLowerCase() === 'fileview.40');
    if (found) return path.join(dir, found);
  } catch {
    // No Prompts/ directory: the built-in default is a valid state.
  }
  return path.join(dir, 'FILEVIEW.40');
}

function stampOf(file: string): string {
  try {
    const st = fs.statSync(file);
    return `${st.mtimeMs}:${st.size}`;
  } catch {
    return 'absent';
  }
}

/**
 * The layout for this listing pass.
 *
 * A PASS TAKES ONE SNAPSHOT AND HOLDS IT: call this once, before the header,
 * and pass the result down. A sysop saving the file mid-listing then cannot
 * split a screen between two layouts, and the internal path and the door path
 * cannot be handed different layouts for the same record.
 *
 * Freshness is an mtime guard checked here, not a watcher and not an
 * unconditional re-read - the `revalidateBbsCommandsIfChanged()` pattern. A
 * sysop's edit reaches the next listing with no restart.
 */
export function getFileViewLayout(bbsRoot: string): CompiledFileLayout {
  const file = fileViewLayoutPath(bbsRoot);
  const stamp = stampOf(file);

  if (cached && cachedStamp === stamp) return cached;

  let source: string | undefined;
  try {
    source = fs.readFileSync(file, 'utf8');
  } catch {
    source = undefined;   // absent is valid; the built-in default is used
  }

  const layout = compileFileLayout(source);

  // One line per distinct file, keyed by sha1, so an edit re-logs and a busy
  // board does not repeat itself.
  if (layout.diagnostics.length > 0 && loggedSha !== layout.sha1) {
    loggedSha = layout.sha1;
    console.warn(
      `[FileLayout] ${file}: ${layout.diagnostics.join('; ')}. ` +
      `Falling back for: ${layout.fellBack.join(', ') || 'nothing'}.`
    );
  }

  cached = layout;
  cachedStamp = stamp;
  return layout;
}

/** Drop the cache. Tests, and any path that knows the volume moved. */
export function resetFileViewLayoutCache(): void {
  cached = undefined;
  cachedStamp = '';
  loggedSha = '';
}
