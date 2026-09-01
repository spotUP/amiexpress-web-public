"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toolLabels = toolLabels;
exports.createToolbar = createToolbar;
/**
 * The paint toolbar: 16 colour swatches, four tool buttons, one status
 * line - squeezed into the toolbar panel's content area.
 *
 * `LAYOUT.edit.toolbar` (layout.ts) is only 5 rows tall; `panelContentRect`
 * (panels.ts) leaves exactly `height - 3 = 2` content rows once the border
 * and title bar are subtracted. Three separately-labelled UI groups
 * (swatches / tool buttons / status) do not fit three separate rows in
 * that budget - a naive third row would render past the panel's declared
 * height and be silently clipped on a real terminal. So the tool buttons
 * share row 0 and the palette + status line share row 1; every element
 * the brief lists is present, just packed two-to-a-row instead of one-
 * per-row (see task-4-report.md for the exact width accounting).
 *
 * State ownership: `state` is a plain object the CALLER owns (EditScreen
 * keeps it as `this.toolbarState`, mirrored from its own `this.tool`/
 * `this.fg` fields every `paint()` cycle - see edit-screen.ts). This
 * module only ever READS `state`'s current fields, on `refresh()`; a
 * click here never mutates it. Instead it builds a brand new
 * `ToolbarState` and hands it to `onChange`, exactly like every other
 * control in this door (the keyboard's f/S-f/b/S-b keys mutate
 * EditScreen's own fields directly and call `paint()`) - this is a second
 * INPUT SURFACE for the same fields, not a second store to keep in sync
 * by hand.
 */
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
const cell_art_1 = require("@amiexpress/bbs-door-sdk/engines/graphics/cell-art");
const layout_1 = require("./layout");
const panels_1 = require("./panels");
const token_strip_1 = require("./token-strip");
const TOOLS = ['paint', 'erase', 'pick', 'fill'];
const TOOL_LABEL = {
    paint: 'Paint', erase: 'Erase', pick: 'Pick', fill: 'Fill',
};
/**
 * Plain (untagged) tool-button labels, in display order - the SAME array
 * `render()` wraps in colour tags for the active tool and `tokenAtColumn`
 * walks to hit-test a click. One source for the strip's widths so
 * rendering and hit-testing can never drift apart.
 */
function toolLabels() {
    return TOOLS.map(t => `[${TOOL_LABEL[t]}]`);
}
function createToolbar(screen, panel, state, onChange) {
    const content = (0, panels_1.panelContentRect)(layout_1.LAYOUT.edit.toolbar);
    const box = new blessed_1.Box({
        parent: panel,
        top: content.top, left: content.left, width: content.width, height: content.height,
        border: { type: 'none' }, tags: true, mouse: true,
    });
    function render() {
        const tools = toolLabels()
            .map((label, i) => (TOOLS[i] === state.tool ? `{blue-bg}{lightyellow-fg}${label}{/}` : label))
            .join(' ');
        const swatches = cell_art_1.PALETTE
            .map((name, i) => {
            const fg = i === 0 ? 'white' : 'black';
            const label = i.toString(16).toUpperCase();
            // The active swatch swaps fg/bg (same "invert to mark the current
            // one" convention paintPalette used for its F/B markers) instead
            // of growing to a second character - there is no width budget for
            // a bracket or box around it.
            return i === state.colour
                ? `{${fg}-bg}{${name}-fg}${label}{/}`
                : `{${name}-bg}{${fg}-fg}${label}{/}`;
        })
            .join('');
        box.setContent(`${tools}\n${swatches}  ${TOOL_LABEL[state.tool]} ${state.colour}`);
    }
    box.on('click', (data) => {
        const coords = box._getCoords();
        if (!coords)
            return;
        const x = data.x - coords.xi;
        const y = data.y - coords.yi;
        if (y === 0) {
            const index = (0, token_strip_1.tokenAtColumn)(toolLabels(), x);
            if (index === -1)
                return;
            onChange({ tool: TOOLS[index], colour: state.colour });
        }
        else if (y === 1) {
            if (x < 0 || x >= cell_art_1.PALETTE.length)
                return;
            onChange({ tool: state.tool, colour: x });
        }
    });
    render();
    return {
        refresh() {
            render();
            screen.render();
        },
        destroy() {
            box.destroy();
        },
    };
}
