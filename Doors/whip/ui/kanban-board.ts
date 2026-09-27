import {
  createBox,
  createList
} from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { modalSize } from './layout';
import { isCompactWidth } from '@amiexpress/bbs-door-sdk';
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { Project, Task, TaskStatus } from '../types/project';
import type { UserStats, Achievement } from '../types/user';
import type { DataManager } from '../core/data-manager';
import type { AchievementManager } from '../core/achievements';
import { calculateLevel } from '../core/gamification';
import { editTask, createTask } from './task-editor';
import { attachWhipMenu, menuBarHeight, type WhipMenuBar } from './menu';
import type { MenuSelection } from '../types/session';
import { T } from '../door-theme';
import { confirmDelete } from './confirm-delete';
import { attachWhipChrome, type FooterHint } from './chrome';

/**
 * The keys this screen answers to, and the same keys shortened for 40 columns.
 *
 * Enter is Edit and M is Move - two keys, each doing what it says (sysop,
 * 2026-09-27). This legend already said "Enter: Edit", but Enter picked the
 * card up into the move mode below, whose own legend then offered E to edit:
 * editing a title took two keys and passed through a mode the caller never
 * asked for.
 */
const HINTS: readonly FooterHint[] = [
  { key: 'Arrows', does: 'Navigate' },
  { key: 'Enter', does: 'Edit' },
  { key: 'N', does: 'New' },
  { key: 'M', does: 'Move' },
  { key: 'D', does: 'Delete' },
  { key: 'Q', does: 'Back' },
];
const COMPACT_HINTS: readonly FooterHint[] = [
  { key: 'Enter', does: 'Edit' },
  { key: 'M', does: 'Move' },
  { key: 'Q', does: 'Back' },
];
const CARRY_HINTS: readonly FooterHint[] = [
  { key: 'Arrows', does: 'Carry' },
  { key: 'Enter', does: 'Drop' },
  { key: 'E', does: 'Edit' },
  { key: 'ESC', does: 'Cancel' },
];
const COMPACT_CARRY_HINTS: readonly FooterHint[] = [
  { key: 'Arr', does: 'Carry' },
  { key: 'Ent', does: 'Drop' },
  { key: 'ESC', does: 'Cancel' },
];

const COLUMNS: TaskStatus[] = ['todo', 'in-progress', 'testing', 'done'];
const COLUMN_LABELS: Record<TaskStatus, string> = {
  'todo': 'TODO',
  'in-progress': 'IN PROGRESS',
  'testing': 'TESTING',
  'done': 'DONE'
};

/**
 * Word-wrap a task title to the column width: breaks on spaces, and only
 * splits inside a word with a trailing hyphen when the word itself is wider
 * than the column. Pure, so the wrapping is unit-tested, not eyeballed.
 */
export function wrapTitle(title: string, width: number): string[] {
  const lines: string[] = [];
  const words = title.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [''];
  let current = '';
  const push = () => {
    if (current.length > 0) lines.push(current);
    current = '';
  };
  for (const word of words) {
    if (word.length > width) {
      // A word wider than the column: hard-split with hyphens.
      push();
      let rest = word;
      while (rest.length > width) {
        lines.push(rest.slice(0, width - 1) + '-');
        rest = rest.slice(width - 1);
      }
      current = rest;
      continue;
    }
    const candidate = current.length === 0 ? word : `${current} ${word}`;
    if (candidate.length > width) {
      push();
      current = word;
    } else {
      current = candidate;
    }
  }
  push();
  return lines;
}

/**
 * A column's list items: one per card, with ONE EMPTY ROW between cards so
 * they do not run together (sysop, 2026-09-27). The row rides on the card
 * above it - a list item is the only unit the widget has - and outside that
 * card's own inversion, so a selected card highlights its title and not the
 * gap. The last card gets none: a trailing gap is a row the column loses.
 */
export function spaceCards(cards: readonly string[]): string[] {
  return cards.map((card, i) => (i < cards.length - 1 ? `${card}\n` : card));
}

