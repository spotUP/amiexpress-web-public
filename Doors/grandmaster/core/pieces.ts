/**
 * Tetris Piece Definitions and Rotation Systems
 *
 * Supports:
 * - SRS (Super Rotation System) - Modern standard
 * - ARS (Arika Rotation System) - TGM classic
 * - NRS (Nintendo Rotation System) - Retro NES
 * - BARS (Bombliss Arika) - Hybrid
 */

import type { PieceType, RotationData, RotationSystem, KickTable } from './types';

// ============================================================================
// Piece Colors (for rendering)
// ============================================================================

export const PIECE_COLORS: Record<PieceType, string> = {
  I: 'cyan',
  O: 'yellow',
  T: 'magenta',
  S: 'green',
  Z: 'red',
  J: 'blue',
  L: 'white',
};

// TGM3 ARS Colors (Authentic)
export const ARS_COLORS: Record<PieceType, string> = {
  I: 'red',
  J: 'blue',
  L: 'orange',
  O: 'yellow',
  S: 'magenta',
  Z: 'green',
  T: 'cyan',
};

// ============================================================================
// SRS Rotation Data
// ============================================================================

const SRS_SHAPES: Record<PieceType, number[][][]> = {
  I: [
    // 0°
    [[0, 0, 0, 0],
     [1, 1, 1, 1],
     [0, 0, 0, 0],
     [0, 0, 0, 0]],
    // 90°
    [[0, 0, 1, 0],
     [0, 0, 1, 0],
     [0, 0, 1, 0],
     [0, 0, 1, 0]],
    // 180°
    [[0, 0, 0, 0],
     [0, 0, 0, 0],
     [1, 1, 1, 1],
     [0, 0, 0, 0]],
    // 270°
    [[0, 1, 0, 0],
     [0, 1, 0, 0],
     [0, 1, 0, 0],
     [0, 1, 0, 0]],
  ],
  O: [
    // All rotations identical
    [[0, 1, 1, 0],
     [0, 1, 1, 0],
     [0, 0, 0, 0],
     [0, 0, 0, 0]],
    [[0, 1, 1, 0],
     [0, 1, 1, 0],
     [0, 0, 0, 0],
     [0, 0, 0, 0]],
    [[0, 1, 1, 0],
     [0, 1, 1, 0],
     [0, 0, 0, 0],
     [0, 0, 0, 0]],
    [[0, 1, 1, 0],
     [0, 1, 1, 0],
     [0, 0, 0, 0],
     [0, 0, 0, 0]],
  ],
  T: [
    // 0°
    [[0, 1, 0, 0],
     [1, 1, 1, 0],
     [0, 0, 0, 0],
     [0, 0, 0, 0]],
    // 90°
    [[0, 1, 0, 0],
     [0, 1, 1, 0],
     [0, 1, 0, 0],
     [0, 0, 0, 0]],
    // 180°
    [[0, 0, 0, 0],
     [1, 1, 1, 0],
     [0, 1, 0, 0],
     [0, 0, 0, 0]],
    // 270°
    [[0, 1, 0, 0],
     [1, 1, 0, 0],
     [0, 1, 0, 0],
     [0, 0, 0, 0]],
  ],
  S: [
    // 0°
    [[0, 1, 1, 0],
     [1, 1, 0, 0],
     [0, 0, 0, 0],
     [0, 0, 0, 0]],
    // 90°
    [[0, 1, 0, 0],
     [0, 1, 1, 0],
     [0, 0, 1, 0],
     [0, 0, 0, 0]],
    // 180°
    [[0, 0, 0, 0],
     [0, 1, 1, 0],
     [1, 1, 0, 0],
     [0, 0, 0, 0]],
    // 270°
    [[1, 0, 0, 0],
     [1, 1, 0, 0],
     [0, 1, 0, 0],
     [0, 0, 0, 0]],
  ],
  Z: [
    // 0°
    [[1, 1, 0, 0],
     [0, 1, 1, 0],
     [0, 0, 0, 0],
     [0, 0, 0, 0]],
    // 90°
    [[0, 0, 1, 0],
     [0, 1, 1, 0],
     [0, 1, 0, 0],
     [0, 0, 0, 0]],
    // 180°
    [[0, 0, 0, 0],
     [1, 1, 0, 0],
     [0, 1, 1, 0],
     [0, 0, 0, 0]],
    // 270°
    [[0, 1, 0, 0],
     [1, 1, 0, 0],
     [1, 0, 0, 0],
     [0, 0, 0, 0]],
  ],
  J: [
    // 0°
    [[1, 0, 0, 0],
     [1, 1, 1, 0],
     [0, 0, 0, 0],
     [0, 0, 0, 0]],
    // 90°
    [[0, 1, 1, 0],
     [0, 1, 0, 0],
     [0, 1, 0, 0],
     [0, 0, 0, 0]],
    // 180°
    [[0, 0, 0, 0],
     [1, 1, 1, 0],
     [0, 0, 1, 0],
     [0, 0, 0, 0]],
    // 270°
    [[0, 1, 0, 0],
     [0, 1, 0, 0],
     [1, 1, 0, 0],
     [0, 0, 0, 0]],
  ],
  L: [
    // 0°
    [[0, 0, 1, 0],
     [1, 1, 1, 0],
     [0, 0, 0, 0],
     [0, 0, 0, 0]],
    // 90°
    [[0, 1, 0, 0],
     [0, 1, 0, 0],
     [0, 1, 1, 0],
     [0, 0, 0, 0]],
    // 180°
    [[0, 0, 0, 0],
     [1, 1, 1, 0],
     [1, 0, 0, 0],
     [0, 0, 0, 0]],
    // 270°
    [[1, 1, 0, 0],
     [0, 1, 0, 0],
     [0, 1, 0, 0],
     [0, 0, 0, 0]],
  ],
};

