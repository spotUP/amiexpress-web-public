/**
 * Panel chrome for LiveChat.
 *
 * Every panel used to pick its own border colour - the sidebar magenta, the
 * chat green, the input yellow - which made the focused panel impossible to
 * spot because the colours already competed with each other. One quiet colour
 * for every border and one bright colour for the focused one means the only
 * thing that stands out is where you are.
 */
/**
 * Every panel border when it is not the focused one.
 *
 * Grey against a white focus, because the signal that matters is DIM versus
 * BRIGHT - the widest gap the palette offers, and unmistakable about which
 * panel has focus. Plain blue was the dark blue of the sixteen-colour
 * palette and on black it is close to unreadable ("my eyes are bad at
 * seeing the dark blue", 2026-08-26); cyan reads well but is already bright,
 * which leaves the focused panel barely distinguishable from the rest.
 *
 * Changing the scheme is these two lines and nothing else - every panel in
 * the door takes its border from here.
 */
export declare const PANEL_BORDER = "gray";
/**
 * The focused panel's border. The SDK derives this from style.focus.border.
 *
 * White: the brightest thing available, so which panel has focus is obvious
 * at a glance rather than a shade apart from the others. Cyan was tried
 * first and is too close to the idle blue to read quickly.
 */
export declare const PANEL_BORDER_FOCUS = "white";
/** Ready-made style fragment - spread into a panel's `style`. */
export declare const PANEL_FOCUS_STYLE: {
    readonly focus: {
        readonly border: {
            readonly fg: "white";
        };
    };
};
