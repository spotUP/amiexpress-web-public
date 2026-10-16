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

/**
 * The REGION wipes: letters a door may ask the board for over the XIM
 * `WIPE IN <letter> <top> <rows> <F|B>` request, never a `~W` screen code.
 * Kept out of WIPE_CODES (and out of WipeType) on purpose: every consumer of
 * that table - the MCI catalogue, the screen parser, the menu wipe pickers -
 * lists whole-screen wipes, and a push needs a row range to mean anything.
 */
export type RegionWipeType =
  | 'push';      // P: new rows slide in over a row range (F from the right, B from the left)

export const REGION_WIPE_CODES: Readonly<Record<string, RegionWipeType>> = {
  P: 'push',
};
