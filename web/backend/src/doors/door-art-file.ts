/**
 * An art setting's value, as a path.
 *
 * A setting marked `art` holds the NAME of a file in the door's own folder -
 * `Bulletin_Header.txt`, or `headers/Header3.ansi` for the alternates that
 * live one level down. The value arrives from a settings form, so it is
 * precisely the field a traversal would come through, and it is checked
 * twice: the regex says what a value may look like, and the resolved absolute
 * path is re-checked to be inside the door's directory. A bug in either one
 * is then not a hole in both.
 *
 * It is its own module rather than three more functions in
 * door-settings.service because it is the security-carrying part and wants
 * reading on its own - and because that file is already 1,400 lines.
 */
import * as fs from 'fs';
import * as path from 'path';

/**
 * One name, or one directory and one name. Nothing else.
 *
 * A segment may not begin with a dot, which is what rules out `..` and `.`
 * without naming them: no traversal, no hidden files, and no empty segment.
 */
const SEGMENT = String.raw`[A-Za-z0-9_-][A-Za-z0-9._-]*`;
export const ART_VALUE_RE = new RegExp(`^${SEGMENT}(\\/${SEGMENT})?$`);

/** Extensions the Studio can draw. A cfg is not a drawing. */
const ART_EXT = ['.txt', '.ans', '.ansi', '.asc', '.ascii'];

/** Directories that are never art, whatever they contain. */
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git']);

const isArtName = (name: string): boolean =>
  ART_EXT.includes(path.extname(name).toLowerCase());

/**
 * An art FOLDER's path, as a manifest declares it: up to three segments, none
 * starting with a dot. It is the manifest's, not a form's, but it is checked
 * the same way so a bad manifest cannot widen what the Studio reaches.
 */
export const ART_FOLDER_RE = new RegExp(`^${SEGMENT}(\\/${SEGMENT}){0,2}$`);
const SEGMENT_RE = new RegExp(`^${SEGMENT}$`);

/**
 * Whether a candidate file is one of a slot's declared choices.
 *
 * A pattern is a value with `*` allowed inside a segment (`headers/*`,
 * `bulletindesign/Header*`); `*` never crosses a `/`. Everything else is
 * literal, so a pattern cannot say more than "these names in this folder".
 */
export function artChoiceMatches(pattern: string, file: string): boolean {
  const source = pattern
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^/]*');
  return new RegExp(`^${source}$`).test(file);
}

/**
 * The absolute path an art value names, or a throw.
 *
 * Throws rather than returning null: every caller wants the path, and the
 * message is what the admin shows the sysop when a setting names something
 * it may not.
 */
export function resolveArtValue(doorDir: string, value: string): string {
  if (!ART_VALUE_RE.test(value)) {
    throw new Error(`"${value}" is not a file inside this door's folder`);
  }
  const root = path.resolve(doorDir);
  const full = path.resolve(root, value);
  // Belt to the regex's braces. `root + path.sep`, not `startsWith(root)`: a
  // SIBLING directory whose name merely begins with the door's would pass the
  // looser test - `Doors/REQUESTS-old` against `Doors/REQUESTS`.
  if (!full.startsWith(root + path.sep)) {
    throw new Error(`"${value}" resolves outside this door's folder`);
  }

  // And a THIRD check, because the two above are both lexical and a symlink
  // is not. `Doors/<door>/headers` could be a link to anywhere, and door
  // folders on this board really do contain symlinks - the classic Request
  // door shipped `REQ.info -> Request.info`. Both sides are realpath'd or the
  // comparison is wrong on macOS, where a temp dir is `/var/folders/...`
  // through a `/private` symlink of its own.
  if (fs.existsSync(full)) {
    const realRoot = fs.realpathSync(root);
    const realFull = fs.realpathSync(full);
    if (!realFull.startsWith(realRoot + path.sep)) {
      throw new Error(`"${value}" is a link out of this door's folder`);
    }
  }
  return full;
}

/**
 * The absolute path of one file inside a declared art folder, or a throw.
 *
 * `dir` comes from the manifest and `name` from the request; both are checked,
 * and the result is held inside the door exactly as `resolveArtValue` holds a
 * setting's value (lexically, then through realpath).
 */
export function resolveArtFolderFile(doorDir: string, dir: string, name: string): string {
  if (!ART_FOLDER_RE.test(dir) || !SEGMENT_RE.test(name) || !isArtName(name)) {
    throw new Error(`"${dir}/${name}" is not a file inside this door's folder`);
  }
  const root = path.resolve(doorDir);
  const full = path.resolve(root, dir, name);
  if (!full.startsWith(root + path.sep)) {
    throw new Error(`"${dir}/${name}" resolves outside this door's folder`);
  }
  if (fs.existsSync(full)) {
    const realRoot = fs.realpathSync(root);
    if (!fs.realpathSync(full).startsWith(realRoot + path.sep)) {
      throw new Error(`"${dir}/${name}" is a link out of this door's folder`);
    }
  }
  return full;
}

/** The art files in one declared folder, by name, sorted. A missing folder has none. */
export function listArtFolder(doorDir: string, dir: string): Array<{ name: string; lines: number }> {
  if (!ART_FOLDER_RE.test(dir)) return [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(path.join(doorDir, dir), { withFileTypes: true });
  } catch {
    return [];
  }
  const out: Array<{ name: string; lines: number }> = [];
  for (const entry of entries) {
    if (!entry.isFile() || !isArtName(entry.name) || !SEGMENT_RE.test(entry.name)) continue;
    try {
      out.push({ name: entry.name, lines: artFileLines(resolveArtFolderFile(doorDir, dir, entry.name)) });
    } catch {
      /* unreadable or a link out: not a piece */
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Rows a caller sees.
 *
 * The trailing newline does not make one, and CRLF counts as one ending, not
 * two - the board's own generated art is CRLF. This is the same arithmetic
 * `screens/screen-rows.ts` explains at length; the trap it describes is why
 * this is a function rather than a `split('\n').length` at each call site.
 */
export function artFileLines(file: string): number {
  const text = fs.readFileSync(file, 'latin1');
  if (text === '') return 0;
  const parts = text.replace(/\r\n/g, '\n').split('\n');
  return parts[parts.length - 1] === '' ? parts.length - 1 : parts.length;
}

/**
 * Every art file the door ships - beside it, and one level down, which is
 * where REQUESTS keeps the twenty alternates it inherited from the classic
 * Request door. These are the candidates a picker offers.
 */
export function listArtChoices(doorDir: string): Array<{ file: string; lines: number }> {
  const out: Array<{ file: string; lines: number }> = [];
  const add = (rel: string): void => {
    try {
      out.push({ file: rel, lines: artFileLines(path.join(doorDir, rel)) });
    } catch {
      /* unreadable is not a choice */
    }
  };

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(doorDir, { withFileTypes: true });
  } catch {
    // A door folder that is not there has no art. The Studio asks this for
    // every door it lists, so one bad path must not end the listing.
    return out;
  }

  for (const entry of entries) {
    if (entry.isFile() && isArtName(entry.name)) {
      add(entry.name);
      continue;
    }
    if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue;
    let inner: fs.Dirent[];
    try {
      inner = fs.readdirSync(path.join(doorDir, entry.name), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const file of inner) {
      if (file.isFile() && isArtName(file.name)) add(`${entry.name}/${file.name}`);
    }
  }

  return out.sort((a, b) => a.file.localeCompare(b.file));
}
