"use strict";
/**
 * Frogger - Game Engine
 * Core game logic for the 1981 Konami arcade classic
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FroggerGame = void 0;
const constants_1 = require("./constants");
class FroggerGame {
    constructor(data, onRender) {
        this.lastSpawnTime = new Map();
        this.data = data;
        this.renderCallback = onRender;
    }
    /**
     * Initialize a new level
     */
    initLevel() {
        const config = (0, constants_1.getLevelConfig)(this.data.level);
        // Reset frog to starting position
        this.data.frog = {
            x: Math.floor(constants_1.GRID_WIDTH / 2),
            y: constants_1.GRID_HEIGHT - 1,
            direction: 'up',
            isJumping: false,
            jumpProgress: 0,
            isDead: false,
            deathType: null,
            deathFrame: 0,
            onObject: null,
        };
        // Reset time
        this.data.timeRemaining = config.timeLimit;
        // Initialize lanes
        this.data.lanes = [];
        for (const laneConfig of constants_1.LANE_CONFIG) {
            const lane = {
                type: laneConfig.type,
                y: laneConfig.y,
                objects: [],
                direction: 'dir' in laneConfig ? laneConfig.dir : 1,
                speed: 'speed' in laneConfig ? laneConfig.speed * config.vehicleSpeed : 0,
            };
            this.data.lanes.push(lane);
        }
        // Initialize homes (keep occupied status from previous rounds)
        if (this.data.homes.length === 0 || this.data.homesCompleted === 5) {
            this.data.homes = constants_1.HOME_POSITIONS.map(x => ({
                x,
                occupied: false,
                hasFly: false,
                hasAlligator: false,
            }));
            this.data.homesCompleted = 0;
        }
        // Spawn initial objects
        this.spawnInitialObjects();
        this.render();
    }
    /**
     * Spawn initial vehicles and river objects
     */
    spawnInitialObjects() {
        this.data.lanes.forEach((lane, index) => {
            if (lane.type === 'road') {
                // Spawn 2-3 vehicles per road lane
                const count = 2 + Math.floor(Math.random() * 2);
                for (let i = 0; i < count; i++) {
                    this.spawnVehicle(index);
                }
            }
            else if (lane.type === 'water') {
                // Spawn 2-4 river objects per water lane
                const count = 2 + Math.floor(Math.random() * 3);
                for (let i = 0; i < count; i++) {
                    this.spawnRiverObject(index);
                }
            }
        });
    }
    /**
     * Spawn a vehicle in a lane
     */
    spawnVehicle(laneIndex) {
        const lane = this.data.lanes[laneIndex];
        if (lane.type !== 'road')
            return;
        // Determine vehicle type based on lane
        const types = ['car', 'truck', 'racecar'];
        const type = types[laneIndex % types.length];
        const width = constants_1.OBJECT_WIDTHS[type];
        // Random starting position
        const x = Math.floor(Math.random() * (constants_1.GRID_WIDTH - width));
        const vehicle = {
            id: this.data.vehicleIdCounter++,
            type,
            x,
            y: lane.y,
            lane: laneIndex,
            width,
            speed: lane.speed * lane.direction,
        };
        lane.objects.push(vehicle);
    }
    /**
     * Spawn a river object in a lane
     */
    spawnRiverObject(laneIndex) {
        const lane = this.data.lanes[laneIndex];
        if (lane.type !== 'water')
            return;
        // Alternate between logs and turtles
        const isEvenLane = laneIndex % 2 === 0;
        const type = isEvenLane ? 'log' : 'turtle';
        const width = constants_1.OBJECT_WIDTHS[type];
        // Random starting position
        const x = Math.floor(Math.random() * (constants_1.GRID_WIDTH - width));
        const obj = {
            id: this.data.riverObjectIdCounter++,
            type,
            x,
            y: lane.y,
            lane: laneIndex,
            width,
            speed: lane.speed * lane.direction,
            isDiving: false,
            diveTimer: 0,
        };
        lane.objects.push(obj);
    }
    /**
     * Handle direction input
     */
    handleDirection(direction) {
        if (this.data.frog.isDead || this.data.frog.isJumping)
            return;
        const frog = this.data.frog;
        let newX = frog.x;
        let newY = frog.y;
        switch (direction) {
            case 'up':
                newY = Math.max(0, frog.y - 1);
                break;
            case 'down':
                newY = Math.min(constants_1.GRID_HEIGHT - 1, frog.y + 1);
                break;
            case 'left':
                newX = Math.max(0, frog.x - 1);
                break;
            case 'right':
                newX = Math.min(constants_1.GRID_WIDTH - 1, frog.x + 1);
                break;
        }
        // Check if movement is valid
        if (newX !== frog.x || newY !== frog.y) {
            frog.direction = direction;
            frog.isJumping = true;
            frog.jumpProgress = 0;
            // Score for forward movement
            if (direction === 'up' && newY < frog.y) {
                this.data.score += constants_1.SCORES.hop;
            }
            // Update position
            frog.x = newX;
            frog.y = newY;
            frog.onObject = null; // No longer on previous object
            this.checkCollisions();
            this.render();
        }
    }
    /**
     * Main game update
     */
    update() {
        const now = Date.now();
        const deltaTime = now - this.data.lastUpdateTime;
        this.data.lastUpdateTime = now;
        this.data.frameCount++;
        // Update timer (every second)
        if (this.data.frameCount % 20 === 0) {
            this.data.timeRemaining--;
            if (this.data.timeRemaining <= 0) {
                this.killFrog('timeout');
                return;
            }
        }
        // Update frog jump animation
        if (this.data.frog.isJumping) {
            this.data.frog.jumpProgress += 0.25;
            if (this.data.frog.jumpProgress >= 1) {
                this.data.frog.isJumping = false;
                this.data.frog.jumpProgress = 0;
            }
        }
        // Update death animation
        if (this.data.frog.isDead) {
            this.data.frog.deathFrame++;
            if (this.data.frog.deathFrame >= 20) {
                this.respawnFrog();
            }
            this.render();
            return;
        }
        // Update all objects
        this.updateObjects(deltaTime);
        // Update frog on river object
        this.updateFrogOnObject();
        // Check collisions
        this.checkCollisions();
        // Check home arrival
        this.checkHomeArrival();
        // Render
        this.render();
    }
    /**
     * Update all moving objects
     */
    updateObjects(deltaTime) {
        const moveAmount = (deltaTime / 1000);
        for (const lane of this.data.lanes) {
            for (const obj of lane.objects) {
                // Move object
                obj.x += obj.speed * moveAmount;
                // Wrap around screen
                if (obj.speed > 0 && obj.x > constants_1.GRID_WIDTH) {
                    obj.x = -('width' in obj ? obj.width : 2);
                }
                else if (obj.speed < 0 && obj.x + ('width' in obj ? obj.width : 2) < 0) {
                    obj.x = constants_1.GRID_WIDTH;
                }
                // Update turtle diving
                if ('isDiving' in obj && obj.type === 'turtle') {
                    const riverObj = obj;
                    riverObj.diveTimer = (riverObj.diveTimer || 0) + deltaTime;
                    const config = (0, constants_1.getLevelConfig)(this.data.level);
                    if (Math.random() < config.turtleDiveFrequency * 0.01) {
                        riverObj.isDiving = !riverObj.isDiving;
                        riverObj.diveTimer = 0;
                    }
                }
            }
        }
    }
    /**
     * Update frog position when riding an object
     */
    updateFrogOnObject() {
        const frog = this.data.frog;
        if (frog.onObject) {
            // Move with the object
            const obj = frog.onObject;
            frog.x += obj.speed * (constants_1.GAME_TICK_MS / 1000);
            // Check if still on object
            if (frog.x < obj.x || frog.x >= obj.x + obj.width) {
                frog.onObject = null;
            }
            // Check if turtle is diving
            if (obj.type === 'turtle' && obj.isDiving) {
                this.killFrog('water');
            }
            // Check screen bounds
            if (frog.x < 0 || frog.x >= constants_1.GRID_WIDTH) {
                this.killFrog('edge');
            }
        }
    }
    /**
     * Check all collisions
     */
    checkCollisions() {
        const frog = this.data.frog;
        const lane = this.data.lanes[frog.y];
        if (!lane)
            return;
        if (lane.type === 'road') {
            // Check vehicle collisions
            for (const obj of lane.objects) {
                if (this.isColliding(frog.x, obj.x, obj.width)) {
                    this.killFrog('car');
                    return;
                }
            }
        }
        else if (lane.type === 'water') {
            // Must be on a river object
            let onObject = false;
            for (const obj of lane.objects) {
                const riverObj = obj;
                if (this.isColliding(frog.x, obj.x, riverObj.width)) {
                    if (riverObj.type !== 'turtle' || !riverObj.isDiving) {
                        frog.onObject = riverObj;
                        onObject = true;
                        break;
                    }
                }
            }
            if (!onObject && !frog.isJumping) {
                this.killFrog('water');
            }
        }
    }
    /**
     * Check if frog collides with an object
     */
    isColliding(frogX, objX, objWidth) {
        return frogX >= objX && frogX < objX + objWidth;
    }
    /**
     * Check if frog reached a home slot
     */
    checkHomeArrival() {
        const frog = this.data.frog;
        if (frog.y !== 0)
            return;
        // Find which home slot (if any)
        for (const home of this.data.homes) {
            if (!home.occupied && Math.abs(frog.x - home.x) <= 2) {
                // Successfully reached home
                home.occupied = true;
                this.data.homesCompleted++;
                this.data.score += constants_1.SCORES.home;
                // Bonus for fly
                if (home.hasFly) {
                    this.data.score += constants_1.SCORES.fly;
                    home.hasFly = false;
                }
                // Time bonus
                this.data.score += Math.floor(this.data.timeRemaining) * constants_1.SCORES.timeBonus;
                // Check if level complete
                if (this.data.homesCompleted >= 5) {
                    this.data.score += constants_1.SCORES.levelComplete;
                    this.data.level++;
                    this.data.state = 'levelComplete';
                    setTimeout(() => {
                        this.initLevel();
                        this.data.state = 'playing';
                    }, 2000);
                }
                else {
                    // Reset frog for next attempt
                    this.resetFrogPosition();
                }
                this.render();
                return;
            }
        }
        // Landed in wrong spot (between homes or on occupied home)
        this.killFrog('edge');
    }
    /**
     * Kill the frog
     */
    killFrog(deathType) {
        this.data.frog.isDead = true;
        this.data.frog.deathType = deathType;
        this.data.frog.deathFrame = 0;
        this.data.lives--;
    }
    /**
     * Respawn frog after death
     */
    respawnFrog() {
        if (this.data.lives <= 0) {
            this.data.state = 'gameover';
            return;
        }
        this.resetFrogPosition();
        this.data.frog.isDead = false;
        this.data.frog.deathType = null;
        this.data.frog.deathFrame = 0;
        // Reset time for new attempt
        const config = (0, constants_1.getLevelConfig)(this.data.level);
        this.data.timeRemaining = config.timeLimit;
    }
    /**
     * Reset frog to starting position
     */
    resetFrogPosition() {
        this.data.frog.x = Math.floor(constants_1.GRID_WIDTH / 2);
        this.data.frog.y = constants_1.GRID_HEIGHT - 1;
        this.data.frog.direction = 'up';
        this.data.frog.isJumping = false;
        this.data.frog.jumpProgress = 0;
        this.data.frog.onObject = null;
    }
    /**
     * Render the game
     */
    render() {
        const lines = [];
        // Create render buffer
        const buffer = [];
        for (let y = 0; y < constants_1.GRID_HEIGHT; y++) {
            buffer[y] = [];
            for (let x = 0; x < constants_1.GRID_WIDTH; x++) {
                buffer[y][x] = ' ';
            }
        }
        // Render lanes (background)
        for (const lane of this.data.lanes) {
            const y = lane.y;
            let bgChar = ' ';
            let bgColor = 'black';
            switch (lane.type) {
                case 'road':
                    bgChar = '.';
                    bgColor = 'gray';
                    break;
                case 'water':
                    bgChar = '~';
                    bgColor = 'blue';
                    break;
                case 'safe':
                    bgChar = '_';
                    bgColor = 'green';
                    break;
                case 'home':
                    bgChar = ' ';
                    bgColor = 'black';
                    break;
            }
            for (let x = 0; x < constants_1.GRID_WIDTH; x++) {
                buffer[y][x] = bgChar;
            }
        }
        // Render homes
        for (const home of this.data.homes) {
            const y = 0;
            if (home.occupied) {
                buffer[y][home.x] = '*';
                buffer[y][home.x + 1] = '*';
            }
            else if (home.hasFly) {
                buffer[y][home.x] = 'F';
                buffer[y][home.x + 1] = ' ';
            }
            else {
                buffer[y][home.x] = '[';
                buffer[y][home.x + 1] = ']';
            }
        }
        // Render objects
        for (const lane of this.data.lanes) {
            for (const obj of lane.objects) {
                const x = Math.floor(obj.x);
                const width = 'width' in obj ? obj.width : 2;
                let char = '#';
                if ('type' in obj) {
                    switch (obj.type) {
                        case 'car':
                        case 'racecar':
                            char = '#';
                            break;
                        case 'truck':
                            char = 'T';
                            break;
                        case 'log':
                            char = '=';
                            break;
                        case 'turtle':
                            char = obj.isDiving ? ' ' : 'o';
                            break;
                    }
                }
                for (let dx = 0; dx < width; dx++) {
                    const drawX = Math.floor(x + dx);
                    if (drawX >= 0 && drawX < constants_1.GRID_WIDTH) {
                        buffer[obj.y][drawX] = char;
                    }
                }
            }
        }
        // Render frog
        if (!this.data.frog.isDead) {
            const fx = Math.floor(this.data.frog.x);
            const fy = this.data.frog.y;
            if (fx >= 0 && fx < constants_1.GRID_WIDTH && fy >= 0 && fy < constants_1.GRID_HEIGHT) {
                let frogChar = '@';
                if (this.data.frog.isJumping) {
                    frogChar = this.data.frog.direction === 'up' ? '^' :
                        this.data.frog.direction === 'down' ? 'v' :
                            this.data.frog.direction === 'left' ? '<' : '>';
                }
                buffer[fy][fx] = frogChar;
            }
        }
        else {
            // Death animation
            const fx = Math.floor(this.data.frog.x);
            const fy = this.data.frog.y;
            if (fx >= 0 && fx < constants_1.GRID_WIDTH && fy >= 0 && fy < constants_1.GRID_HEIGHT) {
                const deathChars = ['X', 'x', '+', '.', ' '];
                const frame = Math.min(this.data.frog.deathFrame / 4, deathChars.length - 1);
                buffer[fy][fx] = deathChars[Math.floor(frame)];
            }
        }
        // Convert buffer to lines with colors
        for (let y = 0; y < constants_1.GRID_HEIGHT; y++) {
            const lane = this.data.lanes[y];
            let line = '';
            for (let x = 0; x < constants_1.GRID_WIDTH; x++) {
                const char = buffer[y][x];
                // Color based on character/lane
                if (char === '@' || char === '^' || char === 'v' || char === '<' || char === '>') {
                    line += `{green-fg}${char}{/}`;
                }
                else if (char === '#') {
                    line += `{red-fg}${char}{/}`;
                }
                else if (char === 'T') {
                    line += `{yellow-fg}${char}{/}`;
                }
                else if (char === '=') {
                    line += `{yellow-fg}${char}{/}`;
                }
                else if (char === 'o') {
                    line += `{green-fg}${char}{/}`;
                }
                else if (char === '*') {
                    line += `{cyan-fg}${char}{/}`;
                }
                else if (char === '[' || char === ']') {
                    line += `{cyan-fg}${char}{/}`;
                }
                else if (char === 'F') {
                    line += `{magenta-fg}${char}{/}`;
                }
                else if (char === '~') {
                    line += `{blue-fg}${char}{/}`;
                }
                else if (char === '.') {
                    line += `{gray-fg}${char}{/}`;
                }
                else if (char === '_') {
                    line += `{green-fg}${char}{/}`;
                }
                else if (char === 'X' || char === 'x' || char === '+') {
                    line += `{red-fg}${char}{/}`;
                }
                else {
                    line += char;
                }
            }
            lines.push(line);
        }
        // Add game status line
        lines.push('');
        const timeBar = '='.repeat(Math.max(0, Math.floor(this.data.timeRemaining / 2)));
        const timeColor = this.data.timeRemaining <= 10 ? 'red' : 'yellow';
        lines.push(`{${timeColor}-fg}TIME: [${timeBar.padEnd(30, ' ')}]{/}`);
        this.renderCallback(lines.join('\n'));
    }
}
exports.FroggerGame = FroggerGame;
//# sourceMappingURL=frogger-game.js.map