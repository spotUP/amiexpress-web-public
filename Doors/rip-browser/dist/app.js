"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.execute = execute;
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const theme_1 = require("@amiexpress/bbs-door-sdk/engines/ui/theme");
const paths_1 = require("./paths");
/** The caller's colours; every literal here was one of these tokens. */
let T = (0, theme_1.themeById)('classic').tokens;
let S = (0, theme_1.themeStyles)((0, theme_1.themeById)('classic'));
let THEME = (0, theme_1.themeById)('classic');
const RIP_DIR = (0, paths_1.ripGraphicsDir)();
async function execute(session) {
    const { socket, bbsSession, user, params } = session;
    // This door predates the bbs API object - it is handed a socket and a
    // session, not a `bbs`, so `session.bbs.getTheme()` found nothing and it
    // silently stayed on classic while every other door followed the user's
    // choice. Reported as "rip looks totally unstyled".
    //
    // The preference is on the user either way; getTheme() in the backend
    // does exactly this (themeById(user?.themePreference)) and themeById
    // falls back to classic for an absent or unknown value.
    const host = session?.bbs;
    const theme = typeof host?.getTheme === 'function'
        ? host.getTheme()
        : (0, theme_1.themeById)(user?.themePreference ?? user?.themepreference);
    T = theme.tokens;
    S = (0, theme_1.themeStyles)(theme);
    THEME = theme;
    console.log(`[RIP Browser] Starting for user: ${user?.username || 'unknown'}`);
    console.log(`[RIP Browser] Working directory: ${process.cwd()}`);
    // Check if terminal supports Unicode (web terminals do, telnet/Amiga don't)
    const unicodeCapable = bbsSession?.unicodeCapable ?? true; // Default true for web
    // Initialize screen
    const screen = bbs_door_sdk_1.blessed.screen({
        smartCSR: true,
        fullUnicode: unicodeCapable,
        terminal: 'xterm',
        title: 'RIP Graphics Browser',
        width: 80,
        height: 24,
        output: (data) => {
            // Only apply ACS conversion for non-Unicode terminals (Amiga/telnet)
            const output = unicodeCapable ? data : (0, bbs_door_sdk_1.convertUnicodeBoxToACS)(data);
            socket.emit('ansi-output', output);
        }
    });
    console.log('[RIP Browser] Screen initialized');
    // Clear terminal and blessed buffer to wipe previous screen content
    screen.program.write('\x1b[2J');
    screen.program.write('\x1b[H');
    screen.clearRegion(0, screen.width, 0, screen.height);
    screen.alloc();
    // Create input manager (browser door, no game mode needed)
    const inputManager = new bbs_door_sdk_1.DoorInputManager(session, screen, {
        enableGameMode: false, // Browser UI, not a game
        enableGrabKeys: false, // Blessed widgets handle their own input
        enableMouse: true, // List has mouse support
    });
    // Enable input
    inputManager.enable();
    // ========== UI COMPONENTS ========== 
    // ... (rest of the component setup code)
    const mainBox = bbs_door_sdk_1.blessed.box({
        parent: screen,
        width: '100%',
        height: '100%',
        style: {
            bg: T.ground,
            fg: T.ink
        }
    });
    const header = bbs_door_sdk_1.blessed.box({
        parent: mainBox,
        top: 0,
        left: 0,
        width: '100%',
        height: 3,
        content: `\n{center}Use arrows to browse, ENTER to view, Q to quit{/center}`,
        tags: true,
        border: { type: 'ascii' }, // Use ASCII borders to avoid Unicode issues
        style: {
            border: { fg: T.accent }
        }
    });
    // The animated slash rail, on the header's first row. A child box keeps
    // it out of the outer geometry - nothing below moves, and a theme with no
    // rail (classic) gets the plain title it always had.
    const mastheadRow = bbs_door_sdk_1.blessed.box({
        parent: header,
        top: 0,
        left: 0,
        width: '100%-2',
        height: 1,
        tags: true,
        content: '',
        style: S.bar.style,
    });
    const list = bbs_door_sdk_1.blessed.list({
        parent: mainBox,
        top: 3,
        left: 0,
        width: '100%',
        height: '100%-4', // header 3 + footer 1
        keys: true,
        mouse: true,
        vi: true,
        scrollbar: {
            ch: '█',
            track: { ch: '│' },
            style: { fg: T.accent }
        },
        style: {
            selected: {
                bg: T.bar,
                fg: T.ink,
                bold: true
            },
            item: {
                fg: T.ink
            }
        }
    });
    // One row, no frame. A bordered footer reads as a separate panel parked
    // at the bottom; a hint line is the same surface with some text on it.
    const footer = bbs_door_sdk_1.blessed.box({
        parent: mainBox,
        bottom: 0,
        left: 0,
        width: '100%',
        height: 1,
        content: '',
        tags: true,
        border: undefined,
        style: (0, theme_1.footerStyle)(THEME),
    });
    /**
     * The whole chrome, from the ONE SDK call.
     *
     * This door had the rail and the hints and neither the width gate nor the
     * glitches - and its hint line was being OVERWRITTEN by the selected
     * filename, so the keys vanished the moment anyone moved the cursor. The
     * selection is a suffix after the hints now, which is what setFooterSuffix
     * is for.
     */
    const chrome = (0, theme_1.attachDoorChrome)(THEME, {
        width: screen.width || 80,
        title: 'RIP GRAPHICS BROWSER',
        masthead: mastheadRow,
        // Two columns less again: this masthead sits inside a framed header.
        mastheadWidth: Math.max(1, (screen.width || 80) - 3),
        footer: footer,
        hints: [
            { key: 'Arrows', does: 'Navigate' },
            { key: 'Enter', does: 'View' },
            { key: 'F5', does: 'Force View' },
            { key: 'Q', does: 'Quit' },
        ],
        compactHints: [
            { key: 'Arrows', does: 'Move' },
            { key: 'Ent', does: 'View' },
            { key: 'Q', does: 'Quit' },
        ],
        footerPad: ' ',
        // The LIST is the only thing here with rows to spare.
        glitch: list,
        glitchOptions: { tickMs: 400 },
        styles: S,
        render: () => screen.render(),
    });
    // ========== FILE LOADING ========== 
    const loadFiles = async () => {
        console.log(`[RIP Browser] Scanning directory: ${RIP_DIR}`);
        try {
            if (!fs.existsSync(RIP_DIR)) {
                console.error(`[RIP Browser] Directory not found: ${RIP_DIR}`);
                list.setItems(['Error: RIPgraphics directory not found']);
                screen.render();
                return;
            }
            const allFiles = fs.readdirSync(RIP_DIR);
            console.log(`[RIP Browser] Found ${allFiles.length} total files in directory`);
            const ripFiles = allFiles
                .filter(f => f.toLowerCase().endsWith('.rip'))
                .sort();
            console.log(`[RIP Browser] Found ${ripFiles.length} .RIP files`);
            if (ripFiles.length === 0) {
                list.setItems(['No .RIP files found']);
            }
            else {
                list.setItems(ripFiles);
            }
            // Ensure the first item is selected and UI is refreshed
            list.select(0);
            screen.render();
            console.log('[RIP Browser] File list updated and rendered');
        }
        catch (err) {
            console.error(`[RIP Browser] Error loading files: ${err.message}`);
            list.setItems([`Error: ${err.message}`]);
            screen.render();
        }
    };
    // ========== VIEW LOGIC ========== 
    const viewRip = async (filename) => {
        try {
            const filePath = path.join(RIP_DIR, filename);
            // latin1, not utf8: a .RIP file is bytes, and its text commands carry
            // CP437. Read as UTF-8, every high byte became U+FFFD before it ever
            // reached the renderer, which decodes one byte per character.
            const content = fs.readFileSync(filePath, 'latin1');
            // 1. Enter RIP mode AND send content in one go
            // We do NOT call screen.render() here because it would send ANSI text 
            // that the terminal would try to interpret as RIP commands.
            socket.emit('ansi-output', '\x1b[1!' + content);
            // 2. Wait for a keypress to return.
            //
            // NOT the one that got us here. Enter on the list fires 'select',
            // which calls this - and blessed then delivers that same Enter to
            // whatever is listening, so a listener attached right now resolves
            // immediately and the picture is gone within a frame. Reported as
            // "rip opens a window border for 1 frame and close again when i press
            // enter on an image".
            //
            // The listener goes on after a beat, so the keystroke that opened the
            // image cannot also close it. Same fault the sprite editor's dialogs
            // had ("a dialog no longer eats the keystroke that opened it").
            await new Promise(resolve => setTimeout(resolve, 150));
            await new Promise(resolve => {
                screen.once('keypress', () => resolve());
            });
            // 3. Exit RIP mode
            socket.emit('ansi-output', '\x1b[2!');
            // 4. Force a full redraw of the browser UI now that we are back in text mode
            screen.render();
        }
        catch (err) {
            chrome.setFooterSuffix(`  {${T.alert}-fg}Error: ${err.message}{/${T.alert}-fg}`);
            screen.render();
        }
    };
    // ========== EVENT HANDLERS ========== 
    list.on('select item', (item) => {
        // Handle both string items and objects with content
        const filename = (typeof item === 'string' ? item : item.content || '').trim();
        // A suffix, not a replacement - the key hints stay on the row.
        chrome.setFooterSuffix(`  Selected: {${T.warn}-fg}${filename}{/${T.warn}-fg}`);
        screen.render();
    });
    list.on('select', (item) => {
        const filename = (typeof item === 'string' ? item : item.content || '').trim();
        console.log(`[RIP Browser] Item selected: "${filename}"`);
        if (filename.toLowerCase().endsWith('.rip')) {
            console.log(`[RIP Browser] Opening RIP viewer for: ${filename}`);
            viewRip(filename);
        }
        else {
            console.log(`[RIP Browser] Ignored selection (not a .rip file)`);
        }
    });
    screen.key(['f5'], () => {
        const item = list.getItem(list.selected);
        const filename = (typeof item === 'string' ? item : item?.content || '').trim();
        if (filename.toLowerCase().endsWith('.rip')) {
            console.log(`[RIP Browser] Force View triggered for: ${filename}`);
            // Manually notify terminal to enter RIP mode via dedicated event
            socket.emit('rip-mode', { enabled: true });
            viewRip(filename);
        }
    });
    screen.key(['q', 'C-c', 'escape'], () => {
        // Stop the chrome first: a timer writing to a destroyed screen is how
        // a door takes the session with it, and stop() also puts back any row a
        // glitch was in the middle of damaging.
        try {
            chrome.stop();
        }
        catch { /* leaving anyway */ }
        screen.destroy();
        if (session.close) {
            session.close();
        }
    });
    // ========== INITIALIZATION ========== 
    // Use a slight delay to ensure screen dimensions are ready before loading
    setTimeout(() => {
        loadFiles();
        list.focus();
        console.log('[RIP Browser] Initial layout complete, rendering...');
        screen.render();
    }, 100);
    // Return promise that resolves when screen is destroyed
    return new Promise((resolve) => {
        console.log('[RIP Browser] Entering event loop promise');
        screen.on('destroy', () => {
            console.log('[RIP Browser] Screen destroyed, resolving promise');
            inputManager.disable();
            resolve();
        });
    });
}
//# sourceMappingURL=app.js.map