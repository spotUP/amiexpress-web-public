/**
 * Panel chrome for LiveChat.
 *
 * Every panel used to pick its own border colour - the sidebar magenta, the
 * chat green, the input yellow - which made the focused panel impossible to
 * spot because the colours already competed with each other. One quiet
 * colour for every border and one bright colour for the focused one means
 * the only thing that stands out is where you are.
 *
 * That rule survives; what changed on 2026-09-03 is where the two colours
 * come from. They were the literals 'gray' and 'white', so this door looked
 * the same under every theme - "livechat doesnt look themed at all", and
 * then "all bordes in the app needs to use the themes primary color as
 * well" (sysop). Sixty-seven call sites read these two names, so they stay
 * names: `let`, refreshed from the theme, rather than a function every site
 * would have to call.
 */
/**
 * Every panel border when it is not the focused one: the theme's primary
 * colour, which is the whole point of a theme having one.
 */
export declare let PANEL_BORDER: string;
/**
 * The focused panel's border. The SDK derives this from style.focus.border.
 *
 * The brightest thing the theme has, because the signal that matters is DIM
 * versus BRIGHT - with every idle border already the accent, a focused
 * border in the accent would be invisible.
 */
export declare let PANEL_BORDER_FOCUS: string;
/**
 * Re-read the theme.
 *
 * Called once at startup, after applyTheme() and before any widget is
 * built, and again when the in-door theme menu changes it. Everything built
 * afterwards takes the new colours; what is already on screen is re-tinted
 * by the SDK (engines/ui/theme/live.ts).
 */
export declare function refreshPanelChrome(): void;
/**
 * Ready-made style fragment - spread into a panel's `style`.
 *
 * A getter, not a frozen object: it is spread when a widget is built, which
 * is after the theme is known.
 */
export declare const PANEL_FOCUS_STYLE: {
    readonly focus: {
        border: {
            fg: string;
        };
    };
};
