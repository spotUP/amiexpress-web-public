/**
 * Fixture DataManager for WhipService tests: canned WHIP data, same method
 * shapes as Doors/whip/dist/core/data-manager.js. The service require()s
 * this file when WHIP_DOOR_DIST_DIR points here, so no board files and no
 * door storage are involved. COMMITTED on purpose: tracked-fixtures rule -
 * a committed test may not depend on untracked files.
 */
'use strict';

const projects = [
  { id: 'p1', name: 'Desert Dream', type: 'demo', status: 'active', description: 'Test demo', partyId: 'revision-2026' },
  { id: 'backlog', name: 'Backlog', type: 'tools', status: 'planning', description: '' },
];

const tasks = [
  { id: 't1', projectId: 'p1', title: 'Fix the scroller', category: 'code', status: 'todo', priority: 'scener', assignedTo: 'u1', points: 10, description: '' },
  { id: 't2', projectId: 'p1', title: 'Pixel logo', category: 'gfx', status: 'done', priority: 'elite', assignedTo: 'u2', points: 15, description: '' },
  { id: 't3', projectId: 'backlog', title: 'Quick idea', category: 'bug', status: 'todo', priority: 'lamer', assignedTo: 'u1', points: 10, description: '' },
];

const users = {
  u1: { userId: 'u1', handle: 'spot', points: 120, level: 'scener', rank: 1, tasksCompleted: 3, achievements: ['first-release'] },
  u2: { userId: 'u2', handle: 'ace', points: 40, level: 'lamer', rank: 2, tasksCompleted: 1, achievements: [] },
};

const achievements = {
  'first-release': { id: 'first-release', name: 'First Release', points: 10 },
  'getting-started': { id: 'getting-started', name: 'Getting Started', points: 25 },
};

const parties = [
  { id: 'revision-2026', name: 'Revision 2026', date: '2026-04-03', location: 'Saarbruecken' },
];

class DataManager {
  async loadProjects() { return projects; }
  async loadTasks() { return tasks; }
  async getTask(id) { return tasks.find((t) => t.id === id); }
  async getTasksForProject(projectId) { return tasks.filter((t) => t.projectId === projectId); }
  async getTasksForUser(userId) { return tasks.filter((t) => t.assignedTo === userId); }
  async loadUsers() { return users; }
  async getUser(userId) { return users[userId]; }
  async loadAchievements() { return achievements; }
  async loadParties() { return parties; }
}

const shared = new DataManager();

function getSharedDataManager() { return shared; }

async function runExclusive(fn) { return fn(); }

module.exports = { DataManager, getSharedDataManager, runExclusive };