// SRS Wall Kick Data (5 tests per rotation)

const SRS_KICKS: Record<string, KickTable> = {

  // JLSTZ pieces

  'JLSTZ_0->1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],

  'JLSTZ_1->0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],

  'JLSTZ_1->2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],

  'JLSTZ_2->1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],

  'JLSTZ_2->3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],

  'JLSTZ_3->2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],

  'JLSTZ_3->0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],

  'JLSTZ_0->3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],



  // I piece (different kicks)

  'I_0->1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],

  'I_1->0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],

  'I_1->2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],

  'I_2->1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],

  'I_2->3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],

  'I_3->2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],

  'I_3->0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],

  'I_0->3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],



  // O piece (no kicks)

  'O_0->1': [[0, 0]],

  'O_1->0': [[0, 0]],

  'O_1->2': [[0, 0]],

  'O_2->1': [[0, 0]],

  'O_2->3': [[0, 0]],

  'O_3->2': [[0, 0]],

  'O_3->0': [[0, 0]],

  'O_0->3': [[0, 0]],

};



// ============================================================================

// ARS (Arika Rotation System) - TGM Classic

// ============================================================================



const ARS_SHAPES: Record<PieceType, number[][][]> = {

  I: [

    [[0, 0, 0, 0],

     [1, 1, 1, 1],

     [0, 0, 0, 0],

     [0, 0, 0, 0]],

    [[0, 0, 1, 0],

     [0, 0, 1, 0],

     [0, 0, 1, 0],

     [0, 0, 1, 0]],

    [[0, 0, 0, 0],

     [1, 1, 1, 1],

     [0, 0, 0, 0],

     [0, 0, 0, 0]],

    [[0, 0, 1, 0],

     [0, 0, 1, 0],

     [0, 0, 1, 0],

     [0, 0, 1, 0]],

  ],

  O: SRS_SHAPES.O,

  T: [

    [[0, 1, 0],

     [1, 1, 1],

     [0, 0, 0]],

    [[0, 1, 0],

     [0, 1, 1],

     [0, 1, 0]],

    [[0, 0, 0],

     [1, 1, 1],

     [0, 1, 0]],

    [[0, 1, 0],

     [1, 1, 0],

     [0, 1, 0]],

  ],

  S: [

    [[0, 1, 1],

     [1, 1, 0],

     [0, 0, 0]],

    [[0, 1, 0],

     [0, 1, 1],

     [0, 0, 1]],

    [[0, 0, 0],

     [0, 1, 1],

     [1, 1, 0]],

    [[1, 0, 0],

     [1, 1, 0],

     [0, 1, 0]],

  ],

  Z: [

    [[1, 1, 0],

     [0, 1, 1],

     [0, 0, 0]],

    [[0, 0, 1],

     [0, 1, 1],

     [0, 1, 0]],

    [[0, 0, 0],

     [1, 1, 0],

     [0, 1, 1]],

    [[0, 1, 0],

     [1, 1, 0],

     [1, 0, 0]],

  ],

  J: [

    [[1, 0, 0],

     [1, 1, 1],

     [0, 0, 0]],

    [[0, 1, 1],

     [0, 1, 0],

     [0, 1, 0]],

    [[0, 0, 0],

     [1, 1, 1],

     [0, 0, 1]],

    [[0, 1, 0],

     [0, 1, 0],

     [1, 1, 0]],

  ],

  L: [

    [[0, 0, 1],

     [1, 1, 1],

     [0, 0, 0]],

    [[0, 1, 0],

     [0, 1, 0],

     [0, 1, 1]],

    [[0, 0, 0],

     [1, 1, 1],

     [1, 0, 0]],

    [[1, 1, 0],

     [0, 1, 0],

     [0, 1, 0]],

  ],

};



// ARS Wall Kicks (Authentic)

