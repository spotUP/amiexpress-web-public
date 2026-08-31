/**
 * Super Qix - Core Game Engine
 * Main game logic and state management
 */
import { FIELD_WIDTH, FIELD_HEIGHT, GAME_TICK_MS, EXTRA_LIFE_PERCENT, FILL_ANIMATION_FRAMES, LEVEL_CLEAR_WIPE_COLUMNS, BONUS_PANEL_FRAMES, INTRO_PANEL_FRAMES, LETTER_END_OF_LEVEL_POINTS, LETTER_WORD_COMPLETE_POINTS, MARKER_CYCLE, MARKER_CYCLE_FRAMES, SKULL_CHEW_FRAMES, GAME_OVER_BLINK_FRAMES, SKULLS_PER_RELEASE, POINTS_PER_BONUS_PERCENT, CHARS, BG_COLORS, CELL_WIDTH, ART_PALETTE, getLevelConfig, FUSE_START_DELAY } from './constants';
import { artForCell } from './background';
import { DrawingSystem } from './drawing';
import { EnemySystem } from './enemies';
import { PowerUpSystem } from './powerups';
/**
 * Main game engine for Super Qix
 */
export class QixEngine {
    constructor(data, renderCallback) {
        this.lastMoveTime = 0;
        /**
         * The picture hidden behind the playfield, revealed as area is claimed.
         * Null when the board has no art, in which case claimed area is drawn as
         * a flat colour and the game plays exactly as before.
         */
        this.background = null;
        /**
         * A claim that is still being painted in.
         *
         * The area is won the instant the shape closes - the score and the
         * percentage are credited then - but the ground is filled in over several
         * frames, sweeping RIGHT TO LEFT, so the player sees the area being taken
         * rather than it appearing all at once. `columns` holds the cells grouped
         * by x, ordered right to left, and each tick consumes a slice of them.
         */
        this.pendingFill = null;
        /**
         * The end-of-level sequence, following the arcade.
         *
         *   reveal - the picture wipes in from the right, taking the player's
         *            lines with it, until the whole image is showing;
         *   bonus  - the BONUS tally sits over the finished picture;
         *   clear  - the picture wipes away again;
         *   intro  - the empty field announces what the next round needs.
         */
        this.outro = null;
        this.data = data;
        this.renderCallback = renderCallback;
        this.drawingSystem = new DrawingSystem(data);
        this.enemySystem = new EnemySystem(data);
        this.powerUpSystem = new PowerUpSystem(data);
    }
    /**
     * Set the picture revealed as area is claimed.
     *
     * Loading it reads a file, so the door does that and hands the result in
     * rather than initLevel blocking on I/O.
     */
    setBackground(background) {
        this.background = background;
    }
    /**
     * Initialize a new level
     */
    initLevel(levelNum) {
        const d = this.data;
        const config = getLevelConfig(levelNum);
        d.level = levelNum;
        d.claimedPercent = 0;
        d.targetPercent = config.targetPercent;
        d.scoreMultiplier = 1;
        d.levelWord = config.word;
        d.collectedLetters = [];
        d.activeEffects = [];
        d.levelStartTime = Date.now();
        d.stopTimer = 0;
        d.timeMeter = 0;
        // Initialize playfield
        d.fieldWidth = FIELD_WIDTH;
        d.fieldHeight = FIELD_HEIGHT;
        d.field = this.createField();
        // Initialize border path for Sparx patrol
        d.borderPath = this.createBorderPath();
        // Reset marker to bottom center of border
        d.marker = {
            x: Math.floor(FIELD_WIDTH / 2),
            y: FIELD_HEIGHT - 1,
            isDrawing: false,
            hasShield: false,
            speedBoost: false,
            speedBoostTimer: 0
        };
        // Clear stix
        d.currentStix = null;
        d.fuse = null;
        // Abandon any claim still being painted in. The winning claim of the
        // previous level is a large one, and its remaining columns would
        // otherwise carry on painting into THIS level's fresh field - which
        // handed the player a new level with chunks already filled in.
        this.pendingFill = null;
        this.outro = null;
        // Spawn enemies
        this.enemySystem.initLevel(config);
        // Clear power-ups
        d.powerUps = [];
        d.powerUpIdCounter = 0;
        this.render();
    }
    /**
     * Create initial field with borders
     */
    createField() {
        const field = [];
        for (let y = 0; y < FIELD_HEIGHT; y++) {
            field[y] = [];
            for (let x = 0; x < FIELD_WIDTH; x++) {
                // Border on edges
                if (x === 0 || x === FIELD_WIDTH - 1 || y === 0 || y === FIELD_HEIGHT - 1) {
                    field[y][x] = 'border';
                }
                else {
                    field[y][x] = 'unclaimed';
                }
            }
        }
        return field;
    }
    /**
     * Create border path for Sparx patrol
     */
    createBorderPath() {
        const path = [];
        // Top edge (left to right)
        for (let x = 0; x < FIELD_WIDTH; x++) {
            path.push({ x, y: 0 });
        }
        // Right edge (top to bottom)
        for (let y = 1; y < FIELD_HEIGHT; y++) {
            path.push({ x: FIELD_WIDTH - 1, y });
        }
        // Bottom edge (right to left)
        for (let x = FIELD_WIDTH - 2; x >= 0; x--) {
            path.push({ x, y: FIELD_HEIGHT - 1 });
        }
        // Left edge (bottom to top)
        for (let y = FIELD_HEIGHT - 2; y > 0; y--) {
            path.push({ x: 0, y });
        }
        return path;
    }
    /**
     * Main update loop
     */
    update() {
        const d = this.data;
        if (d.state !== 'playing')
            return;
        const now = Date.now();
        d.frameCount++;
        // Paint in any claim still sweeping across the field
        this.advanceFill();
        // Fill the border Time Meter
        this.advanceTimeMeter();
        // Update active effects
        this.powerUpSystem.updateEffects();
        // Update enemies
        this.enemySystem.update();
        // Update fuse if drawing and stopped
        if (d.marker.isDrawing && d.currentStix) {
            d.stopTimer += GAME_TICK_MS;
            if (d.stopTimer > FUSE_START_DELAY) {
                this.enemySystem.updateFuse(d.currentStix.points);
            }
        }
        // Check collisions
        if (this.checkCollisions()) {
            // Player died
            this.handleDeath();
            return;
        }
        // Check power-up collection
        this.powerUpSystem.checkCollection(d.marker);
        // Check level complete
        if (d.claimedPercent >= d.targetPercent) {
            this.levelComplete();
            return;
        }
        // Check word complete (auto-complete level)
        if (this.checkWordComplete()) {
            d.score += 10000; // Word bonus
            d.claimedPercent = 100;
            this.levelComplete();
            return;
        }
        this.render();
    }
    /**
     * Fill the border Time Meter, and release Skulls when it tops out.
     *
     * FAQ 1: "The outside border of the playing field is composed of squares
     * which serve as a Time Meter. As you play, they change colour two at a
     * time, until the whole border is red at which point two more Skulls are
     * released onto the field and the counter resets and starts again." Later
     * levels fill it faster (FAQ 1: "the timer counts down more quickly").
     */
    advanceTimeMeter() {
        const d = this.data;
        const config = getLevelConfig(d.level);
        d.timeMeter += GAME_TICK_MS / config.timeMeterMs;
        if (d.timeMeter >= 1) {
            d.timeMeter = 0;
            this.enemySystem.releaseSkulls(SKULLS_PER_RELEASE, config.sparxSpeed);
        }
    }
    /**
     * Queue a won area to be painted in, sweeping right to left.
     *
     * Grouped by column and reversed so the highest x is filled first. The
     * number of columns taken per tick is set so that any claim, from a
     * two-cell sliver to most of the board, finishes in about the same time -
     * a fixed per-column rate would make a big claim crawl.
     */
    beginFill(points) {
        if (points.length === 0)
            return;
        const byColumn = new Map();
        for (const point of points) {
            const column = byColumn.get(point.x);
            if (column)
                column.push(point);
            else
                byColumn.set(point.x, [point]);
        }
        const columns = [...byColumn.keys()]
            .sort((a, b) => b - a) // right to left
            .map(x => byColumn.get(x));
        this.pendingFill = {
            columns,
            perTick: Math.max(1, Math.ceil(columns.length / FILL_ANIMATION_FRAMES)),
        };
    }
    /**
     * Has the Time Meter consumed this border square yet?
     *
     * The meter runs along the border path, and squares are consumed in pairs
     * (FAQ 1: "they change colour two at a time"), so the boundary is rounded
     * down to an even number of squares.
     */
    isMeterFilled(x, y) {
        const d = this.data;
        const path = d.borderPath;
        if (path.length === 0)
            return false;
        const index = path.findIndex(p => p.x === x && p.y === y);
        if (index < 0)
            return false;
        const consumed = Math.floor((d.timeMeter * path.length) / 2) * 2;
        return index < consumed;
    }
    /** Paint the next slice of a sweeping claim. */
    advanceFill() {
        const fill = this.pendingFill;
        if (!fill)
            return;
        for (let i = 0; i < fill.perTick && fill.columns.length > 0; i++) {
            const column = fill.columns.shift();
            for (const point of column) {
                this.data.field[point.y][point.x] = 'claimed';
            }
        }
        if (fill.columns.length === 0)
            this.pendingFill = null;
    }
    /**
     * Write centred lines across the middle of the rendered field.
     *
     * Whole rendered rows are replaced rather than individual cells, because
     * each cell is already a run of colour tags. Every replacement row is
     * padded to the full width so the frame still measures SCREEN_WIDTH.
     */
    overlayPanel(lines, panel) {
        const width = FIELD_WIDTH * CELL_WIDTH;
        const top = Math.max(0, Math.floor((lines.length - panel.length) / 2));
        panel.forEach((entry, i) => {
            const row = top + i;
            if (row < 0 || row >= lines.length)
                return;
            const left = Math.max(0, Math.floor((width - entry.text.length) / 2));
            const padded = ' '.repeat(left) + entry.text + ' '.repeat(Math.max(0, width - left - entry.text.length));
            lines[row] = `{black-bg}{${entry.colour}-fg}${padded}{/${entry.colour}-fg}{/black-bg}`;
        });
    }
    /**
     * The panel the end-of-level sequence is showing: the BONUS tally over the
     * finished picture, then what the next round asks for.
     */
    outroPanel() {
        const outro = this.outro;
        if (!outro)
            return null;
        if (outro.phase === 'bonus') {
            const row = (label, value) => `${label.padEnd(12)}${String(value).padStart(8)}`;
            return [
                { text: 'BONUS', colour: 'lightcyan' },
                { text: '', colour: 'white' },
                { text: row(`AREA  ${outro.areaPercent}%`, outro.areaBonus), colour: 'lightblue' },
                { text: row('WORD', outro.wordBonus), colour: 'lightblue' },
            ];
        }
        if (outro.phase === 'intro') {
            const next = getLevelConfig(this.data.level + 1);
            return [
                { text: 'CHALLENGE TO', colour: 'lightred' },
                { text: `TAKE ${next.targetPercent}% AREA`, colour: 'lightred' },
                { text: '', colour: 'white' },
                { text: 'NEXT TRY', colour: 'lightred' },
                { text: 'READY', colour: 'lightyellow' },
            ];
        }
        return null;
    }
    /**
     * The GAME OVER panel.
     *
     * The arcade blinks "GAME OVER / INSERT COIN" over the field; a BBS door
     * has no coin slot, so it asks for a key. Nothing drew this state at all
     * before - losing the last life simply froze the board.
     */
    gameOverPanel() {
        const d = this.data;
        if (d.state !== 'gameover')
            return null;
        const showPrompt = Math.floor(d.frameCount / GAME_OVER_BLINK_FRAMES) % 2 === 0;
        return [
            { text: 'GAME OVER', colour: 'lightred' },
            { text: '', colour: 'white' },
            { text: `SCORE ${d.score}`, colour: 'lightgreen' },
            { text: `ROUND ${d.level}`, colour: 'lightgreen' },
            { text: '', colour: 'white' },
            { text: showPrompt ? 'PRESS ENTER' : '', colour: 'lightyellow' },
        ];
    }
    /**
     * Work out the end-of-level bonuses and start the arcade sequence.
     *
     * FAQ 2.4.2: "1000 points x (each 1% above required fill threshold)",
     * "1000 points x (Key letters collected) if word is still incomplete",
     * and "10,000 points x (Key letters collected) if word is completed".
     * This is where banked letters finally pay: FAQ 2.3 says collecting them
     * "will not give you any points until you complete the level".
     */
    startLevelOutro() {
        const d = this.data;
        const above = Math.max(0, Math.floor(d.claimedPercent) - d.targetPercent);
        const areaBonus = above * POINTS_PER_BONUS_PERCENT;
        const perLetter = this.checkWordComplete()
            ? LETTER_WORD_COMPLETE_POINTS
            : LETTER_END_OF_LEVEL_POINTS;
        const wordBonus = d.collectedLetters.length * perLetter;
        d.score += areaBonus + wordBonus;
        this.outro = {
            phase: 'reveal',
            sweepX: FIELD_WIDTH,
            timer: 0,
            areaBonus,
            wordBonus,
            areaPercent: Math.floor(d.claimedPercent),
        };
    }
    /**
     * Advance the end-of-level sequence one frame and repaint.
     *
     * Called by the door while the level is handed over - update() only runs
     * while playing. Returns true while the sequence is still running.
     */
    advanceLevelOutro() {
        const outro = this.outro;
        if (!outro)
            return false;
        switch (outro.phase) {
            case 'reveal':
                outro.sweepX -= LEVEL_CLEAR_WIPE_COLUMNS;
                if (outro.sweepX <= 0) {
                    outro.sweepX = 0;
                    outro.phase = 'bonus';
                    outro.timer = BONUS_PANEL_FRAMES;
                }
                break;
            case 'bonus':
                outro.timer--;
                if (outro.timer <= 0) {
                    outro.phase = 'clear';
                    outro.sweepX = FIELD_WIDTH;
                }
                break;
            case 'clear':
                outro.sweepX -= LEVEL_CLEAR_WIPE_COLUMNS;
                if (outro.sweepX <= 0) {
                    outro.sweepX = 0;
                    outro.phase = 'intro';
                    outro.timer = INTRO_PANEL_FRAMES;
                }
                break;
            case 'intro':
                outro.timer--;
                if (outro.timer <= 0) {
                    // Deliberately no repaint: the intro panel from the previous
                    // frame should stay up, and the door advances the level next,
                    // which paints the new one. Repainting here would flash the
                    // finished level's field again.
                    this.outro = null;
                    return false;
                }
                break;
        }
        this.render();
        return true;
    }
    /** Is the end-of-level sequence still running? */
    isRevealing() {
        return this.outro !== null;
    }
    /**
     * What the end-of-level sequence paints at this cell, if anything.
     */
    outroCellAt(x, y, cell) {
        const outro = this.outro;
        if (!outro || cell === 'border')
            return null;
        const picture = () => this.background
            ? { ch: ' ', art: artForCell(this.background, x, y) }
            : { ch: ' ', bg: BG_COLORS.claimed };
        const bare = () => ({ ch: ' ', bg: BG_COLORS.unclaimed });
        switch (outro.phase) {
            case 'reveal':
                return x >= outro.sweepX ? picture() : null;
            case 'bonus':
                return picture();
            case 'clear':
                return x >= outro.sweepX ? bare() : picture();
            case 'intro':
                return bare();
        }
    }
    /** Is a claim still sweeping across the field? */
    isFilling() {
        return this.pendingFill !== null;
    }
    /**
     * Handle direction input
     */
    handleDirection(dir) {
        const d = this.data;
        const now = Date.now();
        // Rate limit movement
        const moveDelay = d.marker.speedBoost ? 25 : 50;
        if (now - this.lastMoveTime < moveDelay)
            return;
        this.lastMoveTime = now;
        // Calculate next position
        let nextX = d.marker.x;
        let nextY = d.marker.y;
        switch (dir) {
            case 'up':
                nextY--;
                break;
            case 'down':
                nextY++;
                break;
            case 'left':
                nextX--;
                break;
            case 'right':
                nextX++;
                break;
        }
        // Bounds check
        if (nextX < 0 || nextX >= FIELD_WIDTH || nextY < 0 || nextY >= FIELD_HEIGHT) {
            return;
        }
        const nextCell = d.field[nextY][nextX];
        // Stepping off safe ground into open field starts a line by itself.
        //
        // The arcade holds a Draw button to detach, but that assumes a stick
        // and a button under one hand. In a BBS terminal the arrow keys are
        // the whole controller, so an arrow pointed into unclaimed area IS the
        // intent to draw - nothing else can be meant by it, since without
        // drawing that move is simply refused.
        if (!d.marker.isDrawing && nextCell === 'unclaimed') {
            this.startDrawing();
        }
        if (d.marker.isDrawing && d.currentStix) {
            // Retracing one step back along the line (FAQ 2.1: backtracking IS
            // allowed in Super Qix). The line shortens and the abandoned cell goes
            // back to open field. Deliberately does NOT reset stopTimer: FAQ 2.2
            // says "backtracking counts as not moving for the purposes of the
            // Fuse", so the fuse keeps burning while the player reverses out.
            if (this.drawingSystem.isBacktrack({ x: nextX, y: nextY })) {
                if (this.drawingSystem.retractStix()) {
                    d.marker.x = nextX;
                    d.marker.y = nextY;
                }
                return;
            }
            // Drawing mode - can move into unclaimed or back to border/claimed
            if (nextCell === 'unclaimed') {
                // Extend stix
                if (this.drawingSystem.extendStix({ x: nextX, y: nextY })) {
                    d.marker.x = nextX;
                    d.marker.y = nextY;
                    d.stopTimer = 0; // Reset fuse timer
                }
            }
            else if (nextCell === 'border' || nextCell === 'claimed') {
                // Complete stix - claim area
                const result = this.drawingSystem.completeStix({ x: nextX, y: nextY });
                if (result.success) {
                    d.marker.x = nextX;
                    d.marker.y = nextY;
                    d.marker.isDrawing = false;
                    d.currentStix = null;
                    d.fuse = null;
                    d.stopTimer = 0;
                    // The area is won now - score and percentage are credited
                    // immediately - but the ground is painted in over the next few
                    // frames, sweeping right to left.
                    if (result.filled) {
                        this.beginFill(result.filled);
                    }
                    // Award points
                    if (result.points) {
                        d.score += result.points;
                    }
                    if (result.percent) {
                        d.claimedPercent += result.percent;
                    }
                    // Spawn power-up chance
                    this.powerUpSystem.trySpawnPowerUp();
                    // Update border path for Sparx, then re-anchor existing Sparx to
                    // it - the rebuilt array reorders points, so a stale pathIndex
                    // would otherwise teleport a Sparx onto the marker's landing cell.
                    d.borderPath = this.updateBorderPath();
                    this.enemySystem.reanchorBorderPositions();
                }
            }
            else if (nextCell === 'stix') {
                // Can't cross own stix - die!
                this.handleDeath();
                return;
            }
        }
        else {
            // Not drawing: the outer frame, and the EDGES of claimed ground only.
            // The inside of a claimed region is not walkable - see isWalkable.
            if (this.drawingSystem.isWalkable({ x: nextX, y: nextY })) {
                d.marker.x = nextX;
                d.marker.y = nextY;
            }
            else if (!this.drawingSystem.isWalkable({ x: d.marker.x, y: d.marker.y }) &&
                (nextCell === 'border' || nextCell === 'claimed')) {
                // Escape hatch: a claim can bury the cell the marker is standing on,
                // and a marker with nowhere legal to go would be stuck for good. From
                // a buried cell, any safe ground is allowed until it is back on an edge.
                d.marker.x = nextX;
                d.marker.y = nextY;
            }
            // Moving into unclaimed area without drawing: stay put
        }
    }
    /**
     * Detach from the edge and start drawing.
     *
     * Super Qix has a single Draw button - there is no slow/fast choice
     * (FAQ 2.5.3: "There's no longer an option to complete lines quickly
     * for safety or slowly for extra points"), so one entry point.
     */
    handleDraw() {
        this.startDrawing();
    }
    /**
     * Start drawing in the current direction
     */
    startDrawing() {
        const d = this.data;
        if (d.marker.isDrawing)
            return;
        // Must be on border or claimed area to start drawing
        const currentCell = d.field[d.marker.y][d.marker.x];
        if (currentCell !== 'border' && currentCell !== 'claimed')
            return;
        d.marker.isDrawing = true;
        d.currentStix = {
            points: [{ x: d.marker.x, y: d.marker.y }],
            startTime: Date.now()
        };
        d.stopTimer = 0;
    }
    /**
     * Stop drawing (release key)
     */
    handleStopDraw() {
        // Drawing continues until you return to safe area
        // This method is called when draw key is released
        // Fuse mechanic will start if stopped
    }
    /**
     * Update border path to include claimed area edges
     */
    updateBorderPath() {
        const d = this.data;
        const path = [];
        const visited = new Set();
        // Find all border and claimed edge cells
        for (let y = 0; y < FIELD_HEIGHT; y++) {
            for (let x = 0; x < FIELD_WIDTH; x++) {
                const cell = d.field[y][x];
                if (cell === 'border') {
                    path.push({ x, y });
                }
                else if (cell === 'claimed' && this.drawingSystem.touchesUnclaimed(x, y)) {
                    // The edge of claimed ground. Same predicate the marker walks on,
                    // so the Sparx patrol and the player agree on what an edge is.
                    const key = `${x},${y}`;
                    if (!visited.has(key)) {
                        visited.add(key);
                        path.push({ x, y });
                    }
                }
            }
        }
        return path;
    }
    /**
     * Check all collisions
     */
    checkCollisions() {
        const d = this.data;
        // Check Qix collision (only while drawing)
        if (d.marker.isDrawing && d.currentStix) {
            if (this.enemySystem.checkQixCollision(d.marker, d.currentStix.points)) {
                if (d.marker.hasShield) {
                    d.marker.hasShield = false;
                    return false; // Shield saved us
                }
                return true;
            }
        }
        // Check Sparx collision (always)
        if (this.enemySystem.checkSparxCollision(d.marker)) {
            if (d.marker.hasShield) {
                d.marker.hasShield = false;
                return false;
            }
            return true;
        }
        // Check Fuse collision (while drawing)
        if (d.fuse && d.fuse.active) {
            if (this.enemySystem.checkFuseCollision(d.marker)) {
                return true; // Fuse always kills
            }
        }
        return false;
    }
    /**
     * Handle player death
     */
    handleDeath() {
        const d = this.data;
        d.lives--;
        // Where the marker goes back to.
        //
        // NOT the level's spawn point. Losing a life in a far corner and being
        // sent back to the middle of the bottom edge costs the whole walk out
        // again, and reads as the game having reset itself. The marker returns
        // to where it LEFT safe ground - the start of the line it was drawing.
        const retreat = d.currentStix?.points[0];
        // Clear current stix
        if (d.currentStix) {
            for (const point of d.currentStix.points) {
                if (d.field[point.y][point.x] === 'stix') {
                    d.field[point.y][point.x] = 'unclaimed';
                }
            }
        }
        d.currentStix = null;
        d.marker.isDrawing = false;
        // FAQ 2.2: "If you should die, all but two Skulls will disappear."
        this.enemySystem.cullSkullsAfterDeath();
        d.fuse = null;
        d.stopTimer = 0;
        if (d.lives <= 0) {
            d.state = 'gameover';
        }
        else if (retreat && this.drawingSystem.isWalkable(retreat)) {
            // Back to where the line started - safe ground by definition, since
            // that is what a line has to start from.
            d.marker.x = retreat.x;
            d.marker.y = retreat.y;
        }
        else if (!this.drawingSystem.isWalkable({ x: d.marker.x, y: d.marker.y })) {
            // Killed on ground a claim has since buried: fall back to the
            // nearest safe cell rather than the spawn point.
            const safe = this.nearestWalkable(d.marker.x, d.marker.y);
            d.marker.x = safe.x;
            d.marker.y = safe.y;
        }
        // Otherwise the marker is already on safe ground: leave it alone.
        this.render();
    }
    /**
     * The closest cell the marker may stand on, searched outwards in rings.
     */
    nearestWalkable(fromX, fromY) {
        for (let r = 1; r < Math.max(FIELD_WIDTH, FIELD_HEIGHT); r++) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    if (Math.abs(dx) !== r && Math.abs(dy) !== r)
                        continue;
                    const point = { x: fromX + dx, y: fromY + dy };
                    if (this.drawingSystem.isWalkable(point))
                        return point;
                }
            }
        }
        // The frame is always walkable, so this is unreachable in practice.
        return { x: Math.floor(FIELD_WIDTH / 2), y: FIELD_HEIGHT - 1 };
    }
    /**
     * Check if word is complete
     */
    checkWordComplete() {
        const d = this.data;
        if (!d.levelWord)
            return false;
        const needed = d.levelWord.split('');
        return needed.every(letter => d.collectedLetters.includes(letter));
    }
    /**
     * Level complete
     */
    levelComplete() {
        const d = this.data;
        // The area and word bonuses are worked out and credited by
        // startLevelOutro, which also owns the tally the player is shown.
        // There was a second area bonus here as well, so every cleared level
        // paid for the same percentage twice.
        // Extra life for 98%+
        if (d.claimedPercent >= EXTRA_LIFE_PERCENT) {
            d.lives++;
        }
        this.startLevelOutro();
        d.state = 'levelTransition';
        d.transitionMessage = `LEVEL ${d.level} COMPLETE!`;
        d.transitionTimer = 90; // 3 seconds at 30fps
        this.render();
    }
    /**
     * Advance to next level
     */
    advanceLevel() {
        const d = this.data;
        d.level++;
        this.initLevel(d.level);
        d.state = 'playing';
    }
    /**
     * Main render function
     */
    render() {
        const d = this.data;
        const lines = [];
        const buffer = [];
        for (let y = 0; y < FIELD_HEIGHT; y++) {
            buffer[y] = [];
            for (let x = 0; x < FIELD_WIDTH; x++) {
                buffer[y][x] = { ch: ' ', bg: BG_COLORS.unclaimed };
            }
        }
        // Draw field
        for (let y = 0; y < FIELD_HEIGHT; y++) {
            for (let x = 0; x < FIELD_WIDTH; x++) {
                const cell = d.field[y][x];
                // The end-of-level sequence paints the field itself: the picture
                // once the reveal has passed a column, plain ground once the
                // clearing wipe has.
                const outroCell = this.outroCellAt(x, y, cell);
                if (outroCell) {
                    buffer[y][x] = outroCell;
                    continue;
                }
                switch (cell) {
                    case 'border':
                        // The frame is also the Time Meter: the squares already
                        // consumed show red, two at a time, until the whole border
                        // is red and two more Skulls are released (FAQ 1).
                        buffer[y][x] = {
                            ch: ' ',
                            bg: this.isMeterFilled(x, y) ? BG_COLORS.borderMeter : BG_COLORS.border,
                        };
                        break;
                    case 'unclaimed':
                        buffer[y][x] = { ch: ' ', bg: BG_COLORS.unclaimed };
                        break;
                    case 'claimed':
                        // Claiming ground is what uncovers the picture. With no art
                        // loaded this falls back to the flat colour it used to be.
                        buffer[y][x] = this.background
                            ? { ch: ' ', art: artForCell(this.background, x, y) }
                            : { ch: ' ', bg: BG_COLORS.claimed };
                        break;
                    case 'stix':
                        // The line being drawn is yellow (FAQ 2.1).
                        buffer[y][x] = { ch: ' ', bg: BG_COLORS.stix };
                        break;
                }
            }
        }
        // Draw current stix
        if (d.currentStix) {
            const bg = BG_COLORS.stix;
            for (const point of d.currentStix.points) {
                if (point.y >= 0 && point.y < FIELD_HEIGHT && point.x >= 0 && point.x < FIELD_WIDTH) {
                    buffer[point.y][point.x] = { ch: ' ', bg };
                }
            }
        }
        // Draw Qix
        for (const qix of d.qixList) {
            const char = d.frameCount % 2 === 0 ? CHARS.qix : CHARS.qixAlt;
            const qx = Math.floor(qix.x);
            const qy = Math.floor(qix.y);
            if (qy >= 0 && qy < FIELD_HEIGHT && qx >= 0 && qx < FIELD_WIDTH) {
                buffer[qy][qx] = { ch: char, fg: 'white', bg: BG_COLORS.qix };
            }
            // Draw segments
            for (const seg of qix.segments) {
                const sx = Math.floor(seg.x);
                const sy = Math.floor(seg.y);
                if (sy >= 0 && sy < FIELD_HEIGHT && sx >= 0 && sx < FIELD_WIDTH) {
                    buffer[sy][sx] = { ch: CHARS.qix, fg: 'white', bg: BG_COLORS.qix };
                }
            }
        }
        // Draw Sparx
        for (const sparx of d.sparxList) {
            const sx = Math.floor(sparx.x);
            const sy = Math.floor(sparx.y);
            if (sy >= 0 && sy < FIELD_HEIGHT && sx >= 0 && sx < FIELD_WIDTH) {
                // Every Skull looks the same: there are no Super Skulls.
                // Skulls chew, alternating an open and a closed mouth.
                const chewing = Math.floor(d.frameCount / SKULL_CHEW_FRAMES) % 2 === 0;
                buffer[sy][sx] = {
                    ch: chewing ? CHARS.sparx : CHARS.sparxChew,
                    fg: 'lightyellow',
                    bg: BG_COLORS.sparx
                };
            }
        }
        // Draw Fuse
        if (d.fuse && d.fuse.active) {
            const fx = Math.floor(d.fuse.x);
            const fy = Math.floor(d.fuse.y);
            if (fy >= 0 && fy < FIELD_HEIGHT && fx >= 0 && fx < FIELD_WIDTH) {
                const char = d.frameCount % 2 === 0 ? CHARS.fuse : CHARS.fuseHead;
                buffer[fy][fx] = { ch: char, fg: 'black', bg: BG_COLORS.fuse };
            }
        }
        // Draw power-ups
        for (const powerUp of d.powerUps) {
            if (!powerUp.collected) {
                const px = Math.floor(powerUp.x);
                const py = Math.floor(powerUp.y);
                if (py >= 0 && py < FIELD_HEIGHT && px >= 0 && px < FIELD_WIDTH) {
                    buffer[py][px] = { ch: powerUp.letter || CHARS.powerUp, fg: 'white', bg: BG_COLORS.powerUp };
                }
            }
        }
        // Draw marker
        const mx = d.marker.x;
        const my = d.marker.y;
        if (my >= 0 && my < FIELD_HEIGHT && mx >= 0 && mx < FIELD_WIDTH) {
            // The arcade marker is an animated sprite. No glyph: the cycling
            // block IS the sprite, and a character on top only muddies it
            // against the picture behind.
            const cycle = MARKER_CYCLE[Math.floor(d.frameCount / MARKER_CYCLE_FRAMES) % MARKER_CYCLE.length];
            buffer[my][mx] = { ch: ' ', bg: cycle };
        }
        // Convert buffer to tagged string.
        //
        // Each logical cell is painted CELL_WIDTH characters wide so that a cell
        // is as wide as it is tall on screen (see CELL_WIDTH in constants.ts).
        // A glyph occupies the first column of its cell and the remainder is
        // padded with spaces carrying the same colours, so the block stays solid.
        for (let y = 0; y < buffer.length; y++) {
            let line = '';
            for (let x = 0; x < buffer[y].length; x++) {
                const { ch, fg, bg, art } = buffer[y][x];
                // Revealed picture: each art character keeps its own colours, so the
                // two columns of a cell can differ - which is what makes it read as
                // artwork rather than a coloured block.
                if (art) {
                    for (const part of art) {
                        const artFg = ART_PALETTE[part.fg] || 'white';
                        const artBg = ART_PALETTE[part.bg] || 'black';
                        line += `{${artBg}-bg}{${artFg}-fg}${part.char}{/${artFg}-fg}{/${artBg}-bg}`;
                    }
                    continue;
                }
                let cellStr = ch + ' '.repeat(CELL_WIDTH - 1);
                if (fg)
                    cellStr = `{${fg}-fg}${cellStr}{/${fg}-fg}`;
                if (bg)
                    cellStr = `{${bg}-bg}${cellStr}{/${bg}-bg}`;
                line += cellStr;
            }
            lines.push(line);
        }
        // The end-of-level sequence and the game-over screen speak for
        // themselves. Without any of this the field simply froze.
        const panel = this.gameOverPanel() ?? this.outroPanel();
        if (panel) {
            this.overlayPanel(lines, panel);
        }
        else if (d.transitionMessage && d.state === 'levelTransition') {
            this.overlayPanel(lines, [
                { text: d.transitionMessage, colour: 'lightyellow' },
            ]);
        }
        this.renderCallback(lines.join('\n'));
    }
}
