/**
 * Minimap Renderer
 *
 * Battle Royale opponent visualization.
 * Two modes driven by opponent count:
 *
 *   Bucket mode  (≤ BUCKET_THRESHOLD opponents):
 *     Each player = a narrow vertical bar that fills from the bottom as
 *     their stack grows.  Color changes green → yellow → red by danger.
 *
 *   Text list mode  (> BUCKET_THRESHOLD opponents):
 *     Ranked leaderboard showing name, level, and stack height.
 */

import type { Board } from '../core/types';

// Opponents per row before switching to text list
const BUCKET_THRESHOLD = 10;

// Chars per bucket slot (bar width + 1 space separator)
const SLOT_W = 4;    // 3-char bar + 1 space
const BAR_W  = 3;    // printable width of the bar
const BAR_H  = 18;   // rows dedicated to the bar (below the name row)

// The panel's content width when it owns everything right of the player's
// side at 80 columns - the only width this renderer ever had.
const DEFAULT_PANEL_W = 41;

/**
 * Opponent state for minimap
 */
export interface OpponentState {
  id: string;
  name: string;
  board: Board;
  level: number;
  grade: string;
  alive: boolean;
  targeting?: boolean;  // Is this opponent targeting you?
  rank?: number;        // Current rank (1-99)
  /**
   * A CPU opponent rather than a person.
   *
   * The versus screen hands full boards to the humans first when not
   * everyone fits (see ui/versus-layout.ts), so the tracker has to know
   * which is which - the lobby knew, and the tracker did not.
   */
  isBot?: boolean;
  /**
   * Absolute cells of the opponent's CURRENTLY FALLING piece.
   *
   * `board` holds locked cells only, so a view rendered from it alone never
   * shows a piece in flight - the piece simply materialises at the bottom
   * the instant it locks, which is what the AI opponent looked like
   * (reported live 2026-08-25). Precomputed at sample time so the renderer
   * does not need the opponent's PieceManager.
   */
  pieceCells?: Array<{ x: number; y: number; type: string }>;
}

/**
 * Minimap configuration (kept for backward-compat; only compact flag is used)
 */
export interface MinimapConfig {
  width: number;
  height: number;
  showName: boolean;
  showLevel: boolean;
  showGrade: boolean;
  compact: boolean;
}

/**
 * MinimapRenderer — renders the battle-royale opponent panel.
 */
export class MinimapRenderer {
  private config: MinimapConfig;

  constructor(config?: Partial<MinimapConfig>) {
    this.config = {
      width: 10,
      height: 10,
      showName: true,
      showLevel: true,
      showGrade: true,
      compact: false,
      ...config,
    };
  }

  /**
   * Render opponents into `container`.
   * Switches between bucket bars and text list automatically.
   *
   * `innerWidth` is the panel's content width. It was 41 for the whole life
   * of this renderer because 80 columns minus the player's side left exactly
   * that; now the grid can sit beside one or more full opponent boards and
   * get far less, so how many bars fit is arithmetic rather than a constant.
   */
  renderBuckets(container: any, opponents: OpponentState[], innerWidth?: number): void {
    const width = innerWidth ?? (typeof container?.width === 'number' ? container.width : DEFAULT_PANEL_W);
    const alive = opponents.filter(o => o.alive);
    const sorted = [...alive].sort((a, b) => {
      if (a.targeting && !b.targeting) return -1;
      if (!a.targeting && b.targeting) return 1;
      return (a.rank ?? 99) - (b.rank ?? 99);
    });

    // Bars beyond BUCKET_THRESHOLD are unreadable however wide the panel is,
    // and bars that do not fit are worse than a list.
    const capacity = Math.min(BUCKET_THRESHOLD, Math.floor(width / SLOT_W));
    const content = sorted.length > capacity
      ? this.buildTextList(sorted, width)
      : this.buildBuckets(sorted);

    container.setContent(content);
    container.screen?.render();
  }

  // ── private ────────────────────────────────────────────────────────────────

  /** Rows the stack occupies (0 = empty board, board.height = topped out). */
  private stackHeight(board: Board): number {
    for (let y = 0; y < board.height; y++) {
      if (board.grid[y]?.some(c => c.filled)) {
        return board.height - y;
      }
    }
    return 0;
  }

  /** Color string based on fill fraction (0–1). */
  private dangerColor(fraction: number, targeting: boolean): string {
    if (targeting) return 'red';
    if (fraction >= 0.66) return 'red';
    if (fraction >= 0.33) return 'yellow';
    return 'green';
  }

