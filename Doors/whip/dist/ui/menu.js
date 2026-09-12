"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WHIP_MENUS = void 0;
exports.attachWhipMenu = attachWhipMenu;
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
const door_theme_1 = require("../door-theme");
exports.WHIP_MENUS = [
    { label: 'Task', entries: [
            { label: '[T] Quick Task', value: 'quick-task' },
            { label: '[M] My Tasks', value: 'my-tasks' },
        ] },
    { label: 'Project', entries: [
            { label: '[N] New Project', value: 'new-project' },
            { label: '[V] View All', value: 'view-projects' },
        ] },
    { label: 'Board', entries: [
            { label: '[K] Kanban', value: 'kanban' },
        ] },
    { label: 'Party', entries: [
            { label: '[P] Timeline', value: 'parties' },
        ] },
    { label: 'Stars', entries: [
            { label: '[L] Leaderboard', value: 'leaderboard' },
            { label: '[A] Achievements', value: 'achievements' },
        ] },
    { label: 'Me', entries: [
            { label: '[D] Profile', value: 'my-profile' },
        ] },
    { label: 'Quit', entries: [
            { label: '[Q] Quit', value: 'quit' },
        ] },
];
/**
 * Build the bar (or nothing on narrow screens) and wire picks + Escape.
 * onExit refocuses whatever the screen nominates - usually its list -
 * so Escape off the menus never strands focus on the bar.
 */
function attachWhipMenu(screen, onPick, onExit) {
    if (screen.width < 60)
        return null;
    const bar = new blessed_1.MenuBar({
        screen,
        items: exports.WHIP_MENUS.map((g) => ({
            label: g.label,
            items: g.entries.map((e) => ({
                label: e.label,
                action: () => onPick(e.value),
            })),
        })),
        style: {
            bg: door_theme_1.T.ground,
            fg: door_theme_1.T.ink,
            hover: { bg: door_theme_1.T.accent, fg: door_theme_1.T.ground },
        },
    });
    bar.on('exit', onExit);
    return {
        bar,
        barH: 1,
        destroy: () => {
            // Close before destroy: hide() releases the focus trap, and
            // destroy() alone would skip that release on a live trap.
            bar.closeAll();
            bar.destroy();
        },
    };
}