const ARS_KICKS: Record<string, KickTable> = {

  'JLSTZ_0->1': [[0, 0], [-1, 0], [1, 0]],

  'JLSTZ_1->0': [[0, 0], [1, 0], [-1, 0]],

  'JLSTZ_1->2': [[0, 0], [1, 0], [-1, 0]],

  'JLSTZ_2->1': [[0, 0], [-1, 0], [1, 0]],

  'JLSTZ_2->3': [[0, 0], [1, 0], [-1, 0]],

  'JLSTZ_3->2': [[0, 0], [-1, 0], [1, 0]],

  'JLSTZ_3->0': [[0, 0], [-1, 0], [1, 0]],

  'JLSTZ_0->3': [[0, 0], [1, 0], [-1, 0]],



  // I piece (TGM3 ARS floor kicks)

  'I_0->1': [[0, 0]],

  'I_1->0': [[0, 0], [0, -1], [0, -2]],

  'I_1->2': [[0, 0], [0, -1], [0, -2]],

  'I_2->1': [[0, 0]],

  'I_2->3': [[0, 0], [0, -1], [0, -2]],

  'I_3->2': [[0, 0], [0, -1], [0, -2]],

  'I_3->0': [[0, 0]],

  'I_0->3': [[0, 0], [0, -1], [0, -2]],



  'O_0->1': [[0, 0]],

  'O_1->0': [[0, 0]],

  'O_1->2': [[0, 0]],

  'O_2->1': [[0, 0]],

  'O_2->3': [[0, 0]],

  'O_3->2': [[0, 0]],

  'O_3->0': [[0, 0]],

  'O_0->3': [[0, 0]],

};



// ================= ===========================================================

// NRS (Nintendo Rotation System) - Classic NES Tetris

// ============================================================================



const NRS_SHAPES: Record<PieceType, number[][][]> = {

  I: [

    // 0° - Horizontal

    [[0, 0, 0, 0],

     [1, 1, 1, 1],

     [0, 0, 0, 0],

     [0, 0, 0, 0]],

    // 90° - Vertical

    [[0, 1, 0, 0],

     [0, 1, 0, 0],

     [0, 1, 0, 0],

     [0, 1, 0, 0]],

    // 180° - Same as 0°

    [[0, 0, 0, 0],

     [1, 1, 1, 1],

     [0, 0, 0, 0],

     [0, 0, 0, 0]],

    // 270° - Same as 90°

    [[0, 1, 0, 0],

     [0, 1, 0, 0],

     [0, 1, 0, 0],

     [0, 1, 0, 0]],

  ],

  O: SRS_SHAPES.O, // Same as SRS

  T: SRS_SHAPES.T, // Same as SRS

  S: SRS_SHAPES.S, // Same as SRS

  Z: SRS_SHAPES.Z, // Same as SRS

  J: SRS_SHAPES.J, // Same as SRS

  L: SRS_SHAPES.L, // Same as SRS

};



// NRS has NO wall kicks - pure rotation

const NRS_KICKS: Record<string, KickTable> = {

  'JLSTZ_0->1': [[0, 0]],

  'JLSTZ_1->0': [[0, 0]],

  'JLSTZ_1->2': [[0, 0]],

  'JLSTZ_2->1': [[0, 0]],

  'JLSTZ_2->3': [[0, 0]],

  'JLSTZ_3->2': [[0, 0]],

  'JLSTZ_3->0': [[0, 0]],

  'JLSTZ_0->3': [[0, 0]],

  'I_0->1': [[0, 0]],

  'I_1->0': [[0, 0]],

  'I_1->2': [[0, 0]],

  'I_2->1': [[0, 0]],

  'I_2->3': [[0, 0]],

  'I_3->2': [[0, 0]],

  'I_3->0': [[0, 0]],

  'I_0->3': [[0, 0]],

  'O_0->1': [[0, 0]],

  'O_1->0': [[0, 0]],

  'O_1->2': [[0, 0]],

  'O_2->1': [[0, 0]],

  'O_2->3': [[0, 0]],

  'O_3->2': [[0, 0]],

  'O_3->0': [[0, 0]],

  'O_0->3': [[0, 0]],

};



// ============================================================================

// BARS (Big Arika Rotation System) - Hybrid

// ============================================================================



const BARS_SHAPES: Record<PieceType, number[][][]> = {

  // BARS uses SRS shapes

  I: SRS_SHAPES.I,

  O: SRS_SHAPES.O,

  T: SRS_SHAPES.T,

  S: SRS_SHAPES.S,

  Z: SRS_SHAPES.Z,

  J: SRS_SHAPES.J,

  L: SRS_SHAPES.L,

};



// BARS has moderate wall kicks (between ARS and SRS)

