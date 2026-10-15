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
export type ActionLogKind = 'ok' | 'skip' | 'fail';
export interface ActionLogEntry {
    kind: ActionLogKind;
    /** What happened, in the sysop's terms. */
    text: string;
}
export declare class ActionLog {
    private readonly title;
    private entries;
    constructor(title: string);
    add(kind: ActionLogKind, text: string): void;
    ok(text: string): void;
    skip(text: string): void;
    fail(text: string): void;
    get count(): number;
    /** One line per entry, for the status bar. */
    summary(): string;
    /** The panel body. */
    render(): string;
}
/**
 * Render the steps an install reported into the same panel format.
 *
 * The install core returns them; this turns them into the text the sysop
 * reads, so both halves of a door's lifecycle look the same on screen.
 */
export declare function installLogPanel(title: string, steps: ReadonlyArray<ActionLogEntry>): string;
//# sourceMappingURL=action-log.d.ts.map