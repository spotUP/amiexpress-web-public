"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HELP_PART_4 = void 0;
const door_theme_1 = require("../door-theme");
/** Help content part 4: Advanced UI Features */
exports.HELP_PART_4 = `
{bold}{${door_theme_1.T.ok}-fg}--- ADVANCED UI FEATURES ---{/${door_theme_1.T.ok}-fg}{/bold}

LiveChat now features a modern, dockable window management system.

{${door_theme_1.T.accentAlt}-fg}ADJACENT (TILED) RESIZING{/${door_theme_1.T.accentAlt}-fg}
Resizing a panel (like the Chat or Sidebar) will automatically
adjust touching panels to maintain a perfectly tiled layout.
No more gaps or overlapping windows!

{${door_theme_1.T.accentAlt}-fg}INTELLIGENT SNAPPING{/${door_theme_1.T.accentAlt}-fg}
Drag panels by their title bars near the screen edges.
A {${door_theme_1.T.accent}-fg}cyan ghost area{/${door_theme_1.T.accent}-fg} ({${door_theme_1.T.accent}-fg}░{/${door_theme_1.T.accent}-fg}) will show you exactly where the
panel will snap. Supports Left, Right, Top, and Bottom docking.

{${door_theme_1.T.accentAlt}-fg}8-WAY RESIZING{/${door_theme_1.T.accentAlt}-fg}
All windows can now be resized from {bold}any edge or corner{/bold}.
Hover your mouse over a border to see it highlight in white,
then click and drag to resize in that direction.

{${door_theme_1.T.accentAlt}-fg}LAYOUT PERSISTENCE{/${door_theme_1.T.accentAlt}-fg}
The system automatically remembers your layout! Your window
positions and sizes are saved to your user account and will
be restored exactly as you left them when you return.

{${door_theme_1.T.accentAlt}-fg}VISUAL DEPTH{/${door_theme_1.T.accentAlt}-fg}
Focused panels are bright ({${door_theme_1.T.accent}-fg}Cyan{/${door_theme_1.T.accent}-fg} border, {${door_theme_1.T.ink}-fg}White{/${door_theme_1.T.ink}-fg} text).
Inactive panels automatically dim ({${door_theme_1.T.bar}-fg}Blue{/${door_theme_1.T.bar}-fg} border, {${door_theme_1.T.dim}-fg}Gray{/${door_theme_1.T.dim}-fg} text)
so you always know exactly which area is receiving input.

{${door_theme_1.T.accentAlt}-fg}DOCKABLE SIDEBAR{/${door_theme_1.T.accentAlt}-fg}
The Sidebar is no longer fixed! It is now a dockable panel that
can be moved, resized, or docked to any edge of the screen.

{${door_theme_1.T.dim}-fg}Press Escape or F1 to close this help{/${door_theme_1.T.dim}-fg}
`;
