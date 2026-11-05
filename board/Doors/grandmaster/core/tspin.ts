/**
 * Is this lock a T-Spin, and which kind?
 *
 * Lifted out of `core/game.ts` unchanged (2026-09-15): the rule is a
 * geometric question about one piece and one board, it answers with no side
 * effects, and MISSION mode now cares about the DIFFERENCE between the two
 * kinds rather than just "was there one" - which makes it worth being able
 * to test on its own.
 *
 * The rule is HeborisCE's: `tspin_flag` set by a rotation that was not
 * followed by a move, three of the four corners around the T's centre
 * filled, and both FRONT corners filled for the full spin rather than a
 * mini. ARS shifts the sampled corners down a row when the T is flat-side
 * down (`gamestart.c`: `if(rt == 2) tmp_y = tmp_y + 1`).
 */
import type { Board, Piece } from './types';

export interface TSpinInput {
  /** The live piece. Anything but a T is never a T-Spin. */
  piece: Piece | null;
  board: Board;
  /** HeborisCE's `tspin_flag`: a rotation happened and nothing moved after. */
  tSpinFlag: number;
  /** How many rotations this piece has had (`statusc[...+5]`). */
  rotationCount: number;
  /** What the player did last; only a rotation can leave a spin. */
  lastMove: string | null | undefined;
  /** ARS samples one corner pair a row lower when the T is flat-side down. */
  rotationSystem: string;
}

export function detectTSpin(input: TSpinInput): 'full' | 'mini' | 'none' {
  const piece = input.piece;

  // Must be a T-piece
  if (!piece || piece.type !== 'T') return 'none';

  // HeborisCE: tspin_flag must be set (rotation without subsequent horizontal move)
  // and rotationCount > 0 (statusc[player * 10 + 5] > 0 in HeborisCE)
  if (input.tSpinFlag === 0 || input.rotationCount === 0) return 'none';

  // Also check lastMove for compatibility
  if (input.lastMove !== 'rotate') return 'none';

  // Get the center position of the T-piece
  // T-piece center is at [1,1] in its 3x3 bounding box
  const centerX = piece.x + 1;
  const centerY = piece.y + 1;

  // Check the 4 corners around the center
  const corners = [
    { x: centerX - 1, y: centerY - 1 },  // Top-left
    { x: centerX + 1, y: centerY - 1 },  // Top-right
    { x: centerX - 1, y: centerY + 1 },  // Bottom-left
    { x: centerX + 1, y: centerY + 1 },  // Bottom-right
  ];

  // Count filled corners
  let filledCorners = 0;
  const board = input.board;

  for (let i = 0; i < corners.length; i++) {
    const corner = corners[i];
    let cx = corner.x;
    let cy = corner.y;
    
    // TGM3/HeborisCE ARS: if T is up-facing (flat side down), 
    // the detection area shifts for specific corners
    if (input.rotationSystem === 'ARS' && piece.rotation === 2) {
        // HeborisCE gamestart.c: if(rt == 2) tmp_y = tmp_y + 1;
        cy += 1;
    }

    // Out of bounds counts as filled
    if (cx < 0 || cx >= board.width ||
        cy < 0 || cy >= board.height) {
      filledCorners++;
      continue;
    }

    // Check if cell is filled
    if (board.grid[cy][cx].filled) {
      filledCorners++;
    }
  }

  // 3-corner rule: at least 3 corners must be filled
  if (filledCorners >= 3) {
    // Check if it's a mini T-Spin (T facing away from wall)
    // Full T-Spin: both front corners filled
    // Mini T-Spin: only back corners filled

    // Determine front corners based on rotation
    let frontCorners: typeof corners;
    switch (piece.rotation) {
      case 0: // T facing up
        frontCorners = [corners[0], corners[1]];  // Top corners
        break;
      case 1: // T facing right
        frontCorners = [corners[1], corners[3]];  // Right corners
        break;
      case 2: // T facing down
        frontCorners = [corners[2], corners[3]];  // Bottom corners
        break;
      case 3: // T facing left
        frontCorners = [corners[0], corners[2]];  // Left corners
        break;
    }

    // Count front corners filled
    let frontFilled = 0;
    for (const corner of frontCorners) {
      if (corner.x < 0 || corner.x >= board.width ||
          corner.y < 0 || corner.y >= board.height ||
          board.grid[corner.y][corner.x].filled) {
        frontFilled++;
      }
    }

    // Full T-Spin if both front corners filled, otherwise Mini
    return frontFilled >= 2 ? 'full' : 'mini';
  }

  return 'none';
}
