"use strict";
/**
 * The browser's selection state. Pure: the UI binds keys to these and
 * paints from the result; every transition lives in the test suite.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.initialState = initialState;
exports.moveSelection = moveSelection;
exports.cyclePane = cyclePane;
exports.selection = selection;
const assets_1 = require("./assets");
const PANES = ['doors', 'sprites', 'animations'];
function clamp(index, count) {
    return Math.max(0, Math.min(count - 1, index));
}
/** The dependent panes, refilled for the current door/sprite selection. */
function refill(state) {
    const door = state.doors[state.doorIndex] ?? null;
    const sprites = door ? (0, assets_1.listSprites)(door) : [];
    const spriteIndex = clamp(state.spriteIndex, sprites.length);
    const file = sprites[spriteIndex] ?? null;
    let animations = [];
    if (door && file) {
        try {
            animations = Object.keys((0, assets_1.readSprite)(door, file).animations).sort();
        }
        catch {
            animations = []; // a malformed sheet lists empty rather than crashing
        }
    }
    return {
        ...state,
        sprites,
        spriteIndex,
        animations,
        animationIndex: clamp(state.animationIndex, animations.length),
    };
}
function initialState() {
    return refill({
        doors: (0, assets_1.listDoorsWithSprites)(),
        doorIndex: 0,
        sprites: [],
        spriteIndex: 0,
        animations: [],
        animationIndex: 0,
        pane: 'doors',
    });
}
/** Move within the focused pane; clamped, and dependents reset + refill. */
function moveSelection(state, delta) {
    if (state.pane === 'doors') {
        const doorIndex = clamp(state.doorIndex + delta, state.doors.length);
        if (doorIndex === state.doorIndex)
            return state;
        return refill({ ...state, doorIndex, spriteIndex: 0, animationIndex: 0 });
    }
    if (state.pane === 'sprites') {
        const spriteIndex = clamp(state.spriteIndex + delta, state.sprites.length);
        if (spriteIndex === state.spriteIndex)
            return state;
        return refill({ ...state, spriteIndex, animationIndex: 0 });
    }
    const animationIndex = clamp(state.animationIndex + delta, state.animations.length);
    if (animationIndex === state.animationIndex)
        return state;
    return { ...state, animationIndex };
}
/** Tab / Shift-Tab between panes, wrapping both ways. */
function cyclePane(state, delta) {
    const at = PANES.indexOf(state.pane);
    return { ...state, pane: PANES[(at + delta + PANES.length) % PANES.length] };
}
/** What the UI should be showing for this state. */
function selection(state) {
    return {
        door: state.doors[state.doorIndex] ?? null,
        sprite: state.sprites[state.spriteIndex] ?? null,
        animation: state.animations[state.animationIndex] ?? null,
    };
}
