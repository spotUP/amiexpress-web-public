"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTask = createTask;
exports.editTask = editTask;
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const blessed_1 = __importDefault(require("@amiexpress/bbs-door-sdk/engines/ui/blessed"));
const layout_1 = require("./layout");
const uuid_1 = require("uuid");
const door_theme_1 = require("../door-theme");
const CATEGORIES = ['code', 'music', 'gfx', 'design', 'effects', 'engine', '3d', 'bug'];
const PRIORITIES = ['lamer', 'scener', 'elite', 'legend'];
async function createTask(screen, project, user, dataManager, bbsApi) {
    const newTask = {
        id: (0, uuid_1.v4)(),
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
    return showTaskEditor(screen, newTask, user, dataManager, true, project, bbsApi);
}
async function editTask(screen, task, user, dataManager, achievementManager, project, bbsApi) {
    return showTaskEditor(screen, task, user, dataManager, false, project, bbsApi);
}
async function showTaskEditor(screen, task, user, dataManager, isNew, project, bbsApi) {
    // Assignee picker source. Loaded here (not in the dialog body) because
    // the dialog builds synchronously; a board the user never opened has no
    // WHIP users yet, so this is allowed to be empty.
    let knownUsers = {};
    try {
        knownUsers = await dataManager.loadUsers();
    }
    catch {
        knownUsers = {};
    }
    // Handle per id for the picker; unknown ids stay selectable so an edit
    // can never silently unassign.
    const handleOf = (userId) => {
        if (!userId)
            return null;
        const found = Object.values(knownUsers).find((u) => u.userId === userId);
        return found ? found.handle : null;
    };
    const assigneeOptions = [
        { label: '(Unassigned)', userId: null },
        ...Object.values(knownUsers)
            .map((u) => ({ label: u.handle, userId: u.userId }))
            .sort((a, b) => a.label.localeCompare(b.label)),
    ];
    const currentHandle = handleOf(task.assignedTo);
    if (task.assignedTo && !currentHandle) {
        assigneeOptions.push({ label: `(Unknown: ${task.assignedTo})`, userId: task.assignedTo });
    }
    let selectedAssignee = 0;
    if (task.assignedTo) {
        const idx = assigneeOptions.findIndex((o) => o.userId === task.assignedTo);
        if (idx !== -1)
            selectedAssignee = idx;
    }
    // Project picker source. Same shape as the assignee picker above: the
    // door pinned every task to the project whose board opened the dialog,
    // so a quick-task could never choose a project and a Backlog task could
    // never move out (2026-09-10). The dialog now chooses.
    let allProjects = [];
    try {
        allProjects = await dataManager.loadProjects();
    }
    catch {
        allProjects = [];
    }
    if (allProjects.length === 0 && project)
        allProjects = [project];
    const projectOptions = allProjects.map((p) => ({ label: p.name, id: p.id }));
    if (task.projectId && !projectOptions.some((o) => o.id === task.projectId)) {
        projectOptions.push({ label: `(Unknown: ${task.projectId})`, id: task.projectId });
    }
    let selectedProject = 0;
    if (task.projectId) {
        const idx = projectOptions.findIndex((o) => o.id === task.projectId);
        if (idx !== -1)
            selectedProject = idx;
    }
    return new Promise((resolve) => {
        screen.program.enableMouse();
        // Modal container - the project name rides in the label, so a task can
        // never silently land somewhere unexpected (a new task opened from the
        // Backlog quick action used to look identical to one opened on a real
        // project, and the task "vanished" - it was in Backlog all along).
        // The label follows the Project picker below, so it stays true.
        const labelFor = (name) => `${isNew ? ' New Task' : ' Edit Task'}${name ? ` - ${name} ` : ' '}`;
        /*
         * THE FIELDS ARE PLACED FOR THE SCREEN, not by literals - `ui/layout.ts`
         * holds the decision for both widths. A `width: 68` modal cannot open on
         * a C64 at all, which is half of why this door was refused there.
         */
        const fields = (0, layout_1.taskEditorLayout)(screen.width, screen.height);
        const modal = blessed_1.default.box({
            parent: screen,
            top: 'center',
            left: 'center',
            width: fields.modal.width,
            height: fields.modal.height,
            border: { type: 'line' },
            style: {
                border: { fg: door_theme_1.T.accentAlt },
                bg: door_theme_1.T.ground
            },
            label: labelFor(project?.name ?? projectOptions[selectedProject]?.label ?? ''),
            tags: true,
        });
        // Title input - bordered textbox with label on border (WORKING PATTERN)
        const titleInput = blessed_1.default.textbox({
            parent: modal,
            ...fields.title,
            border: { type: 'line' },
            label: ' Title ',
            keys: true,
            mouse: true,
            inputOnFocus: true,
            value: task.title,
            style: {
                fg: door_theme_1.T.ink,
                bg: door_theme_1.T.ground,
                border: { fg: door_theme_1.T.accent },
            }
        });
        // Category list
        const categoryList = blessed_1.default.list({
            parent: modal,
            ...fields.category,
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
                border: { fg: door_theme_1.T.accent },
                selected: { bg: door_theme_1.T.accent, fg: door_theme_1.T.ground },
                item: { fg: door_theme_1.T.ink, bg: door_theme_1.T.ground },
                bg: door_theme_1.T.ground
            },
        });
        // Priority list
        const priorityList = blessed_1.default.list({
            parent: modal,
            ...fields.priority,
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
                border: { fg: door_theme_1.T.accent },
                selected: { bg: door_theme_1.T.accent, fg: door_theme_1.T.ground },
                item: { fg: door_theme_1.T.ink, bg: door_theme_1.T.ground },
                bg: door_theme_1.T.ground
            },
        });
        // Project list - full width under Category/Priority. New tasks used to
        // be pinned to the opening project with no choice; edits could never
        // re-home, so Backlog tasks were stuck (2026-09-10).
        const projectList = blessed_1.default.list({
            parent: modal,
            ...fields.project,
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
                border: { fg: door_theme_1.T.accent },
                selected: { bg: door_theme_1.T.accent, fg: door_theme_1.T.ground },
                item: { fg: door_theme_1.T.ink, bg: door_theme_1.T.ground },
                bg: door_theme_1.T.ground
            },
        });
        const refreshLabel = () => {
            const name = projectOptions[projectList.selected]?.label ?? '';
            modal.options.label = labelFor(name);
        };
        projectList.on('select', refreshLabel);
        // Assignee list - left column under Project. The door never had a way
        // to assign at all: new tasks silently took the creator.
        const assigneeList = blessed_1.default.list({
            parent: modal,
            ...fields.assignee,
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
                border: { fg: door_theme_1.T.accent },
                selected: { bg: door_theme_1.T.accent, fg: door_theme_1.T.ground },
                item: { fg: door_theme_1.T.ink, bg: door_theme_1.T.ground },
                bg: door_theme_1.T.ground
            },
        });
        // Points input - bordered textbox
        const pointsInput = blessed_1.default.textbox({
            parent: modal,
            ...fields.points,
            border: { type: 'line' },
            label: ' Points ',
            keys: true,
            mouse: true,
            inputOnFocus: true,
            value: task.points.toString(),
            style: {
                fg: door_theme_1.T.ink,
                bg: door_theme_1.T.ground,
                border: { fg: door_theme_1.T.accent },
            }
        });
        // Description input - bordered textbox
        const descInput = blessed_1.default.textbox({
            parent: modal,
            ...fields.description,
            border: { type: 'line' },
            label: ' Description (optional) ',
            keys: true,
            mouse: true,
            inputOnFocus: true,
            value: task.description || '',
            style: {
                fg: door_theme_1.T.ink,
                bg: door_theme_1.T.ground,
                border: { fg: door_theme_1.T.accent },
            }
        });
        // Buttons - bordered height-3 like the SDK ConfirmModal: borderless
        // 1-row buttons never painted (reported with a screenshot, 2026-09-09).
        const saveBtn = (0, blessed_helpers_1.createButton)({
            parent: modal,
            top: fields.buttonsTop,
            left: fields.buttons.ok.left,
            width: fields.buttons.ok.width,
            height: 3,
            content: '[ Save ]',
            align: 'center',
            valign: 'middle',
            border: { type: 'line' },
            keys: true,
            mouse: true,
            style: {
                fg: door_theme_1.T.ink,
                bg: door_theme_1.T.ok,
                border: { fg: door_theme_1.T.ok },
                focus: { bg: 'lightgreen', fg: door_theme_1.T.ground },
                hover: { bg: 'lightgreen', fg: door_theme_1.T.ground }
            }
        });
        const cancelBtn = (0, blessed_helpers_1.createButton)({
            parent: modal,
            top: fields.buttonsTop,
            left: fields.buttons.cancel.left,
            width: fields.buttons.cancel.width,
            height: 3,
            content: '[ Cancel ]',
            align: 'center',
            valign: 'middle',
            border: { type: 'line' },
            keys: true,
            mouse: true,
            style: {
                fg: door_theme_1.T.ink,
                bg: door_theme_1.T.alert,
                border: { fg: door_theme_1.T.alert },
                focus: { bg: 'lightred', fg: door_theme_1.T.ground },
                hover: { bg: 'lightred', fg: door_theme_1.T.ground }
            }
        });
        let closed = false;
        // The Project label follows the arrow keys a tick late (see the key
        // handler). A dialog closed within that tick would have left the timer
        // to fire on a removed modal, so it is cleared here.
        let labelTimer = null;
        const cleanup = () => {
            if (closed)
                return;
            closed = true;
            if (labelTimer) {
                clearTimeout(labelTimer);
                labelTimer = null;
            }
            screen.off('keypress', keyHandler);
            screen.remove(modal);
            screen.render();
        };
        // Double-submit guard: Save is reachable from the button, Ctrl+Enter
        // and (via focus) plain Enter in quick succession, and two interleaved
        // saves store the same task object twice - the board then shows the
        // task duplicated under one id (2026-09-09). Set synchronously so the
        // second entry bails before its first await.
        const save = (0, blessed_helpers_1.guardDoubleSubmit)(async () => {
            // VALIDATE FIRST, then write (2026-09-13). This used to assign title,
            // category, priority, points, assignee and projectId onto the Task -
            // which is DataManager's cached record, handed out by reference - and
            // only then check the title, returning without putting any of it back.
            // Clearing the title and pressing Ctrl+Enter therefore left a
            // blank-titled, possibly re-homed task on the board and in the Discord
            // API even after Escape, because nothing was ever reverted.
            const title = titleInput.getValue();
            if (!title.trim()) {
                const msg = blessed_1.default.message({
                    parent: screen,
                    top: 'center',
                    left: 'center',
                    width: 'shrink',
                    height: 'shrink',
                    padding: 2,
                    border: { type: 'line' },
                    style: { border: { fg: door_theme_1.T.alert }, bg: door_theme_1.T.ground },
                    label: ' Error '
                });
                msg.display('Task title cannot be empty!', () => {
                    screen.remove(msg);
                    screen.render();
                });
                return;
            }
            task.title = title;
            task.category = CATEGORIES[categoryList.selected];
            task.priority = PRIORITIES[priorityList.selected];
            task.points = parseInt(pointsInput.getValue()) || 10;
            task.description = descInput.getValue();
            task.assignedTo = assigneeOptions[assigneeList.selected]?.userId ?? undefined;
            const fromProjectId = task.projectId;
            const chosenProject = projectOptions[projectList.selected];
            if (chosenProject)
                task.projectId = chosenProject.id;
            const projectNameOf = (id) => projectOptions.find((o) => o.id === id)?.label ?? id ?? '';
            if (isNew) {
                await dataManager.addTask(task);
                if (bbsApi?.emitCustomEvent && project) {
                    bbsApi.emitCustomEvent('task_created', `Created ${task.category} task "${task.title}"`, {
                        projectId: task.projectId, taskId: task.id, taskCategory: task.category
                    });
                }
            }
            else {
                task.updatedAt = new Date().toISOString();
                await dataManager.updateTask(task);
                // Re-homing an edit is the backlog-to-project move the door never
                // had: say so on the feed, with both ends, like a status move does.
                if (task.projectId !== fromProjectId && bbsApi?.emitCustomEvent) {
                    bbsApi.emitCustomEvent('task_moved', `Moved task "${task.title}" from ${projectNameOf(fromProjectId)} to ${projectNameOf(task.projectId)}`, {
                        projectId: task.projectId,
                        projectName: projectNameOf(task.projectId),
                        taskId: task.id,
                        fromProjectId,
                        toProjectId: task.projectId
                    });
                }
            }
            cleanup();
            resolve(task);
        });
        saveBtn.on('press', () => { save(); });
        cancelBtn.on('press', () => { cleanup(); resolve(null); });
        // Tab order for the dialog. WHIP runs with focusKeys:false (arrows must
        // never yank focus out of its lists), so the screen's default Tab
        // navigation is off and the dialog advances focus itself down this ring -
        // which is also why a focus TRAP is not used here: a trap suppresses
        // screen-level key handlers, and this dialog's keys live on the screen.
        const focusables = [titleInput, categoryList, priorityList, projectList, assigneeList, pointsInput, descInput, saveBtn, cancelBtn];
        const advanceFrom = (_current) => { if (!closed)
            (0, blessed_helpers_1.advanceFocus)(screen, focusables); };
        const retreatFrom = (_current) => { if (!closed)
            (0, blessed_helpers_1.retreatFocus)(screen, focusables); };
        // Enter in a text field advances to the next field (the textbox consumes
        // Enter as submit); Enter on a focused button presses it. Ctrl+Enter
        // saves from anywhere.
        //
        // EXCEPT THE TITLE OF A NEW TASK: there Enter is Save (sysop, 2026-09-27:
        // "type the title and press Enter - that should trigger OK at once").
        // Every other field has a default a quick task can keep, so making the
        // caller Tab through six of them to reach Save was the whole cost of a new
        // task. The same save() the button calls, so a blank title is still
        // refused by the one validation. An edit keeps Enter-advances: the caller
        // came to change something further down.
        titleInput.on('submit', () => {
            // The title keeps focus through a refused save (the error message
            // hands focus back when dismissed), so the caller just types on.
            if (isNew) {
                save();
            }
            else {
                advanceFrom(titleInput);
            }
        });
        pointsInput.on('submit', () => advanceFrom(pointsInput));
        descInput.on('submit', () => advanceFrom(descInput));
        const keyHandler = (ch, key) => {
            if (closed)
                return;
            if (key.name === 'escape') {
                cleanup();
                resolve(null);
            }
            else if (key.name === 'enter' && key.ctrl) {
                save();
            }
            else if ((key.name === 'up' || key.name === 'down') && screen.getFocused() === projectList) {
                // Arrows move the list's own selection without firing 'select';
                // the label follows a tick later, after the widget had its turn.
                if (labelTimer)
                    clearTimeout(labelTimer);
                labelTimer = setTimeout(() => {
                    labelTimer = null;
                    if (!closed)
                        refreshLabel();
                }, 0);
            }
            else if (key.name === 'tab') {
                if (key.shift)
                    retreatFrom(screen.getFocused());
                else
                    advanceFrom(screen.getFocused());
            }
        };
        screen.on('keypress', keyHandler);
        titleInput.focus();
        screen.render();
    });
}
