/**
 * Placement search
 *
 * One board evaluator for every bot in the door. It was written for the TGM
 * bot (El-Tetris weights, one scratch grid reused across candidates) while
 * the TetriNET bot shipped with `findBestMove()` returning a RANDOM move and
 * a comment reading "In a real implementation, this would evaluate multiple
 * positions" - so TetriNET's opponents never actually played.
 *
 * It needs nothing but a grid of filled flags and the piece shapes, so the
 * 10x24 TGM board and the 12x22 TetriNET field both feed it unchanged.
 */

/** Anything with filled cells: a TGM Board or a TetriNET field. */
export interface PlacementGrid {
  width: number;
  height: number;
  grid: Array<Array<{ filled: boolean }>>;
}

export interface PlacementEvaluation {
  x: number;
  rotation: number;
  score: number;
}

/** Shape lookup for one piece type, or null when that rotation is invalid. */
export type ShapeLookup = (rotation: number) => number[][] | null;

export class PlacementSearch {
  private scratch: Uint8Array | null = null;
  private colHeights: Int16Array | null = null;
  private scratchW = 0;
  private scratchH = 0;

  /**
   * @param difficulty 1-10; below 10 the score is jittered so weaker bots
   *   make visibly worse choices instead of playing perfectly but slowly.
   */
  constructor(private difficulty: number = 10) {}

  setDifficulty(difficulty: number): void {
    this.difficulty = difficulty;
  }

  /** Best (column, rotation) for this piece, by score. */
  findBest(board: PlacementGrid, shapeFor: ShapeLookup, rotations: number = 4): PlacementEvaluation {
    let best: PlacementEvaluation = { x: 0, rotation: 0, score: -Infinity };

    for (let rotation = 0; rotation < rotations; rotation++) {
      const shape = shapeFor(rotation);
      if (!shape) continue;

      let leftBound = shape[0]?.length ?? 4;
      let rightBound = 0;
      for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
          if (shape[r][c]) {
            leftBound = Math.min(leftBound, c);
            rightBound = Math.max(rightBound, c);
          }
        }
      }

      for (let x = -leftBound; x < board.width - rightBound; x++) {
        const score = this.evaluate(board, x, shape);
        if (score > best.score) {
          best = { x, rotation, score };
        }
      }
    }

    return best;
  }

  /** Score one placement by dropping it into a scratch copy of the board. */
  evaluate(board: PlacementGrid, x: number, shape: number[][]): number {
    const W = board.width;
    const H = board.height;

    // Reuse one scratch occupancy grid (see `scratch` above) instead of
    // cloning the board per candidate placement.
    if (!this.scratch || this.scratchW !== W || this.scratchH !== H) {
      this.scratch = new Uint8Array(W * H);
      this.colHeights = new Int16Array(W);
      this.scratchW = W;
      this.scratchH = H;
    }
    const g = this.scratch;
    const colHeights = this.colHeights!;
    for (let i = 0; i < g.length; i++) g[i] = 0;
    for (let y = 0; y < H; y++) {
      const row = board.grid[y];
      const base = y * W;
      for (let cx = 0; cx < W; cx++) {
        if (row[cx].filled) g[base + cx] = 1;
      }
    }

    // Drop the piece: lowest y where it still fits.
    const sh = shape.length;
    let ghostY = -1;
    for (let y = 0; y <= H - 1; y++) {
      let fits = true;
      for (let r = 0; r < sh && fits; r++) {
        const srow = shape[r];
        for (let c = 0; c < srow.length; c++) {
          if (!srow[c]) continue;
          const by = y + r;
          const bx = x + c;
          if (bx < 0 || bx >= W || by >= H) { fits = false; break; }
          if (by >= 0 && g[by * W + bx]) { fits = false; break; }
        }
      }
      if (fits) ghostY = y; else if (ghostY >= 0) break;
    }
    if (ghostY < 0) return -Infinity;

    // Spawn-area collision (piece would rest partly above the board).
    for (let r = 0; r < sh; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c] && ghostY + r < 0) return -Infinity;
      }
    }

    // Stamp the piece in.
    for (let r = 0; r < sh; r++) {
      const srow = shape[r];
      for (let c = 0; c < srow.length; c++) {
        if (srow[c]) g[(ghostY + r) * W + (x + c)] = 1;
      }
    }

    // Complete lines: count, then compact them out in place.
    let lineCount = 0;
    for (let y = 0; y < H; y++) {
      const base = y * W;
      let full = true;
      for (let cx = 0; cx < W; cx++) { if (!g[base + cx]) { full = false; break; } }
      if (full) lineCount++;
    }
    if (lineCount > 0) {
      let writeY = H - 1;
      for (let y = H - 1; y >= 0; y--) {
        const base = y * W;
        let full = true;
        for (let cx = 0; cx < W; cx++) { if (!g[base + cx]) { full = false; break; } }
        if (full) continue;
        if (writeY !== y) {
          const wbase = writeY * W;
          for (let cx = 0; cx < W; cx++) g[wbase + cx] = g[base + cx];
        }
        writeY--;
      }
      for (let y = writeY; y >= 0; y--) {
        const base = y * W;
        for (let cx = 0; cx < W; cx++) g[base + cx] = 0;
      }
    }

    // Single pass for heights, holes and aggregate height - the old code
    // walked the board once for holes, once for bumpiness (10 column
    // scans) and once more for aggregate height (10 more).
    let holes = 0;
    let aggregateHeight = 0;
    for (let cx = 0; cx < W; cx++) {
      let top = -1;
      let colHoles = 0;
      for (let y = 0; y < H; y++) {
        if (g[y * W + cx]) {
          if (top < 0) top = y;
        } else if (top >= 0) {
          colHoles++;
        }
      }
      const h = top < 0 ? 0 : H - top;
      colHeights[cx] = h;
      aggregateHeight += h;
      holes += colHoles;
    }

    let bumpiness = 0;
    for (let cx = 0; cx < W - 1; cx++) {
      bumpiness += Math.abs(colHeights[cx] - colHeights[cx + 1]);
    }

    // Heuristic weights, in El-Tetris proportions (aggregate height -0.51,
    // lines +0.76, holes -0.36, bumpiness -0.18, scaled x1000) plus small
    // landing-height and well terms.
    let score = 0;

    // 1. Landing height (prefer placing low).
    score -= (H - ghostY) * 45;

    // 2. Rows eliminated, with a modest tetris bias.
    score += lineCount * 760;
    if (lineCount === 4) score += 300;

    // 3. Holes.
    score -= holes * 357;

    // 4. Bumpiness (proxy for column transitions).
    score -= bumpiness * 184;

    // 5. Aggregate height.
    score -= aggregateHeight * 510;

    // 6. Well penalty: avoid deep wells beyond the single one a tetris needs.
    let wells = 0;
    for (let cx = 0; cx < W; cx++) {
      const leftH = cx > 0 ? colHeights[cx - 1] : H;
      const rightH = cx < W - 1 ? colHeights[cx + 1] : H;
      const depth = Math.min(leftH, rightH) - colHeights[cx];
      if (depth > 2) wells += (depth - 2);
    }
    score -= wells * 120;

    // Difficulty scaling
    if (this.difficulty < 10) {
      score += (Math.random() - 0.5) * (11 - this.difficulty) * 600;
    }

    return score;
  }
}
