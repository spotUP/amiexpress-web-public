"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BOARD_ART = void 0;
exports.choicesForWidth = choicesForWidth;
exports.buildThemeItems = buildThemeItems;
exports.buildNote = buildNote;
exports.buildFooterHints = buildFooterHints;
exports.createApp = createApp;
exports.runDoor = runDoor;
/**
 * SCREENTHEME - pick which set of the BOARD'S ART you are shown.
 *
 * Not THEME. That one paints the inside of doors and takes effect the moment
 * you move the cursor. This one chooses the screens the BOARD draws - the
 * logon, the menus, the bulletins - so it CANNOT show you the result in the
 * door: the screen you are standing on was composed before you got here, and
 * repainting the board underneath a running door is the failure this avoids
 * rather than the feature it offers. The note says so in as many words, and
 * the door leaves you at the board, which repaints its menu on the way out.
 *
 * What a caller may wear is not decided here. `bbs.listScreenThemes()` and
 * `bbs.setScreenTheme()` both go through `caller-theme.ts` - the same function
 * the loader asks - so this picker can never offer a theme the board would
 * then refuse, and never refuse one it would serve.
 */
const terminal_mode_1 = require("@amiexpress/bbs-door-sdk/utils/terminal-mode");
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const theme_1 = require("@amiexpress/bbs-door-sdk/engines/ui/theme");
const door_input_manager_1 = require("@amiexpress/bbs-door-sdk/utils/door-input-manager");
const blessed_helpers_2 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
/**
 * The board's own art, always offered and never in the registry as a
 * directory.
 *
 * `default` is not a theme directory - it IS the board's screens, where they
 * are today - so a caller who wants back out of a theme has to have a row to
 * choose. Without it the only way off a theme was for a sysop to retire it.
 */
exports.BOARD_ART = {
    slug: 'default',
    title: "The board's own art",
    author: '',
    widths: [80, 40],
    status: 'live',
};
/**
 * The themes worth offering THIS caller, at the width they are actually on.
 *
 * `WIDTHS` is the artist's own declaration, and a theme that says it is 80
 * only has nothing for a C64 caller but the board's art with extra steps. A
 * theme that declares NOTHING is offered at every width: an empty declaration
 * is a theme that has not said, not a theme that has said no.
 */
function choicesForWidth(themes, width) {
    const wanted = width <= 40 ? 40 : 80;
    const offered = themes.filter(theme => theme.slug !== exports.BOARD_ART.slug
        && (theme.widths.length === 0 || theme.widths.includes(wanted)));
    return [exports.BOARD_ART, ...offered];
}
/**
 * A theme row, styled. Wide keeps the artist's name; 40 columns has no room.
 *
 * The same shape THEME uses, and the same reason for every number in it:
 * `[*] ` costs four columns, blessed's selected-item caret costs two more, and
 * the last cell is left empty because writing it puts the terminal in a
 * pending-wrap state. A row that folds eats the theme underneath it.
 */