const BARS_KICKS: Record<string, KickTable> = {

  // JLSTZ pieces - 3 tests

  'JLSTZ_0->1': [[0, 0], [-1, 0], [-1, 1]],

  'JLSTZ_1->0': [[0, 0], [1, 0], [1, -1]],

  'JLSTZ_1->2': [[0, 0], [1, 0], [1, -1]],

  'JLSTZ_2->1': [[0, 0], [-1, 0], [-1, 1]],

  'JLSTZ_2->3': [[0, 0], [1, 0], [1, 1]],

  'JLSTZ_3->2': [[0, 0], [-1, 0], [-1, -1]],

  'JLSTZ_3->0': [[0, 0], [-1, 0], [-1, -1]],

  'JLSTZ_0->3': [[0, 0], [1, 0], [1, 1]],



  // I piece - 4 tests

  'I_0->1': [[0, 0], [-2, 0], [1, 0], [-2, -1]],

  'I_1->0': [[0, 0], [2, 0], [-1, 0], [2, 1]],

  'I_1->2': [[0, 0], [-1, 0], [2, 0], [-1, 2]],

  'I_2->1': [[0, 0], [1, 0], [-2, 0], [1, -2]],

  'I_2->3': [[0, 0], [2, 0], [-1, 0], [2, 1]],

  'I_3->2': [[0, 0], [-2, 0], [1, 0], [-2, -1]],

  'I_3->0': [[0, 0], [1, 0], [-2, 0], [1, -2]],

  'I_0->3': [[0, 0], [-1, 0], [2, 0], [-1, 2]],



  // O piece (no kicks)

  'O_0->1': [[0, 0]],

  'O_1->0': [[0, 0]],

  'O_1->2': [[0, 0]],

  'O_2->1': [[0, 0]],

  'O_2->3': [[0, 0]],

  'O_3->2': [[0, 0]],

  'O_3->0': [[0, 0]],

  'O_0->3': [[0, 0]],

};

// ============================================================================
// CLASSIC block-data table (HeborisCE src/script/classic.c:3-23)
//
// Shared verbatim by statCMove (Heboris / TI-ARS) and statAMove (ACE-ARS /
// ACE-ARS2) -- ars.c:1-2 says so explicitly ("block data ... reused from
// classic.c"). Decoded from blkDataX/blkDataY (kind order 0=I,1=L,2=O,3=Z,
// 4=T,5=J,6=S -- see the color-table comments at src/game/init.c:507-529)
// with each kind's rot0..rot3 taken directly as this table's rotation index;
// NOT re-aligned to SRS spawn orientation (T/J/L spawn "point-down"/flipped
// relative to SRS -- the genuine TGM/ARS behavior, not a bug).
// ============================================================================

const CLASSIC_SHAPES: Record<PieceType, number[][][]> = {
  I: [
    [[0, 0, 0, 0],
     [1, 1, 1, 1],
     [0, 0, 0, 0],
     [0, 0, 0, 0]],
    [[0, 0, 1, 0],
     [0, 0, 1, 0],
     [0, 0, 1, 0],
     [0, 0, 1, 0]],
    [[0, 0, 0, 0],
     [1, 1, 1, 1],
     [0, 0, 0, 0],
     [0, 0, 0, 0]],
    [[0, 0, 1, 0],
     [0, 0, 1, 0],
     [0, 0, 1, 0],
     [0, 0, 1, 0]],
  ],
  L: [
    [[0, 0, 0, 0],
     [1, 1, 1, 0],
     [1, 0, 0, 0],
     [0, 0, 0, 0]],
    [[1, 1, 0, 0],
     [0, 1, 0, 0],
     [0, 1, 0, 0],
     [0, 0, 0, 0]],
    [[0, 0, 0, 0],
     [0, 0, 1, 0],
     [1, 1, 1, 0],
     [0, 0, 0, 0]],
    [[0, 1, 0, 0],
     [0, 1, 0, 0],
     [0, 1, 1, 0],
     [0, 0, 0, 0]],
  ],
  O: [
    [[0, 0, 0, 0],
     [0, 1, 1, 0],
     [0, 1, 1, 0],
     [0, 0, 0, 0]],
    [[0, 0, 0, 0],
     [0, 1, 1, 0],
     [0, 1, 1, 0],
     [0, 0, 0, 0]],
    [[0, 0, 0, 0],
     [0, 1, 1, 0],
     [0, 1, 1, 0],
     [0, 0, 0, 0]],
    [[0, 0, 0, 0],
     [0, 1, 1, 0],
     [0, 1, 1, 0],
     [0, 0, 0, 0]],
  ],
  Z: [
    [[0, 0, 0, 0],
     [1, 1, 0, 0],
     [0, 1, 1, 0],
     [0, 0, 0, 0]],
    [[0, 0, 1, 0],
     [0, 1, 1, 0],
     [0, 1, 0, 0],
     [0, 0, 0, 0]],
    [[0, 0, 0, 0],
     [1, 1, 0, 0],
     [0, 1, 1, 0],
     [0, 0, 0, 0]],
    [[0, 0, 1, 0],
     [0, 1, 1, 0],
     [0, 1, 0, 0],
     [0, 0, 0, 0]],
  ],
  T: [
    [[0, 0, 0, 0],
     [1, 1, 1, 0],
     [0, 1, 0, 0],
     [0, 0, 0, 0]],
    [[0, 1, 0, 0],
     [1, 1, 0, 0],
     [0, 1, 0, 0],
     [0, 0, 0, 0]],
    [[0, 0, 0, 0],
     [0, 1, 0, 0],
     [1, 1, 1, 0],
     [0, 0, 0, 0]],
    [[0, 1, 0, 0],
     [0, 1, 1, 0],
     [0, 1, 0, 0],
     [0, 0, 0, 0]],
  ],
  J: [
    [[0, 0, 0, 0],
     [1, 1, 1, 0],
     [0, 0, 1, 0],
     [0, 0, 0, 0]],
    [[0, 1, 0, 0],
     [0, 1, 0, 0],
     [1, 1, 0, 0],
     [0, 0, 0, 0]],
    [[0, 0, 0, 0],
     [1, 0, 0, 0],
     [1, 1, 1, 0],
     [0, 0, 0, 0]],
    [[0, 1, 1, 0],
     [0, 1, 0, 0],
     [0, 1, 0, 0],
     [0, 0, 0, 0]],
  ],
  S: [
    [[0, 0, 0, 0],
     [0, 1, 1, 0],
     [1, 1, 0, 0],
     [0, 0, 0, 0]],
    [[1, 0, 0, 0],
     [1, 1, 0, 0],
     [0, 1, 0, 0],
     [0, 0, 0, 0]],
    [[0, 0, 0, 0],
     [0, 1, 1, 0],
     [1, 1, 0, 0],
     [0, 0, 0, 0]],
    [[1, 0, 0, 0],
     [1, 1, 0, 0],
     [0, 1, 0, 0],
     [0, 0, 0, 0]],
  ],
};

