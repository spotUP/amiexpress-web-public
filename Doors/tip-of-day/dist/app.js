"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
/**
 * TIP app: gather, pick, show, leave.
 *
 * Sources degrade one by one, never throw: the catalog may be missing
 * (no registry found), the board reads are best-effort (each wrapped),
 * storage may refuse (seen-set stays empty and tips repeat). The worst
 * case is the fallback tip, which is still a tip.
 */
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const theme_1 = require("@amiexpress/bbs-door-sdk/engines/ui/theme");
const door_input_manager_1 = require("@amiexpress/bbs-door-sdk/utils/door-input-manager");
const blessed_helpers_2 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const settings_1 = require("@amiexpress/bbs-door-sdk/settings");
const catalog_1 = require("./catalog");
const layout_1 = require("./layout");
const theme_2 = require("@amiexpress/bbs-door-sdk/engines/ui/theme");
const tips_1 = require("./tips");
const login_optout_1 = require("./login-optout");
const SEEN_KEY = 'seen-tip-ids';
const SEEN_CAP = 200;
/** The curated command lessons. Content lives here, not in settings:
 *  the manifest schema holds flat scalar keys (weights), not lesson
 *  lists - phase 4 can promote these if the sysop wants the pen. */
const BUILTIN_HOWTOS = [
    { id: 'howto-bulls', title: 'Bulletins', body: 'Press B at the menu: board news, file lists, party announcements.', command: 'B' },
    { id: 'howto-quick', title: 'Quick logon', body: 'Answer Q at the ANSI prompt to skip the LOGON screen next time.' },
    { id: 'howto-doors', title: 'Doors menu', body: 'The arrow-key door browser lists every game and tool in one place.' },
    { id: 'howto-achieve', title: 'Achievements', body: 'ACHIEVE shows the catalog, scoreboards, and your global profile link.', command: 'ACHIEVE' },
];
function readSettings() {
    const weights = { door: 5, fact: 3, howto: 2, event: 1 };
    try {
        const v = (0, settings_1.readDoorSettings)(__dirname);
        for (const k of ['door', 'fact', 'howto', 'event']) {
            const n = Number(v[`weight_${k}`]);
            if (Number.isFinite(n) && n >= 0)
                weights[k] = n;
        }
    }
    catch {
        /* defaults stand */
    }
    return { weights, howtos: BUILTIN_HOWTOS };
}
/** Board facts, each read best-effort. A missing method is a missing tip. */
async function gatherFacts(bbs, catalog) {
    const facts = { conferences: [], doorsInstalled: catalog.length };
    try {
        const confs = await bbs.listConferences();
        if (Array.isArray(confs))
            facts.conferences = confs.map((c) => ({ name: String(c.name ?? '') }));
    }
    catch { /* fewer tips */ }
    try {
        if (bbs.getSystemInfo) {
            const info = await bbs.getSystemInfo();
            if (info?.bbsName)
                facts.boardName = String(info.bbsName);
        }
    }
    catch { /* fewer tips */ }
    return facts;
}
async function createApp(session) {
    const { bbs, storage } = session;
    // TIPLOGIN at login, TIP when the caller types it (login-optout.ts).
    let showAtLogin = null;
    try {
        showAtLogin = await storage.load(login_optout_1.SHOW_AT_LOGIN_KEY);
    }
    catch { /* never chosen */ }
    const choice = (0, login_optout_1.loginChoice)(String(session.bbsSession?.doorCommand ?? ''), showAtLogin);
    if (!choice.show)
        return;
    const theme = bbs?.getTheme ? bbs.getTheme() : (0, theme_1.themeById)('classic');
    const t = theme.tokens;
    const catalog = (0, catalog_1.loadDoorCatalog)((0, catalog_1.resolveBoardRoot)(__dirname));
    const { weights, howtos } = readSettings();
    const facts = await gatherFacts(bbs, catalog);
    let seen;
    try {
        const stored = await storage.load(SEEN_KEY);
        seen = new Set(Array.isArray(stored) ? stored : []);
    }
    catch {
        seen = new Set();
    }
    const tip = (0, tips_1.pickTip)(catalog, facts, howtos, seen, weights);
    seen.add(tip.id);
    try {
        await storage.save(SEEN_KEY, [...seen].slice(-SEEN_CAP));
    }
    catch { /* repeats beat a crash */ }
    const screen = (0, blessed_helpers_1.createScreen)(bbs, { title: 'Tip of the day' });
    // Geometry from the live screen, never a constant: the frame in
    // layout.ts grows on wide terminals and stacks borderless at 40.
    const screenWidth = screen.width || 80;
    const frame = (0, layout_1.buildTipFrame)(tip, screenWidth);
    const input = new door_input_manager_1.DoorInputManager(session, screen, {
        enableGameMode: false,
        enableGrabKeys: false,
        enableMouse: false,
    });
    input.enable();
    // Child coordinates are INNER-relative: the SDK adds the parent's border
    // offset itself (element.ts:572-576). The door used to add one on top,
    // which put the hint row on the frame's bottom border at 80 columns
    // (probe 2026-09-13: hint yi=15, border at 15) and one column past the
    // right edge at 40. The frame owns this number now.
    const rows = (0, layout_1.tipBoxRows)(frame);
    const pad = rows.left;
    const box = (0, blessed_helpers_1.createBox)({
        parent: screen,
        top: 'center',
        left: 'center',
        width: frame.frameWidth,
        height: frame.frameHeight,
        border: frame.bordered ? { type: 'line' } : undefined,
        focusable: false,
        content: '',
        style: { fg: t.ink, bg: t.ground, border: { fg: t.chrome } },
    });
    const title = (0, blessed_helpers_1.createBox)({
        parent: box,
        top: rows.title,
        left: pad,
        width: frame.innerWidth,
        height: 1,
        // No border key would default to a bordered Panel (panel.ts:53) and
        // the borders would eat these single-row boxes whole (live
        // 2026-09-11: frame painted, text invisible). Explicit undefined.
        border: undefined,
        content: frame.title,
        style: { fg: t.accent, bg: t.ground },
    });
    void title;
    const body = (0, blessed_helpers_1.createBox)({
        parent: box,
        top: rows.body,
        left: pad,
        width: frame.innerWidth,
        height: frame.body.length,
        border: undefined,
        content: frame.body.join('\n'),
        style: { fg: t.ink, bg: t.ground },
    });
    void body;
    const hint = (0, blessed_helpers_1.createBox)({
        parent: box,
        top: rows.hint,
        left: pad,
        width: frame.innerWidth,
        height: 1,
        border: undefined,
        content: frame.hint,
        style: { fg: t.dim, bg: t.ground },
    });
    void hint;
    screen.render();
    // The board's own chrome, not a hand-rolled rail: masthead with the
    // theme's animated slash rail, footer hints, width-gated by the SDK
    // itself (at 40 columns the masthead is a static title and no timer
    // exists). Replaced a bespoke setInterval rail (2026-09-11: the SDK
    // had attachDoorChrome all along - search first, build never).
    const s = (0, theme_2.themeStyles)(theme);
    const mastheadRow = (0, blessed_helpers_1.createBox)({
        parent: screen,
        top: 0,
        left: 0,
        width: '100%',
        height: 1,
        border: undefined,
        focusable: false,
        content: '',
        style: { fg: t.dim, bg: t.ground },
    });
    const footerRow = (0, blessed_helpers_1.createBox)({
        parent: screen,
        bottom: 0,
        left: 0,
        width: '100%',
        height: 1,
        border: undefined,
        focusable: false,
        clickable: false,
        mouse: false,
        style: (0, theme_2.footerStyle)(theme),
        content: '',
    });
    const chrome = (0, theme_2.attachDoorChrome)(theme, {
        width: screenWidth,
        title: 'TIP OF THE DAY',
        masthead: mastheadRow,
        footer: footerRow,
        hints: choice.hints,
        footerPad: ' ',
        styles: s,
        render: () => screen.render(),
    });
    await new Promise((resolve) => {
        let settled = false;
        const done = () => {
            if (settled)
                return;
            settled = true;
            try {
                chrome.stop();
            }
            catch { /* leaving anyway */ }
            try {
                input.disable();
            }
            catch { /* leaving anyway */ }
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
        const timer = setTimeout(done, 30000);
        const quit = () => {
            clearTimeout(timer);
            done();
        };
        screen.key(['enter', 'space', 'escape', 'q', 'Q'], quit);
        // Ctrl+C and a Ctrl+K palette pick leave through the same quit as Q.
        (0, blessed_helpers_2.honourDoorClose)(session, screen, quit);
        // Any other key also continues: blessed only fires listed keys, so
        // the input manager forwards the rest through the screen's keypress.
        // N / L change the login choice on the way out.
        screen.on('keypress', (_ch, key) => {
            clearTimeout(timer);
            const next = (0, login_optout_1.answerKey)(String(key?.name ?? ''), showAtLogin);
            if (next === undefined) {
                done();
                return;
            }
            // Saved before the door leaves, so the next login reads it.
            storage.save(login_optout_1.SHOW_AT_LOGIN_KEY, next).catch(() => { }).finally(done);
        });
    });
}
//# sourceMappingURL=app.js.map