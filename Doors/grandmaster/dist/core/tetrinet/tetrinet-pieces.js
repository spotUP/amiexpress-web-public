"use strict";
/**
 * TetriNET 1.x piece definitions (gtetrinet reference).
 *
 * Shapes are 4x4 matrices with 1 = filled, 0 = empty.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TETRINET_PIECE_ORDER = void 0;
exports.getTetriNetShape = getTetriNetShape;
exports.getRotationCount = getRotationCount;
exports.TETRINET_PIECE_ORDER = ['I', 'O', 'J', 'L', 'S', 'Z', 'T'];
const SHAPES = {
    I: [
        [
            [1, 1, 1, 1],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
        ],
        [
            [0, 0, 1, 0],
            [0, 0, 1, 0],
            [0, 0, 1, 0],
            [0, 0, 1, 0],
        ],
    ],
    O: [
        [
            [0, 1, 1, 0],
            [0, 1, 1, 0],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
        ],
    ],
    J: [
        [
            [0, 0, 1, 0],
            [0, 0, 1, 0],
            [0, 1, 1, 0],
            [0, 0, 0, 0],
        ],
        [
            [0, 1, 0, 0],
            [0, 1, 1, 1],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
        ],
        [
            [0, 1, 1, 0],
            [0, 1, 0, 0],
            [0, 1, 0, 0],
            [0, 0, 0, 0],
        ],
        [
            [0, 1, 1, 1],
            [0, 0, 0, 1],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
        ],
    ],
    L: [
        [
            [0, 1, 0, 0],
            [0, 1, 0, 0],
            [0, 1, 1, 0],
            [0, 0, 0, 0],
        ],
        [
            [0, 1, 1, 1],
            [0, 1, 0, 0],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
        ],
        [
            [0, 1, 1, 0],
            [0, 0, 1, 0],
            [0, 0, 1, 0],
            [0, 0, 0, 0],
        ],
        [
            [0, 0, 0, 1],
            [0, 1, 1, 1],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
        ],
    ],
    S: [
        [
            [0, 0, 1, 0],
            [0, 1, 1, 0],
            [0, 1, 0, 0],
            [0, 0, 0, 0],
        ],
        [
            [0, 1, 1, 0],
            [0, 0, 1, 1],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
        ],
    ],
    Z: [
        [
            [0, 1, 0, 0],
            [0, 1, 1, 0],
            [0, 0, 1, 0],
            [0, 0, 0, 0],
        ],
        [
            [0, 0, 1, 1],
            [0, 1, 1, 0],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
        ],
    ],
    T: [
        [
            [0, 0, 1, 0],
            [0, 1, 1, 0],
            [0, 0, 1, 0],
            [0, 0, 0, 0],
        ],
        [
            [0, 0, 1, 0],
            [0, 1, 1, 1],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
        ],
        [
            [0, 1, 0, 0],
            [0, 1, 1, 0],
            [0, 1, 0, 0],
            [0, 0, 0, 0],
        ],
        [
            [0, 1, 1, 1],
            [0, 0, 1, 0],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
        ],
    ],
};
function getTetriNetShape(type, rotation) {
    const rotations = SHAPES[type];
    const index = rotation % rotations.length;
    return rotations[index];
}
function getRotationCount(type) {
    return SHAPES[type].length;
}
//# sourceMappingURL=tetrinet-pieces.js.map