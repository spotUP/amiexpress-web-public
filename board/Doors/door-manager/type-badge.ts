/**
 * The two-character type badge in the installed-doors list.
 *
 * Split out of app.ts to be testable: it was a map with `?? '??'` behind it,
 * and every door type missing from that map - DD (DayDream), AIM, MCI,
 * python - drew as `[??]` in the list while the detail pane beside it said
 * `Type: DD`. Reported from the live board on 2026-08-31 for the DayDream
 * doors.
 *
 * The map now exists for the types whose badge is NOT their first two
 * letters (a TypeScript door is TS, not TY; an XIM is 68, because what the
 * sysop cares about is that it is a 68K binary). Anything else falls back to
 * its own first two characters, so a door type added later shows something
 * true rather than `??`. Only a genuinely absent type is unknown.
 */

const BADGES: Record<string, string> = {
  // TypeScript, by any of the names the registry uses for it
  TS: 'TS',
  typescript: 'TS',
  SDK: 'TS',

  // 68K binaries: the interface differs, the fact that matters does not
  XIM: '68',
  AIM: '68',
  AMI: '68',
  amiga: '68',

  // ARexx, by any of its spellings
  RX: 'RX',
  AREXX: 'RX',
  ARexx: 'RX',
  arexx: 'RX',
  REXX: 'RX',
  RXD: 'RX',

  // Python, which initializeDoors lower-cases
  PY: 'PY',
  PYTHON: 'PY',
  python: 'PY',
};

/**
 * @param type the door's TYPE as the registry reports it
 * @returns exactly two characters: the badge, or `??` when there is no type
 */
export function typeBadge(type: string): string {
  if (!type) return '??';

  const mapped = BADGES[type];
  if (mapped) return mapped;

  // DD, SIM, TIM, FIM, IIM, MCI, AEM, SUP and anything added later: the
  // first two characters of the type itself, which is what the sysop would
  // call it.
  return type.slice(0, 2).toUpperCase();
}
