"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startNotify = startNotify;
exports.createApp = createApp;
exports.runDoor = runDoor;
/**
 * NOTIFY - choose how the board reaches you.
 *
 * Three views, one model, SDK widgets only (door-three-screens):
 *
 *   Events    a row per event the caller may receive; Email / Push / Board
 *             cells in full words, Left/Right pick the channel, Space cycles
 *             it, Enter opens the event.
 *   Detail    the three channels one per row; for a file event, the
 *             conferences the caller may follow.
 *   Delivery  email address and its verification, push, quiet hours, time
 *             zone, digest, pause, a test.
 *
 * Everything the door knows comes through bbs.notifications(), which acts on
 * the session's own user. The door holds no table, no address of anyone else
 * and no credential. Repaint: a cursor move or a cell change sets the content
 * of the rows that changed and nothing else (the blessed screen then writes
 * only changed cells); a view change swaps the list once.
 */
const terminal_mode_1 = require("@amiexpress/bbs-door-sdk/utils/terminal-mode");
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const theme_1 = require("@amiexpress/bbs-door-sdk/engines/ui/theme");
const door_input_manager_1 = require("@amiexpress/bbs-door-sdk/utils/door-input-manager");
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
const notify_1 = require("@amiexpress/bbs-door-sdk/formats/notify");
const layout_1 = require("./layout");
async function startNotify(session) {
    const { bbs } = session;
    const theme = bbs?.getTheme ? bbs.getTheme() : (0, theme_1.themeById)('classic');
    const s = (0, theme_1.themeStyles)(theme);
    const api = bbs?.notifications ? bbs.notifications() : null;
    const screen = (0, blessed_helpers_1.createScreen)(bbs, { title: 'Notifications' });
    const width = screen.width || 80;
    const height = screen.height || 24;
    const compact = (0, blessed_1.getCompactProfile)(width);
    const plan = (0, layout_1.columnPlan)(width);
    const rowWidth = Math.max(20, width - 1);
    const terminalMode = (0, terminal_mode_1.createTerminalModeSwitch)({ bbs, screen, start: 'fixed', onRelayout: () => { screen.render(); } });
    const input = new door_input_manager_1.DoorInputManager(session, screen, {
        enableGameMode: false, enableGrabKeys: false, enableMouse: true,
        // Ctrl+C and a Ctrl+K palette pick leave through the door's own leave().
        onClose: () => leaveNow(),
    });
    input.enable();
    // Rows: masthead, [column heads], body, status (2 rows; 1 at 40), footer.
    const headRows = plan.compact ? 0 : 1;
    const statusRows = compact.collapseChrome ? 1 : 2;
    const bodyTop = 1 + headRows;
    const bodyHeight = Math.max(3, height - bodyTop - statusRows - 1);
    const mastheadRow = (0, blessed_helpers_1.createBox)({
        parent: screen, top: 0, left: 0, width: '100%', height: 1, border: undefined, focusable: false, content: '',
        style: { fg: theme.tokens.dim, bg: theme.tokens.ground },
    });
    const headRow = (0, blessed_helpers_1.createBox)({
        parent: screen, top: 1, left: 0, width: '100%', height: 1, border: undefined, focusable: false, tags: true, content: '',
        style: { fg: theme.tokens.dim, bg: theme.tokens.ground },
    });
    const list = (0, blessed_helpers_1.createList)({
        parent: screen, top: bodyTop, left: 0, width: '100%', height: bodyHeight,
        keys: false, vi: false, mouse: true, tags: true, border: undefined,
        style: { selected: s.list.style.selected, item: { fg: theme.tokens.dim } },
        items: [],
    });
    // createList turns the list's own keys on whatever is asked; this door binds
    // its own (the list jumps on letters and reads Space as Enter), so they are
    // taken off for good and never given back.
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
        width, title: 'NOTIFICATIONS', masthead: mastheadRow, footer: footer,
        hints: layout_1.HINTS, compactHints: layout_1.COMPACT_HINTS, footerPad: ' ', styles: s, render: () => screen.render(),
    });
    // ------------------------------------------------------------ the model
    let cat = { events: [], deliverable: { email: false, push: false, board: true }, conferences: [], boardZone: 'UTC' };
    let state = null;
    let rows = [];
    let view = 'events';
    let active = 'email';
    let openEvent = 0;
    let noteText = '';
    let painted = [];
    /** The Delivery view's row ids, in order. */
    let deliveryIds = [];
    let stopped = false;
    let leaveNow = () => { };
    const selected = () => Math.max(0, Number(list.selected ?? 0));
    const web = () => (bbs?.connectionType ?? 'web') === 'web';
    const note = (text) => {
        noteText = text;
        refreshStatus();
        screen.render();
    };
    const refreshStatus = () => {
        const lines = [];
        if (view === 'events' && rows[selected()] && !compact.collapseChrome) {
            const r = rows[selected()];
            lines.push((0, layout_1.clip)(` ${r.label}${r.blurb ? ': ' + r.blurb : ''}`, rowWidth));
        }
        lines.push((0, layout_1.clip)(` ${noteText}`, rowWidth));
        statusBox.setContent(lines.slice(-statusRows).join('\n'));
    };
    /** Replace what the list shows: a real view change, so one swap. */
    const setBody = (items, at = 0) => {
        painted = items.slice();
        list.setItems(items);
        list.select(Math.min(at, Math.max(0, items.length - 1)));
        refreshStatus();
        screen.render();
    };
    /** Change one row. Nothing else is touched. */
    const setRow = (i, text) => {
        if (painted[i] === text)
            return;
        painted[i] = text;
        list.setItem(i, text);
    };
    const eventText = (i) => (0, layout_1.eventRowText)(rows[i], plan, i === selected() && view === 'events' ? active : undefined);
    const repaintEvent = (i) => { if (rows[i])
        setRow(i, eventText(i)); };
    const detailItems = () => {
        const r = rows[openEvent];
        const items = (0, layout_1.detailRows)(r, rowWidth, undefined);
        if (r.followsConference)
            items.push((0, layout_1.clip)(' Conferences you follow:', rowWidth), ...(0, layout_1.followRows)(cat.conferences, state?.follows ?? [], rowWidth));
        return items;
    };
    const settingsRows = () => (0, layout_1.deliveryRows)({
        address: state?.email.address ?? null, verified: state?.email.verified ?? false,
        emailDeliverable: cat.deliverable.email, pushDeliverable: cat.deliverable.push, pushBrowsers: state?.pushBrowsers ?? 0, web: web(),
        settings: state.settings, boardZone: cat.boardZone,
    }, rowWidth);
    const show = (next) => {
        view = next;
        if (next === 'events') {
            headRow.setContent((0, layout_1.headerText)(plan));
            setBody(rows.map((_, i) => (0, layout_1.eventRowText)(rows[i], plan, undefined)), openEvent);
            repaintEvent(selected());
        }
        else if (next === 'detail') {
            headRow.setContent(headRows ? ` ${rows[openEvent].label}` : '');
            setBody(detailItems(), 0);
        }
        else if (next === 'delivery') {
            headRow.setContent(headRows ? ' Delivery' : '');
            const r = settingsRows();
            deliveryIds = r.map((x) => x.id);
            setBody(r.map((x) => x.text), 0);
        }
        else {
            headRow.setContent(headRows ? ' Help' : '');
            setBody(layout_1.HELP_LINES.map((l) => (0, layout_1.clip)(` ${l}`, rowWidth)), 0);
        }
        screen.render();
    };
    /** Re-read the caller's state; used on entry and after a refused save. */
    const load = async () => {
        if (!api)
            return false;
        cat = await api.catalogue();
        state = await api.get();
        rows = (0, layout_1.buildEventRows)(cat.events, state.prefs, cat.deliverable);
        return true;
    };
    /** Write the model back. A refusal is shown and the model reloaded, so the screen never lies. */
    const save = async (settings = state.settings) => {
        const res = await api.set((0, layout_1.prefsFromRows)(rows), settings);
        if (res.ok) {
            state = res.state;
            return true;
        }
        note(res.error);
        await load();
        return false;
    };
    // ------------------------------------------------------------ actions
    /** A prompt, awaited. null when cancelled. */
    const ask = (title, text, value = '') => new Promise((resolve) => {
        const p = new blessed_1.Prompt({
            parent: screen, top: 'center', left: 'center', width: Math.min(width - 2, 44),
            border: { type: 'line' }, label: ` ${title} `, text, value, tags: false,
        });
        p.showInput(undefined, undefined, (err, v) => {
            try {
                p.destroy?.();
            }
            catch { /* already gone */ }
            list.focus();
            resolve(err || v === undefined ? null : String(v).trim());
        });
    });
    const cycleCell = async (i, channel) => {
        const r = rows[i];
        if (!r)
            return;
        const cell = r.cells[channel];
        if (cell === 'na') {
            note(r.why[channel] ?? 'That is not available.');
            return;
        }
        const before = cell;
        r.cells[channel] = (0, notify_1.nextMode)(cell);
        if (view === 'events')
            repaintEvent(i);
        else
            setRow(layout_1.CHANNELS.indexOf(channel), (0, layout_1.detailRows)(r, rowWidth)[layout_1.CHANNELS.indexOf(channel)]);
        screen.render();
        if (!(await save())) {
            r.cells[channel] = before;
            show(view);
        }
        else
            note(`${r.label}: ${layout_1.CHANNEL_WORD[channel]} ${r.cells[channel] === 'off' ? 'is off' : 'is ' + String(r.cells[channel])}.`);
    };
    const toggleFollow = async (conferenceIndex) => {
        const c = cat.conferences[conferenceIndex];
        if (!c || !state)
            return;
        const next = state.follows.includes(c.id) ? state.follows.filter((x) => x !== c.id) : [...state.follows, c.id];
        const res = await api.follow(next);
        if (!res.ok) {
            note(res.error);
            return;
        }
        state = { ...state, follows: res.follows };
        setRow(3 + 1 + conferenceIndex, (0, layout_1.followRows)(cat.conferences, state.follows, rowWidth)[conferenceIndex]);
        screen.render();
    };
    const verifyAddress = async () => {
        if (!cat.deliverable.email) {
            note('Email is not set up on this board.');
            return;
        }
        let address = state.email.address;
        const typed = await ask('Email address', 'A code will be mailed there.\nAddress:', address ?? '');
        if (!typed)
            return;
        if (typed.toLowerCase() !== (address ?? '').toLowerCase()) {
            if (!(await bbs.setUserEmail?.(typed))) {
                note('That is not an address.');
                return;
            }
            address = typed;
        }
        else if (state.email.verified) {
            note('That address is already verified.');
            return;
        }
        const sent = await api.startEmailVerification();
        if (!sent.ok) {
            note(`${(0, layout_1.explainVerify)(sent.reason)}${sent.error ? ' ' + sent.error : ''}`);
            await load();
            show('delivery');
            return;
        }
        for (;;) {
            const code = await ask('Mailed code', `A six digit code was mailed to\n${(0, layout_1.clip)(sent.email, 40)}\nEnter it:`);
            if (!code)
                break;
            const done = await api.confirmEmail(code);
            if (done.ok) {
                note('Address verified.');
                break;
            }
            note((0, layout_1.explainVerify)(done.reason, done.attemptsLeft));
            if (done.reason !== 'wrong')
                break;
        }
        await load();
        show('delivery');
    };
    const editQuiet = async () => {
        const typed = await ask('Quiet hours', `Now: ${(0, layout_1.quietWords)(state.settings)}\nFrom and to (22:00 to 07:00), or none:`);
        if (typed === null)
            return;
        const parsed = (0, layout_1.parseQuiet)(typed);
        if (!parsed.ok) {
            note(parsed.error);
            return;
        }
        if (await save({ ...state.settings, ...parsed.value }))
            show('delivery');
    };
    const editZone = async () => {
        const typed = await ask('Time zone', `Now: ${state.settings.timeZone ?? cat.boardZone + ' (board)'}\nZone (Europe/Stockholm), or blank:`);
        if (typed === null)
            return;
        if (await save({ ...state.settings, timeZone: typed === '' ? null : typed }))
            show('delivery');
    };
    const editDigest = async () => {
        const typed = await ask('Digest', `Now: ${(0, layout_1.digestWords)(state.settings)}\ndaily 8, or weekly monday 18:`);
        if (typed === null)
            return;
        const parsed = (0, layout_1.parseDigest)(typed);
        if (!parsed.ok) {
            note(parsed.error);
            return;
        }
        if (await save({ ...state.settings, ...parsed.value }))
            show('delivery');
    };
    const sendTest = async () => {
        const fallback = state.email.verified && cat.deliverable.email ? 'email' : 'board';
        const typed = await ask('Send a test', 'Which channel? email or board:', fallback);
        if (!typed)
            return;
        const channel = typed.toLowerCase();
        if (!layout_1.CHANNELS.includes(channel)) {
            note('Type email, push or board.');
            return;
        }
        const res = await api.test(channel);
        note(res.ok ? res.detail : res.error);
    };
    /** Enter on the Push row: subscribe this browser, or stop push to every browser of the caller. */
    const togglePush = async () => {
        if (!web()) {
            note('Push needs the web terminal.');
            return;
        }
        if (!cat.deliverable.push) {
            note('Push is not set up on this board.');
            return;
        }
        const turnOff = (state?.pushBrowsers ?? 0) > 0;
        if (!turnOff)
            note('Allow notifications in your browser when it asks.');
        const res = turnOff ? await api.disablePush() : await api.enablePush();
        await load();
        show('delivery');
        note(res.ok ? res.detail : res.error);
    };
    const pickDelivery = async (id) => {
        switch (id) {
            case 'email':
                await verifyAddress();
                return;
            case 'push':
                await togglePush();
                return;
            case 'quiet':
                await editQuiet();
                return;
            case 'zone':
                await editZone();
                return;
            case 'digest':
                await editDigest();
                return;
            case 'pause':
                if (await save({ ...state.settings, paused: !state.settings.paused })) {
                    show('delivery');
                    note(state.settings.paused ? 'Everything is paused.' : 'Notifications resumed.');
                }
                return;
            case 'test':
                await sendTest();
                return;
        }
    };
    // ------------------------------------------------------------ keys
    const finished = new Promise((resolve) => {
        const leave = () => {
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
            resolve();
        };
        leaveNow = leave;
        const guard = (fn) => async () => {
            try {
                await fn();
            }
            catch (err) {
                note(`Something went wrong: ${err.message}`);
            }
        };
        const back = () => {
            if (view === 'events') {
                leave();
                return;
            }
            show('events');
        };
        list.on('select item', (_item, index) => {
            if (view !== 'events') {
                refreshStatus();
                return;
            }
            // The old row loses its inverse cell, the new one gains it; no other row is touched.
            for (let i = 0; i < rows.length; i++)
                if (i !== index)
                    repaintEvent(i);
            repaintEvent(index);
            refreshStatus();
            screen.render();
        });
        // The list's own keys are off: it jumps on letters and turns Space into
        // Enter, and this door gives both meanings of its own.
        const activate = guard(async () => {
            const i = selected();
            if (view === 'events') {
                openEvent = i;
                show('detail');
                return;
            }
            if (view === 'delivery') {
                await pickDelivery(deliveryIds[i]);
                return;
            }
            if (view === 'detail')
                await actDetail(i);
        });
        list.on('select', activate);
        screen.key(['enter'], activate);
        const move = (by) => guard(() => {
            const to = Math.min(Math.max(selected() + by, 0), Math.max(0, painted.length - 1));
            if (to !== selected())
                list.select(to);
            screen.render();
        });
        screen.key(['up'], move(-1));
        screen.key(['down'], move(1));
        screen.key(['pageup'], move(-10));
        screen.key(['pagedown'], move(10));
        const actDetail = async (i) => {
            if (i < 3) {
                await cycleCell(openEvent, layout_1.CHANNELS[i]);
                return;
            }
            if (i >= 4)
                await toggleFollow(i - 4);
        };
        screen.key(['escape', 'x', 'X', 'q', 'Q'], guard(back));
        screen.key(['left'], guard(() => {
            if (view !== 'events')
                return;
            active = layout_1.CHANNELS[(layout_1.CHANNELS.indexOf(active) + layout_1.CHANNELS.length - 1) % layout_1.CHANNELS.length];
            repaintEvent(selected());
            screen.render();
        }));
        screen.key(['right'], guard(() => {
            if (view !== 'events')
                return;
            active = layout_1.CHANNELS[(layout_1.CHANNELS.indexOf(active) + 1) % layout_1.CHANNELS.length];
            repaintEvent(selected());
            screen.render();
        }));
        screen.key(['space'], guard(async () => {
            if (view === 'events')
                await cycleCell(selected(), active);
            else if (view === 'detail')
                await actDetail(selected());
            else if (view === 'delivery' && deliveryIds[selected()] === 'pause')
                await pickDelivery('pause');
        }));
        screen.key(['f1', '?', 'h', 'H'], guard(() => show('help')));
        screen.key(['f2', 'a', 'A'], guard(() => { show('delivery'); }));
        screen.key(['f3'], guard(async () => { show('delivery'); await editQuiet(); }));
        screen.key(['f4', 't', 'T'], guard(sendTest));
    });
    // ------------------------------------------------------------ start
    if (!api) {
        noteText = 'This board has no notification service.';
        show('help');
    }
    else {
        await load();
        show('events');
        list.focus();
    }
    refreshStatus();
    screen.render();
    return {
        rows: () => painted.slice(),
        view: () => view,
        note: () => noteText,
        stop: () => { leaveNow(); },
        done: finished,
    };
}
async function createApp(session) {
    const door = await startNotify(session);
    await door.done;
}
async function runDoor(bbs, session) {
    await createApp({ ...(session || {}), bbs });
}
exports.default = runDoor;
//# sourceMappingURL=app.js.map