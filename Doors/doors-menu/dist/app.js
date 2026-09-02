"use strict";
/**
 * Doors Menu - Interactive Door Selection with Categories
 *
 * Displays available doors organized by category with arrow key navigation.
 * Uses SDK blessed helpers (no duplicate code).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildCategoryRow = buildCategoryRow;
exports.buildDoorRow = buildDoorRow;
exports.buildFooterContent = buildFooterContent;
exports.createApp = createApp;
const terminal_mode_1 = require("@amiexpress/bbs-door-sdk/utils/terminal-mode");
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
// Colours come from the user's theme, never from this file. `classic` is
// the default and reproduces exactly what this door drew before, so the
// migration is verifiable: identical output until somebody picks a theme.
const theme_1 = require("@amiexpress/bbs-door-sdk/engines/ui/theme");
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
/**
 * Format file size for display
 */
function formatSize(bytes) {
    if (bytes === 0)
        return '0 B';
    if (bytes < 1024)
        return `${bytes} B`;
    if (bytes < 1024 * 1024)
        return `${Math.round(bytes / 1024)} KB`;
    return `${Math.round(bytes / (1024 * 1024))} MB`;
}
/**
 * Format door type badge
 */
function formatType(type) {
    const typeMap = {
        'TS': 'TS',
        'typescript': 'TS',
        'XIM': 'XIM',
        'xim': 'XIM',
        'AMI': 'AMI',
        'amiga': 'AMI',
        'ami': 'AMI',
        'PYTHON': 'PY',
        'python': 'PY',
        'PY': 'PY',
        'AREXX': 'RX',
        'arexx': 'RX',
        'RX': 'RX',
        'ARC': 'ARC',
        'archive': 'ARC',
        'WEB': 'WEB',
        'web': 'WEB'
    };
    return typeMap[type] || 'AMI';
}
/**
 * Build category tree from door list
 */
function buildCategoryTree(doors) {
    const root = {
        name: 'All Doors',
        fullPath: '',
        children: new Map(),
        doors: []
    };
    for (const door of doors) {
        const category = door.category || 'Misc';
        const parts = category.split('/');
        let current = root;
        let pathSoFar = '';
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            pathSoFar = pathSoFar ? `${pathSoFar}/${part}` : part;
            if (!current.children.has(part)) {
                current.children.set(part, {
                    name: part,
                    fullPath: pathSoFar,
                    children: new Map(),
                    doors: []
                });
            }
            current = current.children.get(part);
        }
        // Add door to its final category
        current.doors.push(door);
    }
    return root;
}
/**
 * Get category at path
 */
function getCategoryAtPath(root, path) {
    let current = root;
    for (const part of path) {
        const child = current.children.get(part);
        if (!child)
            return null;
        current = child;
    }
    return current;
}
/**
 * Count total doors in a category (including subcategories)
 */
function countDoorsInCategory(node) {
    let count = node.doors.length;
    for (const child of node.children.values()) {
        count += countDoorsInCategory(child);
    }
    return count;
}
/**
 * Get all doors in a category (including subcategories)
 */
function getAllDoorsInCategory(node) {
    const doors = [...node.doors];
    for (const child of node.children.values()) {
        doors.push(...getAllDoorsInCategory(child));
    }
    return doors;
}
/**
 * Row builders, width-driven.
 *
 * Every one of these takes the LIVE screen width and asks the SDK's single
 * compact profile what to do with it - there is no 40 and no 80 in this
 * door. At the XXS tier (a C64/PETSCII caller) the secondary columns are
 * dropped rather than allowed to fold: a row one character too long does
 * not clip on this canvas, it wraps and eats the row beneath it, which is
 * how a 40-column caller lost half of this list.
 */
