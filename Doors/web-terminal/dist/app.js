"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startWebTerminal = startWebTerminal;
exports.createApp = createApp;
exports.runDoor = runDoor;
/**
 * WEBTERM - the web terminal settings of W (internal rows 17-22).
 *
 * One list, SDK widgets only (door-three-screens): modem speed, terminal font,
 * PETSCII 80 colours, PETSCII character set, view my data, delete my account.
 * Everything comes from, and goes to, the board through the nine BBSApi
 * methods; the door holds no rule of its own (the erasure checks, the five
 * refused passwords, what a font may be on a PETSCII screen are the board's).
 *
 * Repaint: a changed value sets only the list lines that differ; a view change
 * swaps the list once.
 */
const terminal_mode_1 = require("@amiexpress/bbs-door-sdk/utils/terminal-mode");
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const theme_1 = require("@amiexpress/bbs-door-sdk/engines/ui/theme");
const door_input_manager_1 = require("@amiexpress/bbs-door-sdk/utils/door-input-manager");
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
const layout_1 = require("./layout");
const HINTS = [{ key: 'Up/Down', does: 'Move' }, { key: 'Enter', does: 'Change' }, { key: 'Esc', does: 'Back' }];
const COMPACT_HINTS = [{ key: 'Enter', does: 'Change' }, { key: 'Esc', does: 'Back' }];
const DATA_HINTS = [{ key: 'Up/Down', does: 'Scroll' }, { key: 'Esc', does: 'Back' }];
async function startWebTerminal(session) {
    const { bbs } = session;
    const theme = bbs?.getTheme ? bbs.getTheme() : (0, theme_1.themeById)('classic');
    const s = (0, theme_1.themeStyles)(theme);
    const screen = (0, blessed_helpers_1.createScreen)(bbs, { title: 'Web terminal' });
    const width = screen.width || 80;
    const height = screen.height || 24;
    const compact = (0, blessed_1.getCompactProfile)(width);
    const rowWidth = Math.max(20, width - 1);
    const terminalMode = (0, terminal_mode_1.createTerminalModeSwitch)({ bbs, screen, start: 'fixed', onRelayout: () => { screen.render(); } });
    const input = new door_input_manager_1.DoorInputManager(session, screen, {
        enableGameMode: false, enableGrabKeys: false, enableMouse: true,
        // Ctrl+C and a Ctrl+K palette pick leave through the door's own leave().
        onClose: () => leaveNow(),
    });
    input.enable();
    const statusRows = compact.collapseChrome ? 1 : 2;
    const masthead = (0, blessed_helpers_1.createBox)({
        parent: screen, top: 0, left: 0, width: '100%', height: 1, border: undefined, focusable: false, content: '',
        style: { fg: theme.tokens.dim, bg: theme.tokens.ground },
    });
    const list = (0, blessed_helpers_1.createList)({
        parent: screen, top: 1, left: 0, width: '100%', height: Math.max(3, height - 2 - statusRows),
        keys: false, vi: false, mouse: true, tags: true, border: undefined,
        style: { selected: s.list.style.selected, item: { fg: theme.tokens.dim } }, items: [],
    });
    // This door binds its own keys (it moves by row, not by line).
    (0, blessed_helpers_1.borrowListKeys)(list);
    const statusBox = (0, blessed_helpers_1.createBox)({
        parent: screen, top: height - 1 - statusRows, left: 0, width: '100%', height: statusRows, border: undefined,
        focusable: false, tags: false, content: '', style: s.plain.style,
    });
    const footer = (0, blessed_helpers_1.createBox)({
        parent: screen, bottom: 0, left: 0, width: '100%', height: 1, border: undefined, focusable: false, clickable: false, mouse: false,
        style: (0, theme_1.footerStyle)(theme), content: '',
    });
    const chrome = (0, theme_1.attachDoorChrome)(theme, {
        width, title: 'WEB TERMINAL', masthead: masthead, footer: footer,
        hints: HINTS, compactHints: COMPACT_HINTS, footerPad: ' ', styles: s, render: () => screen.render(),
    });
    let state = bbs.webTerminalSettings();
    let painted = [];
    /** Which row each list line belongs to (two lines a row at 40). */
    let owner = [];
    let view = 'rows';
    let noteText = '';
    let stopped = false;
    let leaveNow = () => { };
    let endNow = () => { };
    const note = (text) => { noteText = text; statusBox.setContent((0, layout_1.clip)(` ${text}`, rowWidth)); screen.render(); };
    const linesNow = () => {
        const lines = [];
        const own = [];
        for (const r of layout_1.ROWS)
            for (const l of (0, layout_1.rowLines)(r.id, state, width)) {
                lines.push(l);
                own.push(r.id);
            }
        return { lines, owner: own };
    };
    const setBody = (items, at = 0) => { painted = items.slice(); list.setItems(items); list.scrollTo?.(0); list.select(at); screen.render(); };
    const showRows = (at = 0) => { view = 'rows'; chrome.setHints(compact.collapseChrome ? COMPACT_HINTS : HINTS); const v = linesNow(); owner = v.owner; setBody(v.lines, at); };
    /** A value changed: re-read the board's state and set only the lines that differ. */
    const refresh = () => {
        state = bbs.webTerminalSettings();
        const v = linesNow();
        v.lines.forEach((text, i) => { if (painted[i] !== text) {
            painted[i] = text;
            list.setItem(i, text);
        } });
        screen.render();
    };
    const selected = () => Math.max(0, Number(list.selected ?? 0));
    const ask = (title, text, value = '', censor = false) => new Promise((resolve) => {
        const p = new blessed_1.Prompt({
            parent: screen, top: 'center', left: 'center', width: Math.min(width - 2, 44),
            border: { type: 'line' }, label: ` ${title} `, text, value, tags: false, censor,
        });
        p.showInput(undefined, undefined, (err, v) => {
            try {
                p.destroy?.();
            }
            catch { /* already gone */ }
            if (!stopped)
                list.focus();
            resolve(err || v === undefined ? null : String(v));
        });
    });
    const pick = async (title, choices) => {
        const typed = await ask(title, choices.map((c, i) => `${i + 1}> ${c}`).join('\n') + '\nNumber:');
        const n = typed === null ? NaN : parseInt(typed, 10);
        return Number.isInteger(n) && n >= 1 && n <= choices.length ? n - 1 : null;
    };
    const act = async (id) => {
        switch (id) {
            case 'modem': {
                const i = await pick('Modem emulation speed', bbs.modemSpeedChoices());
                if (i !== null && await bbs.chooseModemSpeed(i))
                    refresh();
                return;
            }
            case 'font': {
                if (state.fontFixedNotice) {
                    note(state.fontFixedNotice);
                    return;
                }
                const fonts = bbs.terminalFontChoices();
                const i = await pick('Terminal font', fonts.map(f => f.label));
                if (i !== null) {
                    const r = await bbs.chooseTerminalFont(fonts[i].id);
                    refresh();
                    if (r === 'petscii')
                        note(state.fontFixedNotice);
                }
                return;
            }
            case 'palette':
                await bbs.togglePetsciiPalette();
                refresh();
                return;
            case 'charset': {
                const r = await bbs.togglePetsciiCharset();
                refresh();
                note(r.notice);
                return;
            }
            case 'data':
                view = 'data';
                chrome.setHints(DATA_HINTS);
                setBody((0, layout_1.dataLines)(bbs.myData(), width));
                note('Up and Down scroll. Esc returns to the list.');
                return;
            case 'erase': {
                const confirm = await ask('Delete my account', 'This cannot be undone. Type YES ERASE to continue:');
                if (confirm === null)
                    return;
                const password = await ask('Delete my account', 'Your password:', '', true);
                if (password === null)
                    return;
                const username = await ask('Delete my account', 'Your username, to confirm:');
                if (username === null)
                    return;
                const answers = { confirm, password, username };
                const checked = await bbs.eraseMyAccount(answers, { check: true });
                if (!checked.ok) {
                    note(checked.reason);
                    return;
                }
                // The board writes the erasure lines and drops the line; the door
                // clears its screen first, reads nothing of the user afterwards and
                // holds execute() open until the board has finished (the settings
                // resume runs when it resolves).
                leaveNow(false);
                try {
                    const done = await bbs.eraseMyAccount(answers);
                    // The check passed a moment ago; a refusal now (the session moved on)
                    // must not end on a blank screen: say why, then end.
                    if (!done.ok)
                        bbs.write(`\r\n${done.reason}\r\n`);
                }
                finally {
                    endNow();
                }
                return;
            }
        }
    };
    const finished = new Promise((resolve) => {
        const leave = (end = true) => {
            if (stopped)
                return;
            stopped = true;
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
            try {
                bbs.write('\x1b[0m\x1b[2J\x1b[H\x1b[?25h');
            }
            catch { /* leaving anyway */ }
            if (end)
                resolve();
        };
        leaveNow = leave;
        endNow = resolve;
        const guard = (fn) => async () => {
            try {
                await fn();
            }
            catch (err) {
                if (!stopped)
                    note(`Something went wrong: ${err.message}`);
            }
        };
        const activate = guard(async () => { if (view === 'rows')
            await act(owner[selected()]); });
        list.on('select', activate);
        screen.key(['enter', 'space'], activate);
        /** Move by ROW, not by line: at 40 a row is two lines and the value line is not a stop. */
        const move = (by) => guard(() => {
            if (view === 'data') {
                // Page-wise: the list does not follow a key on its own (keys are off).
                const page = Math.max(1, list.height - 2);
                const last = Math.max(0, painted.length - 1);
                const to = Math.min(Math.max(selected() + by * page, 0), last);
                if (to !== selected())
                    list.select(to);
                screen.render();
                return;
            }
            const here = owner[selected()];
            const order = layout_1.ROWS.map(r => r.id);
            const next = order[Math.min(Math.max(order.indexOf(here) + by, 0), order.length - 1)];
            const to = owner.indexOf(next);
            if (to !== selected())
                list.select(to);
            screen.render();
        });
        screen.key(['up'], move(-1));
        screen.key(['down'], move(1));
        screen.key(['escape', 'q', 'Q'], guard(() => { if (view === 'data') {
            showRows(owner.indexOf('data'));
            note('');
            return;
        } leave(); }));
    });
    showRows();
    list.focus();
    screen.render();
    return { rows: () => painted.slice(), visible: () => { const at = Number(list.getScroll?.() ?? 0); return painted.slice(at, at + Number(list.height)); }, note: () => noteText, stop: () => { leaveNow(); }, done: finished };
}
async function createApp(session) {
    const door = await startWebTerminal(session);
    await door.done;
}
async function runDoor(bbs, session) {
    await createApp({ ...(session || {}), bbs });
}
exports.default = runDoor;
//# sourceMappingURL=app.js.map