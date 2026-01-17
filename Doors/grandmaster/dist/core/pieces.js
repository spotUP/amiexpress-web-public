"use strict";
/**
 * Tetris Piece Definitions and Rotation Systems
 *
 * Supports:
 * - SRS (Super Rotation System) - Modern standard
 * - ARS (Arika Rotation System) - TGM classic
 * - NRS (Nintendo Rotation System) - Retro NES
 * - BARS (Bombliss Arika) - Hybrid
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PieceManager = exports.ARS_COLORS = exports.PIECE_COLORS = void 0;
exports.getPieceCells = getPieceCells;
// ============================================================================
// Piece Colors (for rendering)
// ============================================================================
exports.PIECE_COLORS = {
    I: 'cyan',
    O: 'yellow',
    T: 'magenta',
    S: 'green',
    Z: 'red',
    J: 'blue',
    L: 'white',
};
// TGM3 ARS Colors (Authentic)
exports.ARS_COLORS = {
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
const SRS_SHAPES = {
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
            [0, 1, 0, 0],
            [0, 0, 1, 0]],
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
const SRS_KICKS = {
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
const ARS_SHAPES = {
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
const ARS_KICKS = {
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
const NRS_SHAPES = {
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
const NRS_KICKS = {
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
const BARS_SHAPES = {
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
const BARS_KICKS = {
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
// ================= ===========================================================
// Rotation System Data
// ============================================================================
class PieceManager {
    constructor(rotationSystem = 'SRS') {
        this.pool = [];
        this.history = [];
        this.POOL_SIZE = 35;
        this.HISTORY_SIZE = 4;
        this.bag = [];
        this.rotationSystem = rotationSystem;
        this.initPool();
    }
    /**
  
     * Initialize TGM3 piece pool
  
     */
    initPool() {
        this.pool = [];
        const pieces = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
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
    getShape(type, rotation) {
        switch (this.rotationSystem) {
            case 'SRS':
                return SRS_SHAPES[type][rotation];
            case 'ARS':
                return ARS_SHAPES[type][rotation];
            case 'NRS':
                return NRS_SHAPES[type][rotation];
            case 'BARS':
                return BARS_SHAPES[type][rotation];
            default:
                return SRS_SHAPES[type][rotation];
        }
    }
    /**



     * Get wall kick offsets for rotation



     */
    getKicks(type, fromRotation, toRotation) {
        const piece = (type === 'I') ? 'I' : (type === 'O') ? 'O' : 'JLSTZ';
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
            default:
                return SRS_KICKS[key] || [[0, 0]];
        }
    }
    /**



     * Get spawn position for piece type



     */
    getSpawnPosition(type, boardWidth) {
        if (this.rotationSystem === 'ARS') {
            // ARS spawn: centered horizontally, fixed Y
            const x = type === 'O' ? 4 : 3;
            const y = 2; // TGM pieces spawn in the vanish zone
            return { x, y };
        }
        // Standard SRS spawn: centered horizontally, top of playfield
        const x = Math.floor((boardWidth - 4) / 2);
        const y = type === 'I' ? -1 : 0; // I piece spawns higher
        return { x, y };
    }
    /**



     * Generate random piece using TGM3 Pool Randomizer



     * 1:1 with HeborisCE random.c



     */
    getRandomPiece() {
        if (this.rotationSystem === 'SRS' || this.rotationSystem === 'NRS') {
            // Use 7-bag for modern/retro modes
            if (this.bag.length === 0) {
                this.bag = this.shuffle(['I', 'O', 'T', 'S', 'Z', 'J', 'L']);
            }
            return this.bag.pop();
        }
        // TGM3 Pool Randomizer (35-piece pool, 4-piece history)
        const pieces = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
        let piece;
        let index;
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
    /**
     * Fill initial queue
     */
    fillQueue(count) {
        const queue = [];
        for (let i = 0; i < count; i++) {
            queue.push(this.getRandomPiece());
        }
        return queue;
    }
    /**
     * Shuffle array (Fisher-Yates)
     */
    shuffle(array) {
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
    getPieceColor(type) {
        if (this.rotationSystem === 'ARS') {
            return exports.ARS_COLORS[type];
        }
        return exports.PIECE_COLORS[type];
    }
}
exports.PieceManager = PieceManager;
/**
 * Get occupied cells for a piece
 */
function getPieceCells(shape, x, y) {
    const cells = [];
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
//# sourceMappingURL=pieces.js.map