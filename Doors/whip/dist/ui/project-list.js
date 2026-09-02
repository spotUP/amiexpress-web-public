"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.showProjectList = showProjectList;
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const blessed_1 = __importDefault(require("@amiexpress/bbs-door-sdk/engines/ui/blessed"));
const uuid_1 = require("uuid");
const door_theme_1 = require("../door-theme");
const confirm_delete_1 = require("./confirm-delete");
const PROJECT_TYPES = ['demo', 'intro', 'musicdisk', 'graphics', 'music', 'code', 'tools'];
async function showProjectList(screen, user, dataManager, achievementManager, bbsApi) {
    return new Promise(async (resolve) => {
        screen.program.enableMouse();
        screen.clearRegion(0, screen.width, 0, screen.height);
        screen.alloc();
        // Note: Removed 200ms artificial delay for better responsiveness
        let projects = await dataManager.loadProjects();
        let selectedIndex = 0;
        // Header - NOT focusable
        const header = (0, blessed_helpers_1.createBox)({
            fixed: true,
            parent: screen,
            top: 0,
            left: 0,
            width: '100%',
            height: 3,
            border: { type: 'line' },
            content: `{center}{bold}{${door_theme_1.T.accent}-fg}ALL PROJECTS{/${door_theme_1.T.accent}-fg}{/bold} - Manage your demo scene projects{/center}\n` +
                `{center}Total: {bold}${projects.length}{/bold} projects{/center}`,
            style: { fg: door_theme_1.T.ink, bg: door_theme_1.T.ground, border: { fg: door_theme_1.T.accent } },
            tags: true,
            focusable: false,
            mouse: false,
            clickable: false,
        });
        // Project list container - NOT focusable (list inside is)
        const listBox = (0, blessed_helpers_1.createBox)({
            fixed: true,
            parent: screen,
            top: 3,
            left: 1,
            width: '98%',
            height: '100%-6',
            border: { type: 'line' },
            label: ' Projects ',
            style: {
                border: { fg: door_theme_1.T.accent },
                bg: door_theme_1.T.ground
            },
            focusable: false,
            mouse: false,
            clickable: false,
        });
        const list = (0, blessed_helpers_1.createList)({
            parent: listBox,
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            keys: true,
            vi: true,
            mouse: true,
            items: projects.length > 0
                ? projects.map(p => `{bold}${p.name}{/bold} - ${p.type} (${p.status})`)
                : [`{${door_theme_1.T.dim}-fg}No projects yet. Press N to create one.{/${door_theme_1.T.dim}-fg}`],
            style: {
                selected: { bg: door_theme_1.T.accent, fg: door_theme_1.T.ground },
                item: { fg: door_theme_1.T.ink },
                bg: door_theme_1.T.ground
            }
        });
        // Footer - NOT focusable
        const footer = (0, blessed_helpers_1.createBox)({
            fixed: true,
            parent: screen,
            bottom: 0,
            left: 0,
            width: '100%',
            height: 3,
            border: { type: 'line' },
            content: ` {${door_theme_1.T.accent}-fg}[N]{/${door_theme_1.T.accent}-fg} New   {${door_theme_1.T.accent}-fg}[E]{/${door_theme_1.T.accent}-fg} Edit   {${door_theme_1.T.accent}-fg}[D]{/${door_theme_1.T.accent}-fg} Delete   {${door_theme_1.T.accent}-fg}[Enter]{/${door_theme_1.T.accent}-fg} Select   {${door_theme_1.T.alert}-fg}[Q/ESC]{/${door_theme_1.T.alert}-fg} Back\n` +
                ` {${door_theme_1.T.dim}-fg}Arrow Keys to navigate | Mouse click supported{/${door_theme_1.T.dim}-fg}`,
            style: { fg: door_theme_1.T.dim, bg: door_theme_1.T.ground, border: { fg: door_theme_1.T.dim } },
            tags: true,
            focusable: false,
            mouse: false,
            clickable: false,
        });
        const cleanup = () => {
            screen.off('keypress', keyHandler);
            screen.remove(header);
            screen.remove(listBox);
            screen.remove(footer);
        };
        const keyHandler = (ch, key) => {
            (async () => {
                switch (key.name) {
                    case 'n':
                        await createProject(screen, user, dataManager, achievementManager, bbsApi);
                        projects = await dataManager.loadProjects();
                        list.setItems(projects.map(p => `{bold}${p.name}{/bold} - ${p.type} (${p.status})`));
                        screen.render();
                        break;
                    case 'e':
                        if (projects.length > 0) {
                            await editProject(screen, projects[list.selected || 0], dataManager, bbsApi);
                            projects = await dataManager.loadProjects();
                            list.setItems(projects.map(p => `{bold}${p.name}{/bold} - ${p.type} (${p.status})`));
                            screen.render();
                        }
                        break;
                    case 'd':
                        if (projects.length > 0) {
                            const projectToDelete = projects[list.selected || 0];
                            const confirmed = await (0, confirm_delete_1.confirmDelete)(screen, 'project', projectToDelete.name);
                            if (confirmed) {
                                await dataManager.deleteProject(projectToDelete.id);
                                // Emit event for deleted project
                                if (bbsApi?.emitCustomEvent) {
                                    bbsApi.emitCustomEvent('project_deleted', `Deleted project "${projectToDelete.name}"`, { projectType: projectToDelete.type, projectId: projectToDelete.id });
                                }
                                projects = await dataManager.loadProjects();
                                list.setItems(projects.length > 0
                                    ? projects.map(p => `{bold}${p.name}{/bold} - ${p.type} (${p.status})`)
                                    : [`{${door_theme_1.T.dim}-fg}No projects yet. Press N to create one.{/${door_theme_1.T.dim}-fg}`]);
                                screen.render();
                            }
                        }
                        break;
                    case 'enter':
                        if (projects.length > 0) {
                            cleanup();
                            resolve(projects[list.selected || 0]);
                            return;
                        }
                        break;
                    case 'q':
                    case 'escape':
                        cleanup();
                        resolve(null);
                        return;
                }
            })();
        };
        screen.on('keypress', keyHandler);
        list.focus();
        screen.render();
    });
}
async function createProject(screen, user, dataManager, achievementManager, bbsApi) {
    const newProject = {
        id: (0, uuid_1.v4)(),
        name: '',
        type: 'demo',
        description: '',
        createdBy: user.userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'planning'
    };
    await showProjectEditor(screen, newProject, dataManager, true, bbsApi);
}
async function editProject(screen, project, dataManager, bbsApi) {
    await showProjectEditor(screen, project, dataManager, false, bbsApi);
}
async function showProjectEditor(screen, project, dataManager, isNew, bbsApi) {
    return new Promise((resolve) => {
        screen.program.enableMouse();
        // Modal container - NOT focusable (children are)
        const modal = (0, blessed_helpers_1.createBox)({
            fixed: true,
            parent: screen,
            top: 'center',
            left: 'center',
            width: 70,
            height: 22, // Increased from 20 for more comfortable spacing
            border: { type: 'line' },
            style: {
                border: { fg: door_theme_1.T.accentAlt },
                bg: door_theme_1.T.ground
            },
            label: isNew ? ' New Project ' : ' Edit Project ',
            focusable: false,
            mouse: false,
            clickable: false,
        });
        // Name field - label NOT focusable
        const nameLabel = (0, blessed_helpers_1.createBox)({
            fixed: true,
            parent: modal,
            top: 1,
            left: 2,
            width: '100%-4',
            height: 1,
            content: 'Project Name:',
            style: { fg: door_theme_1.T.ink, bg: door_theme_1.T.ground },
            focusable: false,
            mouse: false,
            clickable: false,
        });
        const nameInput = (0, blessed_helpers_1.createTextbox)({
            parent: modal,
            top: 2,
            left: 2,
            width: '100%-4',
            height: 1,
            keys: true,
            mouse: true,
            inputOnFocus: true,
            value: project.name,
            style: {
                fg: door_theme_1.T.ink,
                bg: door_theme_1.T.bar,
                focus: { bg: 'lightblue', fg: door_theme_1.T.ground }
            }
        });
        // Type label - NOT focusable
        const typeLabel = (0, blessed_helpers_1.createBox)({
            fixed: true,
            parent: modal,
            top: 4,
            left: 2,
            width: 30,
            height: 1,
            content: 'Type:',
            style: { fg: door_theme_1.T.ink, bg: door_theme_1.T.ground },
            focusable: false,
            mouse: false,
            clickable: false,
        });
        // Type list
        const typeList = (0, blessed_helpers_1.createList)({
            parent: modal,
            top: 5,
            left: 2,
            width: 30,
            height: 7,
            border: { type: 'line' },
            style: {
                border: { fg: door_theme_1.T.accent },
                selected: { bg: door_theme_1.T.accent, fg: door_theme_1.T.ground },
                item: { fg: door_theme_1.T.ink },
                bg: door_theme_1.T.ground
            },
            keys: true,
            vi: true,
            mouse: true,
            items: PROJECT_TYPES,
            selected: PROJECT_TYPES.indexOf(project.type)
        });
        // Status label - NOT focusable
        const statusLabel = (0, blessed_helpers_1.createBox)({
            fixed: true,
            parent: modal,
            top: 4,
            left: 35,
            width: 30,
            height: 1,
            content: 'Status:',
            style: { fg: door_theme_1.T.ink, bg: door_theme_1.T.ground },
            focusable: false,
            mouse: false,
            clickable: false,
        });
        // Status list
        const statuses = ['planning', 'active', 'released'];
        const statusList = (0, blessed_helpers_1.createList)({
            parent: modal,
            top: 5,
            left: 35,
            width: 30,
            height: 7,
            border: { type: 'line' },
            style: {
                border: { fg: door_theme_1.T.accent },
                selected: { bg: door_theme_1.T.accent, fg: door_theme_1.T.ground },
                item: { fg: door_theme_1.T.ink },
                bg: door_theme_1.T.ground
            },
            keys: true,
            vi: true,
            mouse: true,
            items: statuses,
            selected: statuses.indexOf(project.status)
        });
        // Description label - NOT focusable
        const descLabel = (0, blessed_helpers_1.createBox)({
            fixed: true,
            parent: modal,
            top: 13,
            left: 2,
            width: '100%-4',
            height: 1,
            content: 'Description (optional):',
            style: { fg: door_theme_1.T.ink, bg: door_theme_1.T.ground },
            focusable: false,
            mouse: false,
            clickable: false,
        });
        const descInput = (0, blessed_helpers_1.createTextbox)({
            parent: modal,
            top: 14,
            left: 2,
            width: '100%-4',
            height: 1,
            keys: true,
            mouse: true,
            inputOnFocus: true,
            value: project.description,
            style: {
                fg: door_theme_1.T.ink,
                bg: door_theme_1.T.bar,
                focus: { bg: 'lightblue', fg: door_theme_1.T.ground }
            }
        });
        // Save button
        const saveBtn = (0, blessed_helpers_1.createButton)({
            parent: modal,
            bottom: 1,
            left: 15,
            width: 12,
            height: 3,
            content: ' Save ',
            align: 'center',
            keys: true,
            mouse: true,
            style: {
                fg: door_theme_1.T.ink,
                bg: door_theme_1.T.ok,
                focus: { bg: 'lightgreen', fg: door_theme_1.T.ground },
                hover: { bg: 'lightgreen', fg: door_theme_1.T.ground }
            }
        });
        // Cancel button
        const cancelBtn = (0, blessed_helpers_1.createButton)({
            parent: modal,
            bottom: 1,
            left: 40,
            width: 12,
            height: 3,
            content: ' Cancel ',
            align: 'center',
            keys: true,
            mouse: true,
            style: {
                fg: door_theme_1.T.ink,
                bg: door_theme_1.T.alert,
                focus: { bg: 'lightred', fg: door_theme_1.T.ground },
                hover: { bg: 'lightred', fg: door_theme_1.T.ground }
            }
        });
        const cleanup = () => {
            screen.off('keypress', keyHandler);
            screen.remove(modal);
            screen.render();
        };
        // Save handler
        const save = async () => {
            project.name = nameInput.getValue();
            project.type = PROJECT_TYPES[typeList.selected];
            project.status = statuses[statusList.selected];
            project.description = descInput.getValue();
            if (!project.name.trim()) {
                const msg = blessed_1.default.message({
                    parent: screen,
                    top: 'center',
                    left: 'center',
                    width: 'shrink',
                    height: 'shrink',
                    padding: 2,
                    border: { type: 'line' },
                    style: {
                        border: { fg: door_theme_1.T.alert },
                        bg: door_theme_1.T.ground
                    },
                    label: ' Error '
                });
                msg.display('Project name cannot be empty!\n\nPress any key to continue.', () => {
                    screen.remove(msg);
                    screen.render();
                });
                return;
            }
            if (isNew) {
                await dataManager.addProject(project);
                // Emit event for new project
                if (bbsApi?.emitCustomEvent) {
                    bbsApi.emitCustomEvent('project_created', `Created new ${project.type} project "${project.name}"`, { projectType: project.type, projectId: project.id, status: project.status });
                }
            }
            else {
                project.updatedAt = new Date().toISOString();
                await dataManager.updateProject(project);
                // Emit event for updated project
                if (bbsApi?.emitCustomEvent) {
                    bbsApi.emitCustomEvent('project_updated', `Updated project "${project.name}"`, { projectType: project.type, projectId: project.id, status: project.status });
                }
            }
            cleanup();
            resolve();
        };
        saveBtn.on('press', () => {
            save();
        });
        cancelBtn.on('press', () => {
            cleanup();
            resolve();
        });
        // Key handler for ESC
        const keyHandler = (ch, key) => {
            if (key.name === 'escape') {
                cleanup();
                resolve();
            }
            else if (key.name === 'enter' && key.ctrl) {
                save();
            }
        };
        screen.on('keypress', keyHandler);
        // Focus name input initially
        nameInput.focus();
        screen.render();
    });
}