  /**
   * Bucket bar mode — up to BUCKET_THRESHOLD players as vertical bars.
   *
   * Layout (container content, tags enabled):
   *   Row  0     : 3-char names, space-separated
   *   Rows 1-18  : bar fill (full blocks from bottom up)
   *   Row 19     : level numbers
   */
  private buildBuckets(sorted: OpponentState[]): string {
    const boardH = sorted[0]?.board?.height ?? 20;
    const stackH = sorted.map(o => this.stackHeight(o.board));
    // How many bar rows to fill (0 = empty, BAR_H = full)
    const fillH   = stackH.map(h => Math.round(h * BAR_H / boardH));
    const fracs   = stackH.map(h => h / boardH);

    const rows: string[] = [];

    // Row 0 — names
    let nameLine = '';
    for (let i = 0; i < sorted.length; i++) {
      const opp = sorted[i];
      const col  = opp.targeting ? 'red' : fracs[i] >= 0.66 ? 'red' : fracs[i] >= 0.33 ? 'yellow' : 'cyan';
      const name = opp.name.substring(0, BAR_W).padEnd(BAR_W);
      nameLine += `{${col}-fg}${name}{/${col}-fg} `;
    }
    rows.push(nameLine);

    // Rows 1-BAR_H — vertical bars
    for (let row = 0; row < BAR_H; row++) {
      // row 0 = top of bar area, row BAR_H-1 = bottom
      let line = '';
      for (let i = 0; i < sorted.length; i++) {
        const fill   = fillH[i];
        const filled = row >= BAR_H - fill;   // fill from bottom
        if (filled) {
          const col = this.dangerColor(fracs[i], sorted[i].targeting ?? false);
          line += `{${col}-fg}${'█'.repeat(BAR_W)}{/${col}-fg} `;
        } else {
          // Empty portion — faint dots so the bar outline is visible
          line += `{gray-fg}${'·'.repeat(BAR_W)}{/gray-fg} `;
        }
      }
      rows.push(line);
    }

    // Row BAR_H+1 — level numbers
    let lvLine = '';
    for (let i = 0; i < sorted.length; i++) {
      const lv  = String(sorted[i].level).padStart(BAR_W);
      const col = this.dangerColor(fracs[i], sorted[i].targeting ?? false);
      lvLine += `{${col}-fg}${lv}{/${col}-fg} `;
    }
    rows.push(lvLine);

    return rows.join('\n');
  }

  /**
   * Text list mode — ranked leaderboard for large lobbies.
   *
   * Format (columns derived from the panel's width; the name column is what
   * gives when the panel is narrow, because the rank and the numbers are
   * what the list is FOR):
   *   # Name       Lv Ht
   *   ─────────────────────
   *   1 Opponent1  05  12
   *   ...
   */
  private buildTextList(sorted: OpponentState[], panelWidth: number = DEFAULT_PANEL_W): string {
    const boardH = sorted[0]?.board?.height ?? 20;
    // rank(2) + ' ' + name + ' ' + level(3) + ' ' + height(3)
    const nameW = Math.max(3, Math.min(9, panelWidth - 11));
    const rowW = nameW + 11;
    const lines: string[] = [
      `{cyan-fg}${'#'.padStart(2)} ${'Name'.padEnd(nameW)} ${'Lv'.padStart(3)} ${'Ht'.padStart(3)}{/cyan-fg}`,
      `{gray-fg}${'─'.repeat(rowW)}{/gray-fg}`,
    ];

    const maxEntries = 18;   // content area ≈ 20 rows; 2 used by header
    for (let i = 0; i < Math.min(sorted.length, maxEntries); i++) {
      const opp  = sorted[i];
      const ht   = this.stackHeight(opp.board);
      const frac = ht / boardH;
      const col  = opp.targeting ? 'red'
                 : frac >= 0.66  ? 'red'
                 : frac >= 0.33  ? 'yellow'
                 : 'white';

      const rank = String(i + 1).padStart(2);
      const name = opp.name.substring(0, nameW).padEnd(nameW);
      const lv   = String(opp.level).padStart(3);
      const htS  = String(ht).padStart(3);

      lines.push(`{${col}-fg}${rank} ${name} ${lv} ${htS}{/${col}-fg}`);
    }

    return lines.join('\n');
  }

  /**
   * Update minimap configuration
   */
  setConfig(config: Partial<MinimapConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Opponent Tracker — manages live opponent states.
 */
export class OpponentTracker {
  private opponents: Map<string, OpponentState> = new Map();

  updateOpponent(id: string, state: Partial<OpponentState>): void {
    const existing = this.opponents.get(id);
    if (existing) {
      this.opponents.set(id, { ...existing, ...state });
    } else {
      this.opponents.set(id, {
        id,
        name: state.name || 'Unknown',
        board: state.board!,
        level: state.level || 1,
        grade: state.grade || '9',
        alive: state.alive !== false,
        targeting: state.targeting || false,
        rank: state.rank,
        isBot: state.isBot ?? false,
      });
    }
  }

  removeOpponent(id: string): void {
    this.opponents.delete(id);
  }

  getOpponents(): OpponentState[] {
    return Array.from(this.opponents.values());
  }

  getAliveOpponents(): OpponentState[] {
    return this.getOpponents().filter(o => o.alive);
  }

  getTargetingOpponents(): OpponentState[] {
    return this.getOpponents().filter(o => o.targeting && o.alive);
  }

  clear(): void {
    this.opponents.clear();
  }

  count(): number {
    return this.opponents.size;
  }

  aliveCount(): number {
    return this.getAliveOpponents().length;
  }
}
