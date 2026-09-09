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
    return new Promise((resolve) => {
        screen.program.enableMouse();
        // Modal container
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
            label: isNew ? ' New Task ' : ' Edit Task ',
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
            height: 9,
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
        const save = async () => {
            task.title = titleInput.getValue();
            task.category = CATEGORIES[categoryList.selected];
            task.priority = PRIORITIES[priorityList.selected];
            task.points = parseInt(pointsInput.getValue()) || 10;
            task.description = descInput.getValue();
            if (!task.title.trim()) {
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
        const focusables = [titleInput, categoryList, priorityList, pointsInput, descInput, saveBtn, cancelBtn];
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
