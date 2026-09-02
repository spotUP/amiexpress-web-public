"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProject = createProject;
exports.editProject = editProject;
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const blessed_1 = __importDefault(require("@amiexpress/bbs-door-sdk/engines/ui/blessed"));
const uuid_1 = require("uuid");
const door_theme_1 = require("../door-theme");
const PROJECT_TYPES = ['demo', 'intro', 'musicdisk', 'graphics', 'music', 'code', 'tools'];
const PROJECT_STATUSES = ['planning', 'active', 'released'];
async function createProject(screen, user, dataManager, bbsApi) {
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
    return showProjectEditor(screen, newProject, user, dataManager, true, bbsApi);
}
async function editProject(screen, project, user, dataManager, bbsApi) {
    return showProjectEditor(screen, project, user, dataManager, false, bbsApi);
}
async function showProjectEditor(screen, project, user, dataManager, isNew, bbsApi) {
    return new Promise(async (resolve) => {
        screen.program.enableMouse();
        // Load parties for the party selection
        const parties = await dataManager.loadParties();
        const upcomingParties = parties
            .filter(p => new Date(p.date) >= new Date())
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        // Modal container
        const modal = blessed_1.default.box({
            parent: screen,
            top: 'center',
            left: 'center',
            width: 70,
            height: 24,
            border: { type: 'line' },
            style: {
                border: { fg: door_theme_1.T.accentAlt },
                bg: door_theme_1.T.ground
            },
            label: isNew ? ' New Project ' : ' Edit Project ',
            tags: true,
        });
        // Name input with border (height 3 = border + content + border)
        const nameInput = blessed_1.default.textbox({
            parent: modal,
            top: 1,
            left: 1,
            right: 1,
            height: 3,
            border: { type: 'line' },
            label: ' Name ',
            keys: true,
            mouse: true,
            inputOnFocus: true,
            value: project.name,
            style: {
                fg: door_theme_1.T.ink,
                bg: door_theme_1.T.ground,
                border: { fg: door_theme_1.T.accent },
            }
        });
        // Type list
        const typeList = blessed_1.default.list({
            parent: modal,
            top: 5,
            left: 1,
            width: '48%',
            height: 9,
            border: { type: 'line' },
            label: ' Type ',
            tags: true,
            keys: true,
            vi: true,
            mouse: true,
            focusable: true,
            items: PROJECT_TYPES,
            selected: PROJECT_TYPES.indexOf(project.type),
            style: {
                border: { fg: door_theme_1.T.accent },
                selected: { bg: door_theme_1.T.accent, fg: door_theme_1.T.ground },
                item: { fg: door_theme_1.T.ink, bg: door_theme_1.T.ground },
                bg: door_theme_1.T.ground
            },
        });
        // Status list
        const statusList = blessed_1.default.list({
            parent: modal,
            top: 5,
            left: '50%',
            right: 1,
            height: 5,
            border: { type: 'line' },
            label: ' Status ',
            tags: true,
            keys: true,
            vi: true,
            mouse: true,
            focusable: true,
            items: PROJECT_STATUSES,
            selected: PROJECT_STATUSES.indexOf(project.status),
            style: {
                border: { fg: door_theme_1.T.accent },
                selected: { bg: door_theme_1.T.accent, fg: door_theme_1.T.ground },
                item: { fg: door_theme_1.T.ink, bg: door_theme_1.T.ground },
                bg: door_theme_1.T.ground
            },
        });
        // Party list
        const partyOptions = ['(None)', ...upcomingParties.map(p => p.name.substring(0, 25))];
        const selectedPartyIndex = project.partyId
            ? upcomingParties.findIndex(p => p.id === project.partyId) + 1
            : 0;
        const partyList = blessed_1.default.list({
            parent: modal,
            top: 11,
            left: '50%',
            right: 1,
            height: 5,
            border: { type: 'line' },
            label: ' Target Party ',
            tags: true,
            keys: true,
            vi: true,
            mouse: true,
            focusable: true,
            items: partyOptions,
            selected: selectedPartyIndex,
            style: {
                border: { fg: door_theme_1.T.accent },
                selected: { bg: door_theme_1.T.accent, fg: door_theme_1.T.ground },
                item: { fg: door_theme_1.T.ink, bg: door_theme_1.T.ground },
                bg: door_theme_1.T.ground
            },
        });
        // Description input with border
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
            value: project.description || '',
            style: {
                fg: door_theme_1.T.ink,
                bg: door_theme_1.T.ground,
                border: { fg: door_theme_1.T.accent },
            }
        });
        // Buttons
        const saveBtn = (0, blessed_helpers_1.createButton)({
            parent: modal,
            top: 19,
            left: 17,
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
        const cancelBtn = (0, blessed_helpers_1.createButton)({
            parent: modal,
            top: 19,
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
        const save = async () => {
            project.name = nameInput.getValue();
            project.type = PROJECT_TYPES[typeList.selected];
            project.status = PROJECT_STATUSES[statusList.selected];
            project.description = descInput.getValue();
            const partyIndex = partyList.selected || 0;
            if (partyIndex === 0) {
                delete project.partyId;
            }
            else {
                project.partyId = upcomingParties[partyIndex - 1].id;
            }
            if (!project.name.trim()) {
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
                msg.display('Project name cannot be empty!', () => {
                    screen.remove(msg);
                    screen.render();
                });
                return;
            }
            if (isNew) {
                await dataManager.addProject(project);
                if (bbsApi?.emitCustomEvent) {
                    bbsApi.emitCustomEvent('project_created', `Created ${project.type} project "${project.name}"`, {
                        projectId: project.id, projectName: project.name, projectType: project.type
                    });
                }
            }
            else {
                project.updatedAt = new Date().toISOString();
                await dataManager.updateProject(project);
            }
            cleanup();
            resolve(project);
        };
        saveBtn.on('press', () => { save(); });
        cancelBtn.on('press', () => { cleanup(); resolve(null); });
        const keyHandler = (ch, key) => {
            if (key.name === 'escape') {
                cleanup();
                resolve(null);
            }
            else if (key.name === 'enter' && key.ctrl) {
                save();
            }
        };
        screen.on('keypress', keyHandler);
        nameInput.focus();
        screen.render();
    });
}
