"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clip = clip;
exports.menuItems = menuItems;
exports.profileLines = profileLines;
exports.familiesOf = familiesOf;
exports.catalogLines = catalogLines;
exports.leaderboardLines = leaderboardLines;
exports.explain = explain;
exports.footerHints = footerHints;
exports.createApp = createApp;
exports.runDoor = runDoor;
/**
 * ACHIEVE - your achievements, and this board's link to your global profile.
 *
 * One screen, THEME's shape: a masthead, a menu list, a content panel and
 * a footer. The menu is the door; each entry paints the panel. Everything
 * the door knows comes through bbs.achievements(), which the board answers
 * with its own key - the door never holds a credential and never names an
 * address other than the caller's own.
 *
 * The account path is ONE road: register (a code is mailed), enter the
 * code, and the link is made at once with the link code the verify
 * answer carries - the caller types one thing. A player already verified
 * elsewhere walks the same road: register mails a fresh code, and the
 * link code that comes back links THIS board.
 */
const terminal_mode_1 = require("@amiexpress/bbs-door-sdk/utils/terminal-mode");
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const theme_1 = require("@amiexpress/bbs-door-sdk/engines/ui/theme");
const door_input_manager_1 = require("@amiexpress/bbs-door-sdk/utils/door-input-manager");
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
// ---------------------------------------------------------------------------
// Pure builders - what the panel and the menu say, tested at 40 and 80.
// ---------------------------------------------------------------------------
const TIER_TAG = { bronze: 'BRZ', silver: 'SLV', gold: 'GLD', platinum: 'PLT' };
/** Clip to the panel, never fold: a folded row eats the row underneath it. */
function clip(text, width) {
    return text.length > width ? text.slice(0, Math.max(0, width - 1)) + '~' : text;
}
/** The menu, as the state allows. */
function menuItems(state, compact) {
    const short = compact.singleColumn;
    const account = state.kind === 'linked' ? (short ? `Account: ${state.profile.handle}` : `Account: linked as ${state.profile.handle}`)
        : state.kind === 'off' ? 'Account: not available here'
            : (short ? 'Account: link this board' : 'Account: register and link this board');
    return [
        { id: 'profile', label: short ? 'Your achievements' : 'Your achievements and progress' },
        { id: 'catalog', label: short ? 'Catalog' : 'The catalog, by family' },
        { id: 'board', label: short ? 'Board scoreboard' : "This board's scoreboard" },
        { id: 'global', label: short ? 'Global scoreboard' : 'The global scoreboard' },
        { id: 'account', label: account },
        { id: 'quit', label: short ? 'Leave' : 'Leave the door' },
    ];
}
/** The caller's own page: points, every unlock, and what is close. */
function profileLines(p, width) {
    const out = [];
    out.push(clip(`${p.handle}  ${p.points} points  ${p.unlocks.length} unlocked${p.private ? '  (private)' : ''}`, width));
    out.push(clip(`Linked boards: ${p.linkedBoards.join(', ') || 'none'}`, width));
    out.push('');
    if (p.unlocks.length === 0)
        out.push('No achievements yet. Post, upload, call back tomorrow.');
    for (const u of p.unlocks)
        out.push(clip(`[${TIER_TAG[u.tier] ?? u.tier.slice(0, 3).toUpperCase()}] ${u.name}  ${u.points} pts`, width));
    if (p.progress.length > 0) {
        out.push('');
        out.push('Closest:');
        for (const pr of p.progress.slice(0, 10))
            out.push(clip(`  ${pr.id}  ${pr.have}/${pr.need}`, width));
    }
    return out;
}
/** The families in the catalog, in first-seen order. */
function familiesOf(catalog) {
    const seen = [];
    for (const a of catalog.achievements)
        if (!seen.includes(a.family))
            seen.push(a.family);
    return seen;
}
/** The whole catalog grouped by family; a withheld hidden one shows as the server sent it (???). */
function catalogLines(catalog, width, unlocked = new Set()) {
    const out = [];
    for (const family of familiesOf(catalog)) {
        out.push(`== ${family.toUpperCase()} ==`);
        for (const a of catalog.achievements.filter((x) => x.family === family)) {
            const mark = unlocked.has(a.id) ? '*' : ' ';
            const tag = TIER_TAG[a.tier] ?? a.tier.slice(0, 3).toUpperCase();
            const line = width <= 40
                ? `${mark}[${tag}] ${a.name}`
                : `${mark}[${tag}] ${a.name.padEnd(20).slice(0, 20)} ${a.description}`;
            out.push(clip(line, width));
        }
        out.push('');
    }
    return out;
}
function leaderboardLines(lb, width) {
    const out = [];
    const where = lb.scope === 'global' ? 'Global' : 'This board';
    out.push(clip(`${where}, ${lb.period === 'season' ? `season ${lb.season ?? ''}` : 'all time'}`, width));
    out.push('');
    if (lb.rows.length === 0)
        out.push('Nobody on the board yet.');
    for (const r of lb.rows) {
        const handle = width <= 40 ? r.handle.slice(0, 16).padEnd(16) : r.handle.padEnd(20).slice(0, 20);
        out.push(clip(`${String(r.rank).padStart(3)}. ${handle} ${String(r.points).padStart(5)} pts ${String(r.unlocks).padStart(3)}`, width));
    }
    return out;
}
/** A refusal or a fault, in the caller's words. */
function explain(result) {
    switch (result.error) {
        case undefined: return '';
        case 'not_configured': return 'This board has no achievements server configured.';
        case 'not_linked': return 'This board is not linked to your account yet.';
        case 'unverified_player': return 'Verify your address first: enter the mailed code.';
        case 'bad_code': return 'That code is not the one this address is waiting for.';
        case 'code_expired': return 'That code has expired; a new one was requested.';
        case 'code_burned': return 'Too many wrong tries; a new code was requested.';
        case 'handle_taken': return 'That handle belongs to someone else on the server.';
        case 'bad_handle': return 'A handle is 3 to 16 characters, letters and digits.';
        case 'bad_email': return 'That is not an address the server can mail.';
        case 'rate_limited': return 'Too many requests; try again in a minute.';
        case 'unreachable':
        case 'timeout': return 'The achievements server did not answer.';
        case 'not_json': return 'The achievements server is not answering as itself.';
        case 'unauthenticated':
        case 'board_suspended': return 'This board is not accepted by the server (sysop: check the key).';
        default: return result.detail ? clip(result.detail, 70) : `The server said ${result.error}.`;
    }
}
function footerHints(compact, inView) {
    if (inView) {
        return compact.collapseChrome
            ? [{ key: 'Up/Dn', does: 'Scroll' }, { key: 'Q', does: 'Back' }]
            : [{ key: 'Up/Down', does: 'Scroll' }, { key: 'Q', does: 'Back to the menu' }];
    }
    return compact.collapseChrome
        ? [{ key: 'Up/Dn', does: 'Pick' }, { key: 'Ent', does: 'Open' }, { key: 'Q', does: 'Bye' }]
        : [{ key: 'Up/Down', does: 'Choose' }, { key: 'Enter', does: 'Open' }, { key: 'Q', does: 'Leave' }];
}
// ---------------------------------------------------------------------------
// The door
// ---------------------------------------------------------------------------
async function createApp(session) {
    const { bbs } = session;
    const theme = bbs?.getTheme ? bbs.getTheme() : (0, theme_1.themeById)('classic');
    const s = (0, theme_1.themeStyles)(theme);
    const api = bbs?.achievements ? bbs.achievements() : null;
    const screen = (0, blessed_helpers_1.createScreen)(bbs, { title: 'Achievements' });
    const screenWidth = screen.width || 80;
    const screenHeight = screen.height || 24;
    const compact = (0, blessed_1.getCompactProfile)(screenWidth);
    const panelWidth = Math.max(20, screenWidth - 1);
    const terminalMode = (0, terminal_mode_1.createTerminalModeSwitch)({ bbs, screen, start: 'fixed', onRelayout: () => { screen.render(); } });
    const input = new door_input_manager_1.DoorInputManager(session, screen, { enableGameMode: false, enableGrabKeys: false, enableMouse: true });
    input.enable();
    const mastheadRow = (0, blessed_helpers_1.createBox)({
        parent: screen, top: 0, left: 0, width: '100%', height: 1, border: undefined, focusable: false, content: '',
        style: { fg: theme.tokens.dim, bg: theme.tokens.ground },
    });
    let state = api ? (api.enabled() ? { kind: 'unknown' } : { kind: 'off' }) : { kind: 'off' };
    let items = menuItems(state, compact);
    const menuRows = items.length;
    const list = (0, blessed_helpers_1.createList)({
        parent: screen, top: 2, left: 0, width: '100%', height: menuRows,
        keys: true, vi: true, mouse: true, tags: true, border: undefined,
        style: { selected: s.list.style.selected, item: { fg: theme.tokens.dim } },
        items: items.map((i) => ` ${s.ink(i.label)}`),
    });
    const panelTop = 2 + menuRows + 1;
    const panelHeight = Math.max(3, screenHeight - panelTop - 2);
    const panel = (0, blessed_helpers_1.createBox)({
        parent: screen, top: panelTop, left: 0, width: '100%', height: panelHeight,
        border: undefined, focusable: false, tags: false, content: '', style: s.plain.style,
    });
    const noteRow = (0, blessed_helpers_1.createBox)({
        parent: screen, top: screenHeight - 2, left: 0, width: '100%', height: 1, border: undefined, focusable: false,
        content: '', style: s.plain.style,
    });
    const footer = (0, blessed_helpers_1.createBox)({
        parent: screen, bottom: 0, left: 0, width: '100%', height: 1, border: undefined, focusable: false, clickable: false, mouse: false,
        style: (0, theme_1.footerStyle)(theme), content: '',
    });
    let inView = false;
    let viewLines = [];
    let viewOffset = 0;
    const chromeOptions = {
        width: screenWidth, title: 'ACHIEVEMENTS', masthead: mastheadRow, footer: footer,
        hints: footerHints(compact, false), footerPad: ' ', glitch: panel, glitchOptions: { tickMs: 600 }, showcase: true, styles: s,
        render: () => screen.render(),
    };
    let chrome = (0, theme_1.attachDoorChrome)(theme, chromeOptions);
    // The footer only. Re-attaching the whole chrome to change one line put
    // the rail back to frame zero on every Enter (sysop, 2026-09-07).
    const setHints = () => { chrome.setHints(footerHints(compact, inView)); };
    const note = (text) => { noteRow.setContent(`  ${text}`); screen.render(); };
    const paint = () => {
        const rows = viewLines.slice(viewOffset, viewOffset + panelHeight).map((l) => clip(l, panelWidth));
        panel.setContent(rows.join('\n'));
        screen.render();
    };
    const show = (lines) => { viewLines = lines; viewOffset = 0; inView = true; setHints(); paint(); };
    const refreshMenu = () => {
        items = menuItems(state, compact);
        list.setItems(items.map((i) => ` ${s.ink(i.label)}`));
        screen.render();
    };
    /** A prompt, awaited. null when cancelled. */
    const ask = (title, text, value = '') => new Promise((resolve) => {
        // No height: the widget knows what its own children need, and asking
        // for less than that drew the buttons on top of the input field - the
        // `@` of an email address was the first thing they covered.
        const p = new blessed_1.Prompt({
            parent: screen, top: 'center', left: 'center', width: Math.min(screenWidth - 2, 44),
            border: { type: 'line' }, label: ` ${title} `, text, value, tags: false,
        });
        p.showInput(undefined, undefined, (err, v) => {
            // The dialog is finished with; leaving it parented keeps a hidden
            // element with live key handlers on the screen for the whole session.
            try {
                p.destroy?.();
            }
            catch { /* already gone */ }
            list.focus();
            resolve(err || v === undefined ? null : String(v).trim());
        });
    });
    const email = () => (session.user?.email ?? bbs?.getUser?.()?.email ?? '').trim();
    /** What the server says about the caller now; sets the state. */
    const refreshState = async () => {
        if (!api || !api.enabled()) {
            state = { kind: 'off' };
            return;
        }
        const addr = email();
        if (!addr) {
            state = { kind: 'no-email' };
            return;
        }
        const res = await api.profile(addr);
        state = res.status === 200 && res.body ? { kind: 'linked', email: addr, profile: res.body } : { kind: 'not-linked', email: addr };
    };
    /** The one road: address, register, code, verify, link. */
    const account = async () => {
        if (!api || !api.enabled()) {
            show(['This board has no achievements server configured.', 'Ask the sysop.']);
            return;
        }
        let addr = email();
        if (!addr) {
            const typed = await ask('Your email', 'A code will be mailed there.\nAddress:');
            if (!typed)
                return;
            if (!(await bbs.setUserEmail?.(typed))) {
                note(s.alert ? s.alert('That is not an address.') : 'That is not an address.');
                return;
            }
            addr = typed;
        }
        if (state.kind === 'linked') {
            const p = state.profile;
            show([
                `Linked as ${p.handle}.`, '',
                `Profile: ${p.private ? 'private (off the global lists)' : 'public'}`,
                `Boards: ${p.linkedBoards.join(', ')}`, '',
                'P = toggle private   L = link code for another board   U = unlink this board',
            ]);
            return;
        }
        let handle = (session.user?.username ?? 'caller').replace(/[^A-Za-z0-9 ._-]/g, '').slice(0, 16) || 'caller';
        for (;;) {
            const reg = await api.register(addr, handle);
            if (reg.status === 202)
                break;
            if (reg.error === 'handle_taken' || reg.error === 'bad_handle') {
                const next = await ask('Handle', `${explain(reg)}\nPick another handle:`, handle);
                if (!next)
                    return;
                handle = next;
                continue;
            }
            show([explain(reg)]);
            return;
        }
        const code = await ask('Mailed code', `A six-character code was mailed to\n${clip(addr, 40)}\nEnter it:`);
        if (!code)
            return;
        const ver = await api.verify(addr, code);
        if (ver.status !== 200 || !ver.body) {
            show([explain(ver)]);
            return;
        }
        const linkCode = ver.body.linkCode;
        const linked = linkCode ? await api.link(addr, linkCode) : { status: 0, body: null, error: 'bad_code' };
        if (linked.status !== 200) {
            show([explain(linked)]);
            return;
        }
        await refreshState();
        refreshMenu();
        show([`Verified and linked as ${ver.body.handle}.`, 'This board now reports what you do here.', '', 'Your first achievements arrive within a minute.']);
    };
    const open = async (id) => {
        if (!api)
            return;
        switch (id) {
            case 'profile': {
                if (state.kind === 'unknown')
                    await refreshState();
                if (state.kind !== 'linked') {
                    show(['Not linked yet.', '', 'Open Account to register and link this board.']);
                    return;
                }
                const res = await api.profile(state.email);
                if (res.status !== 200 || !res.body) {
                    show([explain(res)]);
                    return;
                }
                state = { kind: 'linked', email: state.email, profile: res.body };
                show(profileLines(res.body, panelWidth));
                return;
            }
            case 'catalog': {
                const res = await api.catalog();
                if (res.status !== 200 || !res.body) {
                    show([explain(res)]);
                    return;
                }
                const mine = new Set(state.kind === 'linked' ? state.profile.unlocks.map((u) => u.id) : []);
                show(catalogLines(res.body, panelWidth, mine));
                return;
            }
            case 'board':
            case 'global': {
                const res = await api.leaderboard(id === 'global' ? 'global' : 'board', 'all', 50);
                if (res.status !== 200 || !res.body) {
                    show([explain(res)]);
                    return;
                }
                show(leaderboardLines(res.body, panelWidth));
                return;
            }
            case 'account':
                await account();
                return;
            default:
                return;
        }
    };
    // The state on entry, so the menu says "linked as" from the first paint.
    try {
        await refreshState();
    }
    catch {
        state = { kind: 'off' };
    }
    refreshMenu();
    list.select(0);
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
            try {
                bbs.write('\x1b[0m\x1b[2J\x1b[H\x1b[?25h');
            }
            catch { /* leaving anyway */ }
            resolve();
        };
        list.on('select', async (_item, index) => {
            const chosen = items[index];
            if (!chosen || chosen.id === 'quit')
                return done();
            try {
                await open(chosen.id);
            }
            catch (err) {
                show([`Something went wrong: ${err.message}`]);
            }
        });
        screen.key(['q', 'Q', 'escape'], () => {
            if (!inView)
                return done();
            inView = false;
            viewLines = [];
            panel.setContent('');
            setHints();
            screen.render();
        });
        screen.key(['up', 'k'], () => { if (inView && viewOffset > 0) {
            viewOffset -= 1;
            paint();
        } });
        screen.key(['down', 'j'], () => { if (inView && viewOffset + panelHeight < viewLines.length) {
            viewOffset += 1;
            paint();
        } });
        screen.key(['p', 'P'], async () => {
            if (!api || state.kind !== 'linked')
                return;
            const res = await api.setPrivate(state.email, !state.profile.private);
            if (res.status === 200 && res.body) {
                state = { kind: 'linked', email: state.email, profile: res.body };
                note(res.body.private ? 'Your profile is private now.' : 'Your profile is public now.');
            }
            else
                note(explain(res));
        });
        screen.key(['l', 'L'], async () => {
            if (!api || state.kind !== 'linked')
                return;
            const code = await ask('Your link code', 'The code from your last link or mail:');
            if (!code)
                return;
            const res = await api.rotate(state.email, code);
            if (res.status === 200 && res.body)
                show([`Your new link code: ${res.body.linkCode}`, `It expires at ${res.body.linkCodeExpiresAt}.`, '', 'Type it at the next board\'s ACHIEVE door.']);
            else
                show([explain(res)]);
        });
        screen.key(['u', 'U'], async () => {
            if (!api || state.kind !== 'linked')
                return;
            const res = await api.unlink(state.email);
            if (res.status === 200) {
                await refreshState();
                refreshMenu();
                show(['This board is unlinked.', 'What you earned stays; nothing new is reported from here.']);
            }
            else
                show([explain(res)]);
        });
    });
}
async function runDoor(bbs, session) {
    await createApp({ ...(session || {}), bbs });
}
exports.default = runDoor;
//# sourceMappingURL=app.js.map