function buildThemeItems(themes, active, s, compact, width = 80) {
    const nameRoom = Math.max(4, width - 4 - 2 - 1);
    return themes.map(theme => {
        // The one in force is MARKED, not merely highlighted: the highlight
        // follows the cursor and says nothing about what the board will use.
        const mark = theme.slug === active ? s.accent('[*]') : s.dim('[ ]');
        const draft = theme.status === 'live' ? '' : ` (${theme.status})`;
        if (compact.singleColumn) {
            return `${mark} ${s.ink(`${theme.title}${draft}`.substring(0, nameRoom))}`;
        }
        const by = theme.author ? `by ${theme.author}` : '';
        // Clipped as ONE line and split back at the column, so a styling bracket
        // never falls inside a cut and a long title never pushes the artist's
        // name past the edge and folds the row.
        const line = `${`${theme.title}${draft}`.padEnd(24)} ${by}`.substring(0, nameRoom);
        const cut = Math.max(24, `${theme.title}${draft}`.length);
        return `${mark} ${s.ink(line.slice(0, cut))} ${s.dim(line.slice(cut + 1))}`;
    });
}
/** The line under the list, said in as many words as the screen has room for. */
function buildNote(s, compact) {
    return compact.collapseChrome
        ? `  ${s.dim('Applies on the next board screen.')}`
        : `  ${s.dim('A screen theme applies to the next screen the board draws.')}`;
}
/** Footer key hints; the 40-column set is the same three keys, abbreviated. */
function buildFooterHints(compact) {
    return compact.collapseChrome
        ? [
            { key: 'Up/Dn', does: 'Pick' },
            { key: 'Ent', does: 'Wear' },
            { key: 'Q', does: 'Bye' },
        ]
        : [
            { key: 'Up/Down', does: 'Choose' },
            { key: 'Enter', does: 'Wear it' },
            { key: 'Q', does: 'Leave' },
        ];
}
async function createApp(session) {
    const { bbs } = session;
    // The DOOR theme is what this picker is DRAWN in - it has nothing to do with
    // what it picks, and picking a screen theme never changes it here. A theme
    // that names a companion door theme applies it through `setScreenTheme`, on
    // the board's side, where the rule lives.
    const theme = bbs?.getTheme ? bbs.getTheme() : (0, theme_1.themeById)('classic');
    const s = (0, theme_1.themeStyles)(theme);
    const screen = (0, blessed_helpers_1.createScreen)(bbs, { title: 'Screen Theme' });
    const screenWidth = screen.width || 80;
    const compact = (0, blessed_1.getCompactProfile)(screenWidth);
    const available = bbs?.listScreenThemes ? bbs.listScreenThemes() : [];
    const themes = choicesForWidth(available, screenWidth);
    let active = bbs?.getScreenTheme ? bbs.getScreenTheme() : exports.BOARD_ART.slug;
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
    const mastheadRow = (0, blessed_helpers_1.createBox)({
        parent: screen,
        top: 0,
        left: 0,
        width: '100%',
        height: 1,
        border: undefined,
        focusable: false,
        content: '',
        // On the GROUND, not on a bar: a masthead painted `ground on accent` is a
        // slab of colour across the top with the slashes cut out of it.
        style: { fg: theme.tokens.dim, bg: theme.tokens.ground },
    });
    const listRows = Math.max(1, Math.min(themes.length, (screen.height || 24) - 6));
    const list = (0, blessed_helpers_1.createList)({
        parent: screen,
        top: 2,
        left: 0,
        width: '100%',
        height: listRows,
        keys: true,
        vi: true,
        mouse: true,
        tags: true,
        border: undefined,
        style: {
            selected: s.list.style.selected,
            item: { fg: theme.tokens.dim },
        },
        items: buildThemeItems(themes, active, s, compact, screenWidth),
    });
    const noteRow = (0, blessed_helpers_1.createBox)({
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
    const footer = (0, blessed_helpers_1.createBox)({
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
        content: '',
    });
    const chrome = (0, theme_1.attachDoorChrome)(theme, {
        width: screenWidth,
        title: 'SCREEN THEME',
        masthead: mastheadRow,
        footer: footer,
        hints: buildFooterHints(compact),
        footerPad: ' ',
        glitch: list,
        glitchOptions: { tickMs: 400 },
        styles: s,
        render: () => screen.render(),
    });
    // Open ON the theme in force, not on row zero.
    list.select(Math.max(0, themes.findIndex(t => t.slug === active)));
    list.focus();
    screen.render();
    await new Promise((resolve) => {
        const done = () => {
            try {
                chrome.stop();
            }
            catch { /* leaving anyway */ }
            try {
                input.disable();
            }
            catch { /* leaving anyway */ }
            terminalMode.dispose();
            try {
                screen.destroy();
            }
            catch { /* leaving anyway */ }
            // SGR 0 and a clear UNDER it: blessed leaves whatever attributes it last
            // wrote in force, and a C64 commits its one screen background at the
            // last clear - a reset alone hands the board the door's colours.
            try {
                bbs.write('\x1b[0m\x1b[2J\x1b[H\x1b[?25h');
            }
            catch { /* leaving anyway */ }
            resolve();
        };
        // Ctrl+C and a Ctrl+K palette pick leave through the same quit as Q.
        (0, blessed_helpers_2.honourDoorClose)(session, screen, done);
        list.on('select', async (_item, index) => {
            const chosen = themes[index];
            if (!chosen)
                return done();
            let saved = active;
            if (bbs?.setScreenTheme) {
                try {
                    // Answers the slug ACTUALLY in force: the board refuses rather than
                    // stores a preference the loader would not honour, so this is what
                    // the mark must follow.
                    saved = await bbs.setScreenTheme(chosen.slug);
                }
                catch {
                    saved = active;
                }
            }
            active = saved;
            // Repaint the rows, not the screen: the mark moved and nothing else did.
            list.setItems(buildThemeItems(themes, active, s, compact, screenWidth));
            const picked = themes.find(t => t.slug === saved) ?? chosen;
            noteRow.setContent(`  ${s.ok(`${picked.title} saved.`)} ${s.dim('The next board screen is drawn in it.')}`);
            screen.render();
        });
        screen.key(['q', 'Q', 'escape'], () => done());
    });
}
async function runDoor(bbs, session) {
    await createApp({ ...(session || {}), bbs });
}
exports.default = runDoor;
//# sourceMappingURL=app.js.map