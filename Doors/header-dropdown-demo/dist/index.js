"use strict";
/**
 * Header Dropdown Demo
 * Inline one-line menu labels with dropdowns (no button widgets).
 */
Object.defineProperty(exports, "__esModule", { value: true });
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
const door = new bbs_door_sdk_1.ServerDoor({
    name: 'Header Dropdown Demo',
    version: '1.0.0',
    author: 'AmiExpress',
    description: 'Header dropdown menu bar demo',
});
door.onStart(async (ctx) => {
    const { bbs } = ctx;
    if (bbs?.disableGameMode) {
        bbs.disableGameMode();
    }
    // 1. Create Screen (using helper for Amiga compatibility & tags)
    const screen = (0, bbs_door_sdk_1.createScreen)(bbs, {
        dockBorders: true,
        title: 'Header Dropdown Demo',
    });
    // 2. Create input manager (dropdown menu door with mouse support)
    const inputManager = new bbs_door_sdk_1.DoorInputManager(ctx, screen, {
        enableGameMode: false, // Menu UI, not a game
        enableGrabKeys: false, // Blessed widgets handle their own input
        enableMouse: true, // Door has dropdown menu mouse support
    });
    // 3. Enable input (handles all input setup automatically)
    inputManager.enable();
    // 4. Setup cleanup on destroy
    screen.on('destroy', () => {
        inputManager.disable();
    });
    // --- UI Construction ---
    // Header Bar (Simple Box, no dockable overhead for speed)
    const header = new bbs_door_sdk_1.Box({
        parent: screen,
        top: 0,
        left: 0,
        width: '100%',
        height: 1, // Single line
        tags: true,
        style: {
            bg: 'blue',
            fg: 'white',
        },
        // No border
    });
    // Status Panel
    const status = (0, bbs_door_sdk_1.createBox)({
        parent: screen,
        top: 1, // Below header
        left: 0,
        width: '100%',
        height: '100%-1', // Fill rest of screen
        label: ' {cyan-fg}Status{/} ',
        style: {
            border: { fg: 'cyan' },
        },
        content: '{gray-fg}Use Tab/Shift+Tab to switch menus, Enter/Space to open, Esc to close.{/gray-fg}',
    });
    const menuSpecs = [
        {
            label: 'File',
            items: [
                { label: 'New' },
                { label: 'Open' },
                { label: 'Save' },
                { label: '─', separator: true },
                { label: 'Exit', action: () => screen.destroy() },
            ],
        },
        {
            label: 'Edit',
            items: [
                { label: 'Undo' },
                { label: 'Redo' },
                { label: 'Copy' },
                { label: 'Paste' },
            ],
        },
        {
            label: 'View',
            items: [
                { label: 'Zoom In' },
                { label: 'Zoom Out' },
                { label: 'Reset Zoom' },
            ],
        },
        {
            label: 'Help',
            items: [
                { label: 'Help Topics' },
                { label: 'About' },
            ],
        },
    ];
    const labelBoxes = [];
    const dropdowns = [];
    let focusedIndex = 0;
    let activeMenuIndex = null;
    const updateStatus = (text) => {
        status.setContent(text);
        screen.render();
    };
    const updateLabelStyles = () => {
        labelBoxes.forEach((box, index) => {
            const focused = index === focusedIndex;
            box.setContent(focused
                ? `{inverse} ${menuSpecs[index].label} {/inverse}`
                : ` ${menuSpecs[index].label} `);
        });
        screen.render();
    };
    const closeActiveMenu = () => {
        if (activeMenuIndex === null)
            return;
        dropdowns[activeMenuIndex].close();
        activeMenuIndex = null;
    };
    const openMenu = (index) => {
        closeActiveMenu();
        activeMenuIndex = index;
        dropdowns[index].openFor(labelBoxes[index]);
    };
    let cursorLeft = 2;
    menuSpecs.forEach((spec, index) => {
        const labelText = ` ${spec.label} `;
        const label = new bbs_door_sdk_1.Box({
            parent: header,
            top: 0, // In single-line header
            left: cursorLeft,
            width: labelText.length,
            height: 1,
            tags: true,
            clickable: true,
            keys: true,
            mouse: true,
            focusable: true,
            style: {
                fg: 'white',
                bg: 'blue',
                hover: { bg: 'cyan', fg: 'black' },
                focus: { bg: 'cyan', fg: 'black' },
            },
            content: labelText,
        });
        label.on('focus', () => {
            focusedIndex = index;
            updateLabelStyles();
        });
        label.on('click', () => {
            focusedIndex = index;
            updateLabelStyles();
            openMenu(index);
        });
        label.on('keypress', (_ch, key) => {
            if (key.name === 'enter' || key.name === 'space' || key.name === 'down') {
                openMenu(index);
                return;
            }
            if (key.name === 'left') {
                focusLabel((index - 1 + labelBoxes.length) % labelBoxes.length);
                return;
            }
            if (key.name === 'right') {
                focusLabel((index + 1) % labelBoxes.length);
                return;
            }
            if (key.name === 'escape') {
                closeActiveMenu();
                return;
            }
        });
        labelBoxes.push(label);
        const dropdown = new bbs_door_sdk_1.DropdownMenu({
            parent: screen,
            label: ` ${spec.label} `,
            items: spec.items.map((item) => ({
                label: item.label,
                separator: item.separator,
                action: () => {
                    if (item.action) {
                        item.action();
                        return;
                    }
                    updateStatus(`{cyan-fg}Selected:{/cyan-fg} ${spec.label} -> ${item.label}`);
                },
            })),
            // Set dropdown style to light blue (cyan)
            style: {
                bg: 'cyan',
                fg: 'black',
                focus: { bg: 'blue', fg: 'white' }
            }
        });
        dropdown.on('select', () => {
            activeMenuIndex = null;
        });
        dropdown.on('tab-next', () => {
            focusLabel((index + 1) % labelBoxes.length);
            openMenu(focusedIndex);
        });
        dropdown.on('tab-prev', () => {
            focusLabel((index - 1 + labelBoxes.length) % labelBoxes.length);
            openMenu(focusedIndex);
        });
        dropdowns.push(dropdown);
        cursorLeft += labelText.length + 1;
    });
    const focusLabel = (index) => {
        focusedIndex = index;
        labelBoxes[focusedIndex].focus();
        updateLabelStyles();
    };
    screen.key(['tab'], () => {
        if (activeMenuIndex !== null)
            return;
        focusLabel((focusedIndex + 1) % labelBoxes.length);
    });
    screen.key(['S-tab'], () => {
        if (activeMenuIndex !== null)
            return;
        focusLabel((focusedIndex - 1 + labelBoxes.length) % labelBoxes.length);
    });
    screen.key(['escape'], () => {
        closeActiveMenu();
    });
    screen.key(['q', 'Q'], () => {
        screen.destroy();
    });
    updateLabelStyles();
    focusLabel(0);
    screen.render();
    // 4. Await Exit (keeps door alive until screen is destroyed)
    await new Promise((resolve) => {
        if (screen.destroyed)
            return resolve();
        screen.on('destroy', resolve);
    });
});
exports.default = door;
