/**
 * The wipe codes - `~W` and one letter, on a line of their own - and the
 * animation each one plays. This port's own codes, not express.e's.
 *
 * Here, in `screens/`, and importing nothing, because the admin app compiles
 * this folder directly (config-app's `@bbs/screens` alias, and the Docker
 * stage copies only it): the MCI catalogue lists these, and the board's wipe
 * renderer (utils/screen-wipe.util) plays them, from this one table.
 */
export type WipeType =
  | 'matrix'     // ~WM
  | 'hblinds'    // ~WH
  | 'vblinds'    // ~WV
  | 'spiral'     // ~WS
  | 'checker'    // ~WC
  | 'radial'     // ~WR
  | 'blocks'     // ~WB
  | 'noise'      // ~WN
  | 'typewriter' // ~WT
  | 'explode'    // ~WE
  | 'random';    // ~WX

export const WIPE_CODES: Readonly<Record<string, WipeType>> = {
  M: 'matrix',
  H: 'hblinds',
  V: 'vblinds',
  S: 'spiral',
  C: 'checker',
  R: 'radial',
  B: 'blocks',
  N: 'noise',
  T: 'typewriter',
  E: 'explode',
  X: 'random',
};
