/**
 * Input Normalizer
 * Provides helper utilities for trimming and normalizing
 * user-provided text so the BBS can compare values in a
 * case-insensitive, whitespace-tolerant manner.
 */
export function sanitizeInput(value: string | undefined | null): string {
  return (value ?? '').trim();
}

export function normalizeForComparison(value: string | undefined | null): string {
  return sanitizeInput(value).toLowerCase();
}

/**
 * Sanitize a filename for the BBS file system.
 *
 * Express.e:19016 mandates "Filename lengths above 12 are not allowed"
 * and rejects spaces/colons/slashes/asterisks/hashes/pluses/qmarks in
 * the rename loop at express.e:19192-19256. Original AmiExpress UI
 * prompts the user to rename non-conforming uploads; the web file
 * picker has no such prompt, so we sanitize at intake instead:
 *
 *   - replace spaces with underscores
 *   - drop characters not allowed in Amiga BBS filenames
 *   - truncate to 12 chars total, preserving the extension when possible
 *
 * Without this, long names break the DIR file format (status marker
 * is supposed to live at column 13; long names push it past that),
 * making the entry invisible to readers like AquaScan that parse
 * by column position.
 */
export function sanitizeBBSFilename(name: string): string {
  if (!name) return 'unnamed';
  // Replace spaces with underscores, strip disallowed chars
  let cleaned = name.replace(/\s+/g, '_').replace(/[:\/*#+?]/g, '');
  if (cleaned.length <= 12) return cleaned;

  // Preserve extension if there is one and it fits
  const dot = cleaned.lastIndexOf('.');
  if (dot > 0 && dot < cleaned.length - 1) {
    const ext = cleaned.slice(dot);   // includes dot, e.g. ".lha"
    const base = cleaned.slice(0, dot);
    if (ext.length <= 5) {
      const baseRoom = 12 - ext.length;
      return base.slice(0, baseRoom) + ext;
    }
  }
  return cleaned.slice(0, 12);
}
