"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const theme_1 = require("@amiexpress/bbs-door-sdk/engines/ui/theme");
const door_input_manager_1 = require("@amiexpress/bbs-door-sdk/utils/door-input-manager");
const settings_1 = require("@amiexpress/bbs-door-sdk/settings");
const catalog_1 = require("./catalog");
const layout_1 = require("./layout");
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
const tips_1 = require("./tips");
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
    const pad = frame.bordered ? 2 : 1;
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
        top: frame.bordered ? 1 : 0,
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
        top: (frame.bordered ? 1 : 0) + 2,
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
        top: (frame.bordered ? 1 : 0) + 2 + frame.body.length + 1,
        left: pad,
        width: frame.innerWidth,
        height: 1,
        border: undefined,
        content: frame.hint,
        style: { fg: t.dim, bg: t.ground },
    });
    void hint;
    screen.render();
    // The marching rail: one top row of scrolling slashes, effects tier
    // only. effectsAllowed() is false at 40 columns, where a moving effect
    // leaves stray glyphs mid-row — there the door is all tip, no chrome.
    // The interval dies with the door (done() clears it); a leaked timer
    // would keep rendering into the board's menu.
    let railTimer = null;
    if ((0, blessed_1.effectsAllowed)(screenWidth)) {
        const rail = (0, blessed_helpers_1.createBox)({
            parent: screen,
            top: 0,
            left: 0,
            width: screenWidth,
            height: 1,
            border: undefined,
            focusable: false,
            content: (0, layout_1.buildRail)(screenWidth, 0),
            style: { fg: t.dim, bg: t.ground },
        });
        void rail;
        let phase = 0;
        railTimer = setInterval(() => {
            phase += 1;
            try {
                rail.setContent((0, layout_1.buildRail)(screenWidth, phase));
                screen.render();
            }
            catch { /* leaving anyway */ }
        }, 140);
    }
    await new Promise((resolve) => {
        let settled = false;
        const done = () => {
            if (settled)
                return;
            settled = true;
            if (railTimer)
                clearInterval(railTimer);
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
        screen.key(['enter', 'space', 'escape', 'q', 'Q'], () => {
            clearTimeout(timer);
            done();
        });
        // Any other key also continues: blessed only fires listed keys, so
        // the input manager forwards the rest through the screen's keypress.
        screen.on('keypress', () => {
            clearTimeout(timer);
            done();
        });
    });
}
//# sourceMappingURL=app.js.map