"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.showPartyTimeline = showPartyTimeline;
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const gamification_1 = require("../core/gamification");
const door_theme_1 = require("../door-theme");
async function showPartyTimeline(screen, user, dataManager, partyCalendar) {
    return new Promise(async (resolve) => {
        screen.program.enableMouse();
        screen.clearRegion(0, screen.width, 0, screen.height);
        screen.alloc();
        // Note: Removed 200ms artificial delay for better responsiveness
        let parties = await dataManager.loadParties();
        let selectedIndex = 0;
        let header, listBox, instructions;
        // Filter to upcoming parties and sort by date
        const upcomingParties = parties
            .filter(p => new Date(p.date) >= new Date())
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const render = async () => {
            // Remove old widgets
            if (header)
                screen.remove(header);
            if (listBox)
                screen.remove(listBox);
            if (instructions)
                screen.remove(instructions);
            // Header - NOT focusable
            header = (0, blessed_helpers_1.createBox)({
                fixed: true,
                parent: screen,
                top: 0,
                left: 0,
                width: '100%',
                height: 3,
                border: { type: 'line' },
                content: `{center}{bold}{${door_theme_1.T.accent}-fg}PARTY TIMELINE 2026{/${door_theme_1.T.accent}-fg}{/bold} - Upcoming Demo Parties{/center}\n` +
                    `{center}Upcoming: {bold}${upcomingParties.length}{/bold} parties{/center}`,
                style: { fg: door_theme_1.T.ink, bg: door_theme_1.T.ground, border: { fg: door_theme_1.T.accent } },
                tags: true,
                focusable: false,
                mouse: false,
                clickable: false,
            });
            // Party list container - focusable (scrollable)
            listBox = (0, blessed_helpers_1.createBox)({
                fixed: true,
                parent: screen,
                top: 3,
                left: 1,
                width: '98%',
                height: '100%-6',
                border: { type: 'line' },
                label: ' Parties ',
                style: {
                    border: { fg: door_theme_1.T.accent },
                    bg: door_theme_1.T.ground
                },
                scrollable: true,
                alwaysScroll: true,
                mouse: true,
                keys: true,
                vi: true,
                focusable: true,
            });
            if (upcomingParties.length === 0) {
                listBox.setContent(`{center}{${door_theme_1.T.dim}-fg}No upcoming parties found.{/${door_theme_1.T.dim}-fg}{/center}`);
            }
            else {
                let content = '';
                for (let i = 0; i < upcomingParties.length; i++) {
                    const party = upcomingParties[i];
                    const days = partyCalendar.getDaysUntilParty(party.date);
                    const color = partyCalendar.getPartyCountdownColor(days);
                    const isSelected = i === selectedIndex;
                    // Get user's progress for this party
                    const projects = await dataManager.loadProjects();
                    const partyProjects = projects.filter(p => p.partyId === party.id);
                    const allTasks = await dataManager.loadTasks();
                    const partyTasks = allTasks.filter(t => partyProjects.some(p => p.id === t.projectId));
                    const completedTasks = partyTasks.filter(t => t.status === 'done').length;
                    const progress = partyTasks.length > 0
                        ? Math.floor((completedTasks / partyTasks.length) * 100)
                        : 0;
                    const progressBar = (0, gamification_1.createProgressBar)(progress, 24);
                    const prefix = isSelected ? '{inverse}' : '';
                    const suffix = isSelected ? '{/inverse}' : '';
                    // Truncate long names and categories to prevent overflow
                    const maxNameLength = 35;
                    const partyName = party.name.length > maxNameLength
                        ? party.name.substring(0, maxNameLength - 3) + '...'
                        : party.name;
                    const maxLocationLength = 40;
                    const location = party.location.length > maxLocationLength
                        ? party.location.substring(0, maxLocationLength - 3) + '...'
                        : party.location;
                    content += `${prefix}\n`;
                    content += ` {${color}-fg}[${days < 7 ? '!' : '*'}]{/${color}-fg} {bold}${partyName}{/bold}  -  {bold}${days} days{/bold}\n`;
                    content += `     Location: ${location}\n`;
                    content += `     Date: ${party.date}\n`;
                    if (party.categories.length > 0) {
                        const cats = party.categories.join(', ');
                        const maxCatsLength = 50;
                        const truncatedCats = cats.length > maxCatsLength
                            ? cats.substring(0, maxCatsLength - 3) + '...'
                            : cats;
                        content += `     Categories: ${truncatedCats}\n`;
                    }
                    content += `     Progress: ${progress}% ${progressBar}\n`;
                    content += `     Active: ${partyTasks.length - completedTasks} | Completed: ${completedTasks}\n`;
                    content += `${suffix}\n`;
                }
                listBox.setContent(content);
            }
            listBox.focus();
            // Footer - NOT focusable
            instructions = (0, blessed_helpers_1.createBox)({
                fixed: true,
                parent: screen,
                bottom: 0,
                left: 0,
                width: '100%',
                height: 3,
                border: { type: 'line' },
                content: ` {${door_theme_1.T.accent}-fg}[Up/Down]{/${door_theme_1.T.accent}-fg} Scroll   {${door_theme_1.T.accent}-fg}[R]{/${door_theme_1.T.accent}-fg} Refresh from demoparty.net   {${door_theme_1.T.alert}-fg}[Q/ESC]{/${door_theme_1.T.alert}-fg} Back\n` +
                    ` {${door_theme_1.T.dim}-fg}Scrollwheel supported{/${door_theme_1.T.dim}-fg}`,
                style: { fg: door_theme_1.T.dim, bg: door_theme_1.T.ground, border: { fg: door_theme_1.T.dim } },
                tags: true,
                focusable: false,
                mouse: false,
                clickable: false,
            });
            screen.render();
        };
        const keyHandler = (ch, key) => {
            switch (key.name) {
                case 'up':
                    selectedIndex = Math.max(0, selectedIndex - 1);
                    render();
                    break;
                case 'down':
                    selectedIndex = Math.min(upcomingParties.length - 1, selectedIndex + 1);
                    render();
                    break;
                case 'r':
                    // Refresh party data from demoparty.net
                    (async () => {
                        await partyCalendar.refreshParties();
                        parties = await dataManager.loadParties();
                        await render();
                    })();
                    break;
                case 'q':
                case 'escape':
                    cleanup();
                    resolve();
                    break;
            }
        };
        screen.on('keypress', keyHandler);
        const cleanup = () => {
            screen.off('keypress', keyHandler);
            if (header)
                screen.remove(header);
            if (listBox)
                screen.remove(listBox);
            if (instructions)
                screen.remove(instructions);
        };
        await render();
    });
}
