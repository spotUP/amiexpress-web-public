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

const MARKER: Record<ActionLogKind, string> = {
  ok: '{green-fg}[OK]{/green-fg}',
  skip: '{yellow-fg}[SKIP]{/yellow-fg}',
  fail: '{red-fg}[FAIL]{/red-fg}',
};

export class ActionLog {
  private entries: ActionLogEntry[] = [];

  constructor(private readonly title: string) {}

  add(kind: ActionLogKind, text: string): void {
    this.entries.push({ kind, text });
  }

  ok(text: string): void { this.add('ok', text); }
  skip(text: string): void { this.add('skip', text); }
  fail(text: string): void { this.add('fail', text); }

  get count(): number { return this.entries.length; }

  /** One line per entry, for the status bar. */
  summary(): string {
    const done = this.entries.filter(e => e.kind === 'ok').length;
    return `${done} of ${this.entries.length} steps completed`;
  }

  /** The panel body. */
  render(): string {
    if (this.entries.length === 0) {
      return `{yellow-fg}${this.title}{/yellow-fg}\n\nNothing was changed.`;
    }
    const lines = this.entries.map(e => `${MARKER[e.kind]} ${e.text}`);
    return `{yellow-fg}${this.title}{/yellow-fg}\n\n${lines.join('\n')}`;
  }
}
