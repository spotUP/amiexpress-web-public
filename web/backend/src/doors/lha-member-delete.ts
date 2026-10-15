/**
 * Delete members from an LHA/LZH archive IN PLACE, preserving the format.
 *
 * Why this exists next to ami-stripper.lib.ts rather than inside it: that
 * library repacks to a portable ZIP, because the bundled `lha` npm package
 * cannot create archives. A ZIP is useless to this repository - every client
 * is an Amiga expecting the .lha it was published as, and rewriting the
 * format would break the download it just verified a digest for.
 *
 * The real `lha` CLI can remove members in place (`lha d <archive> <member>`),
 * which is all "strip the ads out of the published archive" needs. Verified
 * against TELSER40.LHA: 262337 -> 261104 bytes with the member gone, format
 * intact. The binary ships in the BBS container at /usr/local/bin/lha.
 *
 * LZX is deliberately unsupported: this project has an LZX reader (WASM) and
 * no writer, so there is no honest way to rewrite one. Of the 3301 catalog
 * archives, 2966 are LHA/LZH and 328 are LZX.
 *
 * Nothing here builds a shell command string. The archive path and every
 * member name come from the catalog, and real scene filenames contain '$',
 * '&' and '!' - they are passed as argv entries so the shell never sees them.
 */
import { spawnSync, type SpawnSyncReturns } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/** Injectable for tests: runs the archiver and reports how it went. */
export type ArchiveRunner = (bin: string, args: string[]) => {
  status: number | null;
  stderr: string;
};

const defaultRunner: ArchiveRunner = (bin, args) => {
  const r: SpawnSyncReturns<string> = spawnSync(bin, args, {
    encoding: 'utf8',
    timeout: 120_000,
  });
  return { status: r.status, stderr: r.stderr ?? '' };
};

/** The archiver to use, or null when none is installed. */
export function findLhaBinary(existsSync: (p: string) => boolean = fs.existsSync): string | null {
  const override = process.env.LHA_COMMAND;
  if (override && existsSync(override)) return override;
  for (const candidate of ['/usr/local/bin/lha', '/usr/bin/lha', '/opt/homebrew/bin/lha']) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export interface MemberDeleteCapability {
  ok: boolean;
  reason?: string;
}

/**
 * Whether members can be removed from this archive in place. Format is
 * checked before tooling so the message names the real obstacle: "LZX
 * cannot be rewritten" is permanent and worth saying, while "no lha binary"
 * is a deployment detail.
 */
export function canDeleteMembers(
  archivePath: string,
  binary: string | null = findLhaBinary()
): MemberDeleteCapability {
  const ext = path.extname(archivePath).toLowerCase();
  if (ext !== '.lha' && ext !== '.lzh') {
    return {
      ok: false,
      reason: ext === '.lzx'
        ? 'LZX archives cannot be rewritten here: this server can read LZX but has no LZX writer.'
        : `Unsupported archive format for in-place editing: ${ext || '(none)'}`,
    };
  }
  if (!binary) {
    return { ok: false, reason: 'No lha binary available on this server.' };
  }
  return { ok: true };
}

export interface MemberDeleteResult {
  ok: boolean;
  removed: number;
  reason?: string;
}

/**
 * Removes `members` from `archivePath`. Returns how many the archiver was
 * asked to remove; a member that was already absent is not an error, because
 * the caller's list comes from a catalog that can lag the file.
 */
export function deleteMembers(
  archivePath: string,
  members: string[],
  opts: { binary?: string | null; runner?: ArchiveRunner } = {}
): MemberDeleteResult {
  const binary = opts.binary === undefined ? findLhaBinary() : opts.binary;
  const runner = opts.runner ?? defaultRunner;

  const capability = canDeleteMembers(archivePath, binary);
  if (!capability.ok) {
    return { ok: false, removed: 0, reason: capability.reason };
  }
  if (members.length === 0) {
    return { ok: true, removed: 0 };
  }

  // One invocation for all members: lha rewrites the archive once, so N
  // separate calls would rewrite it N times and multiply the window in which
  // a crash leaves a half-written archive.
  const result = runner(binary as string, ['d', archivePath, ...members]);
  if (result.status !== 0) {
    return {
      ok: false,
      removed: 0,
      reason: `lha exited ${result.status ?? 'null'}: ${(result.stderr || '').trim().slice(0, 200)}`,
    };
  }

  return { ok: true, removed: members.length };
}
