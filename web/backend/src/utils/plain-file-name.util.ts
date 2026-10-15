/**
 * Whether a name a client sent is ONE plain file name - no directory part,
 * nothing that joins into a path above where it is put. AmigaDOS names
 * cannot hold `/` or `:` either, so nothing the board files is refused.
 */
export function isPlainFileName(name: unknown): name is string {
  if (typeof name !== 'string' || name.length === 0 || name.length > 255) return false;
  if (name === '.' || name === '..') return false;
  return !/[\/\\:\0]/.test(name);
}
