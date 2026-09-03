"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.showMyTasks = showMyTasks;
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const gamification_1 = require("../core/gamification");
const task_editor_1 = require("./task-editor");
const door_theme_1 = require("../door-theme");
const chrome_1 = require("./chrome");
/** The keys this screen answers to, and the same keys shortened for 40 columns. */
const HINTS = [
    { key: 'Enter', does: 'Edit Task' },
    { key: 'Up/Down', does: 'Navigate' },
    { key: 'Q/ESC', does: 'Back' },
];
const COMPACT_HINTS = [
    { key: 'Ent', does: 'Edit' },
    { key: 'Up/Dn', does: 'Move' },
    { key: 'Q', does: 'Back' },
];
async function showMyTasks(screen, user, dataManager, achievementManager, bbsApi) {
    return new Promise(async (resolve) => {
        screen.program.enableMouse();
        screen.clearRegion(0, screen.width, 0, screen.height);
        screen.alloc();
        let allTasks = await dataManager.loadTasks();
        let projects = await dataManager.loadProjects();
        // Filter tasks assigned to current user
        let myTasks = allTasks.filter(t => t.assignedTo === user.userId);
        // Sort by status (todo first, then in-progress, testing, done last)
        const statusOrder = { 'todo': 0, 'in-progress': 1, 'testing': 2, 'done': 3 };
        myTasks.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
        const getProjectName = (projectId) => {
            const project = projects.find(p => p.id === projectId);
            return project?.name || 'Unknown';
        };
        // Header
        const header = (0, blessed_helpers_1.createBox)({
            parent: screen,
            top: 0,
            left: 0,
            width: '100%',
            height: 3,
            fixed: true,
            border: { type: 'line' },
            // Empty: a three-row framed box has ONE interior row, and the chrome's
            // masthead owns it now. The title and the handle moved into `title`.
            content: '',
            style: { fg: door_theme_1.T.ink, bg: door_theme_1.T.ground, border: { fg: door_theme_1.T.accent } },
            tags: true,
            focusable: false,
            mouse: false,
            clickable: false,
        });
        // Task list
        const listBox = (0, blessed_helpers_1.createBox)({
            parent: screen,
            top: 3,
            left: 0,
            width: '100%',
            height: '100%-6',
            fixed: true,
            border: { type: 'line' },
            label: ' Tasks ',
            style: {
                border: { fg: door_theme_1.T.accent },
                bg: door_theme_1.T.ground
            },
            focusable: false,
            mouse: false,
            clickable: false,
        });
        const formatTaskItem = (task) => {
            const priorityInitial = task.priority[0].toUpperCase();
            const priorityColor = (0, gamification_1.getPriorityColor)(task.priority);
            const statusColors = {
                'todo': 'white',
                'in-progress': 'yellow',
                'testing': 'magenta',
                'done': 'green'
            };
            const statusColor = statusColors[task.status] || 'white';
            const projectName = getProjectName(task.projectId);
            const maxTitleLen = 30;
            const title = task.title.length > maxTitleLen
                ? task.title.substring(0, maxTitleLen - 2) + '..'
                : task.title.padEnd(maxTitleLen);
            const maxProjectLen = 15;
            const projDisplay = projectName.length > maxProjectLen
                ? projectName.substring(0, maxProjectLen - 2) + '..'
                : projectName.padEnd(maxProjectLen);
            return `{${statusColor}-fg}${task.status.padEnd(11)}{/${statusColor}-fg} ${title} {${door_theme_1.T.dim}-fg}${projDisplay}{/${door_theme_1.T.dim}-fg} {${priorityColor}-fg}[${priorityInitial}]{/${priorityColor}-fg} ${task.points}pts`;
        };
        const list = (0, blessed_helpers_1.createList)({
            parent: listBox,
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            keys: true,
            vi: true,
            mouse: true,
            items: myTasks.length > 0 ? myTasks.map(formatTaskItem) : [],
            style: {
                selected: { bg: door_theme_1.T.accent, fg: door_theme_1.T.ground },
                item: { fg: door_theme_1.T.ink },
                bg: door_theme_1.T.ground
            }
        });
        // Footer
        const footer = (0, blessed_helpers_1.createBox)({
            parent: screen,
            bottom: 0,
            left: 0,
            width: '100%',
            height: 3,
            fixed: true,
            border: { type: 'line' },
            // Filled by the chrome, from the SDK's hint builder.
            content: '',
            style: { fg: door_theme_1.T.dim, bg: door_theme_1.T.ground, border: { fg: door_theme_1.T.dim } },
            tags: true,
            focusable: false,
            mouse: false,
            clickable: false,
        });
        // The whole chrome from the door's ONE call.
        const chrome = (0, chrome_1.attachWhipChrome)({
            screen,
            header,
            footer,
            title: `MY TASKS - ${user.handle}`,
            hints: HINTS,
            compactHints: COMPACT_HINTS,
            // The task list is the only thing here with rows to spare.
            glitch: list,
        });
        list.focus();
        screen.render();
        const refreshList = async () => {
            allTasks = await dataManager.loadTasks();
            projects = await dataManager.loadProjects();
            myTasks = allTasks.filter(t => t.assignedTo === user.userId);
            myTasks.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
            list.clearItems();
            list.setItems(myTasks.length > 0 ? myTasks.map(formatTaskItem) : []);
            // The header is not repainted here any more: the chrome's masthead owns
            // that row and redraws itself.
            screen.render();
        };
        const cleanup = () => {
            // First: a rail timer still writing after these widgets are gone would
            // paint into a screen that no longer holds them.
            chrome.stop();
            screen.off('keypress', keyHandler);
            screen.remove(header);
            screen.remove(listBox);
            screen.remove(footer);
        };
        const keyHandler = (ch, key) => {
            if (key.name === 'q' || key.name === 'escape') {
                cleanup();
                resolve();
                return;
            }
            if (key.name === 'enter') {
                (async () => {
                    if (myTasks.length > 0) {
                        const selectedIndex = list.selected || 0;
                        const task = myTasks[selectedIndex];
                        const project = projects.find(p => p.id === task.projectId);
                        await (0, task_editor_1.editTask)(screen, task, user, dataManager, achievementManager, project, bbsApi);
                        await refreshList();
                    }
                })();
            }
        };
        screen.on('keypress', keyHandler);
    });
}
