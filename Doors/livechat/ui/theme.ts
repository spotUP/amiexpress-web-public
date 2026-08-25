/**
 * Panel chrome for LiveChat.
 *
 * Every panel used to pick its own border colour - the sidebar magenta, the
 * chat green, the input yellow - which made the focused panel impossible to
 * spot because the colours already competed with each other. One quiet colour
 * for every border and one bright colour for the focused one means the only
 * thing that stands out is where you are.
 */

/** Every panel border, focused or not. */
export const PANEL_BORDER = 'blue';

/** The focused panel's border. The SDK derives this from style.focus.border. */
export const PANEL_BORDER_FOCUS = 'white';

/** Ready-made style fragment - spread into a panel's `style`. */
export const PANEL_FOCUS_STYLE = {
  focus: { border: { fg: PANEL_BORDER_FOCUS } },
} as const;
