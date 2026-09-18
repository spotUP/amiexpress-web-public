/**
 * Shared PETSCII core (browser-safe, no Node imports): the KERNAL screen
 * machine, the VIC-II palette, screen-code remaps, the ANSI->PETSCII
 * transducer and the PETSCII-keyboard->ASCII input map. Consumed by
 * web/backend (telnet emitter), packages/terminal (canvas renderer) and
 * both test suites through `@amiexpress/bbs-door-sdk/petscii`.
 */
export { PetsciiMachine, type PetsciiMachineState } from './petscii-machine';
export { type PetsciiScreenShape } from './petscii-machine';
export { WideScreenMachine, WIDE_SCREEN_SHAPE } from './wide-screen-machine';
export { type PetsciiScreenModel } from './screen-model';
export {
  C64_PALETTE_COLODORE,
  C64_PALETTE_PEPTO,
  C128_VDC_PALETTE,
  PETSCII_PALETTES,
  petsciiPaletteFor,
  type PetsciiPaletteName,
  PETSCII_COLOR_TO_VIC,
  vicToSgrForeground,
  vicToSgrBackground,
} from './c64-palette';
export { printablePetsciiToScreenCode, screenCodeToPetscii } from './screen-codes';
export {
  screenTextInRect, rectFromCorners,
  type PetsciiScreenState, type CellRect,
} from './screen-text';
export { writeSeq, writeSeqWithOffsets, type SeqWriteOptions, type SeqWriteResult } from './seq-writer';
export * from './editor-surface';
export {
  checkBoardRules, boardRulesReason,
  type BoardRuleCode, type BoardRuleViolation,
} from './board-rules';
export {
  AnsiToPetsciiTransducer,
  type AnsiToPetsciiOptions,
  petsciiMoveTo,
  nearestVicForRgb,
  vicColorToPetscii,
  sgrColorToVic,
  xterm256ToRgb,
} from './ansi-to-petscii';
export {
  asciiToPetsciiByte,
  encodePetsciiValue,
  type PetsciiByteMapping,
  type EncodePetsciiValueOptions,
} from './ascii-to-petscii';
export { LATIN1_TO_PETSCII_FOLD, UNICODE_TO_PETSCII } from './unicode-to-petscii';
export { petsciiInputToAscii } from './petscii-input';
export { printableLength, wrapLineToWidth } from './wrap';
