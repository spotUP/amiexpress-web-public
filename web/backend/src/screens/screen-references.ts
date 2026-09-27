/**
 * What points at a screen.
 *
 * A screen is pulled into another screen by an MCI sentinel -
 * `~SS_BBS:screens/uprough.txt` - and the including screen draws whatever the
 * target holds. Delete the target and the include draws NOTHING, quietly: the
 * hollow-screen class this board spent a night on, where a file that opens but
 * has no content clears the terminal and the caller pauses at a blank screen.
 *
 * So the Studio's delete has to be able to say what it breaks, and to offer to
 * mend the references it can mend without editing anybody's drawing.
 *
 * REMOVABLE IS THE WHOLE DISTINCTION. A sentinel alone on its line can be
 * taken out cleanly - the line existed to make that include. One sitting
 * INLINE with art is part of a composition, and nothing here can tell what the
 * rest of that row is holding up, so it is reported and never rewritten. The
 * sysop's rule, 2026-09-15: remove what is unambiguous, show what is not.
 */
import * as fs from 'fs';
import * as path from 'path';

/**
 * The MCI codes that NAME another file.
 *
 * The same shape `screen-blankness`'s program signature uses, and for the same
 * reason its comment gives: the target stops at an ESCAPE as well as at
 * whitespace, because this board writes `~SS_BBS:bulletins/bull9.txt` with a
 * colour code butted straight onto it.
 */
const INCLUDE_CODE = /~(?:SS_|\d*SR_)([^\s|~\r\n\x1b]*)/gi;

/** Screens are text; art is latin1. Nothing here decodes as UTF-8. */
const READABLE = /\.(txt|ans|asc|ascii|seq|gr|ibm)$/i;

/**
 * Directories whose contents are never screens a sentinel would name.
 *
 * EVERY DOT-DIRECTORY, not a list of them. Run against the real board this
 * walked into `.claude/worktrees/agent-<id>/`, another session's checkout of
 * this same repository, and reported 170 references inside it - files the
 * sysop has never seen and that a delete must certainly not offer to edit.
 * `.revisions` (the screen history) is the same shape, and so is `.git`.
 */
const SKIP = new Set(['node_modules', 'dist', 'archives']);
const skipDir = (name: string): boolean =>
  name.startsWith('.') || SKIP.has(name.toLowerCase());

export interface ScreenReference {
  /** The screen that names it, board-relative. */
  from: string;
  /** 1-based line the sentinel sits on. */
  line: number;
  /** The whole line, so the admin can show what it would change. */
  text: string;
  /**
   * The sentinel is alone on its line, so the line can be dropped without
   * touching a drawing. False means the line carries something else too.
   */
  removable: boolean;
}

/**
 * An MCI target as a board-relative path.
 *
 * `BBS:screens/x.txt` and `WORK:bbs/screens/x.txt` reach the same file, and
 * the loader resolves both; a comparison that did not would report half the
 * references on this board, which mixes the two spellings.
 */
