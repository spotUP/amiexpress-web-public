/**
 * What a BBC Micro ROM is, and how to tell one from another.
 *
 * The board never ships these files. Acorn's ROMs are not ours to
 * distribute, so the board holds exactly one copy - the one its own users
 * proved they already own - and this module is the part that can look at a
 * candidate file and say what it actually is.
 *
 * Shared rather than door-local because three places now ask the same
 * question: the BEEB door listing what is installed, the proof check
 * reading an upload, and the board deciding whether a caller may fetch
 * them.
 */
import * as crypto from 'crypto';

/** A sideways ROM is 16K, and so is the OS. A file of any other size is not one. */
export const ROM_BYTES = 16384;

/**
 * The three files a Model B needs, by the exact names the emulator asks for
 * (jsbeeb `src/models.js`). Getting one of these names wrong is a black
 * screen, not an error.
 */
export const REQUIRED_ROMS = ['os.rom', 'BASIC.ROM', 'b/DFS-1.2.rom'] as const;

/**
 * The DFS version the pinned model's 8271 disc controller expects.
 *
 * A 1770-era DFS (2.2x and later) cannot drive the emulated controller, and
 * the failure looks like a missing file rather than a mismatched ROM.
 */
export const EXPECTED_DFS_VERSION = '1.2';

export interface RomIdentity {
  /** The ROM's own title, from its sideways header. */
  title: string;
  /** Its version string, when it carries one. */
  version: string;
}

/**
 * What a ROM says it is.
 *
 * A sideways ROM carries its own title and version as plain text after the
 * language entry vectors - the title from offset 9, '\u0000'-terminated, then
 * the version. Reading it is how the board can tell that a file called
 * `DFS-1.2.rom` is actually DFS 2.42, which is the difference between a
 * disc that boots and a "File not found" nobody can explain.
 *
 * Returns null for a ROM with no readable header, which is NORMAL for the
 * OS ROM - it is not a sideways ROM and carries no such string.
 */
export function romIdentityOf(bytes: Uint8Array): RomIdentity | null {
  if (bytes.length < 0x50) return null;

  const parts = Buffer.from(bytes.subarray(9, 0x50))
    .toString('latin1')
    .split('\u0000')
    .map(part => part.trim())
    .filter(part => /^[\x20-\x7e]{2,}$/.test(part));

  if (parts.length === 0) return null;
  const version = parts.find(part => /^[0-9]+\.[0-9]+/.test(part)) ?? '';
  return { title: parts[0], version };
}

/** The content fingerprint, which is how one copy is matched against another. */
export function romDigest(bytes: Uint8Array): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

/**
 * Do two copies of a ROM count as the same ROM?
 *
 * BY CONTENT FIRST, AND BY WHAT IT SAYS IT IS SECOND. Identical dumps are
 * the normal case and hash the same. But a legitimate owner's dump can
 * differ - padded, trimmed, or taken from a different machine of the same
 * model - and refusing those would turn "prove you own this" into "prove
 * you own MY copy of this", which is a different and much less reasonable
 * demand.
 */
export function sameRom(mine: Uint8Array, theirs: Uint8Array): boolean {
  if (romDigest(mine) === romDigest(theirs)) return true;

  const a = romIdentityOf(mine);
  const b = romIdentityOf(theirs);
  if (!a || !b) return false;
  return a.title === b.title && a.version === b.version;
}
