/**
 * express.e getExpressMajorVer (4599-4613): the version string a door gets
 * from EXPRESS_VERSION. A door's MIMICVER tooltype wins outright; otherwise
 * the board's own expressVer is cut to "v<major>.<minor>" (or "v<major>"
 * when it has no dot). The 'v' / 'V' prefix is skipped before reading.
 */

import { eVal } from './e-val.util';

/** The board's own version string when the session carries none. */
export const DEFAULT_EXPRESS_VER = 'v5.6';

export function getExpressMajorVer(mimicVersion: string | undefined, expressVer: string | undefined): string {
  if (mimicVersion && mimicVersion.length > 0) return mimicVersion;

  const ver = expressVer && expressVer.trim().length > 0 ? expressVer.trim() : DEFAULT_EXPRESS_VER;
  const skip = ver[0] === 'v' || ver[0] === 'V' ? 1 : 0;
  const dot = ver.indexOf('.');
  if (dot >= 0) return `v${eVal(ver.slice(skip))}.${eVal(ver.slice(dot + 1))}`;
  return `v${eVal(ver.slice(skip))}`;
}
