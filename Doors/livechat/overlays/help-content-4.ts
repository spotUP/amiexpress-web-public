import { T } from '../door-theme';
/** Help content part 4: Advanced UI Features */
export const HELP_PART_4 = `
{bold}{${T.ok}-fg}--- ADVANCED UI FEATURES ---{/${T.ok}-fg}{/bold}

LiveChat now features a modern, dockable window management system.

{${T.accentAlt}-fg}ADJACENT (TILED) RESIZING{/${T.accentAlt}-fg}
Resizing a panel (like the Chat or Sidebar) will automatically
adjust touching panels to maintain a perfectly tiled layout.
No more gaps or overlapping windows!

{${T.accentAlt}-fg}INTELLIGENT SNAPPING{/${T.accentAlt}-fg}
Drag panels by their title bars near the screen edges.
A {${T.accent}-fg}cyan ghost area{/${T.accent}-fg} ({${T.accent}-fg}░{/${T.accent}-fg}) will show you exactly where the
panel will snap. Supports Left, Right, Top, and Bottom docking.

{${T.accentAlt}-fg}8-WAY RESIZING{/${T.accentAlt}-fg}
All windows can now be resized from {bold}any edge or corner{/bold}.
Hover your mouse over a border to see it highlight in white,
then click and drag to resize in that direction.

{${T.accentAlt}-fg}LAYOUT PERSISTENCE{/${T.accentAlt}-fg}
The system automatically remembers your layout! Your window
positions and sizes are saved to your user account and will
be restored exactly as you left them when you return.

{${T.accentAlt}-fg}VISUAL DEPTH{/${T.accentAlt}-fg}
Focused panels are bright ({${T.accent}-fg}Cyan{/${T.accent}-fg} border, {${T.ink}-fg}White{/${T.ink}-fg} text).
Inactive panels automatically dim ({${T.bar}-fg}Blue{/${T.bar}-fg} border, {${T.dim}-fg}Gray{/${T.dim}-fg} text)
so you always know exactly which area is receiving input.

{${T.accentAlt}-fg}DOCKABLE SIDEBAR{/${T.accentAlt}-fg}
The Sidebar is no longer fixed! It is now a dockable panel that
can be moved, resized, or docked to any edge of the screen.

{${T.dim}-fg}Press Escape or F1 to close this help{/${T.dim}-fg}
`;
