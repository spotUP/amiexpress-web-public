"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActionLog = void 0;
exports.installLogPanel = installLogPanel;
const door_theme_1 = require("./door-theme");
const MARKER = {
    ok: `{${door_theme_1.T.ok}-fg}[OK]{/${door_theme_1.T.ok}-fg}`,
    skip: `{${door_theme_1.T.warn}-fg}[SKIP]{/${door_theme_1.T.warn}-fg}`,
    fail: `{${door_theme_1.T.alert}-fg}[FAIL]{/${door_theme_1.T.alert}-fg}`,
};
class ActionLog {
    constructor(title) {
        this.title = title;
        this.entries = [];
    }
    add(kind, text) {
        this.entries.push({ kind, text });
    }
    ok(text) { this.add('ok', text); }
    skip(text) { this.add('skip', text); }
    fail(text) { this.add('fail', text); }
    get count() { return this.entries.length; }
    /** One line per entry, for the status bar. */
    summary() {
        const done = this.entries.filter(e => e.kind === 'ok').length;
        return `${done} of ${this.entries.length} steps completed`;
    }
    /** The panel body. */
    render() {
        if (this.entries.length === 0) {
            return `{${door_theme_1.T.warn}-fg}${this.title}{/${door_theme_1.T.warn}-fg}\n\nNothing was changed.`;
        }
        const lines = this.entries.map(e => `${MARKER[e.kind]} ${e.text}`);
        return `{${door_theme_1.T.warn}-fg}${this.title}{/${door_theme_1.T.warn}-fg}\n\n${lines.join('\n')}`;
    }
}
exports.ActionLog = ActionLog;
/**
 * Render the steps an install reported into the same panel format.
 *
 * The install core returns them; this turns them into the text the sysop
 * reads, so both halves of a door's lifecycle look the same on screen.
 */
function installLogPanel(title, steps) {
    const log = new ActionLog(title);
    for (const step of steps)
        log.add(step.kind, step.text);
    return log.render();
}
//# sourceMappingURL=action-log.js.map