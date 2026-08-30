/**
 * The command a door archive says it installs as.
 *
 * An AmiExpress door ships its own command icon. Listing any real archive
 * shows it:
 *
 *   VCLCALC/COMMANDS/BBSCMD/CALC.info
 *   VCLCALC/DOORS/CALCULATOR/CALC.rexx
 *
 * So the archive already names the command - CALC - and that .info carries
 * the tooltypes the door was built with: TYPE, LOCATION, STACK, PRIORITY,
 * NAME. DOORMAN asked the sysop to type a command instead and then wrote a
 * fresh four-line .info of its own, which is how a door ends up installed
 * under a name that does not match what it ships with, and how STACK and
 * PRIORITY get lost.
 *
 * This module finds that file. Nothing here writes anything.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface ArchiveCommand {
  /** The command, exactly as the archive spells it. */
  command: string;
  /** Absolute path to the archive's own .info for that command. */
  infoPath: string;
}

/** A command has to be one path segment and usable as a filename. */
export function isUsableCommand(command: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(command) && command.length <= 32;
}

function walk(dir: string, depth: number, out: string[]): void {
  if (depth > 6) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, depth + 1, out);
    else out.push(full);
  }
}

/**
 * Find `.../Commands/BBSCmd/<COMMAND>.info` anywhere in an extracted archive.
 *
 * The case is whatever the author's Amiga wrote - COMMANDS/BBSCMD, Commands/
 * BBSCmd, commands/bbscmd have all been seen - so the match is
 * case-insensitive. When an archive carries more than one command icon the
 * first in walk order wins and the rest are returned for the caller to
 * report; installing several commands from one archive is not something this
 * flow does.
 */
export function findArchiveCommand(extractedDir: string): { chosen: ArchiveCommand | null; others: string[] } {
  const files: string[] = [];
  walk(extractedDir, 0, files);

  const matches: ArchiveCommand[] = [];
  for (const file of files) {
    const normalized = file.split(path.sep).join('/');
    const match = /\/commands\/bbscmd\/([^/]+)\.info$/i.exec(normalized);
    if (!match) continue;
    const command = match[1];
    if (!isUsableCommand(command)) continue;
    matches.push({ command, infoPath: file });
  }

  if (matches.length === 0) return { chosen: null, others: [] };
  return { chosen: matches[0], others: matches.slice(1).map(m => m.command) };
}
