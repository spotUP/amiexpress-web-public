/** E's Val: the leading number of a string, 0 when there is none. */
export function eVal(str: string): number {
  return eValRead(str).value;
}

/**
 * E's two-result Val (`v,r:=Val(str)`), the one Val every number answer uses:
 * the value and how many characters it read - 0 when the string does not start
 * with a number. Leading whitespace, an optional sign, then decimal digits,
 * `$` hex or `%` binary. The value is a 32-bit LONG, so a number too big wraps
 * as the Amiga's does. Unverified against an E reference (none in the repo):
 * whitespace set, `+` sign, and the read count including the blanks and sign.
 */
export function eValRead(str: string): { value: number; read: number } {
  const m = /^\s*([-+]?)(?:\$([0-9a-f]+)|%([01]+)|(\d+))/i.exec(str);
  if (!m) return { value: 0, read: 0 };
  const digits = m[2] !== undefined ? `0x${m[2]}` : m[3] !== undefined ? `0b${m[3]}` : m[4];
  const magnitude = BigInt(digits);
  const value = Number(BigInt.asIntN(32, m[1] === '-' ? -magnitude : magnitude));
  return { value, read: m[0].length };
}
