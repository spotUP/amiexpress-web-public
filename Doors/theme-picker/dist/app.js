"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildThemeItems = buildThemeItems;
exports.buildNote = buildNote;
exports.buildFooterHints = buildFooterHints;
exports.createApp = createApp;
exports.runDoor = runDoor;
/**
 * THEME - pick how the doors look.
 *
 * The themes were per-user from the start, but the only way to change one
 * was a SQL update, which is fine for the sysop and useless for everybody
 * else. This is the picker.
 *
 * Drawn with the CALLER'S current theme, so the screen you choose from is
 * itself an example of what you are leaving. The new one takes effect the
 * next time a door draws - a door already on screen built its widgets from
 * the old theme, and repainting somebody's UI out from under them is worse
 * than asking them to re-enter it. The door says so rather than leaving
 * anyone wondering why nothing changed.
 */
const terminal_mode_1 = require("@amiexpress/bbs-door-sdk/utils/terminal-mode");
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const theme_1 = require("@amiexpress/bbs-door-sdk/engines/ui/theme");
const door_input_manager_1 = require("@amiexpress/bbs-door-sdk/utils/door-input-manager");
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
/** A theme row, styled. Wide keeps the blurb column; XXS has no room for it. */
function buildThemeItems(themes, active, s, compact) {
    return themes.map(t => {
        // The one in use is marked rather than merely highlighted: the
        // highlight follows the cursor and says nothing about what is saved.
        const mark = t.id === active ? s.accent('[*]') : s.dim('[ ]');
        // 40 columns: name only. `[*] ` costs 4 of them and a folded row eats
        // the theme underneath it, which is how the C64 lost a third of this list.
        return compact.singleColumn
            ? `${mark} ${s.ink(t.name.substring(0, 34))}`
            : `${mark} ${s.ink(t.name.padEnd(16))} ${s.dim(t.blurb)}`;
    });
}
/** The line under the list, said in as many words as the screen has room for. */
function buildNote(s, compact) {
    return compact.collapseChrome
        ? `  ${s.dim('Applies on next door draw.')}`
        : `  ${s.dim('A theme applies the next time a door draws.')}`;
}
/** Footer key hints; the XXS set is the same three keys, abbreviated to fit. */
function buildFooterHints(compact) {
    return compact.collapseChrome
        ? [
            { key: 'Up/Dn', does: 'Pick' },
            { key: 'Ent', does: 'Use' },
            { key: 'Q', does: 'Bye' },
        ]
        : [
            { key: 'Up/Down', does: 'Choose' },
            { key: 'Enter', does: 'Use it' },
            { key: 'Q', does: 'Leave' },
        ];
}
async function createApp(session) {
    const { bbs } = session;
    const theme = bbs?.getTheme ? bbs.getTheme() : (0, theme_1.themeById)('classic');
    const s = (0, theme_1.themeStyles)(theme);
    const themes = bbs?.listThemes ? bbs.listThemes() : [];
    if (themes.length === 0) {
        bbs.write('\r\nNo themes are available on this board.\r\n');
        return;
    }
    const screen = (0, blessed_helpers_1.createScreen)(bbs, { title: 'Theme' });
    // Every width decision below comes from the LIVE screen through the SDK's
    // one compact profile - no door-local 40 or 80 anywhere.
    const compact = (0, blessed_1.getCompactProfile)(screen.width || 80);
    // 80x25 like the board, or the caller's whole terminal on Alt+Enter.
    // The layout is written in percentages, so following a resize is a
    // repaint; asking the terminal to grow at all is the part no door gets
    // for free (sdk/utils/terminal-mode.ts).
    const terminalMode = (0, terminal_mode_1.createTerminalModeSwitch)({
        bbs,
        screen,
        start: 'fixed',
        onRelayout: () => { screen.render(); },
    });
    const input = new door_input_manager_1.DoorInputManager(session, screen, {
        enableGameMode: false,
        enableGrabKeys: false,
        enableMouse: true,
    });
    input.enable();
    // The masthead was a STATIC rail here - one `////` printed once - while
    // DOORS had the animated one. Since this is the screen people judge the
    // themes from, it should show what a theme actually looks like in motion.
    const mastheadRow = (0, blessed_helpers_1.createBox)({
        parent: screen,
        top: 0,
        left: 0,
        width: '100%',
        height: 1,
        border: undefined,
        focusable: false,
        content: '',
        style: s.bar.style,
    });
    const stopMasthead = (0, theme_1.attachMasthead)(mastheadRow, theme, {
        title: 'DOOR THEME',
        // One column short: writing a row's last cell leaves the terminal in a
        // pending-wrap state and clips the final character.
        width: Math.max(1, (screen.width || 80) - 1),
        rail: s.accent,
        ink: s.ink,
        render: () => screen.render(),
    });
    const active = theme.id;
    const list = (0, blessed_helpers_1.createList)({
        parent: screen,
        top: 2,
        left: 0,
        width: '100%',
        // One row per theme, and no more. This was themes.length + 2, which
        // was fine for four and pushed the hints off a short screen at six -
        // the list must never be taller than what it holds.
        height: Math.max(1, Math.min(themes.length, (screen.height || 24) - 6)),
        keys: true,
        vi: true,
        mouse: true,
        tags: true,
        border: undefined,
        style: {
            selected: s.list.style.selected,
            item: { fg: theme.tokens.dim },
        },
        items: buildThemeItems(themes, active, s, compact),
    });
    const listRows = Math.max(1, Math.min(themes.length, (screen.height || 24) - 6));
    // The note sits under the list; the HINTS go to the bottom of the screen
    // as a real footer. They used to float together mid-screen just below the
    // list, which read as stray text rather than as the screen's footer -
    // reported as "theme looks cool but it has no footer".
    (0, blessed_helpers_1.createBox)({
        parent: screen,
        top: listRows + 3,
        left: 0,
        width: '100%',
        height: 1,
        border: undefined,
        focusable: false,
        content: buildNote(s, compact),
        style: s.plain.style,
    });
    (0, blessed_helpers_1.createBox)({
        parent: screen,
        bottom: 0,
        left: 0,
        width: '100%',
        height: 1,
        border: undefined,
        focusable: false,
        clickable: false,
        mouse: false,
        style: (0, theme_1.footerStyle)(theme),
        content: ' ' + (0, theme_1.footerHints)(buildFooterHints(compact), { key: s.key, dim: s.dim }, s.rail),
    });
    list.focus();
    screen.render();
    await new Promise((resolve) => {
        const done = () => {
            // Stop the masthead before the screen goes - a timer writing to a
            // destroyed screen is how a door takes the session with it.
            try {
                stopMasthead();
            }
            catch { /* leaving anyway */ }
            try {
                input.disable();
            }
            catch { /* leaving anyway */ }
            // Gives the board its 80 columns back and unhooks resize and Alt+Enter.
            terminalMode.dispose();
            try {
                screen.destroy();
            }
            catch { /* leaving anyway */ }
            resolve();
        };
        list.on('select', async (_item, index) => {
            const chosen = themes[index];
            if (!chosen)
                return done();
            let saved = chosen.id;
            if (bbs?.setTheme) {
                try {
                    saved = await bbs.setTheme(chosen.id);
                }
                catch {
                    // A theme that will not save is not worth trapping anyone over.
                    saved = active;
                }
            }
            const picked = themes.find(t => t.id === saved) ?? chosen;
            done();
            bbs.write(`\r\n${picked.name} it is. Open a door to see it.\r\n\r\n`);
        });
        screen.key(['q', 'Q', 'escape'], () => done());
    });
}
async function runDoor(bbs, session) {
    await createApp({ ...(session || {}), bbs });
}
exports.default = runDoor;
//# sourceMappingURL=app.js.map