// TI-ARS / ACE-ARS wall & floor kicks.
//
// This table is shared by TI-ARS and ACE-ARS; the two ROTATION SYSTEMS are
// not otherwise the same, see the RotationSystem doc comment in core/types.ts
// for what else HeborisCE gates on rots (ACE-ARS's up-key instant lock in
// particular, ars.c:331/361/389, which this door does not implement).
//
// classic.c:130-242 (statCMove, shared by Heboris rots==0 and TI-ARS rots==1):
//   - the plain left/right wall kick for every non-I piece (classic.c:130-186)
//     applies to BOTH Heboris and TI-ARS -- it is not gated on rots.
//   - the T-piece "cyan" floor kick (classic.c:162-183, gated `rots[player]==1`)
//     and the I-piece red wall/floor kick (classic.c:186-241, gated
//     `rots[player]==1`) are TI-ARS exclusive; Heboris (rots==0) gets neither.
// ars.c:83-234 (statAMove, run by ACE-ARS rots==4 and ACE-ARS2 rots==5) runs
// textually the same three kick branches (ars.c:112, ars.c:144-165, ars.c:168-223)
// with NO rots gating at all, so for THESE SPECIFIC transitions ACE-ARS computes
// the same offsets TI-ARS does -- a traced fact about the kick math, checked
// transition by transition, not a claim that ACE-ARS and TI-ARS play the same.
// ars.c's statAMove also gives ACE-ARS (rots==4 only, not TI-ARS, not ACE-ARS2)
// an ARS1-style instant lock on the up key while grounded (ars.c:331,361,389) --
// a lock/landing mechanic with no equivalent in classic.c's statCMove at all, so
// TI-ARS has no analog of it whatsoever. Not implemented in this door: there is
// no "up key held while grounded" input distinct from rotate/hard-drop in this
// door's control scheme, and inventing one risks a guessed key mapping.
//
// Left/right kick priority: classic.c/ars.c test left-then-right with two
// independent `if`s, so when both directions are open the right kick's
// assignment executes last and wins -- hence right is listed before left below.
//
// T floor kick only fires landing in state 2 (point-up), classic.c:145/ars.c:145,
// so it is only added to the T_1->2 / T_3->2 entries.
//
// I kick: horizontal targets (state 0 or 2) try x-1, x+1, x+2 in that order
// (classic.c:193-199/ars.c:174-179); vertical targets (state 1 or 3) try a
// grounded-only floor kick of y-1 then y-2 (classic.c:215-218/ars.c:196-199),
// which is exactly the door's generic floorKickCount/maxFloorKicks mechanism
// (core/game.ts rotate()) for any kick candidate with offsetY<0 while grounded.
const CLASSIC_ARS_KICKS: Record<string, KickTable> = {
  'JLSZ_0->1': [[0, 0], [1, 0], [-1, 0]],
  'JLSZ_1->0': [[0, 0], [1, 0], [-1, 0]],
  'JLSZ_1->2': [[0, 0], [1, 0], [-1, 0]],
  'JLSZ_2->1': [[0, 0], [1, 0], [-1, 0]],
  'JLSZ_2->3': [[0, 0], [1, 0], [-1, 0]],
  'JLSZ_3->2': [[0, 0], [1, 0], [-1, 0]],
  'JLSZ_3->0': [[0, 0], [1, 0], [-1, 0]],
  'JLSZ_0->3': [[0, 0], [1, 0], [-1, 0]],

  'T_0->1': [[0, 0], [1, 0], [-1, 0]],
  'T_1->0': [[0, 0], [1, 0], [-1, 0]],
  'T_1->2': [[0, 0], [1, 0], [-1, 0], [0, -1]],
  'T_2->1': [[0, 0], [1, 0], [-1, 0]],
  'T_2->3': [[0, 0], [1, 0], [-1, 0]],
  'T_3->2': [[0, 0], [1, 0], [-1, 0], [0, -1]],
  'T_3->0': [[0, 0], [1, 0], [-1, 0]],
  'T_0->3': [[0, 0], [1, 0], [-1, 0]],

  'I_0->1': [[0, 0], [0, -1], [0, -2]],
  'I_1->0': [[0, 0], [-1, 0], [1, 0], [2, 0]],
  'I_1->2': [[0, 0], [-1, 0], [1, 0], [2, 0]],
  'I_2->1': [[0, 0], [0, -1], [0, -2]],
  'I_2->3': [[0, 0], [0, -1], [0, -2]],
  'I_3->2': [[0, 0], [-1, 0], [1, 0], [2, 0]],
  'I_3->0': [[0, 0], [-1, 0], [1, 0], [2, 0]],
  'I_0->3': [[0, 0], [0, -1], [0, -2]],

  'O_0->1': [[0, 0]],
  'O_1->0': [[0, 0]],
  'O_1->2': [[0, 0]],
  'O_2->1': [[0, 0]],
  'O_2->3': [[0, 0]],
  'O_3->2': [[0, 0]],
  'O_3->0': [[0, 0]],
  'O_0->3': [[0, 0]],
};

