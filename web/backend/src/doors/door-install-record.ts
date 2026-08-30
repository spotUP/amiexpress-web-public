/**
 * What an install did, recorded in both halves.
 *
 * Two failures on the live board came from the board not knowing what it had
 * installed: DD kept its registration after its files were deleted, and
 * BROADCAST kept a registration pointing at files that were never there. The
 * board had 370 registered commands and zero rows in `door_installed_files`,
 * because only one of three install paths ever wrote it.
 *
 * This is the one place an install is recorded, and it writes both:
 *
 *   door_installs        the LINK - which catalog archive this command is
 *   door_installed_files the FILES - what landed on disk, so a delete can
 *                        remove exactly that and no more
 *
 * The file list is walked from the disk after extraction rather than taken
 * from the extractor's own report: what matters at delete time is what is
 * actually there.
 */
import * as fs from 'fs';
import * as path from 'path';
import { db } from '../database';
import { recordInstall } from './door-installs.repository';

export type InstalledFileType = 'dir' | 'info' | 'library' | 'file';

export interface InstalledFileEntry {
  filePath: string;
  fileType: InstalledFileType;
}

export interface DoorInstallInput {
  bbsRoot: string;
  command: string;
  archiveName: string;
  installDir: string;
  infoPath: string;
  extraFiles?: string[];
  metadata?: {
    catalogId?: string | null;
    name?: string | null;
    description?: string | null;
    category?: string | null;
    version?: string | null;
    releaseGroup?: string | null;
    md5?: string | null;
    doorType?: string | null;
    sourceUrl?: string | null;
    sourceRevision?: string | null;
  };
}

function classify(absPath: string): InstalledFileType {
  if (absPath.toLowerCase().endsWith('.library')) return 'library';
  if (absPath.toLowerCase().endsWith('.info')) return 'info';
  return 'file';
}

export function walkInstalledFiles(
  bbsRoot: string,
  installDir: string,
  infoPath: string,
  extras: string[] = []
): InstalledFileEntry[] {
  const entries: InstalledFileEntry[] = [];
  const add = (absPath: string, fileType: InstalledFileType): void => {
    entries.push({ filePath: path.relative(bbsRoot, absPath), fileType });
  };

  if (fs.existsSync(infoPath)) add(infoPath, 'info');

  if (fs.existsSync(installDir)) {
    add(installDir, 'dir');
    const walk = (dir: string): void => {
      for (const name of fs.readdirSync(dir)) {
        const child = path.join(dir, name);
        let stats: fs.Stats;
        try { stats = fs.statSync(child); } catch { continue; }
        if (stats.isDirectory()) {
          add(child, 'dir');
          walk(child);
        } else {
          add(child, classify(child));
        }
      }
    };
    walk(installDir);
  }

  for (const extra of extras) {
    if (fs.existsSync(extra)) add(extra, classify(extra));
  }

  return entries;
}

export function recordDoorInstall(input: DoorInstallInput): void {
  const files = walkInstalledFiles(input.bbsRoot, input.installDir, input.infoPath, input.extraFiles);

  // Files first, deliberately. A delete needs the file list more than the
  // menu needs a description, so a failure writing the metadata row must not
  // take the file list with it.
  try {
    db.trackDoorFiles(input.command, files);
  } catch (err) {
    console.log(`[door-install] file list not recorded for ${input.command}: ${(err as Error).message}`);
  }

  const meta = input.metadata ?? {};
  try {
    recordInstall({
      id: `install-${input.command}`,
      catalog_id: meta.catalogId ?? null,
      archive_name: input.archiveName,
      command: input.command,
      install_dir: path.relative(input.bbsRoot, input.installDir),
      door_type: meta.doorType ?? null,
      name: meta.name ?? null,
      md5: meta.md5 ?? null,
      description: meta.description ?? null,
      category: meta.category ?? null,
      version: meta.version ?? null,
      release_group: meta.releaseGroup ?? null,
      source_url: meta.sourceUrl ?? null,
      source_revision: meta.sourceRevision ?? null,
    });
  } catch (err) {
    console.log(`[door-install] install row not recorded for ${input.command}: ${(err as Error).message}`);
  }
}
