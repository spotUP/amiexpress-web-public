/**
 * Files a theme must not carry and a designer never edits: leftovers, and
 * screens the BOARD writes for itself.
 *
 * One classification, read by three callers that must agree: the screen index
 * (which hides these from the gallery and keeps them out of a seeded theme),
 * the theme studio's copy route, and the loader's `Files/` mirror
 * (`themedPath`). Moved out of screen-index.service.ts so the loader can ask
 * without importing the index.
 */
import * as fs from 'fs';
import * as path from 'path';

import { BOARD_WRITTEN_NAME } from './screen-tables';
import { readScreenFlags } from './screen-flags';
import { NEWS_BULLETIN_SOURCES } from '../services/news-bulletins';

/**
 * An old copy kept beside the real file. Every board grows these.
 *
 * Deliberately about the NAME: content cannot tell a backup from the screen it
 * was copied from - that is what makes it a backup.
 */
const BACKUP_NAME = /(\.bak\b|\.old\b|\.orig\b|\.stale\b|\.backup|~$|\.save\b|\.prev\b|\bcopy\b|\bcopy \d+\b)/i;

/**
 * Files the BOARD writes, which an edit would simply lose.
 *
 * express.e writes `Node<n>/CallersLog` and the other logs without a screen
 * extension, so they were never listed.
 *
 * `Callers.txt` and `callers!.txt` used to be here on the sysop's word and are
 * NOT board-written: express.e's only writer is `callersLog()`, which builds
 * `Node<n>/CallersLog` (express.e:9499) and never a `.txt`. On this board all
 * 62 copies are one of two hashes, the oldest stamped 2008, and not one is
 * dirty in git while every `Node<n>/CallersLog` is - the board rewrites the
 * log and leaves the screen alone. They are hand-drawn ANSI: a framed
 * `Spee N Name Location On-Time Action H:MM` header a designer may want to
 * edit.
 *
 * `Bulletins/lastc.txt` stays: Super-AmiLog (`Utils/lastcallers`) signs it in
 * the art, and RUNTIME_CONTENT's last-callers marker catches it too.
 *
 * `AchieveTop.txt` is here by NAME, against this module's usual rule, because
 * the name IS the evidence: achievements/bulletin.ts owns it and rewrites it
 * every fifteen minutes, and unlike `bull6.txt` beside `bull9.txt` there is no
 * hand-drawn file it could be confused with. Content would not do - a sysop
 * who fills the `AchieveTop.Header` slot replaces the strap a marker would
 * look for. Its `.Header` and `.Tailer` are art and must not match.
 * Left unmarked, seeding a theme copied the bulletin into it, and a theme copy
 * WINS the global screen walk - so the leaderboards froze at the moment the
 * theme was made (measured on the live board, 2026-09-08).
 *
 * `bull9.txt` is here because the door that writes it changed hands: the
 * classic `Request v2.1` door wrote it, our own REQUESTS door writes it now,
 * and in between it sat frozen for five days looking exactly like art. Its
 * content is the sysop's own, unmarked, so only the name can catch it.
 *
 * `quicknew.txt` is here for the same reason, found by auditing the whole
 * class after that bug rather than waiting for it to bite twice: the batch
 * jobs redirect a door's stdout over it every run (see command.handler's
 * EXEC_QUICKNEW comment), and a theme seeded today would serve last week's
 * new-files list for ever. Content cannot catch it - the file is whatever
 * door the sysop pointed the batch at.
 */
const RUNTIME_NAME = BOARD_WRITTEN_NAME;   // the one copy, in screen-tables

/**
 * The bulletins the news job writes, read from the job's OWN table.
 *
 * WEB_NEWS_BULLETINS (services/news-bulletins.ts) rewrites one
 * `Bulletins/bullN.txt` per feed - thirty of them on the live board, the
 * headlines the magazine is composed from - and the Screen Designer offered
 * every one to the artists as hand-drawn art: "i meant all logos etc not the
 * articles they are generated anyway" (sysop, 2026-10-14). Their content is a
 * feed's and carries no marker, so the job's list of files is the evidence;
 * reading it from NEWS_BULLETIN_SOURCES means a feed added there is hidden
 * here with no second edit. Board root only: a conference's own `bull14.txt`
 * is nobody's output.
 */
