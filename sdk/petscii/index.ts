/**
 * Shared PETSCII core (browser-safe, no Node imports): the KERNAL screen
 * machine, the VIC-II palette, screen-code remaps, the ANSI->PETSCII
 * transducer and the PETSCII-keyboard->ASCII input map. Consumed by
 * web/backend (telnet emitter), packages/terminal (canvas renderer) and
 * both test suites through `@amiexpress/bbs-door-sdk/petscii`.
 */
export { PetsciiMachine, type PetsciiMachineState } from './petscii-machine';
export {
  C64_PALETTE_COLODORE,
  C64_PALETTE_PEPTO,
  PETSCII_COLOR_TO_VIC,
  vicToSgrForeground,
  vicToSgrBackground,
} from './c64-palette';
export { printablePetsciiToScreenCode, screenCodeToPetscii } from './screen-codes';
export {
  AnsiToPetsciiTransducer,
  type AnsiToPetsciiOptions,
  nearestVicForRgb,
  vicColorToPetscii,
  sgrColorToVic,
  xterm256ToRgb,
} from './ansi-to-petscii';
export { UNICODE_TO_PETSCII } from './unicode-to-petscii';
export { petsciiInputToAscii } from './petscii-input';
export { printableLength, wrapLineToWidth } from './wrap';
