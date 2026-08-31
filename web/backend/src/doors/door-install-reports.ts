/**
 * Installs a 68K door reports back to the BBS, read when the door exits.
 *
 * DoorRepo used to POST each install to /api/door-admin/installed, and it
 * has never worked on this board. The emulator runs IN the backend's Node
 * process, so a door blocking on the reply starves the event loop that
 * would produce it: the request times out after 30 seconds and the answer
 * lands afterwards, unread. The same measurement that produced
 * door-list-snapshot.ts, in the other direction - there the BBS writes a
 * file the door reads at launch; here the door writes one the BBS reads at
 * exit.
 *
 * The consequence of it never working: door_installs has no row for
 * anything DoorRepo installed, so those doors show no catalog name, no
 * description and no archive - and a later delete has no recorded file list
 * to work from.
 *
 * On a real AmiExpress board nothing reads this file and nothing is lost:
 * door_installs is this project's table, not something an Amiga has. The
 * install is complete without it.
 */
import * as fs from 'fs';
import * as path from 'path';

import { recordDoorInstall } from './door-install-record';

/** Where the door appends its reports, beside the token and the snapshot. */
export function doorInstallReportPath(bbsRoot: string): string {
  return path.join(bbsRoot, 'Doors', 'DoorRepo', 'DoorRepo.installs');
}

/**
 * The same shape the HTTP route accepts, and for the same reason: this name
 * reaches a filesystem path, and a door running as the sysop is not a reason
 * to take `../` from a file.
 */
const COMMAND_NAME = /^[A-Za-z0-9]{1,12}$/;

export interface DoorInstallReport {
  command: string;
  archiveName: string;
}

/**
 * Parse one report line: `INSTALL|<COMMAND>|<archive>`.
 *
 * Unknown verbs and malformed lines are dropped rather than guessed at - the
 * file may have been written by an older build of the door than the BBS.
 */
export function parseInstallReport(line: string): DoorInstallReport | null {
  const trimmed = line.trim();
  if (trimmed === '') return null;

  const parts = trimmed.split('|');
  if (parts.length < 3) return null;
  if (parts[0].toUpperCase() !== 'INSTALL') return null;

  const command = parts[1].trim();
  // Everything after the second separator is the archive name: a catalog
  // holds names with all sorts in them, and only the command is constrained.
  const archiveName = parts.slice(2).join('|').trim();

  if (!COMMAND_NAME.test(command)) return null;
  if (archiveName === '') return null;

  return { command: command.toUpperCase(), archiveName };
}

/**
 * Record everything the door reported, then remove the file.
 *
 * Never throws: this runs on the door's exit path, where an exception would
 * become a door that looks like it crashed. Every install here has already
 * succeeded on disk - this is bookkeeping catching up with it.
 *
 * @returns the reports that were recorded
 */
export function applyDoorInstallReports(bbsRoot: string): DoorInstallReport[] {
  const reportFile = doorInstallReportPath(bbsRoot);

  let body: string;
  try {
    body = fs.readFileSync(reportFile, 'latin1');
  } catch {
    return [];                       // nothing reported, the ordinary case
  }

  // Removed BEFORE the work: a report that throws must not be retried on
  // every subsequent door exit, and a duplicate row helps nobody.
  try { fs.unlinkSync(reportFile); } catch { /* already gone */ }

  const recorded: DoorInstallReport[] = [];
  for (const line of body.split(/\r?\n/)) {
    const report = parseInstallReport(line);
    if (!report) continue;

    try {
      recordDoorInstall({
        bbsRoot,
        command: report.command,
        archiveName: report.archiveName,
        installDir: path.join(bbsRoot, 'Doors', report.command),
        infoPath: path.join(bbsRoot, 'Commands', 'BBSCmd', `${report.command}.info`),
      });
      recorded.push(report);
      console.log(`[door-install] recorded ${report.command} from ${report.archiveName}`);
    } catch (err) {
      console.log(`[door-install] ${report.command} not recorded: ${(err as Error).message}`);
    }
  }

  return recorded;
}
