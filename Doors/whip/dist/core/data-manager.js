"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataManager = void 0;
const core_1 = require("@amiexpress/bbs-door-sdk/core");
const achievements_1 = require("./achievements");
class DataManager {
    constructor() {
        // In-memory cache for performance
        this.projectsCache = null;
        this.tasksCache = null;
        this.usersCache = null;
        this.achievementsCache = null;
        this.partiesCache = null;
        this.storage = new core_1.Storage({
            doorName: 'whip',
            global: true
        });
    }
    // Cache invalidation methods
    invalidateProjectsCache() {
        this.projectsCache = null;
    }
    invalidateTasksCache() {
        this.tasksCache = null;
    }
    invalidateUsersCache() {
        this.usersCache = null;
    }
    invalidateAchievementsCache() {
        this.achievementsCache = null;
    }
    invalidatePartiesCache() {
        this.partiesCache = null;
    }
    invalidateAllCaches() {
        this.projectsCache = null;
        this.tasksCache = null;
        this.usersCache = null;
        this.achievementsCache = null;
        this.partiesCache = null;
    }
    // Projects
    async loadProjects() {
        if (this.projectsCache === null) {
            this.projectsCache = (await this.storage.load('projects')) ?? [];
        }
        return this.projectsCache;
    }
    async saveProjects(projects) {
        this.projectsCache = projects; // Update cache
        await this.storage.save('projects', projects);
    }
    async getProject(id) {
        const projects = await this.loadProjects();
        return projects.find(p => p.id === id);
    }
    async addProject(project) {
        const projects = await this.loadProjects();
        projects.push(project);
        await this.saveProjects(projects);
    }
    async updateProject(project) {
        const projects = await this.loadProjects();
        const index = projects.findIndex(p => p.id === project.id);
        if (index >= 0) {
            projects[index] = project;
            await this.saveProjects(projects);
        }
    }
    async deleteProject(id) {
        const projects = await this.loadProjects();
        const filtered = projects.filter(p => p.id !== id);
        await this.saveProjects(filtered);
        // Also delete all tasks for this project
        const tasks = await this.loadTasks();
        const filteredTasks = tasks.filter(t => t.projectId !== id);
        await this.saveTasks(filteredTasks);
    }
    // Tasks
    async loadTasks() {
        if (this.tasksCache === null) {
            this.tasksCache = (await this.storage.load('tasks')) ?? [];
        }
        return this.tasksCache;
    }
    async saveTasks(tasks) {
        this.tasksCache = tasks; // Update cache
        await this.storage.save('tasks', tasks);
    }
    async getTask(id) {
        const tasks = await this.loadTasks();
        return tasks.find(t => t.id === id);
    }
    async getTasksForProject(projectId) {
        const tasks = await this.loadTasks();
        return tasks.filter(t => t.projectId === projectId);
    }
    async getTasksForUser(userId) {
        const tasks = await this.loadTasks();
        return tasks.filter(t => t.assignedTo === userId);
    }
    async addTask(task) {
        const tasks = await this.loadTasks();
        tasks.push(task);
        await this.saveTasks(tasks);
    }
    async updateTask(task) {
        const tasks = await this.loadTasks();
        const index = tasks.findIndex(t => t.id === task.id);
        if (index >= 0) {
            tasks[index] = task;
            await this.saveTasks(tasks);
        }
    }
    async deleteTask(id) {
        const tasks = await this.loadTasks();
        const filtered = tasks.filter(t => t.id !== id);
        await this.saveTasks(filtered);
    }
    // Users
    async loadUsers() {
        if (this.usersCache === null) {
            this.usersCache = (await this.storage.load('users')) ?? {};
        }
        return this.usersCache;
    }
    async saveUsers(users) {
        this.usersCache = users; // Update cache
        await this.storage.save('users', users);
    }
    async getUser(userId) {
        const users = await this.loadUsers();
        return users[userId];
    }
    async createUser(userId, handle) {
        const users = await this.loadUsers();
        const newUser = {
            userId,
            handle,
            points: 0,
            level: 'lamer',
            rank: 0,
            tasksCompleted: 0,
            projectsCreated: 0,
            achievements: [],
            joinedAt: new Date().toISOString(),
            lastActiveAt: new Date().toISOString()
        };
        users[userId] = newUser;
        await this.saveUsers(users);
        return newUser;
    }
    async updateUser(user) {
        const users = await this.loadUsers();
        users[user.userId] = user;
        await this.saveUsers(users);
    }
    async updateRankings() {
        const users = await this.loadUsers();
        const sorted = Object.values(users).sort((a, b) => b.points - a.points);
        sorted.forEach((user, index) => {
            user.rank = index + 1;
        });
        await this.saveUsers(users);
    }
    // Achievements
    async loadAchievements() {
        if (this.achievementsCache === null) {
            const stored = await this.storage.load('achievements');
            this.achievementsCache = stored ?? (0, achievements_1.getDefaultAchievements)();
        }
        return this.achievementsCache;
    }
    async saveAchievements(achievements) {
        this.achievementsCache = achievements; // Update cache
        await this.storage.save('achievements', achievements);
    }
    // Parties
    async loadParties() {
        if (this.partiesCache === null) {
            const stored = await this.storage.load('parties');
            // Return empty array if no stored data - let refreshParties() populate from demoparty.net
            this.partiesCache = stored ?? [];
        }
        return this.partiesCache;
    }
    async saveParties(parties) {
        this.partiesCache = parties; // Update cache
        await this.storage.save('parties', parties);
    }
    async addParty(party) {
        const parties = await this.loadParties();
        parties.push(party);
        await this.saveParties(parties);
    }
    async updateParty(party) {
        const parties = await this.loadParties();
        const index = parties.findIndex(p => p.id === party.id);
        if (index >= 0) {
            parties[index] = party;
            await this.saveParties(parties);
        }
    }
    async deleteParty(id) {
        const parties = await this.loadParties();
        const filtered = parties.filter(p => p.id !== id);
        await this.saveParties(filtered);
    }
}
exports.DataManager = DataManager;
