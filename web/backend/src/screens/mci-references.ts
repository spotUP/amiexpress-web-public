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

export function parseMciReferences(content: string): MciReference[] {
  // `~~` is a literal tilde (screen.handler.ts), so blank those before
  // matching rather than letting one start a code.
  const text = content.replace(/~~/g, '  ');
  const found: { at: number; ref: MciReference }[] = [];

  const push = (at: number, code: MciReference['code'], target: string) => {
    found.push({
      at,
      ref: { code, target, resolves: false, scopeSpecific: SCOPE_SPECIFIC.test(target) },
    });
  };

  for (const m of text.matchAll(/~CC_([^\s|~\r\n]+)/g)) push(m.index ?? 0, 'CC', m[1]);
  for (const m of text.matchAll(/~(?:SS_|2S)([^\s|~\r\n]+)/g)) push(m.index ?? 0, 'SS', m[1]);
  for (const m of text.matchAll(/~\d*SR_([^\s|~\r\n]+)/g)) push(m.index ?? 0, 'SR', m[1]);
  for (const m of text.matchAll(/~CL\./g)) push(m.index ?? 0, 'CL', '');

  return found.sort((a, b) => a.at - b.at).map(f => f.ref);
}
