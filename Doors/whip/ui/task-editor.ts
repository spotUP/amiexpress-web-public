import {
  createButton,
  guardDoubleSubmit,
  advanceFocus,
  retreatFocus,
} from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { Task, Project, TaskCategory, TaskPriority } from '../types/project';
import type { UserStats } from '../types/user';
import type { DataManager } from '../core/data-manager';
import type { AchievementManager } from '../core/achievements';
import { v4 as uuidv4 } from 'uuid';
import { T } from '../door-theme';

const CATEGORIES: TaskCategory[] = ['code', 'music', 'gfx', 'design', 'effects', 'engine', '3d', 'bug'];
const PRIORITIES: TaskPriority[] = ['lamer', 'scener', 'elite', 'legend'];

export async function createTask(
  screen: Screen,
  project: Project,
  user: UserStats,
  dataManager: DataManager,
  bbsApi?: any
): Promise<void> {
  const newTask: Task = {
    id: uuidv4(),
    projectId: project.id,
    title: '',
    category: 'code',
    status: 'todo',
    priority: 'scener',
    assignedTo: user.userId,
    points: 10,
    description: '',
    createdAt: new Date().toISOString()
  };

  await showTaskEditor(screen, newTask, user, dataManager, true, project, bbsApi);
}

export async function editTask(
  screen: Screen,
  task: Task,
  user: UserStats,
  dataManager: DataManager,
  achievementManager: AchievementManager,
  project?: Project,
  bbsApi?: any
): Promise<void> {
  await showTaskEditor(screen, task, user, dataManager, false, project, bbsApi);
}

