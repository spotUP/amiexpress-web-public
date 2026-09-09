"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTask = createTask;
exports.editTask = editTask;
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const blessed_1 = __importDefault(require("@amiexpress/bbs-door-sdk/engines/ui/blessed"));
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
    await showTaskEditor(screen, newTask, user, dataManager, true, project, bbsApi);
}
async function editTask(screen, task, user, dataManager, achievementManager, project, bbsApi) {
    await showTaskEditor(screen, task, user, dataManager, false, project, bbsApi);
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
    return new Promise((resolve) => {
        screen.program.enableMouse();
        // Modal container - the project name rides in the label, so a task can
        // never silently land somewhere unexpected (a new task opened from the
        // Backlog quick action used to look identical to one opened on a real
        // project, and the task "vanished" - it was in Backlog all along).
        const projectName = project?.name ?? '';
        const modal = blessed_1.default.box({
            parent: screen,
            top: 'center',
            left: 'center',
            width: 68,
            height: 22,
            border: { type: 'line' },
            style: {
                border: { fg: door_theme_1.T.accentAlt },
                bg: door_theme_1.T.ground
            },
            label: `${isNew ? ' New Task' : ' Edit Task'}${projectName ? ` - ${projectName} ` : ' '}`,
            tags: true,
        });
        // Title input - bordered textbox with label on border (WORKING PATTERN)
        const titleInput = blessed_1.default.textbox({
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
                fg: door_theme_1.T.ink,
                bg: door_theme_1.T.ground,
                border: { fg: door_theme_1.T.accent },
            }
        });
        // Category list
        const categoryList = blessed_1.default.list({
            parent: modal,
            top: 5,
            left: 1,
            width: '48%',
            height: 7,
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
            top: 5,
            left: '50%',
            right: 1,
            height: 6,
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
        // Assignee list - left column under Category. The door never had a way
        // to assign at all: new tasks silently took the creator.
        const assigneeList = blessed_1.default.list({
            parent: modal,
            top: 12,
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
                border: { fg: door_theme_1.T.accent },
                selected: { bg: door_theme_1.T.accent, fg: door_theme_1.T.ground },
                item: { fg: door_theme_1.T.ink, bg: door_theme_1.T.ground },
                bg: door_theme_1.T.ground
            },
        });
        // Points input - bordered textbox
        const pointsInput = blessed_1.default.textbox({
            parent: modal,
            top: 12,
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
                fg: door_theme_1.T.ink,
                bg: door_theme_1.T.ground,
                border: { fg: door_theme_1.T.accent },
            }
        });
        // Description input - bordered textbox
        const descInput = blessed_1.default.textbox({
            parent: modal,
            top: 15,
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
                fg: door_theme_1.T.ink,
                bg: door_theme_1.T.ground,
                border: { fg: door_theme_1.T.accent },
            }
        });
        // Buttons - bordered height-3 like the SDK ConfirmModal: borderless
        // 1-row buttons never painted (reported with a screenshot, 2026-09-09).
        const saveBtn = (0, blessed_helpers_1.createButton)({
            parent: modal,
            top: 18,
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
                fg: door_theme_1.T.ink,
                bg: door_theme_1.T.ok,
                border: { fg: door_theme_1.T.ok },
                focus: { bg: 'lightgreen', fg: door_theme_1.T.ground },
                hover: { bg: 'lightgreen', fg: door_theme_1.T.ground }
            }
        });
        const cancelBtn = (0, blessed_helpers_1.createButton)({
            parent: modal,
            top: 18,
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
                fg: door_theme_1.T.ink,
                bg: door_theme_1.T.alert,
                border: { fg: door_theme_1.T.alert },
                focus: { bg: 'lightred', fg: door_theme_1.T.ground },
                hover: { bg: 'lightred', fg: door_theme_1.T.ground }
            }
        });
        let closed = false;
        const cleanup = () => {
            if (closed)
                return;
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
        let saving = false;
        const save = async () => {
            if (saving)
                return;
            saving = true;
            task.title = titleInput.getValue();
            task.category = CATEGORIES[categoryList.selected];
            task.priority = PRIORITIES[priorityList.selected];
            task.points = parseInt(pointsInput.getValue()) || 10;
            task.description = descInput.getValue();
            task.assignedTo = assigneeOptions[assigneeList.selected]?.userId ?? undefined;
            if (!task.title.trim()) {
                saving = false;
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
            if (isNew) {
                await dataManager.addTask(task);
                if (bbsApi?.emitCustomEvent && project) {
                    bbsApi.emitCustomEvent('task_created', `Created ${task.category} task "${task.title}"`, {
                        projectId: project.id, taskId: task.id, taskCategory: task.category
                    });
                }
            }
            else {
                task.updatedAt = new Date().toISOString();
                await dataManager.updateTask(task);
            }
            cleanup();
            resolve();
        };
        saveBtn.on('press', () => { save(); });
        cancelBtn.on('press', () => { cleanup(); resolve(); });
        // Tab order for the dialog. WHIP runs with focusKeys:false (arrows must
        // never yank focus out of its lists), so the screen's default Tab
        // navigation is off and the dialog advances focus itself down this ring -
        // which is also why a focus TRAP is not used here: a trap suppresses
        // screen-level key handlers, and this dialog's keys live on the screen.
        const focusables = [titleInput, categoryList, priorityList, assigneeList, pointsInput, descInput, saveBtn, cancelBtn];
        const advanceFrom = (current) => {
            if (closed)
                return;
            const i = focusables.indexOf(current);
            focusables[(i + 1) % focusables.length].focus();
            screen.render();
        };
        const retreatFrom = (current) => {
            if (closed)
                return;
            const i = focusables.indexOf(current);
            focusables[(i - 1 + focusables.length) % focusables.length].focus();
            screen.render();
        };
        // Enter in a text field advances to the next field (the textbox consumes
        // Enter as submit); Enter on a focused button presses it. Ctrl+Enter
        // saves from anywhere.
        titleInput.on('submit', () => advanceFrom(titleInput));
        pointsInput.on('submit', () => advanceFrom(pointsInput));
        descInput.on('submit', () => advanceFrom(descInput));
        const keyHandler = (ch, key) => {
            if (closed)
                return;
            if (key.name === 'escape') {
                cleanup();
                resolve();
            }
            else if (key.name === 'enter' && key.ctrl) {
                save();
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