// ============================================================================
// WORLD block-data table (HeborisCE src/script/world.c:52-72).
//
// Verified byte-for-byte identical (position and shape, not just rotation
// offset) to this file's own SRS_SHAPES above for every piece and rotation --
// so TI-WORLD / ACE-SRS / DS-WORLD / SRS-X all reuse SRS_SHAPES directly; no
// separate shape table is needed. ("ACE-SRS" is a HeborisCE display name for
// what the engine actually runs through statWMove i.e. the WORLD family, per
// game/gamestart.c:7613-7630 -- it does not use a different, SRS-native table.)
// ============================================================================

// TI-WORLD / ACE-SRS / DS-WORLD / SRS-X shared 90-degree wall kicks.
//
// This table is shared by all four of these ROTATION SYSTEMS; the systems
// themselves are not otherwise interchangeable -- see the RotationSystem doc
// comment in core/types.ts for the lock/landing differences HeborisCE gates
// per rots value (DS-WORLD's kick-limit exemption and SRS-X's instant lock on
// down are both implemented in core/game.ts; the ACE-SRS/DS-WORLD soft-drop
// gravity constant at world.c:405,452 is not).
//
// world.c:139-357 (statWMove) is the single function behind all four of these
// rulesets (game/gamestart.c:7613-7630: rots==2 TI-WORLD, rots==3 ACE-SRS/
// "WORLD2", rots==6 DS-WORLD/"WORLD3", rots==7 SRS-X); its rotation/kick block
// (world.c:203-357) is not gated on rots at all for the plain CW/CCW case, so
// for these transitions all four compute identical 90-degree kick data -- a
// traced fact about the kick math specifically, not a claim that the four
// systems play the same. They differ in kick-count limits, lock-on-down, and
// drop-speed constants passed into statWMove (world.c:7613-7630, 405-452) and,
// for SRS-X only, a dedicated 180-degree path (world.c:211, 242-254) -- see
// SRS_X_KICKS below.
//
// Non-I offsets are the "回転補正(I以外共通)" table at world.c:29-37 (world_i_rot
// defaults to 0 -- game/gamestart.c:975 -- so the I offsets are the symmetric
// "Iのみ" table at world.c:40-43, not the asymmetric iBlockKickTable variant).
const WORLD_KICKS: Record<string, KickTable> = {
  'JLSTZ_0->1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  'JLSTZ_0->3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  'JLSTZ_1->2': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  'JLSTZ_3->2': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  'JLSTZ_2->3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  'JLSTZ_2->1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  'JLSTZ_3->0': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  'JLSTZ_1->0': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],

  'I_0->1': [[0, 0], [-2, 0], [1, 0], [1, -2]],
  'I_0->3': [[0, 0], [2, 0], [-1, 0], [-1, -2]],
  'I_1->2': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  'I_3->2': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  'I_2->3': [[0, 0], [-1, 0], [2, 0], [2, -1]],
  'I_2->1': [[0, 0], [1, 0], [-2, 0], [-2, -1]],
  'I_3->0': [[0, 0], [1, 0], [-2, 0], [-2, -1], [1, 2]],
  'I_1->0': [[0, 0], [-1, 0], [2, 0], [2, -1], [-1, 2]],

  'O_0->1': [[0, 0]],
  'O_1->0': [[0, 0]],
  'O_1->2': [[0, 0]],
  'O_2->1': [[0, 0]],
  'O_2->3': [[0, 0]],
  'O_3->2': [[0, 0]],
  'O_3->0': [[0, 0]],
  'O_0->3': [[0, 0]],
};

