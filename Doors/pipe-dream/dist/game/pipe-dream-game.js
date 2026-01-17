/**
 * Pipe Dream - Game Engine
 * 1989 LucasArts puzzle game
 */
import { QUEUE_SIZE, SCORES, PIPE_CONNECTIONS, PIPE_CHARS, OPPOSITE, DIRECTION_VECTORS, getLevelConfig, getPipesForLevel, } from './constants';
export class PipeDreamGame {
    constructor(data, renderCallback, onGameOver, onLevelComplete) {
        this.data = data;
        this.renderCallback = renderCallback;
        this.onGameOver = onGameOver;
        this.onLevelComplete = onLevelComplete;
    }
    initLevel() {
        const config = getLevelConfig(this.data.level);
        // Initialize grid
        this.data.grid = [];
        for (let y = 0; y < config.gridHeight; y++) {
            this.data.grid[y] = [];
            for (let x = 0; x < config.gridWidth; x++) {
                this.data.grid[y][x] = {
                    pipe: null,
                    fillLevel: 0,
                    isObstacle: false,
                    isStart: false,
                    startDirection: null,
                };
            }
        }
        // Place start point
        this.data.startX = 0;
        this.data.startY = Math.floor(config.gridHeight / 2);
        this.data.startDirection = 'right';
        const startCell = this.data.grid[this.data.startY][this.data.startX];
        startCell.pipe = 'start';
        startCell.isStart = true;
        startCell.startDirection = 'right';
        // Place end point (optional bonus)
        this.data.hasEnd = config.hasReservoirs; // End appears in later levels
        if (this.data.hasEnd) {
            this.data.endX = config.gridWidth - 1;
            this.data.endY = Math.floor(Math.random() * config.gridHeight);
            this.data.grid[this.data.endY][this.data.endX].pipe = 'end';
        }
        // Place obstacles
        for (let i = 0; i < config.obstacleCount; i++) {
            let attempts = 0;
            while (attempts < 50) {
                const x = Math.floor(Math.random() * config.gridWidth);
                const y = Math.floor(Math.random() * config.gridHeight);
                const cell = this.data.grid[y][x];
                if (!cell.pipe && !cell.isObstacle) {
                    cell.isObstacle = true;
                    break;
                }
                attempts++;
            }
        }
        // Place reservoirs
        if (config.hasReservoirs) {
            const reservoirCount = Math.floor(Math.random() * 2) + 1;
            for (let i = 0; i < reservoirCount; i++) {
                let attempts = 0;
                while (attempts < 50) {
                    const x = 1 + Math.floor(Math.random() * (config.gridWidth - 2));
                    const y = Math.floor(Math.random() * config.gridHeight);
                    const cell = this.data.grid[y][x];
                    if (!cell.pipe && !cell.isObstacle) {
                        cell.pipe = 'reservoir';
                        break;
                    }
                    attempts++;
                }
            }
        }
        // Initialize cursor
        this.data.cursor = { x: Math.floor(config.gridWidth / 2), y: Math.floor(config.gridHeight / 2) };
        // Initialize queue
        this.data.pipeQueue = [];
        this.data.queueSize = QUEUE_SIZE;
        for (let i = 0; i < QUEUE_SIZE; i++) {
            this.data.pipeQueue.push(this.getRandomPipe());
        }
        // Initialize flow state
        this.data.flowState = null;
        this.data.flowStarted = false;
        this.data.flowTimer = 0;
        this.data.flowDelay = config.flowDelay;
        this.data.reachedEnd = false;
        this.data.pipesUsed = 0;
        this.data.requiredPipes = config.requiredPipes;
        this.render();
    }
    getRandomPipe() {
        const pipes = getPipesForLevel(this.data.level);
        return pipes[Math.floor(Math.random() * pipes.length)];
    }
    update() {
        if (this.data.state !== 'playing')
            return;
        this.data.frameCount++;
        // Flow timer countdown
        if (!this.data.flowStarted) {
            this.data.flowTimer++;
            if (this.data.flowTimer >= this.data.flowDelay) {
                this.startFlow();
            }
        }
        else {
            // Update flow
            this.updateFlow();
        }
        this.render();
    }
    startFlow() {
        this.data.flowStarted = true;
        this.data.flowState = {
            x: this.data.startX,
            y: this.data.startY,
            direction: this.data.startDirection,
            progress: 0,
        };
        // Fill start cell
        const startCell = this.data.grid[this.data.startY][this.data.startX];
        startCell.fillLevel = 100;
    }
    updateFlow() {
        if (!this.data.flowState)
            return;
        const config = getLevelConfig(this.data.level);
        const flow = this.data.flowState;
        // Get current cell
        const cell = this.data.grid[flow.y]?.[flow.x];
        if (!cell) {
            this.endGame(false);
            return;
        }
        // Progress through current pipe
        flow.progress += config.flowSpeed;
        // Fill the pipe
        cell.fillLevel = Math.min(100, flow.progress);
        // Check if filled current pipe
        if (flow.progress >= 100) {
            // Score for filling pipe
            if (cell.pipe === 'cross') {
                this.data.score += SCORES.crossFilled;
            }
            else if (cell.pipe === 'reservoir') {
                this.data.score += SCORES.reservoirFilled;
                // Reservoir takes longer to fill
                if (flow.progress < 300) {
                    return;
                }
            }
            else {
                this.data.score += SCORES.pipeFilled;
            }
            this.data.pipesUsed++;
            // Check for end goal
            if (flow.x === this.data.endX && flow.y === this.data.endY && this.data.hasEnd) {
                this.data.reachedEnd = true;
                this.data.score += SCORES.reachedEnd;
            }
            // Move to next cell
            const nextResult = this.getNextCell(flow.x, flow.y, flow.direction);
            if (!nextResult) {
                // Flow has nowhere to go - game over or level complete
                if (this.data.pipesUsed >= this.data.requiredPipes) {
                    this.endGame(true);
                }
                else {
                    this.endGame(false);
                }
                return;
            }
            const { x: nextX, y: nextY, entryDirection } = nextResult;
            const nextCell = this.data.grid[nextY]?.[nextX];
            if (!nextCell || !nextCell.pipe || nextCell.isObstacle) {
                // Hit obstacle or empty - check if level complete
                if (this.data.pipesUsed >= this.data.requiredPipes) {
                    this.endGame(true);
                }
                else {
                    this.endGame(false);
                }
                return;
            }
            // Check if pipe connects
            const pipeConns = this.getPipeConnections(nextCell.pipe, nextCell);
            if (!pipeConns[entryDirection]) {
                // Pipe doesn't connect - game over or level complete
                if (this.data.pipesUsed >= this.data.requiredPipes) {
                    this.endGame(true);
                }
                else {
                    this.endGame(false);
                }
                return;
            }
            // Find exit direction
            const exitDirection = this.getExitDirection(nextCell.pipe, entryDirection, nextCell);
            if (!exitDirection) {
                // No exit (dead end)
                if (this.data.pipesUsed >= this.data.requiredPipes) {
                    this.endGame(true);
                }
                else {
                    this.endGame(false);
                }
                return;
            }
            // Move flow to next cell
            flow.x = nextX;
            flow.y = nextY;
            flow.direction = exitDirection;
            flow.progress = 0;
        }
    }
    getNextCell(x, y, direction) {
        const vector = DIRECTION_VECTORS[direction];
        const nextX = x + vector.dx;
        const nextY = y + vector.dy;
        // Out of bounds
        if (nextX < 0 || nextX >= this.data.grid[0].length ||
            nextY < 0 || nextY >= this.data.grid.length) {
            return null;
        }
        return {
            x: nextX,
            y: nextY,
            entryDirection: OPPOSITE[direction],
        };
    }
    getPipeConnections(pipeType, cell) {
        const base = { ...PIPE_CONNECTIONS[pipeType] };
        // Start pipe has dynamic connection
        if (pipeType === 'start' && cell.startDirection) {
            base[cell.startDirection] = true;
        }
        return base;
    }
    getExitDirection(pipeType, entryDirection, cell) {
        const connections = this.getPipeConnections(pipeType, cell);
        // For straight pipes and corners, find the other connected direction
        const exits = [];
        for (const dir of ['up', 'down', 'left', 'right']) {
            if (connections[dir] && dir !== entryDirection) {
                exits.push(dir);
            }
        }
        if (exits.length === 0)
            return null;
        // For cross pipes, continue in same general direction if possible
        if (pipeType === 'cross' && exits.includes(OPPOSITE[entryDirection])) {
            return OPPOSITE[entryDirection];
        }
        return exits[0];
    }
    endGame(success) {
        if (success) {
            // Calculate bonus
            const unusedBonus = this.data.pipeQueue.length * SCORES.unusedQueue;
            const levelBonus = this.data.level * SCORES.levelBonus;
            const endBonus = this.data.reachedEnd ? SCORES.reachedEnd : 0;
            this.data.score += unusedBonus + levelBonus + endBonus;
            this.data.state = 'levelComplete';
            this.onLevelComplete();
        }
        else {
            this.data.state = 'gameover';
            this.onGameOver();
        }
    }
    handleMove(direction) {
        if (this.data.state !== 'playing')
            return;
        const vector = DIRECTION_VECTORS[direction];
        const newX = this.data.cursor.x + vector.dx;
        const newY = this.data.cursor.y + vector.dy;
        const config = getLevelConfig(this.data.level);
        if (newX >= 0 && newX < config.gridWidth && newY >= 0 && newY < config.gridHeight) {
            this.data.cursor.x = newX;
            this.data.cursor.y = newY;
        }
        this.render();
    }
    handlePlace() {
        if (this.data.state !== 'playing')
            return;
        if (this.data.pipeQueue.length === 0)
            return;
        const { x, y } = this.data.cursor;
        const cell = this.data.grid[y][x];
        // Can't place on obstacles, start, or end
        if (cell.isObstacle || cell.pipe === 'start' || cell.pipe === 'end') {
            return;
        }
        // Can replace existing pipe (costs points but no score)
        if (cell.pipe && cell.fillLevel > 0) {
            // Can't replace filled pipe
            return;
        }
        // Place pipe from queue
        const pipe = this.data.pipeQueue.shift();
        cell.pipe = pipe;
        cell.fillLevel = 0;
        this.data.score += SCORES.pipeUsed;
        // Refill queue
        this.data.pipeQueue.push(this.getRandomPipe());
        this.render();
    }
    handleDiscard() {
        if (this.data.state !== 'playing')
            return;
        if (this.data.pipeQueue.length === 0)
            return;
        // Discard current pipe (small penalty)
        this.data.pipeQueue.shift();
        this.data.pipeQueue.push(this.getRandomPipe());
        this.render();
    }
    render() {
        const config = getLevelConfig(this.data.level);
        const gridW = config.gridWidth;
        const gridH = config.gridHeight;
        let output = '';
        // Draw grid with border
        // Top border
        output += '+' + '-'.repeat(gridW * 3) + '+\n';
        for (let y = 0; y < gridH; y++) {
            output += '|';
            for (let x = 0; x < gridW; x++) {
                const cell = this.data.grid[y][x];
                const isCursor = x === this.data.cursor.x && y === this.data.cursor.y;
                let cellStr = '';
                if (cell.isObstacle) {
                    cellStr = '{gray-fg}XXX{/}';
                }
                else if (cell.pipe) {
                    const char = PIPE_CHARS[cell.pipe];
                    const isFilled = cell.fillLevel > 50;
                    const isPartial = cell.fillLevel > 0 && cell.fillLevel <= 50;
                    if (cell.pipe === 'start') {
                        cellStr = `{green-fg}[${this.data.startDirection === 'right' ? '>' : this.data.startDirection === 'left' ? '<' : this.data.startDirection === 'up' ? '^' : 'v'}]{/}`;
                    }
                    else if (cell.pipe === 'end') {
                        cellStr = '{magenta-fg}[E]{/}';
                    }
                    else if (cell.pipe === 'reservoir') {
                        const fillChar = isFilled ? '~' : isPartial ? '.' : ' ';
                        cellStr = isFilled ? `{cyan-fg}[${fillChar}]{/}` : `{blue-fg}[${fillChar}]{/}`;
                    }
                    else {
                        // Regular pipe
                        const color = isFilled ? 'cyan' : isPartial ? 'blue' : 'yellow';
                        cellStr = `{${color}-fg} ${char} {/}`;
                    }
                }
                else {
                    // Empty cell
                    cellStr = ' . ';
                }
                // Cursor highlight
                if (isCursor) {
                    output += `{white-bg}{black-fg}${cellStr.replace(/{[^}]+}/g, '')}{/}`;
                }
                else {
                    output += cellStr;
                }
            }
            output += '|\n';
        }
        // Bottom border
        output += '+' + '-'.repeat(gridW * 3) + '+\n';
        // Queue display
        output += '\n{white-fg}NEXT:{/} ';
        for (let i = 0; i < this.data.pipeQueue.length; i++) {
            const pipe = this.data.pipeQueue[i];
            const char = PIPE_CHARS[pipe];
            const color = i === 0 ? 'yellow' : 'white';
            output += `{${color}-fg}[${char}]{/} `;
        }
        // Status
        output += '\n\n';
        const timerStr = this.data.flowStarted ? '{red-fg}FLOWING!{/}' : `{yellow-fg}START IN: ${this.data.flowDelay - this.data.flowTimer}{/}`;
        const progressStr = `{cyan-fg}PIPES: ${this.data.pipesUsed}/${this.data.requiredPipes}{/}`;
        output += `${timerStr}  ${progressStr}`;
        this.renderCallback(output);
    }
}
