"use strict";
/**
 * Doors Menu - Interactive Door Selection with Categories
 *
 * Displays available doors organized by category with arrow key navigation.
 * Uses SDK blessed helpers (no duplicate code).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
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
async function createApp(session) {
    const { bbs, user } = session;
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
        content: ' DOOR GAMES & UTILITIES ',
        style: {
            fg: 'white',
            bg: 'blue'
        }
    });
    // Create breadcrumb bar
    const breadcrumb = (0, blessed_helpers_1.createBox)({
        parent: screen,
        top: 1,
        left: 0,
        width: '70%',
        height: 1,
        fixed: true,
        focusable: false,
        clickable: false,
        mouse: false,
        border: undefined,
        content: '{cyan-fg}Location:{/cyan-fg} All Doors',
        style: {
            fg: 'cyan',
            bg: 'black'
        }
    });
    // Create type filter display
    const filterDisplay = (0, blessed_helpers_1.createBox)({
        parent: screen,
        top: 1,
        right: 0,
        width: '30%',
        height: 1,
        fixed: true,
        focusable: false,
        clickable: false,
        mouse: false,
        border: undefined,
        content: '{yellow-fg}Filter:{/yellow-fg} ALL',
        style: {
            fg: 'yellow',
            bg: 'black'
        }
    });
    // Create main list
    const mainList = (0, blessed_helpers_1.createList)({
        parent: screen,
        top: 2,
        left: 0,
        width: '100%',
        height: '100%-5',
        keys: true,
        vi: true,
        mouse: true,
        scrollable: true,
        alwaysScroll: true,
        scrollbar: {
            ch: ' ',
            style: {
                bg: 'blue'
            }
        },
        style: {
            selected: {
                bg: 'blue',
                fg: 'white'
            },
            item: {
                fg: 'white'
            }
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
    mainList.on('select item', () => {
        screen.render();
    });
    // Create footer
    const footer = (0, blessed_helpers_1.createBox)({
        parent: screen,
        bottom: 0,
        left: 0,
        width: '100%',
        height: 3,
        fixed: true, // Static footer
        focusable: false,
        clickable: false, // Don't capture mouse events
        mouse: false, // Don't listen for mouse events
        border: {
            type: 'line',
            labelStyle: { fg: 'white', bg: 'blue' } // Blue background for label
        },
        style: {
            fg: 'white',
            border: { fg: 'gray' }
        },
        content: '{yellow-fg}Up/Down:{/yellow-fg} Navigate  {yellow-fg}Enter:{/yellow-fg} Select  {yellow-fg}T:{/yellow-fg} Filter Type  {yellow-fg}Backspace:{/yellow-fg} Back  {yellow-fg}Q:{/yellow-fg} Quit'
    });
    /**
     * Update breadcrumb display
     */
    function updateBreadcrumb() {
        const parts = ['{cyan-fg}Location:{/cyan-fg} All Doors'];
        for (const part of currentPath) {
            parts.push(` {gray-fg}/{/gray-fg} ${part}`);
        }
        if (viewMode === 'doors') {
            parts.push(' {yellow-fg}(viewing doors){/yellow-fg}');
        }
        breadcrumb.setContent(parts.join(''));
    }
    /**
     * Update filter display
     */
    function updateFilterDisplay() {
        const typeColors = {
            'ALL': 'white',
            'XIM': 'green',
            'TS': 'cyan',
            'SIM': 'yellow',
            'PY': 'magenta',
            'RX': 'blue'
        };
        const color = typeColors[currentTypeFilter] || 'white';
        filterDisplay.setContent(`{yellow-fg}Filter:{/yellow-fg} {${color}-fg}${currentTypeFilter}{/${color}-fg}`);
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
            items.push('{gray-fg}[..]{/gray-fg} Back to parent');
        }
        // Add subcategories
        const sortedCategories = Array.from(currentCategory.children.keys()).sort();
        for (const catName of sortedCategories) {
            const child = currentCategory.children.get(catName);
            const doorCount = countDoorsInCategory(child);
            const hasSubcats = child.children.size > 0;
            const icon = hasSubcats ? '{magenta-fg}[+]{/magenta-fg}' : '{green-fg}[>]{/green-fg}';
            items.push(`${icon} {white-fg}${catName.padEnd(25)}{/white-fg} {cyan-fg}(${doorCount} door${doorCount !== 1 ? 's' : ''}){/cyan-fg}`);
        }
        // Add "View All Doors" option if there are doors at this level or children
        const directDoors = currentCategory.doors.length;
        const totalDoors = countDoorsInCategory(currentCategory);
        if (totalDoors > 0) {
            items.push(`{yellow-fg}[*]{/yellow-fg} {white-fg}View All Doors{/white-fg} {cyan-fg}(${totalDoors} total){/cyan-fg}`);
        }
        // If no subcategories, just show doors directly
        if (sortedCategories.length === 0 && directDoors > 0) {
            renderDoorView();
            return;
        }
        mainList.setItems(items);
        mainList.select(0);
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
        items.push('{gray-fg}[..]{/gray-fg} Back to categories');
        // Add doors sorted by name
        const sortedDoors = filteredDoors.sort((a, b) => a.name.localeCompare(b.name));
        for (const door of sortedDoors) {
            const typeLabel = formatType(door.type);
            const sizeLabel = formatSize(door.size);
            items.push(`{yellow-fg}[${typeLabel.padEnd(3)}]{/yellow-fg} {green-fg}${door.command.padEnd(12)}{/green-fg} {white-fg}${door.name.padEnd(25)}{/white-fg} {cyan-fg}${sizeLabel.padStart(8)}{/cyan-fg}`);
        }
        // Show count with filter info
        if (currentTypeFilter !== 'ALL') {
            const filterInfo = `{gray-fg}Showing ${filteredDoors.length} of ${allDoors.length} doors (${currentTypeFilter} only){/gray-fg}`;
            items.push('');
            items.push(filterInfo);
        }
        mainList.setItems(items);
        mainList.select(0);
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
    // Return promise that resolves when screen is destroyed
    return new Promise((resolve) => {
        let resolved = false;
        const cleanup = () => {
            if (!resolved) {
                resolved = true;
                try {
                    if (mainList)
                        mainList.removeAllListeners('select');
                    if (screen) {
                        screen.removeAllListeners('destroy');
                        screen.removeAllListeners('keypress');
                    }
                    if (!screen.destroyed) {
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