// SRS-X dedicated 180-degree kicks (world.c:121-135, otherBlock180KickTable /
// iBlock180KickTable), only reachable via statWMove's move==2 branch which is
// exclusive to rots==7 / SRS-X (world.c:211). The trailing (0,0) padding rows
// in iBlock180KickTable are dropped since [0,0] is already tried first by
// every kick lookup in this file (the direct in-place rotation test that
// precedes the wall-kick branch, e.g. world.c:231).
const SRS_X_KICKS: Record<string, KickTable> = {
  'JLSTZ_0->2': [[0, 0], [1, 0], [2, 0], [1, 1], [2, 1], [-1, 0], [-2, 0], [-1, 1], [-2, 1], [0, -1], [3, 0], [-3, 0]],
  'JLSTZ_1->3': [[0, 0], [0, 1], [0, 2], [-1, 1], [-1, 2], [0, -1], [0, -2], [-1, -1], [-1, -2], [1, 0], [0, 3], [0, -3]],
  'JLSTZ_2->0': [[0, 0], [-1, 0], [-2, 0], [-1, -1], [-2, -1], [1, 0], [2, 0], [1, -1], [2, -1], [0, 1], [-3, 0], [3, 0]],
  'JLSTZ_3->1': [[0, 0], [0, 1], [0, 2], [1, 1], [1, 2], [0, -1], [0, -2], [1, -1], [1, -2], [-1, 0], [0, 3], [0, -3]],

  'I_0->2': [[0, 0], [-1, 0], [-2, 0], [1, 0], [2, 0], [0, 1]],
  'I_1->3': [[0, 0], [0, 1], [0, 2], [0, -1], [0, -2], [-1, 0]],
  'I_2->0': [[0, 0], [1, 0], [2, 0], [-1, 0], [-2, 0], [0, -1]],
  'I_3->1': [[0, 0], [0, 1], [0, 2], [0, -1], [0, -2], [1, 0]],

  'O_0->2': [[0, 0]],
  'O_1->3': [[0, 0]],
  'O_2->0': [[0, 0]],
  'O_3->1': [[0, 0]],
};

// ================= ===========================================================

// Rotation System Data

// ============================================================================



export class PieceManager {

  private rotationSystem: RotationSystem;

  private pool: PieceType[] = [];

  private history: PieceType[] = [];

  private readonly POOL_SIZE = 35;

  private readonly HISTORY_SIZE = 4;



  constructor(rotationSystem: RotationSystem = 'SRS') {

    this.rotationSystem = rotationSystem;

    this.initPool();

  }



  /**

   * Initialize TGM3 piece pool

   */

  private initPool(): void {

    this.pool = [];

    const pieces: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

    // Fill pool with 5 of each piece

    for (let i = 0; i < 5; i++) {

      this.pool.push(...pieces);

    }

    this.shuffle(this.pool);

    // History starts with Z, S, Z, S to prevent early S/Z droughts (authentic TGM behavior)

    this.history = ['Z', 'S', 'Z', 'S'];

  }



  /**

   * Get piece shape at specified rotation

   */

  getShape(type: PieceType, rotation: 0 | 1 | 2 | 3): number[][] {

    switch (this.rotationSystem) {

      case 'SRS':

        return SRS_SHAPES[type][rotation];

      case 'ARS':

        return ARS_SHAPES[type][rotation];

      case 'NRS':

        return NRS_SHAPES[type][rotation];

      case 'BARS':

        return BARS_SHAPES[type][rotation];

      case 'TI-ARS':

      case 'ACE-ARS':

        // classic.c block-data table, shared verbatim by TI-ARS and ACE-ARS
        return CLASSIC_SHAPES[type][rotation];

      case 'TI-WORLD':

      case 'ACE-SRS':

      case 'DS-WORLD':

      case 'SRS-X':

        // world.c block-data table == SRS_SHAPES, byte-for-byte (see WORLD_KICKS comment)
        return SRS_SHAPES[type][rotation];

      default:

        return SRS_SHAPES[type][rotation];

    }

  }



    /**



     * Get wall kick offsets for rotation



     */



