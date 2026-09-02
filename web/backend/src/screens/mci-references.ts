/**
 * The MCI codes a screen file carries, and whether they still point at
 * something.
 *
 * A screen on this board is a program, not a picture. Measured across the 891
 * files under its screen directories: 252 `~SS_` includes, 173 `~CC_` command
 * invocations, 108 `~nSR_` recursions and 42 `~CL.` conference lists. A
 * reference to a door that has since been deleted is a menu item that fails
 * only when a caller presses the key, which is why the manager checks them
 * rather than rendering the text and calling it a preview.
 *
 * The patterns mirror the loader's own parser in screen.handler.ts - `~CC_`,
 * `~SS_`/`~2S`, `~nSR_` and `~CL.` - so if that parser learns a new form, this
 * has to learn it too.
 */

export interface MciReference {
  /** CC runs a command, SS includes a screen, SR recurses, CL lists conferences. */
  code: 'CC' | 'SS' | 'SR' | 'CL';
  /** What it names: a command for CC, a path for SS and SR, nothing for CL. */
  target: string;
  /**
   * What the board CALLS the target - the door's own name behind `~CC_gwall`.
   * Filled in by the index; a path target has none.
   */
  targetName?: string;
  /** Whether that command or file exists on this board. Filled in by the index. */
  resolves: boolean;
  /**
   * Whether the target names a specific node or conference.
   *
   * This is what blocks sharing a screen directory: a `~SS_BBS:Node1/x.txt`
   * carried into a directory that 215 nodes read would give every one of them
   * node 1's content.
   */
  scopeSpecific: boolean;
}

const SCOPE_SPECIFIC = /(^|[:/])(Node\d+|Conf\d+)([/:]|$)/i;

/** A reference and where it starts in the text, for a caller that has to point at it. */
export interface LocatedMciReference {
  at: number;
  /** The matched text itself - `~CC_gwall` - so a caller can measure it. */
  text: string;
  ref: MciReference;
}

/**
 * The same parse, with the offsets kept. The browser editor highlights each
 * token in place, and a second copy of these patterns living in the admin is
 * exactly the drift this file's header warns about.
 */
export function locateMciReferences(content: string): LocatedMciReference[] {
  // `~~` is a literal tilde (screen.handler.ts), so blank those before
  // matching rather than letting one start a code.
  const text = content.replace(/~~/g, '  ');
  const found: LocatedMciReference[] = [];

  const push = (at: number, matched: string, code: MciReference['code'], target: string) => {
    found.push({
      at,
      text: matched,
      ref: { code, target, resolves: false, scopeSpecific: SCOPE_SPECIFIC.test(target) },
    });
  };

  for (const m of text.matchAll(/~CC_([^\s|~\r\n]+)/g)) push(m.index ?? 0, m[0], 'CC', m[1]);
  for (const m of text.matchAll(/~(?:SS_|2S)([^\s|~\r\n]+)/g)) push(m.index ?? 0, m[0], 'SS', m[1]);
  for (const m of text.matchAll(/~\d*SR_([^\s|~\r\n]+)/g)) push(m.index ?? 0, m[0], 'SR', m[1]);
  for (const m of text.matchAll(/~CL\./g)) push(m.index ?? 0, m[0], 'CL', '');

  return found.sort((a, b) => a.at - b.at);
}

export function parseMciReferences(content: string): MciReference[] {
  return locateMciReferences(content).map(f => f.ref);
}