/**
 * Column geometry for a screen width (2026-09-10): four equal columns
 * across the full width, so a widened terminal spreads the board
 * instead of leaving it narrow. Pure - the board recomputes it on
 * resize; the probe is width in, widths out.
 *
 * FORTY COLUMNS HOLD ONE COLUMN, NOT FOUR (2026-09-22). Quartering a C64's
 * screen leaves ten cells a column and eight inside its border, which is not
 * a card - it is a column of single letters. So at the compact tier the board
 * shows the FOCUSED column at full width and slides the others off the edges;
 * left and right still walk between them, which is how the board already
 * moves, and the column's own label says which one the caller is on.
 *
 * `focused` is therefore part of the geometry rather than something the
 * caller applies afterwards: at eighty columns it changes nothing, and at
 * forty it is the whole layout.
 */
export function columnGeometry(
  screenWidth: number,
  focused = 0,
  columns = 4,
): { totalWidth: number; colWidth: number; leftOf: (i: number) => number; onePerScreen: boolean } {
  if (isCompactWidth(screenWidth)) {
    const colWidth = Math.max(10, screenWidth);
    return {
      totalWidth: colWidth,
      colWidth,
      leftOf: (i: number) => (i - focused) * colWidth,
      onePerScreen: true,
    };
  }
  const totalWidth = Math.max(40, screenWidth - 1);
  const colWidth = Math.max(10, Math.floor(totalWidth / columns));
  return { totalWidth, colWidth, leftOf: (i: number) => i * colWidth, onePerScreen: false };
}

/**
 * One task as a card: its full title, word-wrapped, and nothing else.
 *
 * TITLE ONLY (sysop, 2026-09-27). A card used to end in a meta row -
 * `[S] 10 pts · handle` - and a quarter of 80 columns is too narrow to spend
 * a row per card on it. Priority, points and assignee live in the task's
 * detail view, which is the editor that Enter opens.
 */
export function formatKanbanCard(
  task: Task,
  width: number,
  carried = false,
  selected = false
): string {
  // A carried task shows its grip AND its held state: the marker eats
  // its own cells so the wrap width shrinks by exactly that much, and
  // every row inverts - a held card reads nothing like a merely
  // selected one, the keyboard equivalent of the drag ghost (2026-09-10).
  // A selected (not carried) card inverts the same way: the list widget
  // highlights only the first visual row of a multi-row item, which left
  // the rest of the title dark (screenshot, 2026-09-10).
  const rows = wrapTitle(task.title, Math.max(4, carried ? width - 3 : width));
  if (carried && rows.length > 0) rows[0] = `>> ${rows[0]}`;
  if (!carried && !selected) return rows.join('\n');
  return rows.map((row) => `{inverse}${row}{/inverse}`).join('\n');
}

