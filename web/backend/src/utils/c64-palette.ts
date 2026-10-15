/**
 * VIC-II palette + PETSCII color byte map. The one copy lives in the SDK
 * (sdk/petscii/c64-palette.ts, exported as @amiexpress/bbs-door-sdk/petscii);
 * this module re-exports it so existing backend imports keep working.
 */
export {
  C64_PALETTE_COLODORE,
  C64_PALETTE_PEPTO,
  PETSCII_COLOR_TO_VIC,
  vicToSgrForeground,
  vicToSgrBackground,
} from '@amiexpress/bbs-door-sdk/petscii';
