"use strict";
/**
 * What an install or an uninstall actually did, for the right-hand panel.
 *
 * Both used to report a single status line - "Uninstalled WALL" - which says
 * nothing about what was touched. After an uninstall removed every door on
 * the live board, the sysop asked for exactly this: show what is being
 * deleted, so a run that starts removing the wrong thing is visible while it
 * happens rather than afterwards.
 *
 * Plain text with blessed tags. No emoji: this renders in a BBS terminal.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActionLog = void 0;
const MARKER = {
    ok: '{green-fg}[OK]{/green-fg}',
    skip: '{yellow-fg}[SKIP]{/yellow-fg}',
    fail: '{red-fg}[FAIL]{/red-fg}',
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
            return `{yellow-fg}${this.title}{/yellow-fg}\n\nNothing was changed.`;
        }
        const lines = this.entries.map(e => `${MARKER[e.kind]} ${e.text}`);
        return `{yellow-fg}${this.title}{/yellow-fg}\n\n${lines.join('\n')}`;
    }
}
exports.ActionLog = ActionLog;
//# sourceMappingURL=action-log.js.map