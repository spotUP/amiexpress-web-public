/**
 * The narrow spellings of one display file - the board's ONE width-variant
 * naming rule.
 *
 * A door being adapted to 40 columns asks for a file its author drew for 80.
 * Where the sysop has drawn a narrow copy, that copy wins - and it reaches the
 * caller exactly as drawn, because the rule ladder leaves an already-fitting
 * row alone (`chooseRule` answers `crop`, the identity at that width, in
 * sdk/petscii/frame/adapt.ts).
 *
 * The suffix is `_C64`, the one `screen.handler.ts` already resolves screens
 * with, so there is one convention to learn rather than two. BOTH spellings
 * are probed because a door file is not always `NAME.ext`: the "extension" of
 * `dRE!WAll.StYlE.1` is a STYLE NUMBER, and the narrow copy a sysop would draw
 * for it is `dRE!WAll.StYlE.1_C64`, not `dRE!WAll.StYlE_C64.1`.
 *
 * IT LIVES HERE BECAUSE TWO ROUTES NEED IT, and a door cannot tell them apart:
 * the BBS's own show-file service (XIM `JH_SF`/`JH_SG`, used by `wall` and
 * `games`) and a door opening the file itself through dos.library (`ctop` and
 * `conftop`, which read `BBS:Conf<n>/Conftop.header`). A naming rule written
 * out twice is the shape that made nine bugs in this tree; it is written once.
 *
 * Works on an AmigaDOS path as well as a host path: `path.parse` splits the
 * last segment either way, and `BBS:Conf1/Conftop.header` keeps its volume.
 */
import * as path from 'path';

export function narrowVariants(candidate: string): string[] {
  const parsed = path.parse(candidate);
  const whole = `${candidate}_C64`;
  const stem = path.join(parsed.dir, `${parsed.name}_C64${parsed.ext}`);
  return whole === stem ? [whole] : [whole, stem];
}