const NEWS_BULLETIN_PATHS = new Set(
  NEWS_BULLETIN_SOURCES.map((source) => `bulletins/${source.file}`.toLowerCase()),
);

/** True for a bulletin the news job writes, by its path under the board root. */
export function isNewsBulletin(relPath: string): boolean {
  return NEWS_BULLETIN_PATHS.has(relPath.split(path.sep).join('/').toLowerCase());
}

/**
 * Signatures of the tools that WRITE screens on this board.
 *
 * Bulletins 1 to 6 are rewritten every boot - five by MultiTop-II, whose own
 * header is in the art, and one by a last-callers generator. A designer
 * opening the gallery should see art, not output.
 *
 * Content, not names: `bull6.txt` looks exactly like a hand-drawn bulletin
 * from the outside, and the file names carry no hint at all. `bull9.txt` is
 * the case that proves the limit of that - the REQUESTS door writes it
 * between the sysop's own header and tail art, so there is no marker to find
 * and it is caught by NAME in RUNTIME_NAME above.
 */
const RUNTIME_CONTENT: { marker: RegExp; tool: string }[] = [
  { marker: /MultiTop/i, tool: 'MultiTop-II' },
  { marker: /l\s*AST\s*c\s*ALLERS|LAST CALLERS/i, tool: 'a last-callers generator' },
  // S-AmiLog's record table (SamiLogService.generateRecordStats). Unlike its
  // weekly sibling it signs nothing - the "Last Callers" marker above catches
  // that one - and the batch writes it to a path the SYSOP names, so there is
  // no filename to match on either. This header IS the signature.
  { marker: /^\s*Area\s+Record\s+Date\s*$/m, tool: 'S-AmiLog record stats' },
];

export function classifyGenerated(
  relPath: string,
  buf: Buffer,
  baseDir: string,
): 'backup' | 'runtime' | undefined {
  // The sysop's own answer first. `art` is an override that says the
  // heuristics below are wrong about this file, so it returns nothing rather
  // than a classification.
  const flag = readScreenFlags(baseDir)[relPath];
  if (flag === 'art') return undefined;
  if (flag) return flag;

  const name = path.basename(relPath);
  if (BACKUP_NAME.test(name)) return 'backup';
  if (RUNTIME_NAME.test(name)) return 'runtime';
  if (isNewsBulletin(relPath)) return 'runtime';

  // Only worth reading for a bulletin-sized file; a 240 KB RIP screen is not
  // written by a stats door.
  if (buf.length < 64_000) {
    const text = buf.toString('latin1');
    if (RUNTIME_CONTENT.some(({ marker }) => marker.test(text))) return 'runtime';
  }

  return undefined;
}

/**
 * True when the board file at `absPath` (inside `baseDir`) is one the board
 * rewrites for itself - a door's bulletin, MultiTop's bull1-5, quicknew.
 *
 * A theme may not carry a copy of one: the copy is frozen at the moment it was
 * made, and a theme copy WINS the loader's walk, so callers wearing the theme
 * read last month's output for ever. `Themes/h7/Files/Bulletins/bull9.txt`,
 * copied in on 2026-09-12, served the REQUESTS door's bulletin as it stood
 * that day until it was found on 2026-10-11.
 *
 * Reads the BOARD's file, not the theme's: the theme's copy is the stale one,
 * and whether the board's is still written by a tool is what decides.
 */
export function isBoardGeneratedFile(baseDir: string, absPath: string): boolean {
  const relPath = path.relative(path.resolve(baseDir), path.resolve(absPath));
  if (relPath === '' || relPath.startsWith('..') || path.isAbsolute(relPath)) return false;
  let buf: Buffer;
  try {
    const stat = fs.statSync(absPath);
    if (!stat.isFile()) return false;
    // classifyGenerated reads content only below 64 KB - a larger file is
    // not a tool's bulletin - so a larger one is judged by name alone.
    buf = stat.size < 64_000 ? fs.readFileSync(absPath) : Buffer.alloc(0);
  } catch {
    // No board file: the name rules and the sysop's flags still answer.
    buf = Buffer.alloc(0);
  }
  return classifyGenerated(relPath, buf, baseDir) === 'runtime';
}
