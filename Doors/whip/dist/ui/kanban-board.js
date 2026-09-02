"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.showKanbanBoard = showKanbanBoard;
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const blessed_1 = __importDefault(require("@amiexpress/bbs-door-sdk/engines/ui/blessed"));
const gamification_1 = require("../core/gamification");
const task_editor_1 = require("./task-editor");
const door_theme_1 = require("../door-theme");
const COLUMNS = ['todo', 'in-progress', 'testing', 'done'];
const COLUMN_LABELS = {
    'todo': 'TODO',
    'in-progress': 'IN PROGRESS',
    'testing': 'TESTING',
    'done': 'DONE'
};
async function showKanbanBoard(screen, project, user, dataManager, achievementManager, bbsApi) {
    return new Promise(async (resolve) => {
        screen.program.enableMouse();
        screen.clearRegion(0, screen.width, 0, screen.height);
        screen.alloc();
        let currentColumn = 0;
        let tasks = await dataManager.getTasksForProject(project.id);
        // Drag and drop state
        let dragState = {
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
        const header = (0, blessed_helpers_1.createBox)({
            parent: screen,
            top: 0,
            left: 0,
            width: '100%',
            height: 3,
            fixed: true,
            border: { type: 'line' },
            content: `{center}{bold}{${door_theme_1.T.accent}-fg}PROJECT: ${project.name}{/${door_theme_1.T.accent}-fg}{/bold} - Kanban Board${partyInfo}{/center}\n` +
                `{center}Tasks: {bold}${tasks.length}{/bold} | Todo: {bold}${tasks.filter(t => t.status === 'todo').length}{/bold} | In Progress: {bold}${tasks.filter(t => t.status === 'in-progress').length}{/bold} | Done: {bold}${tasks.filter(t => t.status === 'done').length}{/bold}{/center}`,
            style: { fg: door_theme_1.T.ink, bg: door_theme_1.T.ground, border: { fg: door_theme_1.T.accent } },
            tags: true,
            focusable: false,
            mouse: false,
            clickable: false,
        });
        // Column containers - calculate width based on screen width
        // Leave 1 char margin on right to ensure border is visible
        const totalWidth = screen.width - 1;
        const colWidth = Math.floor(totalWidth / 4);
        const columnBoxes = [];
        const columnLists = [];
        const leftMargin = 0;
        for (let i = 0; i < COLUMNS.length; i++) {
            const status = COLUMNS[i];
            const label = COLUMN_LABELS[status];
            const box = (0, blessed_helpers_1.createBox)({
                parent: screen,
                top: 3,
                left: leftMargin + (i * colWidth),
                width: colWidth,
                height: '100%-6',
                fixed: true,
                border: { type: 'line' },
                label: ` ${label} `,
                style: {
                    border: { fg: i === currentColumn ? 'yellow' : 'cyan' },
                    bg: door_theme_1.T.ground
                },
                focusable: false,
                mouse: false,
                clickable: false,
            });
            const list = (0, blessed_helpers_1.createList)({
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
                    selected: { bg: door_theme_1.T.accent, fg: door_theme_1.T.ground },
                    item: { fg: door_theme_1.T.ink },
                    bg: door_theme_1.T.ground
                }
            });
            // Store column index for drag handling
            list._columnIndex = i;
            columnBoxes.push(box);
            columnLists.push(list);
        }
        // Footer - NOT focusable
        const footer = (0, blessed_helpers_1.createBox)({
            parent: screen,
            bottom: 0,
            left: 0,
            width: '100%',
            height: 3,
            fixed: true,
            border: { type: 'line' },
            content: ` {${door_theme_1.T.accent}-fg}[Arrows]{/${door_theme_1.T.accent}-fg} Navigate   {${door_theme_1.T.accent}-fg}[Enter]{/${door_theme_1.T.accent}-fg} Edit   {${door_theme_1.T.accent}-fg}[N]{/${door_theme_1.T.accent}-fg} New   {${door_theme_1.T.accent}-fg}[M]{/${door_theme_1.T.accent}-fg} Move   {${door_theme_1.T.accent}-fg}[D]{/${door_theme_1.T.accent}-fg} Delete   {${door_theme_1.T.alert}-fg}[Q/ESC]{/${door_theme_1.T.alert}-fg} Back\n` +
                ` {${door_theme_1.T.accentAlt}-fg}Drag & Drop:{/${door_theme_1.T.accentAlt}-fg} Click and drag tasks between columns`,
            style: { fg: door_theme_1.T.dim, bg: door_theme_1.T.ground, border: { fg: door_theme_1.T.dim } },
            tags: true,
            focusable: false,
            mouse: false,
            clickable: false,
        });
        // Debounce timer for navigation updates
        let updateTimeout = null;
        let isUpdating = false;
        const updateListsImmediate = () => {
            for (let i = 0; i < COLUMNS.length; i++) {
                columnBoxes[i].style.border.fg = i === currentColumn ? 'yellow' : 'cyan';
            }
            columnLists[currentColumn].focus();
            screen.render();
        };
        const updateLists = async (immediate = false) => {
            if (isUpdating && !immediate)
                return;
            if (updateTimeout) {
                clearTimeout(updateTimeout);
                updateTimeout = null;
            }
            if (immediate) {
                isUpdating = true;
                tasks = await dataManager.getTasksForProject(project.id);
                for (let i = 0; i < COLUMNS.length; i++) {
                    const status = COLUMNS[i];
                    const columnTasks = tasks.filter(t => t.status === status);
                    const maxTitleLen = Math.max(8, colWidth - 12);
                    const items = columnTasks.map(task => {
                        const priorityInitial = task.priority[0].toUpperCase();
                        const priorityColor = (0, gamification_1.getPriorityColor)(task.priority);
                        const title = task.title.length > maxTitleLen
                            ? task.title.substring(0, maxTitleLen - 2) + '..'
                            : task.title;
                        return `${title} {${priorityColor}-fg}[${priorityInitial}]{/${priorityColor}-fg} ${task.points}`;
                    });
                    // Clear items first, then set new ones to ensure proper refresh
                    columnLists[i].clearItems();
                    columnLists[i].setItems(items.length > 0 ? items : []);
                }
                // Update header with new counts
                header.setContent(`{center}{bold}{${door_theme_1.T.accent}-fg}PROJECT: ${project.name}{/${door_theme_1.T.accent}-fg}{/bold} - Kanban Board${partyInfo}{/center}\n` +
                    `{center}Tasks: {bold}${tasks.length}{/bold} | Todo: {bold}${tasks.filter(t => t.status === 'todo').length}{/bold} | In Progress: {bold}${tasks.filter(t => t.status === 'in-progress').length}{/bold} | Done: {bold}${tasks.filter(t => t.status === 'done').length}{/bold}{/center}`);
                for (let i = 0; i < COLUMNS.length; i++) {
                    columnBoxes[i].style.border.fg = i === currentColumn ? 'yellow' : 'cyan';
                }
                columnLists[currentColumn].focus();
                screen.render();
                isUpdating = false;
            }
            else {
                updateTimeout = setTimeout(async () => {
                    updateTimeout = null;
                    await updateLists(true);
                }, 50);
                updateListsImmediate();
            }
        };
        await updateLists(true);
        // Get column index from screen X position
        const getColumnFromX = (x) => {
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
        const startDrag = (colIndex, itemIndex, x, y) => {
            const columnTasks = tasks.filter(t => t.status === COLUMNS[colIndex]);
            if (itemIndex >= columnTasks.length)
                return;
            const task = columnTasks[itemIndex];
            dragState = {
                active: true,
                task: task,
                fromColumn: colIndex,
                fromIndex: itemIndex,
                ghost: (0, blessed_helpers_1.createBox)({
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
                        fg: door_theme_1.T.ink,
                        bg: door_theme_1.T.bar,
                        border: { fg: door_theme_1.T.accentAlt }
                    },
                    tags: true,
                })
            };
            screen.render();
        };
        // Update drag ghost position
        const updateDrag = (x, y) => {
            if (!dragState.active || !dragState.ghost)
                return;
            dragState.ghost.top = y - 1;
            dragState.ghost.left = x - 8;
            // Highlight potential drop target
            const targetCol = getColumnFromX(x);
            for (let i = 0; i < COLUMNS.length; i++) {
                if (i === targetCol && targetCol !== dragState.fromColumn) {
                    columnBoxes[i].style.border.fg = 'green';
                }
                else if (i === currentColumn) {
                    columnBoxes[i].style.border.fg = 'yellow';
                }
                else {
                    columnBoxes[i].style.border.fg = 'cyan';
                }
            }
            screen.render();
        };
        // End drag operation
        const endDrag = async (x, y) => {
            if (!dragState.active || !dragState.task)
                return;
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
                }
                catch (err) {
                    console.error('[Kanban] Move task failed:', err);
                }
                await updateLists(true);
            }
            else {
                // Dropped on same column or outside - just refresh to reset borders
                for (let i = 0; i < COLUMNS.length; i++) {
                    columnBoxes[i].style.border.fg = i === currentColumn ? 'yellow' : 'cyan';
                }
                screen.render();
            }
        };
        // Set up drag handlers for each list
        for (let i = 0; i < columnLists.length; i++) {
            const list = columnLists[i];
            const colIndex = i; // Capture for closure
            list.on('mouse', (data) => {
                if (data.action === 'mousedown') {
                    // Skip if already dragging
                    if (dragState.active)
                        return;
                    const columnTasks = tasks.filter(t => t.status === COLUMNS[colIndex]);
                    if (columnTasks.length === 0)
                        return;
                    // Get the selected item index - blessed updates this on mousedown
                    const selectedIndex = list.selected ?? 0;
                    if (selectedIndex >= columnTasks.length)
                        return;
                    currentColumn = colIndex;
                    // Capture coordinates and start drag immediately
                    const mouseX = data.x;
                    const mouseY = data.y;
                    startDrag(colIndex, selectedIndex, mouseX, mouseY);
                }
            });
        }
        // Global mouse handler for drag operations
        const mouseHandler = (data) => {
            if (!dragState.active)
                return;
            if (data.action === 'mousemove') {
                updateDrag(data.x, data.y);
            }
            else if (data.action === 'mouseup' || data.action === 'mouserelease') {
                endDrag(data.x, data.y);
            }
        };
        // Also handle element mouse events that might capture the release
        const elementMouseHandler = (data) => {
            if (!dragState.active)
                return;
            if (data.action === 'mouseup' || data.action === 'mouserelease') {
                endDrag(data.x, data.y);
            }
        };
        screen.on('mouse', mouseHandler);
        // Listen on each column for mouseup in case screen doesn't get it
        columnLists.forEach(list => list.on('mouse', elementMouseHandler));
        const cleanup = () => {
            if (updateTimeout)
                clearTimeout(updateTimeout);
            screen.off('keypress', keyHandler);
            screen.off('mouse', mouseHandler);
            columnLists.forEach(list => list.off('mouse', elementMouseHandler));
            if (dragState.ghost)
                screen.remove(dragState.ghost);
            screen.remove(header);
            columnBoxes.forEach(box => screen.remove(box));
            screen.remove(footer);
        };
        const keyHandler = (ch, key) => {
            // Ignore keys during drag
            if (dragState.active)
                return;
            if (key.name === 'left' || key.name === 'right') {
                if (key.name === 'left') {
                    currentColumn = Math.max(0, currentColumn - 1);
                }
                else {
                    currentColumn = Math.min(COLUMNS.length - 1, currentColumn + 1);
                }
                updateLists(false);
                return;
            }
            (async () => {
                const columnTasks = tasks.filter(t => t.status === COLUMNS[currentColumn]);
                switch (key.name) {
                    case 'enter':
                        if (columnTasks.length > 0) {
                            const selectedIndex = columnLists[currentColumn].selected || 0;
                            const task = columnTasks[selectedIndex];
                            await (0, task_editor_1.editTask)(screen, task, user, dataManager, achievementManager, project, bbsApi);
                            await updateLists(true);
                        }
                        break;
                    case 'n':
                        await (0, task_editor_1.createTask)(screen, project, user, dataManager, bbsApi);
                        await updateLists(true);
                        break;
                    case 'm':
                        if (columnTasks.length > 0) {
                            const selectedIndex = columnLists[currentColumn].selected || 0;
                            const task = columnTasks[selectedIndex];
                            const newStatus = await selectMoveDestination(screen);
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
                            const confirmed = await confirmDelete(screen, task.title);
                            if (confirmed) {
                                await dataManager.deleteTask(task.id);
                                if (bbsApi?.emitCustomEvent) {
                                    bbsApi.emitCustomEvent('task_deleted', `Deleted task "${task.title}" from project "${project.name}"`, {
                                        projectId: project.id,
                                        projectName: project.name,
                                        taskId: task.id,
                                        taskCategory: task.category
                                    });
                                }
                                await updateLists(true);
                            }
                        }
                        break;
                    case 'q':
                    case 'escape':
                        cleanup();
                        resolve();
                        break;
                }
            })();
        };
        screen.on('keypress', keyHandler);
    });
}
async function selectMoveDestination(screen) {
    return new Promise((resolve) => {
        const modal = (0, blessed_helpers_1.createBox)({
            parent: screen,
            top: 'center',
            left: 'center',
            width: 40,
            height: 10,
            fixed: true,
            border: { type: 'line' },
            label: ' Move Task To ',
            style: {
                border: { fg: door_theme_1.T.accentAlt },
                bg: door_theme_1.T.ground
            },
            focusable: false,
            mouse: false,
            clickable: false,
        });
        const list = (0, blessed_helpers_1.createList)({
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
                selected: { bg: door_theme_1.T.accent, fg: door_theme_1.T.ground },
                item: { fg: door_theme_1.T.ink },
                bg: door_theme_1.T.ground
            }
        });
        const cleanup = () => {
            screen.off('keypress', keyHandler);
            screen.remove(modal);
            screen.render();
        };
        list.on('select', (item, index) => {
            cleanup();
            resolve(COLUMNS[index]);
        });
        const keyHandler = (ch, key) => {
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
async function moveTask(screen, task, newStatus, dataManager, achievementManager, user, project, bbsApi) {
    const oldStatus = task.status;
    task.status = newStatus;
    task.updatedAt = new Date().toISOString();
    if (newStatus === 'done' && oldStatus !== 'done') {
        task.completedAt = new Date().toISOString();
        const userData = await dataManager.getUser(user.userId);
        if (userData) {
            userData.points += task.points;
            userData.tasksCompleted += 1;
            userData.level = (0, gamification_1.calculateLevel)(userData.points);
            await dataManager.updateUser(userData);
            if (bbsApi?.emitCustomEvent) {
                bbsApi.emitCustomEvent('task_completed', `Completed task "${task.title}" (+${task.points} pts) in "${project.name}"`, {
                    projectId: project.id,
                    projectName: project.name,
                    taskId: task.id,
                    taskCategory: task.category,
                    points: task.points,
                    totalPoints: userData.points,
                    level: userData.level
                });
            }
            const newAchievements = await achievementManager.checkAchievements(userData);
            if (newAchievements.length > 0) {
                const achievements = await dataManager.loadAchievements();
                for (const achievementId of newAchievements) {
                    const achievement = achievements[achievementId];
                    if (achievement) {
                        await showAchievementUnlock(screen, achievement);
                        if (bbsApi?.emitCustomEvent) {
                            bbsApi.emitCustomEvent('achievement_unlocked', `Unlocked achievement "${achievement.name}" (+${achievement.points} pts)`, {
                                achievementId: achievement.id,
                                achievementName: achievement.name,
                                points: achievement.points,
                                category: achievement.category,
                                totalPoints: userData.points
                            });
                        }
                    }
                }
            }
        }
    }
    else if (newStatus !== oldStatus) {
        if (bbsApi?.emitCustomEvent) {
            bbsApi.emitCustomEvent('task_moved', `Moved task "${task.title}" from ${oldStatus} to ${newStatus}`, {
                projectId: project.id,
                projectName: project.name,
                taskId: task.id,
                fromStatus: oldStatus,
                toStatus: newStatus
            });
        }
    }
    await dataManager.updateTask(task);
}
async function confirmDelete(screen, taskTitle) {
    return new Promise((resolve) => {
        const question = blessed_1.default.question({
            parent: screen,
            top: 'center',
            left: 'center',
            width: 60,
            height: 7,
            border: { type: 'line' },
            style: {
                border: { fg: door_theme_1.T.alert },
                bg: door_theme_1.T.ground
            },
            label: ' Confirm Delete '
        });
        question.ask(`Delete task "${taskTitle}"?\n\n(Y/N)`, (answer) => {
            screen.remove(question);
            screen.render();
            resolve(answer);
        });
    });
}
async function showAchievementUnlock(screen, achievement) {
    return new Promise((resolve) => {
        const msg = blessed_1.default.message({
            parent: screen,
            top: 'center',
            left: 'center',
            width: 60,
            height: 10,
            border: { type: 'line' },
            style: {
                border: { fg: door_theme_1.T.accentAlt },
                bg: door_theme_1.T.ground
            },
            label: ' Achievement Unlocked! '
        });
        const content = `{center}{bold}{${door_theme_1.T.ok}-fg}${achievement.icon} ${achievement.name}{/${door_theme_1.T.ok}-fg}{/bold}{/center}\n\n` +
            `{center}${achievement.description}{/center}\n\n` +
            `{center}{${door_theme_1.T.accentAlt}-fg}+${achievement.points} points{/${door_theme_1.T.accentAlt}-fg}{/center}\n\n` +
            `{center}Press any key to continue{/center}`;
        msg.display(content, () => {
            screen.remove(msg);
            screen.render();
            resolve();
        });
    });
}