export async function showKanbanBoard(
  screen: Screen,
  project: Project,
  user: UserStats,
  dataManager: DataManager,
  achievementManager: AchievementManager,
  bbsApi?: any,
  onNavigate?: (sel: MenuSelection) => void
): Promise<void> {
  return new Promise(async (resolve) => {
    screen.program.enableMouse();
    screen.clearRegion(0, screen.width, 0, screen.height);
    screen.alloc();

    let currentColumn = 0;
    let tasks = await dataManager.getTasksForProject(project.id);

    // Open modal dialogs under this counter; the keyHandler below ignores
    // everything while it is non-zero (see the guard there).
    let modalDepth = 0;
    async function withModal<T>(fn: () => Promise<T>): Promise<T> {
      modalDepth++;
      try {
        return await fn();
      } finally {
        modalDepth--;
      }
    }

    // Keyboard carry - the board's MOVE mode: M grabs the task under the
    // cursor, arrows move the cursor (left/right carry the task along,
    // unsaved), Enter drops (one persisted move with full side effects), ESC
    // puts it back. Enter picked the card up until 2026-09-27; it is Edit now,
    // and M - which opened a four-row destination picker that did the same
    // job less visibly - is the one Move key.
    //
    // The held column is HERE, in the door's own UI state, and the Task is
    // never touched until the drop (2026-09-13). It used to be carried by
    // writing `task.status` - and `getTasksForProject` hands out references
    // into DataManager's tasksCache, so that wrote the unsaved column into
    // the door's shared record. Only ESC put it back: carrying a card into
    // DONE and then pressing N, E, M, D or a menu pick left the cache
    // saying "done" with no points, no completedAt, no achievement check
    // and no feed event, and the next saveTasks() wrote it to disk.
    let carried: { task: Task; fromStatus: TaskStatus; toColumn: number } | null = null;

    /**
     * The column a task DRAWS in: the carried one follows the cursor, every
     * other one answers with its stored status. One source of truth for the
     * four column filters below, so a carry can never be half-applied.
     */
    const statusOf = (task: Task): TaskStatus =>
      carried && carried.task.id === task.id ? COLUMNS[carried.toColumn] : task.status;

    const tasksIn = (columnIndex: number): Task[] =>
      tasks.filter((t) => statusOf(t) === COLUMNS[columnIndex]);

    // Drag and drop state
    let dragState: {
      active: boolean;
      task: Task | null;
      fromColumn: number;
      fromIndex: number;
      ghost: any;
    } = {
      active: false,
      task: null,
      fromColumn: -1,
      fromIndex: -1,
      ghost: null
    };

    // Get party info if linked
    let partyInfo = '';
    if (project.partyId) {
      const parties = await dataManager.loadParties();
      const party = parties.find(p => p.id === project.partyId);
      if (party) {
        const days = Math.ceil((new Date(party.date).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
        partyInfo = ` | Party: ${party.name} in ${days} days`;
      }
    }

    // Menu bar row (ui/menu.ts): headers and columns slide down one
    // row when it is up, and stay put below 60 columns.
    const barH = menuBarHeight(screen.width);

    // Header - NOT focusable
    const header = createBox({
      parent: screen,
      top: barH,
      left: 0,
      width: '100%',
      height: 3,
      fixed: true,
      border: { type: 'line' },
      // Empty: a three-row framed box has ONE interior row, and the chrome's
      // masthead owns it now. The project name and the party countdown that
      // shared that row moved into `title` below.
      content: '',
      style: { fg: T.ink, bg: T.ground, border: { fg: T.accent } },
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false,
    });

    // Column containers - full width, recomputed on resize so a
    // widened terminal spreads the board (2026-09-10). paintLists
    // re-wraps cards from the same numbers, so one relayout covers all.
    let { colWidth } = columnGeometry(screen.width, 0, COLUMNS.length);
    const columnBoxes: any[] = [];
    const columnLists: any[] = [];
    const leftMargin = 0;

    for (let i = 0; i < COLUMNS.length; i++) {
      const status = COLUMNS[i];
      const label = COLUMN_LABELS[status];

      const box = createBox({
        parent: screen,
        top: barH + 3,
        left: leftMargin + (i * colWidth),
        width: colWidth,
        height: `100%-${barH + 6}`,
        fixed: true,
        border: { type: 'line' },
        label: ` ${label} `,
        style: {
          // Base color only. The focused column whitens by itself (SDK
          // resolveStateBorder) - the door stopped painting focus by
          // hand 2026-09-10, which is what fought the SDK default.
          border: { fg: T.chrome },
          bg: T.ground
        },
        focusable: false,
        mouse: false,
        clickable: false,
      });

      const list = createList({
        parent: box,
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        keys: true,
        vi: true,
        mouse: true,
        items: [],
        style: {
          selected: { bg: T.accent, fg: T.ground },
          item: { fg: T.ink },
          bg: T.ground
        }
      });

      // Store column index for drag handling
      (list as any)._columnIndex = i;

      columnBoxes.push(box);
      columnLists.push(list);
    }

    // Footer - NOT focusable
    const footer = createBox({
      parent: screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 3,
      fixed: true,
      border: { type: 'line' },
      // Filled by the chrome, from the SDK's hint builder. The old line ran
      // past the frame and lost the word after `[Q/ESC]`; the SDK's is built
      // to the width tier instead.
      content: '',
      style: { fg: T.dim, bg: T.ground, border: { fg: T.dim } },
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false,
    });

    // The whole chrome from the door's ONE call. Reattached with carry
    // hints while a task is held (see setCarryMode): the SDK owns the
    // footer row, so the hints change by reattaching, not by painting
    // over it.
    let chrome = attachWhipChrome({
      screen,
      header,
      footer,
      title: `KANBAN: ${project.name}${partyInfo}`,
      hints: HINTS,
      compactHints: COMPACT_HINTS,
      // A getter, not the element: the focused column changes with every
      // left/right, so the tick must ask which list is live rather than
      // damage whichever one happened to be focused at attach time.
      glitch: () => columnLists[currentColumn],
    });

    const setCarryMode = (on: boolean) => {
      chrome.stop();
      chrome = attachWhipChrome({
        screen,
        header,
        footer,
        title: `KANBAN: ${project.name}${partyInfo}`,
        hints: on ? CARRY_HINTS : HINTS,
        compactHints: on ? COMPACT_CARRY_HINTS : COMPACT_HINTS,
        glitch: () => columnLists[currentColumn],
      });
      screen.render();
    };

    // Debounce timer for navigation updates
    let updateTimeout: NodeJS.Timeout | null = null;
    let isUpdating = false;

    const updateListsImmediate = () => {
      // focus() + render() is the whole job: the SDK whitens the
      // focused box, so there is no per-column painting here anymore.
      columnLists[currentColumn].focus();
      screen.render();
    };

    const updateLists = async (immediate: boolean = false) => {
      if (isUpdating && !immediate) return;

      if (updateTimeout) {
        clearTimeout(updateTimeout);
        updateTimeout = null;
      }

      if (immediate) {
        isUpdating = true;
        tasks = await dataManager.getTasksForProject(project.id);
        paintLists();
        isUpdating = false;
      } else {
        updateTimeout = setTimeout(async () => {
          updateTimeout = null;
          await updateLists(true);
        }, 50);
        updateListsImmediate();
      }
    };

    /** Repaint columns from the in-memory task list (no reload). */
    const paintLists = () => {
      for (let i = 0; i < COLUMNS.length; i++) {
        const columnTasks = tasksIn(i);

        const cardWidth = Math.max(8, colWidth - 2);
        const sel = columnLists[i].selected || 0;
        const items = spaceCards(columnTasks.map((task, idx) =>
          formatKanbanCard(
            task, cardWidth,
            carried?.task.id === task.id,
            // Selected rows invert whole: the widget highlights only the
            // first visual row of a multi-row card (2026-09-10).
            idx === sel && i === currentColumn
          )
        ));

        // Clear items first, then set new ones to ensure proper refresh -
        // and put the selection BACK, because clearItems() zeroes it
        // (sdk list.ts:539) and setItems() only ever clamps downwards. Every
        // repaint used to drop the cursor to row 0 while the inverse
        // highlight above stayed drawn on the old row, so two cards looked
        // selected and E/M/D acted on the wrong one (2026-09-13).
        columnLists[i].clearItems();
        columnLists[i].setItems(items.length > 0 ? items : []);
        if (sel > 0) columnLists[i].select(sel);
      }

      columnLists[currentColumn].focus();
      screen.render();
    };

    await updateLists(true);

    // Get column index from screen X position
    const getColumnFromX = (x: number): number => {
      const geo = columnGeometry(screen.width, currentColumn, COLUMNS.length);
      for (let i = 0; i < COLUMNS.length; i++) {
        const colLeft = leftMargin + geo.leftOf(i);
        const colRight = colLeft + geo.colWidth;
        if (x >= colLeft && x < colRight) {
          return i;
        }
      }
      return -1;
    };

    // A widened (or narrowed) terminal re-lays the columns instead of
    // leaving them at their opening width with dead space beside them.
    const relayout = (): void => {
      const geo = columnGeometry(screen.width, currentColumn, COLUMNS.length);
      colWidth = geo.colWidth;
      for (let i = 0; i < COLUMNS.length; i++) {
        columnBoxes[i].left = leftMargin + geo.leftOf(i);
        columnBoxes[i].width = geo.colWidth;
      }
      paintLists();
    };
    screen.on('resize', relayout);

    // Start drag operation
    const startDrag = (colIndex: number, itemIndex: number, x: number, y: number) => {
      // Keyboard carry and mouse drag never mix: drop (Enter) or cancel
      // (ESC) first.
      if (carried) return;
      const columnTasks = tasksIn(colIndex);
      if (itemIndex >= columnTasks.length) return;

      const task = columnTasks[itemIndex];

      dragState = {
        active: true,
        task: task,
        fromColumn: colIndex,
        fromIndex: itemIndex,
        ghost: createBox({
          focusable: false,
          mouse: false,
          clickable: false,
          parent: screen,
          top: y - 1,
          left: x - 8,
          width: 18,
          height: 3,
          border: { type: 'line' },
          content: task.title.length > 14 ? task.title.substring(0, 12) + '..' : task.title,
          style: {
            fg: T.ink,
            bg: T.bar,
            border: { fg: T.accentAlt }
          },
          tags: true,
        })
      };

      setDropTarget(true);
      screen.render();
    };

    // Update drag ghost position
    const updateDrag = (x: number, y: number) => {
      if (!dragState.active || !dragState.ghost) return;

      dragState.ghost.top = y - 1;
      dragState.ghost.left = x - 8;

      screen.render();
    };

    // Drop-target green rides the SDK hover state, not hand-painted
    // borders (which the focus default would override mid-drag anyway):
    // while a drag is active the box under the mouse goes green.
    const setDropTarget = (on: boolean) => {
      for (let i = 0; i < COLUMNS.length; i++) {
        const style = columnBoxes[i].options.style as any;
        if (on) {
          style.hover = { ...(style.hover ?? {}), border: { fg: T.ok } };
        } else if (style.hover) {
          delete style.hover;
        }
      }
    };

    // End drag operation
    const endDrag = async (x: number, y: number) => {
      if (!dragState.active || !dragState.task) return;
      setDropTarget(false);

      // Capture task info before resetting state
      const taskToMove = dragState.task;
      const fromCol = dragState.fromColumn;

      // Remove ghost
      if (dragState.ghost) {
        screen.remove(dragState.ghost);
        dragState.ghost = null;
      }

      const targetCol = getColumnFromX(x);

      // Reset drag state first to prevent re-entry
      dragState = {
        active: false,
        task: null,
        fromColumn: -1,
        fromIndex: -1,
        ghost: null
      };

      // If dropped on different column, move the task
      if (targetCol !== -1 && targetCol !== fromCol) {
        const newStatus = COLUMNS[targetCol];
        try {
          await moveTask(screen, taskToMove, newStatus, dataManager, achievementManager, user, project, bbsApi);
        } catch (err) {
          console.error('[Kanban] Move task failed:', err);
        }
        await updateLists(true);
      } else {
        // Dropped on same column or outside - just refresh.
        screen.render();
      }
    };

    // Set up drag handlers for each list
    for (let i = 0; i < columnLists.length; i++) {
      const list = columnLists[i];
      const colIndex = i;  // Capture for closure

      list.on('mouse', (data: any) => {
        if (data.action === 'mousedown') {
          // Skip if already dragging
          if (dragState.active) return;

          const columnTasks = tasksIn(colIndex);
          if (columnTasks.length === 0) return;

          // Get the selected item index - blessed updates this on mousedown
          const selectedIndex = list.selected ?? 0;
          if (selectedIndex >= columnTasks.length) return;

          currentColumn = colIndex;

          // Capture coordinates and start drag immediately
          const mouseX = data.x;
          const mouseY = data.y;

          startDrag(colIndex, selectedIndex, mouseX, mouseY);
        }
      });
    }

    // Global mouse handler for drag operations
    const mouseHandler = (data: any) => {
      if (!dragState.active) return;

      if (data.action === 'mousemove') {
        updateDrag(data.x, data.y);
      } else if (data.action === 'mouseup' || data.action === 'mouserelease') {
        endDrag(data.x, data.y);
      }
    };

    // Also handle element mouse events that might capture the release
    const elementMouseHandler = (data: any) => {
      if (!dragState.active) return;
      if (data.action === 'mouseup' || data.action === 'mouserelease') {
        endDrag(data.x, data.y);
      }
    };

    screen.on('mouse', mouseHandler);
    // Listen on each column for mouseup in case screen doesn't get it
    columnLists.forEach(list => list.on('mouse', elementMouseHandler));

    // Menu picks leave this board for wherever the app loop sends them.
    let menu: WhipMenuBar | null = null;
    const pickFromBar = (value: MenuSelection) => {
      onNavigate?.(value);
      cleanup();
      resolve();
    };
    // N/M/D/E/Q are the board's own keys, so the bar neither binds nor
    // advertises them here; Tab still reaches it, and T/V/K/P/L/A pick
    // straight from the board.
    menu = attachWhipMenu(screen, pickFromBar, () => columnLists[currentColumn], {
      reserved: ['N', 'M', 'D', 'E', 'Q'],
    });

    const cleanup = () => {
      // First: a rail timer still writing after these widgets are gone would
      // paint into a screen that no longer holds them.
      chrome.stop();
      if (menu) {
        menu.destroy();
        menu = null;
      }
      if (updateTimeout) clearTimeout(updateTimeout);
      screen.off('keypress', keyHandler);
      screen.off('mouse', mouseHandler);
      screen.off('resize', relayout);
      columnLists.forEach(list => list.off('mouse', elementMouseHandler));
      if (dragState.ghost) screen.remove(dragState.ghost);
      screen.remove(header);
      columnBoxes.forEach(box => screen.remove(box));
      screen.remove(footer);
    };

    const keyHandler = (ch: any, key: any) => {
      // Ignore keys during drag
      if (dragState.active) return;

      // Ignore keys while a modal dialog is open. Modals (edit, create,
      // move picker, delete confirm) register their own screen keys, but
      // declined keys still bubble here: picking a move destination with
      // Enter opened the edit dialog on top of the move, and Escape in a
      // title field closed the board behind the dialog (2026-09-09).
      if (modalDepth > 0) return;

      if (key.name === 'left' || key.name === 'right') {
        if (key.name === 'left') {
          currentColumn = Math.max(0, currentColumn - 1);
        } else {
          currentColumn = Math.min(COLUMNS.length - 1, currentColumn + 1);
        }
        /*
         * ON A C64 THE BOARD SLIDES. One column fills the screen at the
         * compact tier (`columnGeometry`), so walking left or right is a
         * re-layout rather than a change of focus inside a visible row of
         * four - without this the caller moved to a column parked off the
         * edge and watched an unchanged screen.
         */
        if (columnGeometry(screen.width, currentColumn, COLUMNS.length).onePerScreen) {
          relayout();
        }
        if (carried) {
          // Carry along, unsaved: the drop persists, ESC drops the carry.
          // Paint only - a reload would discard the carried column, and
          // NOTHING here touches the task itself.
          carried.toColumn = currentColumn;
          paintLists();
        } else {
          updateLists(false);
        }
        return;
      }

      (async () => {
        const columnTasks = tasksIn(currentColumn);

        switch (key.name) {
        case 'enter':
          if (carried) {
            const { task, fromStatus, toColumn } = carried;
            const toStatus = COLUMNS[toColumn];
            carried = null;
            setCarryMode(false);
            if (toStatus !== fromStatus) {
              await moveTask(screen, task, toStatus, dataManager, achievementManager, user, project, bbsApi);
            }
            await updateLists(true);
            break;
          }
          // Not carrying: Enter is Edit, the same as E.
          // falls through
        case 'e':
        case 'E':
          if (columnTasks.length > 0) {
            const selectedIndex = columnLists[currentColumn].selected || 0;
            const task = columnTasks[selectedIndex];
            await withModal(() => editTask(screen, task, user, dataManager, achievementManager, project, bbsApi));
            await updateLists(true);
          }
          break;

        case 'n':
          await withModal(() => createTask(screen, project, user, dataManager, bbsApi));
          await updateLists(true);
          break;

        case 'm':
          // Move: pick the card up. Already carrying, M does nothing - Enter
          // drops, ESC cancels.
          if (!carried && columnTasks.length > 0) {
            const selectedIndex = columnLists[currentColumn].selected || 0;
            const task = columnTasks[selectedIndex];
            carried = { task, fromStatus: task.status, toColumn: currentColumn };
            setCarryMode(true);
            paintLists();
          }
          break;

        case 'd':
          if (columnTasks.length > 0) {
            const selectedIndex = columnLists[currentColumn].selected || 0;
            const task = columnTasks[selectedIndex];
            const confirmed = await withModal(() => confirmDelete(screen, 'task', task.title));
            if (confirmed) {
              await dataManager.deleteTask(task.id);

              if (bbsApi?.emitCustomEvent) {
                bbsApi.emitCustomEvent(
                  'task_deleted',
                  `Deleted task "${task.title}" from project "${project.name}"`,
                  {
                    projectId: project.id,
                    projectName: project.name,
                    taskId: task.id,
                    taskCategory: task.category
                  }
                );
              }

              await updateLists(true);
            }
          }
          break;

        case 'q':
        case 'escape':
          if (carried) {
            // Nothing to put back: the carry only ever lived in `carried`.
            carried = null;
            setCarryMode(false);
            paintLists();
            break;
          }
          cleanup();
          resolve();
          break;
        }
      })();
    };

    screen.on('keypress', keyHandler);
  });
}

async function moveTask(
  screen: Screen,
  task: Task,
  newStatus: TaskStatus,
  dataManager: DataManager,
  achievementManager: AchievementManager,
  user: UserStats,
  project: Project,
  bbsApi?: any
): Promise<void> {
  const oldStatus = task.status;
  task.status = newStatus;
  task.updatedAt = new Date().toISOString();

  if (newStatus === 'done' && oldStatus !== 'done') {
    task.completedAt = new Date().toISOString();

    const userData = await dataManager.getUser(user.userId);
    if (userData) {
      userData.points += task.points;
      userData.tasksCompleted += 1;
      userData.level = calculateLevel(userData.points);
      await dataManager.updateUser(userData);

      if (bbsApi?.emitCustomEvent) {
        bbsApi.emitCustomEvent(
          'task_completed',
          `Completed task "${task.title}" (+${task.points} pts) in "${project.name}"`,
          {
            projectId: project.id,
            projectName: project.name,
            taskId: task.id,
            taskCategory: task.category,
            points: task.points,
            totalPoints: userData.points,
            level: userData.level
          }
        );
      }

      const newAchievements = await achievementManager.checkAchievements(userData);

      if (newAchievements.length > 0) {
        const achievements = await dataManager.loadAchievements();
        for (const achievementId of newAchievements) {
          const achievement = achievements[achievementId];
          if (achievement) {
            await showAchievementUnlock(screen, achievement);

            if (bbsApi?.emitCustomEvent) {
              bbsApi.emitCustomEvent(
                'achievement_unlocked',
                `Unlocked achievement "${achievement.name}" (+${achievement.points} pts)`,
                {
                  achievementId: achievement.id,
                  achievementName: achievement.name,
                  points: achievement.points,
                  category: achievement.category,
                  totalPoints: userData.points
                }
              );
            }
          }
        }
      }
    }
  } else if (newStatus !== oldStatus) {
    if (bbsApi?.emitCustomEvent) {
      bbsApi.emitCustomEvent(
        'task_moved',
        `Moved task "${task.title}" from ${oldStatus} to ${newStatus}`,
        {
          projectId: project.id,
          projectName: project.name,
          taskId: task.id,
          fromStatus: oldStatus,
          toStatus: newStatus
        }
      );
    }
  }

  await dataManager.updateTask(task);
}


async function showAchievementUnlock(screen: Screen, achievement: Achievement): Promise<void> {
  return new Promise((resolve) => {
    const noticeSize = modalSize(60, 10, screen.width, screen.height);
    const msg = blessed.message({
      parent: screen,
      top: 'center',
      left: 'center',
      width: noticeSize.width,
      height: noticeSize.height,
      border: { type: 'line' },
      style: {
        border: { fg: T.accentAlt },
        bg: T.ground
      },
      label: ' Achievement Unlocked! '
    });

    const content = `{center}{bold}{${T.ok}-fg}${achievement.icon} ${achievement.name}{/${T.ok}-fg}{/bold}{/center}\n\n` +
                   `{center}${achievement.description}{/center}\n\n` +
                   `{center}{${T.accentAlt}-fg}+${achievement.points} points{/${T.accentAlt}-fg}{/center}\n\n` +
                   `{center}Press any key to continue{/center}`;

    msg.display(content, () => {
      screen.remove(msg);
      screen.render();
      resolve();
    });
  });
}