async function showTaskEditor(
  screen: Screen,
  task: Task,
  user: UserStats,
  dataManager: DataManager,
  isNew: boolean,
  project?: Project,
  bbsApi?: any
): Promise<void> {
  // Assignee picker source. Loaded here (not in the dialog body) because
  // the dialog builds synchronously; a board the user never opened has no
  // WHIP users yet, so this is allowed to be empty.
  let knownUsers: Record<string, UserStats> = {};
  try {
    knownUsers = await dataManager.loadUsers();
  } catch {
    knownUsers = {};
  }
  // Handle per id for the picker; unknown ids stay selectable so an edit
  // can never silently unassign.
  const handleOf = (userId: string | undefined): string | null => {
    if (!userId) return null;
    const found = Object.values(knownUsers).find((u) => u.userId === userId);
    return found ? found.handle : null;
  };
  const assigneeOptions: Array<{ label: string; userId: string | null }> = [
    { label: '(Unassigned)', userId: null },
    ...Object.values(knownUsers)
      .map((u) => ({ label: u.handle, userId: u.userId as string | null }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  ];
  const currentHandle = handleOf(task.assignedTo);
  if (task.assignedTo && !currentHandle) {
    assigneeOptions.push({ label: `(Unknown: ${task.assignedTo})`, userId: task.assignedTo });
  }
  let selectedAssignee = 0;
  if (task.assignedTo) {
    const idx = assigneeOptions.findIndex((o) => o.userId === task.assignedTo);
    if (idx !== -1) selectedAssignee = idx;
  }
  // Project picker source. Same shape as the assignee picker above: the
  // door pinned every task to the project whose board opened the dialog,
  // so a quick-task could never choose a project and a Backlog task could
  // never move out (2026-09-10). The dialog now chooses.
  let allProjects: Project[] = [];
  try {
    allProjects = await dataManager.loadProjects();
  } catch {
    allProjects = [];
  }
  if (allProjects.length === 0 && project) allProjects = [project];
  const projectOptions: Array<{ label: string; id: string }> =
    allProjects.map((p) => ({ label: p.name, id: p.id }));
  if (task.projectId && !projectOptions.some((o) => o.id === task.projectId)) {
    projectOptions.push({ label: `(Unknown: ${task.projectId})`, id: task.projectId });
  }
  let selectedProject = 0;
  if (task.projectId) {
    const idx = projectOptions.findIndex((o) => o.id === task.projectId);
    if (idx !== -1) selectedProject = idx;
  }
  return new Promise((resolve) => {
    screen.program.enableMouse();

    // Modal container - the project name rides in the label, so a task can
    // never silently land somewhere unexpected (a new task opened from the
    // Backlog quick action used to look identical to one opened on a real
    // project, and the task "vanished" - it was in Backlog all along).
    // The label follows the Project picker below, so it stays true.
    const labelFor = (name: string) =>
      `${isNew ? ' New Task' : ' Edit Task'}${name ? ` - ${name} ` : ' '}`;
    const modal = blessed.box({
      parent: screen,
      top: 'center',
      left: 'center',
      width: 68,
      height: 24,
      border: { type: 'line' },
      style: {
        border: { fg: T.accentAlt },
        bg: T.ground
      },
      label: labelFor(project?.name ?? projectOptions[selectedProject]?.label ?? ''),
      tags: true,
    });

    // Title input - bordered textbox with label on border (WORKING PATTERN)
    const titleInput = blessed.textbox({
      parent: modal,
      top: 1,
      left: 1,
      right: 1,
      height: 3,
      border: { type: 'line' },
      label: ' Title ',
      keys: true,
      mouse: true,
      inputOnFocus: true,
      value: task.title,
      style: {
        fg: T.ink,
        bg: T.ground,
        border: { fg: T.accent },
      }
    });

    // Category list
    const categoryList = blessed.list({
      parent: modal,
      top: 4,
      left: 1,
      width: '48%',
      height: 5,
      border: { type: 'line' },
      label: ' Category ',
      tags: true,
      keys: true,
      vi: true,
      mouse: true,
      focusable: true,
      items: CATEGORIES,
      selected: CATEGORIES.indexOf(task.category),
      style: {
        border: { fg: T.accent },
        selected: { bg: T.accent, fg: T.ground },
        item: { fg: T.ink, bg: T.ground },
        bg: T.ground
      },
    } as any);

    // Priority list
    const priorityList = blessed.list({
      parent: modal,
      top: 4,
      left: '50%',
      right: 1,
      height: 5,
      border: { type: 'line' },
      label: ' Priority ',
      tags: true,
      keys: true,
      vi: true,
      mouse: true,
      focusable: true,
      items: PRIORITIES,
      selected: PRIORITIES.indexOf(task.priority),
      style: {
        border: { fg: T.accent },
        selected: { bg: T.accent, fg: T.ground },
        item: { fg: T.ink, bg: T.ground },
        bg: T.ground
      },
    } as any);

    // Project list - full width under Category/Priority. New tasks used to
    // be pinned to the opening project with no choice; edits could never
    // re-home, so Backlog tasks were stuck (2026-09-10).
    const projectList = blessed.list({
      parent: modal,
      top: 9,
      left: 1,
      right: 1,
      height: 4,
      border: { type: 'line' },
      label: ' Project ',
      tags: true,
      keys: true,
      vi: true,
      mouse: true,
      focusable: true,
      items: projectOptions.map((o) => o.label),
      selected: selectedProject,
      style: {
        border: { fg: T.accent },
        selected: { bg: T.accent, fg: T.ground },
        item: { fg: T.ink, bg: T.ground },
        bg: T.ground
      },
    } as any);
    const refreshLabel = () => {
      const name = projectOptions[projectList.selected!]?.label ?? '';
      modal.options.label = labelFor(name);
    };
    projectList.on('select', refreshLabel);

    // Assignee list - left column under Project. The door never had a way
    // to assign at all: new tasks silently took the creator.
    const assigneeList = blessed.list({
      parent: modal,
      top: 13,
      left: 1,
      width: '48%',
      height: 3,
      border: { type: 'line' },
      label: ' Assignee ',
      tags: true,
      keys: true,
      vi: true,
      mouse: true,
      focusable: true,
      items: assigneeOptions.map((o) => o.label),
      selected: selectedAssignee,
      style: {
        border: { fg: T.accent },
        selected: { bg: T.accent, fg: T.ground },
        item: { fg: T.ink, bg: T.ground },
        bg: T.ground
      },
    } as any);

    // Points input - bordered textbox
    const pointsInput = blessed.textbox({
      parent: modal,
      top: 13,
      left: '50%',
      right: 1,
      height: 3,
      border: { type: 'line' },
      label: ' Points ',
      keys: true,
      mouse: true,
      inputOnFocus: true,
      value: task.points.toString(),
      style: {
        fg: T.ink,
        bg: T.ground,
        border: { fg: T.accent },
      }
    });

    // Description input - bordered textbox
    const descInput = blessed.textbox({
      parent: modal,
      top: 16,
      left: 1,
      right: 1,
      height: 3,
      border: { type: 'line' },
      label: ' Description (optional) ',
      keys: true,
      mouse: true,
      inputOnFocus: true,
      value: task.description || '',
      style: {
        fg: T.ink,
        bg: T.ground,
        border: { fg: T.accent },
      }
    });

    // Buttons - bordered height-3 like the SDK ConfirmModal: borderless
    // 1-row buttons never painted (reported with a screenshot, 2026-09-09).
    const saveBtn = createButton({
      parent: modal,
      top: 19,
      left: 15,
      width: 14,
      height: 3,
      content: '[ Save ]',
      align: 'center',
      valign: 'middle',
      border: { type: 'line' },
      keys: true,
      mouse: true,
      style: {
        fg: T.ink,
        bg: T.ok,
        border: { fg: T.ok },
        focus: { bg: 'lightgreen', fg: T.ground },
        hover: { bg: 'lightgreen', fg: T.ground }
      }
    });

    const cancelBtn = createButton({
      parent: modal,
      top: 19,
      left: 38,
      width: 14,
      height: 3,
      content: '[ Cancel ]',
      align: 'center',
      valign: 'middle',
      border: { type: 'line' },
      keys: true,
      mouse: true,
      style: {
        fg: T.ink,
        bg: T.alert,
        border: { fg: T.alert },
        focus: { bg: 'lightred', fg: T.ground },
        hover: { bg: 'lightred', fg: T.ground }
      }
    });

    let closed = false;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      screen.off('keypress', keyHandler);
      screen.remove(modal);
      screen.render();
    };

    // Double-submit guard: Save is reachable from the button, Ctrl+Enter
    // and (via focus) plain Enter in quick succession, and two interleaved
    // saves store the same task object twice - the board then shows the
    // task duplicated under one id (2026-09-09). Set synchronously so the
    // second entry bails before its first await.
    const save = guardDoubleSubmit(async () => {
      task.title = titleInput.getValue();
      task.category = CATEGORIES[categoryList.selected!] as TaskCategory;
      task.priority = PRIORITIES[priorityList.selected!] as TaskPriority;
      task.points = parseInt(pointsInput.getValue()) || 10;
      task.description = descInput.getValue();
      task.assignedTo = assigneeOptions[assigneeList.selected!]?.userId ?? undefined;
      const fromProjectId = task.projectId;
      const chosenProject = projectOptions[projectList.selected!];
      if (chosenProject) task.projectId = chosenProject.id;
      const projectNameOf = (id: string | undefined) =>
        projectOptions.find((o) => o.id === id)?.label ?? id ?? '';

      if (!task.title.trim()) {
        const msg = blessed.message({
          parent: screen,
          top: 'center',
          left: 'center',
          width: 'shrink',
          height: 'shrink',
          padding: 2,
          border: { type: 'line' },
          style: { border: { fg: T.alert }, bg: T.ground },
          label: ' Error '
        });
        msg.display('Task title cannot be empty!', () => {
          screen.remove(msg);
          screen.render();
        });
        return;
      }

      if (isNew) {
        await dataManager.addTask(task);
        if (bbsApi?.emitCustomEvent && project) {
          bbsApi.emitCustomEvent('task_created', `Created ${task.category} task "${task.title}"`, {
            projectId: task.projectId, taskId: task.id, taskCategory: task.category
          });
        }
      } else {
        task.updatedAt = new Date().toISOString();
        await dataManager.updateTask(task);
        // Re-homing an edit is the backlog-to-project move the door never
        // had: say so on the feed, with both ends, like a status move does.
        if (task.projectId !== fromProjectId && bbsApi?.emitCustomEvent) {
          bbsApi.emitCustomEvent(
            'task_moved',
            `Moved task "${task.title}" from ${projectNameOf(fromProjectId)} to ${projectNameOf(task.projectId)}`,
            {
              projectId: task.projectId,
              projectName: projectNameOf(task.projectId),
              taskId: task.id,
              fromProjectId,
              toProjectId: task.projectId
            }
          );
        }
      }

      cleanup();
      resolve();
    });

    saveBtn.on('press', () => { save(); });
    cancelBtn.on('press', () => { cleanup(); resolve(); });

    // Tab order for the dialog. WHIP runs with focusKeys:false (arrows must
    // never yank focus out of its lists), so the screen's default Tab
    // navigation is off and the dialog advances focus itself down this ring -
    // which is also why a focus TRAP is not used here: a trap suppresses
    // screen-level key handlers, and this dialog's keys live on the screen.
    const focusables: any[] = [titleInput, categoryList, priorityList, projectList, assigneeList, pointsInput, descInput, saveBtn, cancelBtn];
    const advanceFrom = (_current: any) => { if (!closed) advanceFocus(screen, focusables); };
    const retreatFrom = (_current: any) => { if (!closed) retreatFocus(screen, focusables); };


    // Enter in a text field advances to the next field (the textbox consumes
    // Enter as submit); Enter on a focused button presses it. Ctrl+Enter
    // saves from anywhere.
    titleInput.on('submit', () => advanceFrom(titleInput));
    pointsInput.on('submit', () => advanceFrom(pointsInput));
    descInput.on('submit', () => advanceFrom(descInput));

    const keyHandler = (ch: any, key: any) => {
      if (closed) return;
      if (key.name === 'escape') { cleanup(); resolve(); }
      else if (key.name === 'enter' && key.ctrl) { save(); }
      else if ((key.name === 'up' || key.name === 'down') && screen.getFocused() === projectList) {
        // Arrows move the list's own selection without firing 'select';
        // the label follows a tick later, after the widget had its turn.
        setTimeout(refreshLabel, 0);
      }
      else if (key.name === 'tab') {
        if (key.shift) retreatFrom(screen.getFocused());
        else advanceFrom(screen.getFocused());
      }
    };

    screen.on('keypress', keyHandler);
    titleInput.focus();
    screen.render();
  });
}
