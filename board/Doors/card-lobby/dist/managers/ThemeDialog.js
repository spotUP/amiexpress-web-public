"use strict";
/**
 * Card Lobby - the theme panel.
 *
 * The SDK owns the panel itself (openThemeMenu): the list, the live preview
 * as the highlight moves, and remembering the choice. What lives here is the
 * one thing a HOST has to get right - putting the shade up before the panel
 * is hung on it, and taking it down again afterwards.
 *
 * `overlayShade` starts hidden, and a child of a hidden element paints
 * nothing. So Views > Theme opened a panel nobody could see, and since the
 * promise it hands back settles only on a key pressed inside that panel, the
 * door's runAction kept `actionInProgress` set for the rest of the session
 * and answered every later entry with "Please wait for current action to
 * complete" - the sysop's "many menu entries does nothing in cardlobby"
 * (2026-09-13).
 *
 * It sits beside CardStyleDialog, which had the sequence right all along,
 * so the two panels the Views menu opens now read the same way.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.showThemeDialog = showThemeDialog;
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
/**
 * Open the panel. Resolves when it closes - with the theme that is running,
 * which is the chosen one on ENTER and the one it opened with on ESC.
 *
 * `onApply` runs before each re-tint, so the door can re-point its own
 * palette and build anything after the switch in the new colours.
 */
async function showThemeDialog(host, bbs, onApply) {
    if (host.isModalActive())
        return null;
    host.setModalActive(true);
    host.overlayShade.show();
    host.overlayShade.setFront();
    try {
        return await (0, blessed_1.openThemeMenu)({
            screen: host.screen,
            bbs,
            parent: host.overlayShade,
            onApply,
        });
    }
    finally {
        host.overlayShade.hide();
        host.setModalActive(false);
    }
}