function targetToRelPath(target: string): string {
  let rest = target.replace(/^~?(?:SS_|\d*SR_)/i, '');
  rest = rest.replace(/^work:bbs\//i, '').replace(/^bbs:/i, '').replace(/^work:/i, '');
  return rest.replace(/^\/+/, '').toLowerCase();
}

/**
 * Is `wanted` one of the numbered files a `~<n>SR_` base rolls between?
 *
 * formatNumberedFilename builds `NNN.<stem>` beside the base, so
 * `~3SR_WORK:bbs/Screens/logoff/logoff` draws `Screens/logoff/001.logoff.txt`
 * - and deleting that file must say so. Comparing the base path alone never
 * matched a member: 001.logoff.txt went on 2026-09-20 with "nothing points
 * at this", and every third logoff after it alerted the sysop. The same
 * `^\d+\.<stem>(\.|$)` rule the screen index uses for a pool.
 */
function isPoolMember(code: string, wanted: string): boolean {
  if (!/^~?\d*SR_/i.test(code)) return false;
  const base = targetToRelPath(code);
  const slash = base.lastIndexOf('/');
  const dir = slash >= 0 ? base.slice(0, slash + 1) : '';
  if (!wanted.startsWith(dir) || wanted.slice(dir.length).includes('/')) return false;
  const stem = base.slice(dir.length).replace(/\.[^.]*$/, '');
  const escaped = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^\\d+\\.${escaped}(\\.|$)`, 'i').test(wanted.slice(dir.length));
}

/**
 * The top-level directories a screen can live in.
 *
 * NOT the whole board root. Run against the repository this matched a stray
 * `68klog.txt` at the root and vendored reference material under
 * `Documentation/7-Reference Sources/reference-boardBBS/` - another BBS's screens,
 * carrying the same sentinels, none of them this board's. The board resolves
 * screens out of these directories and nowhere else
 * (screen-resolution's searchLocations, and the entrypoint's own seeding
 * list), so this is where a reference can be.
 */
const SCREEN_ROOT = /^(Screens|Bulletins|Node\d+|Conf\d+|Themes)$/i;

/** Every readable screen file under the board's SCREEN directories. */
function screenFiles(baseDir: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, depth: number): void => {
    if (depth > 4) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!skipDir(entry.name)) walk(full, depth + 1);
        continue;
      }
      if (entry.isFile() && READABLE.test(entry.name)) {
        out.push(path.relative(baseDir, full));
      }
    }
  };
  let tops: fs.Dirent[];
  try {
    tops = fs.readdirSync(baseDir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const top of tops) {
    if (!top.isDirectory() || skipDir(top.name) || !SCREEN_ROOT.test(top.name)) continue;
    walk(path.join(baseDir, top.name), 0);
  }
  return out;
}

/**
 * Every screen that pulls `relPath` in, with the line each does it on.
 *
 * The file itself is skipped: a screen naming itself is a loop the loader
 * already refuses, and reporting it as a reference would offer to edit the
 * very file being deleted.
 */
export function findScreenReferences(baseDir: string, relPath: string): ScreenReference[] {
  const wanted = relPath.replace(/\\/g, '/').toLowerCase();
  const refs: ScreenReference[] = [];

  for (const candidate of screenFiles(baseDir)) {
    if (candidate.replace(/\\/g, '/').toLowerCase() === wanted) continue;

    let text: string;
    try {
      text = fs.readFileSync(path.join(baseDir, candidate), 'latin1');
    } catch {
      continue;
    }
    if (!text.includes('~')) continue;

    const lines = text.split(/\r\n|\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // A fresh regex per line: a /g regex carries lastIndex between calls,
      // and sharing one across a walk is how a scanner starts skipping hits.
      const codes = line.match(new RegExp(INCLUDE_CODE.source, 'gi')) ?? [];
      for (const code of codes) {
        const exact = targetToRelPath(code) === wanted;
        if (!exact && !isPoolMember(code, wanted)) continue;
        // Alone on the line: nothing but this sentinel and whitespace, so
        // dropping the line drops the include and nothing else. A pool
        // member never is: that line draws the whole pool, not this file.
        const withoutCode = line.replace(code, '');
        refs.push({
          from: candidate,
          line: i + 1,
          text: line,
          removable: exact && withoutCode.trim() === '',
        });
      }
    }
  }

  return refs;
}

/**
 * Drop the lines that exist only to include `relPath`, one file at a time.
 *
 * ONLY the removable ones. A sentinel sharing its line with art is left
 * exactly where it is and reported instead - the sysop's rule, and the reason
 * this function takes the references rather than finding them again: the
 * caller has already shown the sysop what will change, and this writes that
 * and nothing else.
 *
 * `revision` is called before each file is rewritten, so every screen edited
 * here can be restored from the admin's own revision panel. A delete that
 * silently edits three other screens is not undoable; one that leaves a
 * revision behind is.
 */
export function removeScreenReferences(
  baseDir: string,
  refs: ScreenReference[],
  revision: (relPath: string) => void,
): { file: string; linesRemoved: number }[] {
  const byFile = new Map<string, number[]>();
  for (const ref of refs) {
    if (!ref.removable) continue;
    byFile.set(ref.from, [...(byFile.get(ref.from) ?? []), ref.line]);
  }

  const done: { file: string; linesRemoved: number }[] = [];
  for (const [file, lineNumbers] of byFile.entries()) {
    const full = path.join(baseDir, file);
    let text: string;
    try {
      text = fs.readFileSync(full, 'latin1');
    } catch {
      continue;
    }

    // The file's OWN ending style survives: this board's screens are a mix of
    // CRLF and LF, and rewriting one into the other would show up as every
    // line changing in the next revision diff.
    const crlf = text.includes('\r\n');
    const lines = text.split(/\r\n|\n/);
    const drop = new Set(lineNumbers);
    const kept = lines.filter((_line, index) => !drop.has(index + 1));
    if (kept.length === lines.length) continue;

    revision(file);
    fs.writeFileSync(full, kept.join(crlf ? '\r\n' : '\n'), 'latin1');
    done.push({ file, linesRemoved: lines.length - kept.length });
  }
  return done;
}
