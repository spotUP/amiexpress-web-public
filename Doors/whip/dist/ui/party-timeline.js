"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.upcomingFrom = upcomingFrom;
exports.showPartyTimeline = showPartyTimeline;
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const gamification_1 = require("../core/gamification");
const menu_1 = require("./menu");
const door_theme_1 = require("../door-theme");
const chrome_1 = require("./chrome");
/** The keys this screen answers to, and the same keys shortened for 40 columns. */
const HINTS = [
    { key: 'Up/Down', does: 'Scroll' },
    { key: 'R', does: 'Refresh from demoparty.net' },
    { key: 'Q/ESC', does: 'Back' },
];
const COMPACT_HINTS = [
    { key: 'Up/Dn', does: 'Scroll' },
    { key: 'R', does: 'Refresh' },
    { key: 'Q', does: 'Back' },
];
/** Upcoming parties, soonest first. Pure, so a refresh can recompute it. */
function upcomingFrom(parties, now = new Date()) {
    return parties
        .filter((p) => new Date(p.date) >= now)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}
async function showPartyTimeline(screen, user, dataManager, partyCalendar, onNavigate) {
    return new Promise(async (resolve) => {
        screen.program.enableMouse();
        screen.clearRegion(0, screen.width, 0, screen.height);
        screen.alloc();
        // Note: Removed 200ms artificial delay for better responsiveness
        let selectedIndex = 0;
        // NOT const, and NOT captured once (2026-09-13): R reloads the parties
        // from demoparty.net, and the old code recomputed nothing, so the
        // refresh the footer advertises changed not one cell on screen.
        let upcomingParties = upcomingFrom(await dataManager.loadParties());
        // The header and the footer are built ONCE, outside the paint.
        //
        // They used to be torn down and rebuilt on every arrow key along with the
        // list, which was harmless while they held static text and is not once
        // they carry the chrome: the masthead and the hint row are attached to
        // these two elements, and an element replaced under a running timer is an
        // element the timer keeps painting after it has left the screen. Same
        // geometry, same place, built once. The LIST is built once now too - see
        // the paint/rebuild split below.
        // Menu bar row (ui/menu.ts): header and list slide down one row
        // when it is up, and stay put below 60 columns.
        const barH = (0, menu_1.menuBarHeight)(screen.width);
        const header = (0, blessed_helpers_1.createBox)({
            fixed: true,
            parent: screen,
            top: barH,
            left: 0,
            width: '100%',
            height: 3,
            border: { type: 'line' },
            // Empty: a three-row framed box has ONE interior row, and the chrome's
            // masthead owns it now. The centred title moved to `title` below.
            content: '',
            style: { fg: door_theme_1.T.ink, bg: door_theme_1.T.ground, border: { fg: door_theme_1.T.accent } },
            tags: true,
            focusable: false,
            mouse: false,
            clickable: false,
        });
        // Footer - NOT focusable
        const instructions = (0, blessed_helpers_1.createBox)({
            fixed: true,
            parent: screen,
            bottom: 0,
            left: 0,
            width: '100%',
            height: 3,
            border: { type: 'line' },
            // Filled by the chrome, from the SDK's hint builder.
            content: '',
            style: { fg: door_theme_1.T.dim, bg: door_theme_1.T.ground, border: { fg: door_theme_1.T.dim } },
            tags: true,
            focusable: false,
            mouse: false,
            clickable: false,
        });
        // Party list container - focusable (scrollable). Built ONCE.
        const listBox = (0, blessed_helpers_1.createBox)({
            fixed: true,
            parent: screen,
            top: barH + 3,
            left: 1,
            width: '98%',
            height: `100%-${barH + 6}`,
            border: { type: 'line' },
            label: ' Parties ',
            style: {
                border: { fg: door_theme_1.T.accent },
                bg: door_theme_1.T.ground
            },
            scrollable: true,
            alwaysScroll: true,
            // Visible scrollbar (2026-09-10): the list scrolled invisibly
            // while the selection moved below the fold. Amiga-ASCII glyphs
            // only - the terminal renders no block characters.
            scrollbar: {
                ch: '|',
                track: { ch: ':', style: { fg: door_theme_1.T.dim, bg: door_theme_1.T.ground } },
                style: { fg: door_theme_1.T.accent, bg: door_theme_1.T.ground },
            },
            mouse: true,
            keys: true,
            vi: true,
            focusable: true,
        });
        /**
         * Data and paint, split (2026-09-13).
         *
         * Every arrow key used to destroy the pane, build a new one, reload the
         * projects and the tasks ONCE PER PARTY, re-serialise every party and
         * rebind the wheel handlers - and it did all that from an async function
         * nobody awaited, so two quick arrows had two builds in flight writing
         * into two different panes (the second build reassigned `listBox` while
         * the first was still awaiting inside its loop). Held arrows put a stale
         * render's content into the newer pane.
         *
         * Now: `rebuild()` is the only async step and runs when the DATA changes;
         * `paint()` is synchronous, moves the selection marker on the two blocks
         * that changed and nothing else, and is what a key press calls. ~198
         * bytes is one XIM message on 68K, so a key must not redraw the board.
         */
        let blocks = [];
        /** Each block already joined; only the two that change are re-joined. */
        let serialized = [];
        /** Content line each party's block starts on, to keep it on screen. */
        let rowOf = [];
        /** Which block currently carries the inverse marker, -1 for none. */
        let markedIndex = -1;
        const rebuild = async () => {
            // Once for the whole screen, not once per party: the old loop awaited
            // both of these inside itself, so ten parties meant twenty loads.
            const projects = await dataManager.loadProjects();
            const allTasks = await dataManager.loadTasks();
            blocks = [];
            serialized = [];
            rowOf = [];
            markedIndex = -1;
            let line = 0;
            for (const party of upcomingParties) {
                const days = partyCalendar.getDaysUntilParty(party.date);
                const color = partyCalendar.getPartyCountdownColor(days);
                const partyProjects = projects.filter(p => p.partyId === party.id);
                const partyTasks = allTasks.filter(t => partyProjects.some(p => p.id === t.projectId));
                const completedTasks = partyTasks.filter(t => t.status === 'done').length;
                const progress = partyTasks.length > 0
                    ? Math.floor((completedTasks / partyTasks.length) * 100)
                    : 0;
                const progressBar = (0, gamification_1.createProgressBar)(progress, 24);
                // Truncate long names and categories to prevent overflow
                const maxNameLength = 35;
                const partyName = party.name.length > maxNameLength
                    ? party.name.substring(0, maxNameLength - 3) + '...'
                    : party.name;
                const maxLocationLength = 40;
                const location = party.location.length > maxLocationLength
                    ? party.location.substring(0, maxLocationLength - 3) + '...'
                    : party.location;
                const rows = [];
                // Row 0 and the last row are the selection marker's own rows: empty
                // when the block is not selected, the open and close tags when it
                // is. Keeping them in the block means the line count - and so the
                // scroll position - never depends on the selection.
                rows.push('');
                rows.push(` {${color}-fg}[${days < 7 ? '!' : '*'}]{/${color}-fg} {bold}${partyName}{/bold}  -  {bold}${days} days{/bold}`);
                rows.push(`     Location: ${location}`);
                rows.push(`     Date: ${party.date}`);
                if (party.categories.length > 0) {
                    const cats = party.categories.join(', ');
                    const maxCatsLength = 50;
                    const truncatedCats = cats.length > maxCatsLength
                        ? cats.substring(0, maxCatsLength - 3) + '...'
                        : cats;
                    rows.push(`     Categories: ${truncatedCats}`);
                }
                rows.push(`     Progress: ${progress}% ${progressBar}`);
                rows.push(`     Active: ${partyTasks.length - completedTasks} | Completed: ${completedTasks}`);
                rows.push('');
                rowOf.push(line);
                blocks.push(rows);
                serialized.push(rows.join('\n'));
                line += rows.length;
            }
        };
        const markBlock = (index, on) => {
            const rows = blocks[index];
            if (!rows)
                return;
            rows[0] = on ? '{inverse}' : '';
            rows[rows.length - 1] = on ? '{/inverse}' : '';
            serialized[index] = rows.join('\n');
        };
        const paint = () => {
            if (blocks.length === 0) {
                listBox.setContent(`{center}{${door_theme_1.T.dim}-fg}No upcoming parties found.{/${door_theme_1.T.dim}-fg}{/center}`);
                screen.render();
                return;
            }
            selectedIndex = Math.max(0, Math.min(selectedIndex, blocks.length - 1));
            if (markedIndex !== selectedIndex) {
                if (markedIndex >= 0)
                    markBlock(markedIndex, false);
                markBlock(selectedIndex, true);
                markedIndex = selectedIndex;
            }
            listBox.setContent(serialized.join('\n'));
            // Keep the selection on screen: scroll so its first row sits two
            // rows down from the top of the pane.
            listBox.scrollTo(Math.max(0, (rowOf[selectedIndex] ?? 0) - 2));
            screen.render();
        };
        const move = (delta) => {
            const next = Math.max(0, Math.min(upcomingParties.length - 1, selectedIndex + delta));
            if (next === selectedIndex)
                return;
            selectedIndex = next;
            paint();
        };
        // Bound ONCE, because the pane is built once: the wheel moves the
        // selection exactly like the arrow keys.
        listBox.on('wheelup', () => move(-1));
        listBox.on('wheeldown', () => move(1));
        // The whole chrome from the door's ONE call.
        const chrome = (0, chrome_1.attachWhipChrome)({
            screen,
            header,
            footer: instructions,
            title: 'PARTY TIMELINE 2026',
            hints: HINTS,
            compactHints: COMPACT_HINTS,
            // The pane is built once now, so the element itself would do - the
            // getter stays because it costs nothing and survives a future rebuild.
            glitch: () => listBox,
        });
        // One refresh at a time: R is a network round trip, and a caller
        // leaning on the key would otherwise stack them.
        let refreshing = false;
        const refresh = async () => {
            if (refreshing)
                return;
            refreshing = true;
            try {
                await partyCalendar.refreshParties();
                upcomingParties = upcomingFrom(await dataManager.loadParties());
                await rebuild();
                paint();
            }
            finally {
                refreshing = false;
            }
        };
        const keyHandler = (ch, key) => {
            switch (key.name) {
                case 'up':
                    move(-1);
                    break;
                case 'down':
                    move(1);
                    break;
                case 'r':
                    // Refresh party data from demoparty.net
                    void refresh();
                    break;
                case 'q':
                case 'escape':
                    cleanup();
                    resolve();
                    break;
            }
        };
        screen.on('keypress', keyHandler);
        // Menu picks leave this screen for wherever the app loop sends them.
        // Bound once: the paint touches the pane, never this scope.
        let menu = null;
        const pickFromBar = (value) => {
            onNavigate?.(value);
            cleanup();
            resolve();
        };
        menu = (0, menu_1.attachWhipMenu)(screen, pickFromBar, () => listBox, { reserved: ['R', 'Q'] });
        const cleanup = () => {
            // First: a rail timer still writing after these widgets are gone would
            // paint into a screen that no longer holds them.
            chrome.stop();
            if (menu) {
                menu.destroy();
                menu = null;
            }
            screen.off('keypress', keyHandler);
            screen.remove(header);
            screen.remove(listBox);
            screen.remove(instructions);
        };
        await rebuild();
        paint();
        listBox.focus();
    });
}
