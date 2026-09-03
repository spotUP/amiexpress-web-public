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

import { T } from '../door-theme';

/**
 * Every panel border when it is not the focused one: the theme's primary
 * colour, which is the whole point of a theme having one.
 */
export let PANEL_BORDER: string = T.accent;

/**
 * The focused panel's border. The SDK derives this from style.focus.border.
 *
 * The brightest thing the theme has, because the signal that matters is DIM
 * versus BRIGHT - with every idle border already the accent, a focused
 * border in the accent would be invisible.
 */
export let PANEL_BORDER_FOCUS: string = T.ink;

/**
 * Re-read the theme.
 *
 * Called once at startup, after applyTheme() and before any widget is
 * built, and again when the in-door theme menu changes it. Everything built
 * afterwards takes the new colours; what is already on screen is re-tinted
 * by the SDK (engines/ui/theme/live.ts).
 */
export function refreshPanelChrome(): void {
  PANEL_BORDER = T.accent;
  PANEL_BORDER_FOCUS = T.ink;
}

/**
 * Ready-made style fragment - spread into a panel's `style`.
 *
 * A getter, not a frozen object: it is spread when a widget is built, which
 * is after the theme is known.
 */
export const PANEL_FOCUS_STYLE = {
  get focus() {
    return { border: { fg: PANEL_BORDER_FOCUS } };
  },
} as const;
