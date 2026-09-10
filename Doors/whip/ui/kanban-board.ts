import {
  createBox,
  createList
} from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { Project, Task, TaskStatus } from '../types/project';
import type { UserStats, Achievement } from '../types/user';
import type { DataManager } from '../core/data-manager';
import type { AchievementManager } from '../core/achievements';
import { getPriorityColor, calculateLevel } from '../core/gamification';
import { editTask, createTask } from './task-editor';
import { T } from '../door-theme';
import { confirmDelete } from './confirm-delete';
import { attachWhipChrome, type FooterHint } from './chrome';

/** The keys this screen answers to, and the same keys shortened for 40 columns. */
const HINTS: readonly FooterHint[] = [
  { key: 'Arrows', does: 'Navigate' },
  { key: 'Enter', does: 'Edit' },
  { key: 'N', does: 'New' },
  { key: 'M', does: 'Move' },
  { key: 'D', does: 'Delete' },
  { key: 'Q', does: 'Back' },
];
const COMPACT_HINTS: readonly FooterHint[] = [
  { key: 'Arr', does: 'Move' },
  { key: 'Ent', does: 'Edit' },
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
 * One task as a multi-line card: full wrapped title rows, then the meta
 * row (priority, points, assignee). Replaces the old single-line
 * truncated form ("BBS Re.. [L] 10"), which left six readable characters.
 */
export function formatKanbanCard(
  task: Task,
  width: number,
  assigneeHandle?: string,
  carried = false
): string {
  const priorityInitial = task.priority[0].toUpperCase();
  const priorityColor = getPriorityColor(task.priority);
  // A carried task shows its grip AND its held state: the marker eats
  // its own cells so the wrap width shrinks by exactly that much, and
  // every row inverts - a held card reads nothing like a merely
  // selected one, the keyboard equivalent of the drag ghost (2026-09-10).
  const titleRows = wrapTitle(task.title, Math.max(4, carried ? width - 3 : width));
  if (carried && titleRows.length > 0) titleRows[0] = `>> ${titleRows[0]}`;
  const meta = `{${priorityColor}-fg}[${priorityInitial}]{/${priorityColor}-fg} ${task.points} pts${
    assigneeHandle ? ` {gray-fg}· ${assigneeHandle}{/}` : ''
  }`;
  const rows = [...titleRows, meta];
  if (!carried) return rows.join('\n');
  return rows.map((row) => `{inverse}${row}{/inverse}`).join('\n');
}

export async function showKanbanBoard(
  screen: Screen,
  project: Project,
  user: UserStats,
  dataManager: DataManager,
  achievementManager: AchievementManager,
  bbsApi?: any
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

    // Keyboard carry: Enter grabs the task under the cursor, arrows move
    // the cursor (left/right carry the task along, unsaved), Enter drops
    // (one persisted move with full side effects), ESC puts it back.
    // E keeps the old Enter job (edit).
    let carried: { task: Task; fromStatus: TaskStatus } | null = null;

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

    // Header - NOT focusable
    const header = createBox({
      parent: screen,
      top: 0,
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

    // Column containers - calculate width based on screen width
    // Leave 1 char margin on right to ensure border is visible
    const totalWidth = screen.width - 1;
    const colWidth = Math.floor(totalWidth / 4);
    const columnBoxes: any[] = [];
    const columnLists: any[] = [];
    const leftMargin = 0;

    for (let i = 0; i < COLUMNS.length; i++) {
      const status = COLUMNS[i];
      const label = COLUMN_LABELS[status];

      const box = createBox({
        parent: screen,
        top: 3,
        left: leftMargin + (i * colWidth),
        width: colWidth,
        height: '100%-6',
        fixed: true,
        border: { type: 'line' },
        label: ` ${label} `,
        style: {
          // Theme tokens, not literals: the old yellow/cyan ignored the
          // caller's theme. Active is T.ink - full-brightness text, white
          // on classic, the white focus border asked for 2026-09-10.
          border: { fg: i === currentColumn ? T.ink : T.chrome },
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
      for (let i = 0; i < COLUMNS.length; i++) {
        columnBoxes[i].style.border.fg = i === currentColumn ? T.ink : T.chrome;
      }
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
        handlesById = await loadHandles();
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

    /** Handle per id for card meta rows. Refreshed on every reload. */
    let handlesById: Record<string, string> = {};
    const loadHandles = async (): Promise<Record<string, string>> => {
      try {
        const users = await dataManager.loadUsers();
        const map: Record<string, string> = {};
        for (const u of Object.values(users)) {
          if (u?.userId && u?.handle) map[u.userId] = u.handle;
        }
        return map;
      } catch {
        return {};
      }
    };

    /** Repaint columns from the in-memory task list (no reload). */
    const paintLists = () => {
      for (let i = 0; i < COLUMNS.length; i++) {
        const status = COLUMNS[i];
        const columnTasks = tasks.filter(t => t.status === status);

        const cardWidth = Math.max(8, colWidth - 2);
        const items = columnTasks.map(task =>
          formatKanbanCard(task, cardWidth, handlesById[task.assignedTo ?? ''], carried?.task.id === task.id)
        );

        // Clear items first, then set new ones to ensure proper refresh
        columnLists[i].clearItems();
        columnLists[i].setItems(items.length > 0 ? items : []);
      }

      for (let i = 0; i < COLUMNS.length; i++) {
        columnBoxes[i].style.border.fg = i === currentColumn ? T.ink : T.chrome;
      }

      columnLists[currentColumn].focus();
      screen.render();
    };

    await updateLists(true);

    // Get column index from screen X position
    const getColumnFromX = (x: number): number => {
      for (let i = 0; i < COLUMNS.length; i++) {
        const colLeft = leftMargin + (i * colWidth);
        const colRight = colLeft + colWidth;
        if (x >= colLeft && x < colRight) {
          return i;
        }
      }
      return -1;
    };

    // Start drag operation
    const startDrag = (colIndex: number, itemIndex: number, x: number, y: number) => {
      // Keyboard carry and mouse drag never mix: drop (Enter) or cancel
      // (ESC) first.
      if (carried) return;
      const columnTasks = tasks.filter(t => t.status === COLUMNS[colIndex]);
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

      screen.render();
    };

    // Update drag ghost position
    const updateDrag = (x: number, y: number) => {
      if (!dragState.active || !dragState.ghost) return;

      dragState.ghost.top = y - 1;
      dragState.ghost.left = x - 8;

      // Highlight potential drop target
      const targetCol = getColumnFromX(x);
      for (let i = 0; i < COLUMNS.length; i++) {
        if (i === targetCol && targetCol !== dragState.fromColumn) {
          columnBoxes[i].style.border.fg = 'green';
        } else if (i === currentColumn) {
          columnBoxes[i].style.border.fg = T.ink;
        } else {
          columnBoxes[i].style.border.fg = T.chrome;
        }
      }

      screen.render();
    };

    // End drag operation
    const endDrag = async (x: number, y: number) => {
      if (!dragState.active || !dragState.task) return;

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
        // Dropped on same column or outside - just refresh to reset borders
        for (let i = 0; i < COLUMNS.length; i++) {
          columnBoxes[i].style.border.fg = i === currentColumn ? T.ink : T.chrome;
        }
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

          const columnTasks = tasks.filter(t => t.status === COLUMNS[colIndex]);
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

    const cleanup = () => {
      // First: a rail timer still writing after these widgets are gone would
      // paint into a screen that no longer holds them.
      chrome.stop();
      if (updateTimeout) clearTimeout(updateTimeout);
      screen.off('keypress', keyHandler);
      screen.off('mouse', mouseHandler);
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
        if (carried) {
          // Carry along, unsaved: the drop persists, ESC restores. Paint
          // only - a reload would discard the carried (unsaved) status.
          carried.task.status = COLUMNS[currentColumn];
          paintLists();
        } else {
          updateLists(false);
        }
        return;
      }

      (async () => {
        const columnTasks = tasks.filter(t => t.status === COLUMNS[currentColumn]);

        switch (key.name) {
        case 'enter':
          if (carried) {
            const { task, fromStatus } = carried;
            carried = null;
            setCarryMode(false);
            if (task.status !== fromStatus) {
              await moveTask(screen, task, task.status, dataManager, achievementManager, user, project, bbsApi);
            }
            await updateLists(true);
          } else if (columnTasks.length > 0) {
            const selectedIndex = columnLists[currentColumn].selected || 0;
            const task = columnTasks[selectedIndex];
            carried = { task, fromStatus: task.status };
            setCarryMode(true);
            paintLists();
          }
          break;

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
          if (columnTasks.length > 0) {
            const selectedIndex = columnLists[currentColumn].selected || 0;
            const task = columnTasks[selectedIndex];
            const newStatus = await withModal(() => selectMoveDestination(screen));
            if (newStatus) {
              await moveTask(screen, task, newStatus, dataManager, achievementManager, user, project, bbsApi);
              await updateLists(true);
            }
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
            carried.task.status = carried.fromStatus;
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

async function selectMoveDestination(screen: Screen): Promise<TaskStatus | null> {
  return new Promise((resolve) => {
    const modal = createBox({
      parent: screen,
      top: 'center',
      left: 'center',
      width: 40,
      height: 10,
      fixed: true,
      border: { type: 'line' },
      label: ' Move Task To ',
      style: {
        border: { fg: T.accentAlt },
        bg: T.ground
      },
      focusable: false,
      mouse: false,
      clickable: false,
    });

    const list = createList({
      parent: modal,
      top: 1,
      left: 1,
      width: '100%-2',
      height: '100%-2',
      keys: true,
      vi: true,
      mouse: true,
      items: COLUMNS.map(col => COLUMN_LABELS[col]),
      style: {
        selected: { bg: T.accent, fg: T.ground },
        item: { fg: T.ink },
        bg: T.ground
      }
    });

    const cleanup = () => {
      screen.off('keypress', keyHandler);
      screen.remove(modal);
      screen.render();
    };

    list.on('select', (item: any, index: number) => {
      cleanup();
      resolve(COLUMNS[index]);
    });

    const keyHandler = (ch: any, key: any) => {
      if (key.name === 'escape' || key.name === 'q') {
        cleanup();
        resolve(null);
      }
    };

    screen.on('keypress', keyHandler);
    list.focus();
    screen.render();
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
    const msg = blessed.message({
      parent: screen,
      top: 'center',
      left: 'center',
      width: 60,
      height: 10,
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