/** Clip to `max` printable characters (the styles wrap, they do not pad). */
function clip(text, max) {
    return max <= 0 ? '' : text.substring(0, max);
}
/** One category row: icon, name, and the door count. */
function buildCategoryRow(catName, doorCount, hasSubcats, s, width) {
    // "has children" vs "is a leaf" is structure, not severity, so both
    // take accents rather than the semantic ok/warn colours.
    //
    // The leaf marker is `-` rather than `>`: in Topaz a `[` immediately
    // followed by `>` merges into something that reads as a capital D,
    // which is why these rows looked like `D]` and not `[>]`. The bytes
    // were always correct - it is the glyph pair that is not.
    const icon = hasSubcats ? s.accent('[+]') : s.accentAlt('[-]');
    const compact = (0, blessed_1.getCompactProfile)(width);
    if (!compact.singleColumn) {
        return `${icon} ${s.ink(catName.padEnd(25))} ${s.accentAlt(`(${doorCount} door${doorCount !== 1 ? 's' : ''})`)}`;
    }
    // XXS: the count loses the word "doors" - the parentheses already say it.
    const count = `(${doorCount})`;
    // icon(3) + space + name + space + count, one column short of the edge.
    const room = Math.max(1, width - 1 - 3 - 1 - 1 - count.length);
    return `${icon} ${s.ink(clip(catName, room))} ${s.accentAlt(count)}`;
}
/** One door row: type badge, command, name and (wide only) the size. */
function buildDoorRow(door, s, width) {
    const typeLabel = formatType(door.type);
    const compact = (0, blessed_1.getCompactProfile)(width);
    if (!compact.singleColumn) {
        const sizeLabel = formatSize(door.size || 0);
        return (`${s.accent(`[${typeLabel.padEnd(3)}]`)} ` +
            `${s.ok(door.command.padEnd(12))} ` +
            `${s.ink(door.name.padEnd(25))} ` +
            `${s.accentAlt(sizeLabel.padStart(8))}`);
    }
    // XXS: the size column goes first - it is the least useful thing on the
    // row and the only one nobody navigates by - and the command column
    // shrinks to what a BBS command actually is.
    const CMD = 10;
    const cmd = clip(door.command, CMD).padEnd(CMD);
    const room = Math.max(1, width - 1 - 5 - 1 - CMD - 1);
    return `${s.accent(`[${typeLabel.padEnd(3)}]`)} ${s.ok(cmd)} ${s.ink(clip(door.name, room))}`;
}
/** The footer hint line. XXS keeps the navigation keys and drops the rest. */
function buildFooterContent(s, width) {
    const compact = (0, blessed_1.getCompactProfile)(width);
    // The key CAP is the part worth reading - which letter to press. The
    // word after it is a reminder, so it sits dim and the caps carry the
    // accent. Bright text throughout made the hint line compete with the
    // content above it.
    const hints = compact.collapseChrome
        ? [
            `${s.key('Up/Dn:')} ${s.dim('Move')}`,
            `${s.key('Ent:')} ${s.dim('Go')}`,
            `${s.key('BS:')} ${s.dim('Back')}`,
            `${s.key('Q:')} ${s.dim('Quit')}`,
        ]
        : [
            `${s.key('Up/Down:')} ${s.dim('Navigate')}`,
            `${s.key('Enter:')} ${s.dim('Select')}`,
            `${s.key('T:')} ${s.dim('Filter Type')}`,
            `${s.key('Backspace:')} ${s.dim('Back')}`,
            `${s.key('Q:')} ${s.dim('Quit')}`,
        ];
    // The rail tail is decoration and the XXS row has no spare cells for it.
    return hints.join('  ') + (s.rail && !compact.collapseChrome ? `  ${s.dim(s.rail)}` : '');
}
async function createApp(session) {
    const { bbs, user } = session;
    // One resolve per run. `s` carries every colour this door draws.
    const theme = bbs?.getTheme ? bbs.getTheme() : (0, theme_1.themeById)('classic');
    const s = (0, theme_1.themeStyles)(theme);
    const username = user?.username || 'Guest';
    const userLevel = user?.secLevel || 0;
    // Fetch available doors from BBS API
    const doors = await fetchAvailableDoors(bbs, userLevel);
    if (doors.length === 0) {
        bbs.write('\r\n\x1b[36mNo doors are currently available.\x1b[0m\r\n');
        return Promise.resolve();
    }
    // Check if a specific door was requested via params
    if (session.params && session.params.length > 0) {
        const doorName = session.params[0].toUpperCase();
        const matchedDoor = doors.find(d => d.command.toUpperCase() === doorName ||
            d.id.toUpperCase() === doorName);
        if (matchedDoor) {
            await bbs.executeCommand(matchedDoor.command);
            return;
        }
        else {
            bbs.write(`\r\n\x1b[31mDoor "${doorName}" not found.\x1b[0m\r\n`);
            return Promise.resolve();
        }
    }
    // Build category tree
    const categoryTree = buildCategoryTree(doors);
    // Navigation state
    let currentPath = [];
    let viewMode = 'categories';
    let currentCategory = categoryTree;
    // Type filter state
    const doorTypes = ['ALL', 'XIM', 'TS', 'SIM', 'PY', 'RX'];
    let currentTypeFilter = 'ALL';
    // Create screen using SDK helper
    let screen;
    let terminalMode = null;
    try {
        screen = (0, blessed_helpers_1.createScreen)(bbs, {
            smartCSR: false, // Prevent layout corruption
            dockBorders: false, // Not needed for fixed panels
            title: 'Door Games & Utilities',
        });
        screen.program.write('\x1b[2J');
        screen.program.write('\x1b[H');
        screen.clearRegion(0, screen.width, 0, screen.height);
        screen.alloc();
        // 80x25 like the board, or the caller's whole terminal on Alt+Enter.
        // The listing is written in percentages, so following a resize is a
        // repaint; asking the terminal to grow at all is the part no door gets
        // for free (sdk/utils/terminal-mode.ts).
        terminalMode = (0, terminal_mode_1.createTerminalModeSwitch)({
            bbs,
            screen,
            start: 'fixed',
            onRelayout: () => { screen.render(); },
        });
    }
    catch (error) {
        bbs.write('\r\n\x1b[31mError creating door interface\x1b[0m\r\n');
        throw error;
    }
    // Create input manager (menu-based door, no game mode needed)
    const inputManager = new blessed_helpers_1.DoorInputManager(session, screen, {
        enableGameMode: false, // Menu-based UI, not a game
        enableGrabKeys: false, // Blessed widgets handle their own input
        enableMouse: true, // Door has mouse support
    });
    // Enable input
    inputManager.enable();
    // Every width decision below comes from the LIVE screen through the SDK's
    // one compact profile - never a door-local 40 or 80.
    const screenWidth = screen.width || 80;
    const compact = (0, blessed_1.getCompactProfile)(screenWidth);
    const TITLE = 'DOOR GAMES & UTILITIES';
    /**
     * The masthead: a run of slashes with the headline right-aligned at the
     * end, and one short segment of the run lit in the accent colour.
     *
     * The bar itself never moves - a run of identical slashes shifted by a
     * column is the same run. What travels is the BRIGHTNESS, which is the
     * effect the mockups wanted and the reason the run is drawn in two
     * colours rather than one.
     *
     * `barWidth` is how much of the run has been drawn; the entry animation
     * grows it from nothing. `scanTick` is null before the animation ends,
     * when nothing is lit yet.
     */
    let barWidth = null;
    let tick = null;
    /**
     * The bar is an irregular stream - `///////////// //// /////////// /` -
     * scrolled rather than regenerated, so it travels instead of flickering.
     * The seed only has to be stable for a session; the node number keeps two
     * people's boards from marching in step.
     */
    const BAR_SEED = (session?.bbsSession?.nodeId ?? 1) * 7 + 3;
    function buildMasthead() {
        if (!s.rail)
            return ` ${TITLE} `;
        // One column short of the width, always. Writing the final cell of a
        // row is the oldest trap in terminal drawing: it leaves the cursor in a
        // pending-wrap state and the last character ends up clipped or pushed
        // onto the next line, which is exactly what the headline was doing.
        // Leaving the column empty costs nothing and cannot go wrong.
        const width = Math.max(1, (screen.width || 80) - 1);
        const runWidth = Math.max(0, width - TITLE.length - 1);
        const shown = barWidth === null ? runWidth : Math.min(barWidth, runWidth);
        // Two things move at once, and they have to: the spaced pattern slides
        // (which a solid run could not do at all), and a short segment lights
        // up as it passes. Either alone reads as a static bar with a quirk.
        const run = (0, theme_1.railStream)(s.rail, shown, tick ?? 0, BAR_SEED).padEnd(runWidth);
        // One colour, all the way along. A bright segment travelling through it
        // was tried and read as glare rather than as motion - the irregular
        // stream already moves visibly on its own, and a second thing moving
        // through it was one idea too many.
        return `${s.accent(run)} ${s.ink(TITLE)}`;
    }
    // Create header
    const header = (0, blessed_helpers_1.createBox)({
        parent: screen,
        top: 0,
        left: 0,
        width: '100%',
        height: 1,
        fixed: true,
        focusable: false,
        clickable: false,
        mouse: false,
        border: undefined,
        // The masthead: branding slashes, then the title. The mockup for
        // Uprough Neon leads with `/////` and this is where it belongs - a
        // theme with no rail (classic) gets exactly the title it always had.
        content: buildMasthead(),
        style: s.bar.style
    });
    // Create breadcrumb bar
    const breadcrumb = (0, blessed_helpers_1.createBox)({
        parent: screen,
        top: 2, // row 1 is left blank under the masthead
        left: 0,
        width: '70%',
        height: 1,
        fixed: true,
        focusable: false,
        clickable: false,
        mouse: false,
        border: undefined,
        content: `${s.accentAlt('Location:')} All Doors`,
        style: {
            fg: theme.tokens.accentAlt,
            bg: theme.tokens.ground
        }
    });
    // Create type filter display
    const filterDisplay = (0, blessed_helpers_1.createBox)({
        parent: screen,
        top: 2, // row 1 is left blank under the masthead
        right: 0,
        width: '30%',
        height: 1,
        fixed: true,
        focusable: false,
        clickable: false,
        mouse: false,
        border: undefined,
        content: `${s.accent('Filter:')} ALL`,
        style: {
            fg: theme.tokens.accent,
            bg: theme.tokens.ground
        }
    });
    // Create main list
    const mainList = (0, blessed_helpers_1.createList)({
        parent: screen,
        top: 3, // masthead, blank row, breadcrumb, then the list
        left: 0,
        width: '100%',
        height: '100%-4',
        keys: true,
        vi: true,
        mouse: true,
        scrollable: true,
        alwaysScroll: true,
        scrollbar: {
            ch: ' ',
            style: {
                bg: theme.tokens.selectionBg
            }
        },
        style: {
            selected: s.list.style.selected,
            item: { fg: theme.tokens.ink }
        },
        tags: true,
    });
    // Mouse wheel scrolling support
    mainList.on('wheeldown', () => {
        mainList.down(3);
        screen.render();
    });
    mainList.on('wheelup', () => {
        mainList.up(3);
        screen.render();
    });
    // Ensure smooth scrolling with held keys
    /**
     * The cursor marker, for a theme that has nothing else to show it with.
     *
     * Quiet Phosphor draws no borders and no highlight block - it carries
     * hierarchy in brightness alone - so without this there is genuinely
     * nothing on screen saying which row is selected. Themes that highlight
     * the whole row get an empty string and lose nothing.
     *
     * Every row is prefixed, selected or not, so the columns stay in line:
     * a marker that only appeared on one row would shunt it sideways.
     */
    const MARK = (0, theme_1.selectionMark)(theme);
    /**
     * A dotted leader in the footer showing how far down the list you are.
     *
     * The mockups used a leader as decoration; this makes it carry something.
     * It is redrawn only when the selection moves, which is a row that was
     * being repainted anyway.
     */
    let lastLeader = '';
    function updateScrollLeader() {
        if (!s.rail)
            return; // classic keeps its plain footer
        // 26 cells of dotted leader on a 40-column footer would sit on top of
        // the key hints. The hints win.
        if (compact.collapseChrome)
            return;
        if (currentRows.length === 0)
            return;
        const items = currentRows;
        const at = (mainList.selected ?? 0) + 1;
        const width = Math.max(4, Math.min(24, (screen.width || 80) - 56));
        const drawn = s.dim((0, theme_1.leaderProgress)(width, at, items.length));
        if (drawn === lastLeader)
            return; // nothing to repaint
        lastLeader = drawn;
        scrollLeader.setContent(drawn);
    }
    /**
     * The marker column only. The unreadable-selection problem this door
     * briefly worked around lives in the List widget and is fixed there, so
     * rows keep their own colours and the widget decides what happens to
     * them when one is selected.
     */
    function markRow(text, selected) {
        if (!MARK)
            return text;
        return (selected ? s.accent(MARK) : ' '.repeat(MARK.length)) + text;
    }
    /**
     * The rows as WE built them, without any marker.
     *
     * Read back off the widget instead, this crashed: blessed's `items` are
     * element objects, not the strings that were handed in, and their content
     * is not reliably a string either - "Cannot read properties of undefined
     * (reading 'slice')", which took the whole door down every time a
     * borderless theme was active. Keeping our own copy also removes the need
     * to guess whether a row already carries a marker.
     */
    let currentRows = [];
    /** Set the list's rows, remembering them, and draw the marker column. */
    function setRows(rows, selectAt = 0) {
        currentRows = rows;
        mainList.setItems(rows.map((row, i) => markRow(row, i === selectAt)));
        mainList.select(selectAt);
        markedRow = selectAt;
    }
    /** Which row currently carries the marker, so only two rows are redrawn. */
    let markedRow = -1;
    /**
     * Move the marker, touching only the row that lost it and the row that
     * gained it.
     *
     * Rebuilding every row on each keypress is what made the masthead
     * animation stutter while navigating - with a hundred and fifty doors in
     * the list, a full setItems on every arrow key starves a 20fps timer.
     * Two setItem calls cost nothing by comparison.
     */
    function refreshMarkers() {
        if (!MARK || currentRows.length === 0)
            return;
        const at = mainList.selected ?? 0;
        if (at === markedRow)
            return;
        if (markedRow >= 0 && markedRow < currentRows.length) {
            mainList.setItem(markedRow, markRow(currentRows[markedRow], false));
        }
        if (at >= 0 && at < currentRows.length) {
            mainList.setItem(at, markRow(currentRows[at], true));
        }
        markedRow = at;
    }
    mainList.on('select item', () => {
        refreshMarkers();
        updateScrollLeader();
        screen.render();
    });
    /**
     * The leader itself: a strip at the right of the footer row.
     *
     * Its own box so moving the selection repaints twenty characters rather
     * than the whole footer, which is the difference between a row that is
     * free to redraw and one that is not.
     */
    const scrollLeader = (0, blessed_helpers_1.createBox)({
        parent: screen,
        bottom: 0,
        right: 1,
        width: 26,
        height: 1,
        border: undefined,
        focusable: false,
        clickable: false,
        mouse: false,
        tags: true,
        content: '',
        style: s.plain.style,
    });
    // Create footer
    const footer = (0, blessed_helpers_1.createBox)({
        parent: screen,
        bottom: 0,
        left: 0,
        width: '100%',
        // One row, no frame.
        //
        // The footer used to be a bordered box, which read as a separate panel
        // parked at the bottom rather than as part of the screen. A hint line
        // is not a panel: it is the same surface as everything else with some
        // text on it, so it takes the bar's colours and draws no rule at all.
        height: 1,
        fixed: true, // Static footer
        focusable: false,
        clickable: false, // Don't capture mouse events
        mouse: false, // Don't listen for mouse events
        border: undefined,
        style: {
            fg: theme.tokens.dim,
            bg: theme.tokens.bar,
        },
        // The key CAP is the part worth reading - which letter to press. The
        // word after it is a reminder, so it sits dim and the caps carry the
        // accent. Bright text throughout made the hint line compete with the
        // content above it.
        content: buildFooterContent(s, screenWidth)
    });
    /**
     * Update breadcrumb display
     */
    function updateBreadcrumb() {
        const parts = [`${s.accentAlt('Location:')} All Doors`];
        for (const part of currentPath) {
            parts.push(` ${s.dim('/')} ${part}`);
        }
        if (viewMode === 'doors') {
            parts.push(` ${s.accent('(viewing doors)')}`);
        }
        breadcrumb.setContent(parts.join(''));
    }
    /**
     * Update filter display
     */
    function updateFilterDisplay() {
        // Door types were six literal hues - white/green/cyan/yellow/magenta/blue -
        // which is six colours on screen at once and reads as noise under a theme
        // built on one or two. Each type keeps a DISTINCT role instead, so the
        // types still tell apart and a single-hue theme collapses them the way it
        // means to.
        const typeInk = {
            'ALL': s.ink,
            'XIM': s.ok,
            'TS': s.accent,
            'SIM': s.warn,
            'PY': s.accentAlt,
            'RX': s.dim,
        };
        const paint = typeInk[currentTypeFilter] || s.ink;
        filterDisplay.setContent(`${s.accent('Filter:')} ${paint(currentTypeFilter)}`);
    }
    /**
     * Filter doors by current type filter
     */
    function filterDoorsByType(doorsToFilter) {
        if (currentTypeFilter === 'ALL') {
            return doorsToFilter;
        }
        return doorsToFilter.filter(door => {
            const doorType = formatType(door.type);
            return doorType === currentTypeFilter;
        });
    }
    /**
     * Cycle to next type filter
     */
    function cycleTypeFilter() {
        const currentIndex = doorTypes.indexOf(currentTypeFilter);
        const nextIndex = (currentIndex + 1) % doorTypes.length;
        currentTypeFilter = doorTypes[nextIndex];
        updateFilterDisplay();
        // Re-render current view with new filter
        if (viewMode === 'doors') {
            renderDoorView();
        }
        else {
            renderCategoryView();
        }
    }
    /**
     * Render category view
     */
    function renderCategoryView() {
        viewMode = 'categories';
        currentCategory = getCategoryAtPath(categoryTree, currentPath) || categoryTree;
        const items = [];
        // Add ".. Back" if not at root
        if (currentPath.length > 0) {
            items.push(`${s.dim('[..]')} Back to parent`);
        }
        // Add subcategories
        const sortedCategories = Array.from(currentCategory.children.keys()).sort();
        for (const catName of sortedCategories) {
            const child = currentCategory.children.get(catName);
            const doorCount = countDoorsInCategory(child);
            const hasSubcats = child.children.size > 0;
            items.push(buildCategoryRow(catName, doorCount, hasSubcats, s, screenWidth));
        }
        // Add "View All Doors" option if there are doors at this level or children
        const directDoors = currentCategory.doors.length;
        const totalDoors = countDoorsInCategory(currentCategory);
        if (totalDoors > 0) {
            items.push(`${s.accent('[*]')} ${s.ink('View All Doors')} ${s.accentAlt(`(${totalDoors} total)`)}`);
        }
        // If no subcategories, just show doors directly
        if (sortedCategories.length === 0 && directDoors > 0) {
            renderDoorView();
            return;
        }
        setRows(items);
        updateBreadcrumb();
        screen.render();
    }
    /**
     * Render door list view
     */
    function renderDoorView() {
        viewMode = 'doors';
        currentCategory = getCategoryAtPath(categoryTree, currentPath) || categoryTree;
        const allDoors = getAllDoorsInCategory(currentCategory);
        const filteredDoors = filterDoorsByType(allDoors);
        const items = [];
        // Add back option
        items.push(`${s.dim('[..]')} Back to categories`);
        // Add doors sorted by name
        const sortedDoors = filteredDoors.sort((a, b) => a.name.localeCompare(b.name));
        for (const door of sortedDoors) {
            items.push(buildDoorRow(door, s, screenWidth));
        }
        // Show count with filter info
        if (currentTypeFilter !== 'ALL') {
            const filterInfo = s.dim(`Showing ${filteredDoors.length} of ${allDoors.length} doors (${currentTypeFilter} only)`);
            items.push('');
            items.push(filterInfo);
        }
        setRows(items);
        updateBreadcrumb();
        screen.render();
    }
    /**
     * Handle selection in category view
     */
    function handleCategorySelect(index) {
        const hasBackOption = currentPath.length > 0;
        let adjustedIndex = hasBackOption ? index - 1 : index;
        // Check if "Back" was selected
        if (hasBackOption && index === 0) {
            goBack();
            return;
        }
        const sortedCategories = Array.from(currentCategory.children.keys()).sort();
        // Check if a category was selected
        if (adjustedIndex < sortedCategories.length) {
            const selectedCat = sortedCategories[adjustedIndex];
            currentPath.push(selectedCat);
            renderCategoryView();
            return;
        }
        // Check if "View All Doors" was selected
        const viewAllIndex = hasBackOption ? sortedCategories.length + 1 : sortedCategories.length;
        if (index === viewAllIndex) {
            renderDoorView();
            return;
        }
    }
    /**
     * Handle selection in door view
     */
    async function handleDoorSelect(index) {
        // Index 0 is "Back"
        if (index === 0) {
            goBack();
            return;
        }
        const allDoors = getAllDoorsInCategory(currentCategory);
        const filteredDoors = filterDoorsByType(allDoors);
        const sortedDoors = filteredDoors.sort((a, b) => a.name.localeCompare(b.name));
        const selectedDoor = sortedDoors[index - 1];
        if (selectedDoor) {
            terminalMode?.dispose();
            terminalMode = null;
            screen.destroy();
            bbs.write('\x1b[2J\x1b[H');
            if (bbs.executeCommand) {
                await bbs.executeCommand(selectedDoor.command);
            }
            else {
                bbs.write(`\r\nLaunching ${selectedDoor.name}...\r\n`);
            }
        }
    }
    /**
     * Go back one level
     */
    function goBack() {
        if (viewMode === 'doors') {
            // Check if current category has subcategories to show
            const cat = getCategoryAtPath(categoryTree, currentPath);
            if (cat && cat.children.size > 0) {
                // Has subcategories, show category view
                renderCategoryView();
            }
            else if (currentPath.length > 0) {
                // No subcategories at this level, go up one level
                currentPath.pop();
                renderCategoryView();
            }
            else {
                // At root with no categories, show category view (will show root level)
                renderCategoryView();
            }
        }
        else if (currentPath.length > 0) {
            currentPath.pop();
            renderCategoryView();
        }
    }
    // Handle selection
    mainList.on('select', (item, index) => {
        if (viewMode === 'categories') {
            handleCategorySelect(index);
        }
        else {
            // Fire-and-forget async operation (EventHandler can't be async)
            handleDoorSelect(index).catch((err) => {
                console.error('[doors-menu] Error handling door select:', err);
            });
        }
    });
    // Handle back navigation
    screen.key(['backspace', 'delete'], () => {
        goBack();
    });
    // Handle type filter toggle
    screen.key(['t', 'T'], () => {
        cycleTypeFilter();
    });
    // Handle quit
    screen.key(['q', 'Q', 'escape'], () => {
        if (currentPath.length > 0 || viewMode === 'doors') {
            goBack();
        }
        else {
            terminalMode?.dispose();
            terminalMode = null;
            screen.destroy();
        }
    });
    // Handle screen destroy
    screen.on('destroy', () => {
        inputManager.disable();
    });
    // Initial render
    mainList.focus();
    updateFilterDisplay();
    renderCategoryView();
    refreshMarkers();
    updateScrollLeader();
    // The masthead arrives, then keeps moving.
    //
    // The entry draws the bar in from nothing over a few frames; after that a
    // slow timer slides the pattern and walks the lit segment along it. One
    // row redrawn per tick, which is the budget a moving row is allowed - see
    // the cost table in the SDK's chrome.ts.
    let mastheadTimer = null;
    // A 40-column screen has no spare cells for decoration, and a 20fps row
    // repaint is a lot of PETSCII bytes for a C64 to swallow. The masthead
    // still draws - it just stops moving. (SDK: effectsAllowed().)
    if (s.rail && (0, blessed_1.effectsAllowed)(screenWidth)) {
        const width = Math.max(1, (screen.width || 80) - 1);
        const runWidth = Math.max(0, width - TITLE.length - 1);
        const frames = (0, theme_1.barGrowFrames)(s.rail, runWidth, 6);
        let frame = 0;
        const entry = setInterval(() => {
            barWidth = frames[frame] ? frames[frame].trimEnd().length : runWidth;
            header.setContent(buildMasthead());
            screen.render();
            if (++frame >= frames.length) {
                clearInterval(entry);
                barWidth = null; // full run from here on
                tick = 0;
                mastheadTimer = setInterval(() => {
                    tick = (tick ?? 0) + 1;
                    header.setContent(buildMasthead());
                    screen.render();
                    // 20 frames a second. A terminal cannot move anything less than
                    // a whole cell, so smoothness is entirely a matter of frame RATE
                    // and of keeping the interval even.
                    //
                    // Affordable because this is a TypeScript door on the web: the
                    // cost is a socket write and an xterm parse, not the ~45ms of
                    // 68K emulation a real door would pay per message. One row is
                    // roughly 200 bytes, so this is about 4KB a second - fine here,
                    // and NOT something to copy into a 68K door.
                }, 50);
            }
        }, 25);
    }
    // The theme's glitches, if it asked for any. Does nothing at all on a
    // theme that did not - no timer is even started - so a board on classic
    // pays nothing for this line existing.
    //
    // Attached to the LIST because it is the only thing on screen with rows
    // to spare: damaging the header or the key hints would read as the door
    // being broken rather than as atmosphere.
    // Glitches damage rows on purpose. On a 40-column canvas that damage is
    // the "stray glyphs mid-row" the sysop reported, so at XXS no timer runs.
    const stopGlitches = (0, blessed_1.effectsAllowed)(screenWidth) ? (0, theme_1.attachGlitches)(mainList, theme, () => screen.render(), 
    // The list owns the keyboard here, so "busy" is about the filter
    // prompt: a scrambled row while somebody is typing a filter reads as
    // the door having eaten the input.
    {
        // Considered several times a second. The dice and the minimum gap in
        // glitch.ts decide how often one actually fires; this only sets how
        // finely that decision is sampled, and too coarse a tick puts a floor
        // under the gap no matter what the constants say.
        tickMs: 400,
        isBusy: () => Boolean(screen._filterPromptOpen),
    }) : () => undefined;
    // Return promise that resolves when screen is destroyed
    return new Promise((resolve) => {
        let resolved = false;
        const cleanup = () => {
            if (!resolved) {
                resolved = true;
                // Stops the timer AND puts the true row back, so a door that exits
                // mid-glitch never leaves the damage as the last thing on screen.
                try {
                    stopGlitches();
                }
                catch { /* leaving anyway */ }
                if (mastheadTimer) {
                    clearInterval(mastheadTimer);
                    mastheadTimer = null;
                }
                try {
                    if (mainList)
                        mainList.removeAllListeners('select');
                    if (screen) {
                        screen.removeAllListeners('destroy');
                        screen.removeAllListeners('keypress');
                    }
                    if (!screen.destroyed) {
                        terminalMode?.dispose();
                        terminalMode = null;
                        screen.destroy();
                    }
                }
                catch (err) {
                    // Silently handle cleanup errors
                }
                resolve();
            }
        };
        screen.on('destroy', cleanup);
        if (session.socket) {
            session.socket.once('disconnect', () => {
                cleanup();
            });
        }
    });
}
/**
 * Fetch available doors from BBS API
 */
async function fetchAvailableDoors(bbs, userLevel) {
    if (bbs.getDoorList) {
        const allDoors = await bbs.getDoorList();
        const filtered = allDoors.filter((door) => door.enabled &&
            userLevel >= (door.accessLevel || 0)).map((door) => ({
            id: door.id || door.command,
            command: door.command || door.id,
            name: door.name || door.id,
            description: door.description || '',
            type: door.type || door.doorType || 'AMI',
            size: door.size || 0,
            accessLevel: door.accessLevel || 0,
            category: door.category || undefined
        }));
        return filtered;
    }
    return [];
}
//# sourceMappingURL=app.js.map