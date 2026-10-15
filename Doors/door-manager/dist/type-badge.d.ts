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
/**
 * @param type the door's TYPE as the registry reports it
 * @returns exactly two characters: the badge, or `??` when there is no type
 */
export declare function typeBadge(type: string): string;
//# sourceMappingURL=type-badge.d.ts.map