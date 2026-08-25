"use strict";
/**
 * Panel chrome for LiveChat.
 *
 * Every panel used to pick its own border colour - the sidebar magenta, the
 * chat green, the input yellow - which made the focused panel impossible to
 * spot because the colours already competed with each other. One quiet colour
 * for every border and one bright colour for the focused one means the only
 * thing that stands out is where you are.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PANEL_FOCUS_STYLE = exports.PANEL_BORDER_FOCUS = exports.PANEL_BORDER = void 0;
/** Every panel border, focused or not. */
exports.PANEL_BORDER = 'blue';
/** The focused panel's border. The SDK derives this from style.focus.border. */
exports.PANEL_BORDER_FOCUS = 'white';
/** Ready-made style fragment - spread into a panel's `style`. */
exports.PANEL_FOCUS_STYLE = {
    focus: { border: { fg: exports.PANEL_BORDER_FOCUS } },
};