    getKicks(type: PieceType, fromRotation: number, toRotation: number): KickTable {



      // classic.c gives the T-piece its own floor-kick branch (kicks it doesn't
      // share with J/L/S/Z), so TI-ARS/ACE-ARS resolve kicks with a T-specific
      // bucket instead of the generic 3-bucket (I/O/JLSTZ) scheme.
      const isClassicFamily = this.rotationSystem === 'TI-ARS' || this.rotationSystem === 'ACE-ARS';
      const piece = isClassicFamily
        ? ((type === 'I') ? 'I' : (type === 'O') ? 'O' : (type === 'T') ? 'T' : 'JLSZ')
        : ((type === 'I') ? 'I' : (type === 'O') ? 'O' : 'JLSTZ');



      const key = `${piece}_${fromRotation}->${toRotation}`;







      switch (this.rotationSystem) {



        case 'SRS':



          return SRS_KICKS[key] || [[0, 0]];



        case 'ARS':



          // TGM3 ARS has specific kicks for I and others



          return ARS_KICKS[key] || [[0, 0]];



        case 'NRS':



          return NRS_KICKS[key] || [[0, 0]];



        case 'BARS':



          return BARS_KICKS[key] || [[0, 0]];



        case 'TI-ARS':

        case 'ACE-ARS':

          return CLASSIC_ARS_KICKS[key] || [[0, 0]];

        case 'TI-WORLD':

        case 'ACE-SRS':

        case 'DS-WORLD':

          return WORLD_KICKS[key] || [[0, 0]];

        case 'SRS-X':

          // 180-degree transitions (e.g. 0->2) resolve from the dedicated
          // SRS-X table first; 90-degree transitions fall back to WORLD_KICKS
          // since SRS-X shares statWMove's plain rotation/kick block.
          return SRS_X_KICKS[key] || WORLD_KICKS[key] || [[0, 0]];



        default:



          return SRS_KICKS[key] || [[0, 0]];



      }



    }



  



    /**



     * Get spawn position for piece type



     */



    getSpawnPosition(type: PieceType, boardWidth: number): { x: number; y: number } {



      if (this.rotationSystem === 'ARS' || this.rotationSystem === 'TI-ARS' || this.rotationSystem === 'ACE-ARS') {



        // ARS/TI-ARS/ACE-ARS spawn: centered horizontally, fixed Y (TGM-lineage vanish zone)



        const x = type === 'O' ? 4 : 3;



        const y = 2; // TGM pieces spawn in the vanish zone



        return { x, y };



      }



      // TI-WORLD / ACE-SRS / DS-WORLD / SRS-X reuse SRS_SHAPES (see WORLD_KICKS
      // comment), so they fall through to the standard SRS spawn below.



      



      // Standard SRS spawn: centered horizontally, top of playfield



      const x = Math.floor((boardWidth - 4) / 2);



      const y = type === 'I' ? -1 : 0;  // I piece spawns higher



      return { x, y };



    }



  



    /**



     * Generate random piece using TGM3 Pool Randomizer



     * 1:1 with HeborisCE random.c



     */



    getRandomPiece(): PieceType {



      if (this.rotationSystem === 'SRS' || this.rotationSystem === 'NRS') {



        // Use 7-bag for modern/retro modes



        if (this.bag.length === 0) {



          this.bag = this.shuffle(['I', 'O', 'T', 'S', 'Z', 'J', 'L']);



        }



        return this.bag.pop()!;



      }



  



      // TGM3 Pool Randomizer (35-piece pool, 4-piece history)



      const pieces: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];



      let piece: PieceType;



      let index: number;



      let tries = 0;



  



      // First piece restriction: TGM3 prevents Z, S, O as first piece



      const isFirstPiece = this.history.every(p => p === 'Z' || p === 'S');



  



      do {



        index = Math.floor(Math.random() * this.pool.length);



        piece = this.pool[index];



        tries++;



  



        // TGM3 Rules:



        // 1. Piece not in history (max 6 tries)



        // 2. First piece cannot be Z, S, or O



        if (isFirstPiece && (piece === 'Z' || piece === 'S' || piece === 'O')) {



          continue;



        }



  



        if (!this.history.includes(piece)) {



          break;



        }



      } while (tries < 6);



  



      // Update pool: replace chosen piece with a random piece



      this.pool[index] = pieces[Math.floor(Math.random() * pieces.length)];



  



      // Update history



      this.history.shift();



      this.history.push(piece);



  



      return piece;



    }



  

  private bag: PieceType[] = [];

  /**
   * Fill initial queue
   */
  fillQueue(count: number): PieceType[] {
    const queue: PieceType[] = [];
    for (let i = 0; i < count; i++) {
      queue.push(this.getRandomPiece());
    }
    return queue;
  }

  /**
   * Shuffle array (Fisher-Yates)
   */
  private shuffle<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Get piece color for rendering
   */
  getPieceColor(type: PieceType): string {
    if (this.rotationSystem === 'ARS') {
      return ARS_COLORS[type];
    }
    return PIECE_COLORS[type];
  }
}

/**
 * Get occupied cells for a piece
 */
export function getPieceCells(
  shape: number[][],
  x: number,
  y: number
): Array<{ x: number; y: number }> {
  const cells: Array<{ x: number; y: number }> = [];

  for (let row = 0; row < shape.length; row++) {
    for (let col = 0; col < shape[row].length; col++) {
      if (shape[row][col]) {
        cells.push({
          x: x + col,
          y: y + row,
        });
      }
    }
  }

  return cells;
}
