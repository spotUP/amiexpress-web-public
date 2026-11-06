/**
 * Message pick mode: choose a chat message with the arrow keys instead of
 * typing its id (ids are never shown - sysop request, plan L3).
 *
 * The logic is separate from blessed so it can be tested on its own. The
 * picker works on `chatMessageIds` (one entry per display ROW; the same id on
 * each row of a multi-row message, null on rows that are not a message), and
 * moves a whole message at a time, never a row.
 *
 * One key owner: the door registers the picker's Up/Down/Escape keys and
 * input-history asks `state.active` before it recalls history.
 */
import { totalRows, wrappedHeight } from '../ui/chat-row-map';

/** What Enter does with the picked message. */
export type PickAction =
  /** Re-dispatch `/<command> <args> <id>` through the normal command path. */
  | { kind: 'command'; command: string; args: string[] }
  /** Open the per-message context menu (plain Up entry). */
  | { kind: 'menu' };

export interface PickerState {
  active: boolean;
  /** First display row of the selected message. */
  rowIndex: number;
  action: PickAction;
}

/** The message id behind `row`, and the whole run of rows that share it. */
export function messageRows(ids: readonly (string | null)[], row: number): { first: number; last: number } | null {
  const id = ids[row];
  if (id === null || id === undefined) return null;
  let first = row;
  let last = row;
  while (first > 0 && ids[first - 1] === id) first--;
  while (last < ids.length - 1 && ids[last + 1] === id) last++;
  return { first, last };
}

/** First row of the newest message, or null when there is none. */
export function newestMessageRow(ids: readonly (string | null)[]): number | null {
  for (let i = ids.length - 1; i >= 0; i--) {
    if (ids[i] !== null && ids[i] !== undefined) return messageRows(ids, i)!.first;
  }
  return null;
}

/**
 * The first row of the message one step from `row` (dir -1 older, +1 newer),
 * skipping rows without an id and the rest of the current message. Stays put
 * at either end.
 */
export function moveSelection(ids: readonly (string | null)[], row: number, dir: -1 | 1): number {
  const cur = messageRows(ids, row);
  if (!cur) return row;
  let i = dir < 0 ? cur.first - 1 : cur.last + 1;
  while (i >= 0 && i < ids.length) {
    const g = messageRows(ids, i);
    if (g) return g.first;
    i += dir;
  }
  return row;
}

/** Wrapped-row offset of display row `row`, and the height of rows first..last. */
export function wrappedSpan(lines: readonly string[], width: number, first: number, last: number): { top: number; height: number } {
  const top = totalRows(lines.slice(0, first) as string[], width);
  const height = totalRows(lines.slice(first, last + 1) as string[], width);
  return { top, height };
}

/**
 * The selected message's line as an inverse bar: the plain text re-wrapped in
 * the given colours and padded to the row width. The caller passes theme
 * tokens (T.ground / T.accent) so no colour is hardcoded here.
 */
export function highlightLine(line: string, width: number, fg: string, bg: string): string {
  const plain = line.replace(/\{[^}]*\}/g, '');
  const rows = Math.max(1, wrappedHeight(line, width));
  const padded = plain.padEnd(rows * Math.max(1, width), ' ');
  return `{${fg}-fg}{${bg}-bg}${padded}{/${bg}-bg}{/${fg}-fg}`;
}

export interface MessagePickerDeps {
  ids: () => readonly (string | null)[];
  /** Selection, label or highlight changed: redraw. */
  onChange: () => void;
  /** Enter on a message. */
  onConfirm: (action: PickAction, messageId: string) => void;
}

const COMMANDS_NEEDING_AN_ID = new Set(['love', 'thumbsup', 'heart', 'fire', '+1', '-1', 'pin', 'thread', 'reply']);

export function createMessagePicker(deps: MessagePickerDeps) {
  const state: PickerState = { active: false, rowIndex: -1, action: { kind: 'menu' } };

  const stop = () => {
    state.active = false;
    state.rowIndex = -1;
    deps.onChange();
  };

  const start = (action: PickAction): boolean => {
    const row = newestMessageRow(deps.ids());
    if (row === null) return false;
    state.active = true;
    state.rowIndex = row;
    state.action = action;
    deps.onChange();
    return true;
  };

  return {
    state,
    start,
    /**
     * `/love`, `/react`, `/thumbsup`, `/pin`, `/thread`, `/reply` typed with
     * no message id start pick mode for that action. True when handled.
     */
    startFromCommand: (text: string): boolean => {
      const parts = text.trim().replace(/^\//, '').split(/\s+/);
      const command = (parts.shift() ?? '').toLowerCase();
      if (command === 'react') {
        if (parts.length >= 2) return false;
        return start({ kind: 'command', command, args: parts.length ? parts : ['+1'] });
      }
      if (!COMMANDS_NEEDING_AN_ID.has(command) || parts.length > 0) return false;
      return start({ kind: 'command', command, args: [] });
    },
    move: (dir: -1 | 1): void => {
      if (!state.active) return;
      const next = moveSelection(deps.ids(), state.rowIndex, dir);
      if (next !== state.rowIndex) {
        state.rowIndex = next;
        deps.onChange();
      }
    },
    confirm: (): void => {
      if (!state.active) return;
      const id = deps.ids()[state.rowIndex];
      const action = state.action;
      stop();
      if (id !== null && id !== undefined) deps.onConfirm(action, id);
    },
    cancel: (): void => {
      if (state.active) stop();
    },
  };
}

export type MessagePicker = ReturnType<typeof createMessagePicker>;
