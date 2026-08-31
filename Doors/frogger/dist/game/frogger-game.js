"use strict";
/**
 * Frogger - Game Engine
 * Core game logic for the 1981 Konami arcade classic
 *
 * The level's traffic, footing and hazards all come from FAQ 6.4's table by
 * way of getLevelConfig; nothing here invents a count or a direction.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FroggerGame = void 0;
const constants_1 = require("./constants");
class FroggerGame {
    constructor(data, onRender) {
        this.data = data;
        this.renderCallback = onRender;
    }
    /**
     * The game's own clock, in milliseconds of play.
     *
     * Driven by the frame counter rather than the wall clock, so that when a
     * fly is due after eight seconds it is due after eight seconds of GAME,
     * not of real time - a paused or slow-running door would otherwise skew
     * every timer in here.
     */
    clock() {
        return this.data.frameCount * constants_1.GAME_TICK_MS;
    }
    /**
     * Initialize a new level
     */
    initLevel() {
        const d = this.data;
        const config = (0, constants_1.getLevelConfig)(d.level);
        this.resetFrogPosition();
        d.frog.isDead = false;
        d.frog.deathType = null;
        d.frog.deathFrame = 0;
        d.timeRemaining = constants_1.INITIAL_TIME;
        d.frameCount = 0;
        d.frogStartTime = Date.now();
        // Lanes, straight out of LANE_CONFIG. Lane 4 carries the table's
        // fast/slow marking in its stored speed; the timed speed-up on top of
        // that is applied as it moves (FAQ 6.4).
        d.lanes = [];
        for (const laneConfig of constants_1.LANE_CONFIG) {
            const isLane4Road = laneConfig.type === 'road' && 'lane' in laneConfig && laneConfig.lane === 4;
            const base = 'speed' in laneConfig ? laneConfig.speed : 0;
            const lane = {
                type: laneConfig.type,
                y: laneConfig.y,
                lane: 'lane' in laneConfig ? laneConfig.lane : 0,
                objects: [],
                direction: 'dir' in laneConfig ? laneConfig.dir : 1,
                speed: isLane4Road && config.lane4Fast ? base * constants_1.LANE4_FAST_MULTIPLIER : base,
            };
            d.lanes.push(lane);
        }
        // Homes keep their frogs between trips; a finished level starts over.
        if (d.homes.length === 0 || d.homesCompleted >= 5) {
            d.homes = constants_1.HOME_POSITIONS.map(x => ({
                x,
                occupied: false,
                hasFly: false,
                hasAlligator: false,
                visitorUntil: 0,
            }));
            d.homesCompleted = 0;
        }
        d.snakes = [];
        d.snakeIdCounter = 0;
        d.carryingLadyFrog = false;
        d.hopPointsThisHome = 0;
        d.furthestRow = constants_1.GRID_HEIGHT - 1;
        this.populateRoad(config);
        this.populateWater(config);
        this.placeSnakes(config);
        d.flyTimer = constants_1.FLY_SPAWN_INTERVAL_MS;
        d.alligatorTimer = constants_1.HOME_CROCODILE_INTERVAL_MS;
        d.ladyFrogTimer = constants_1.LADY_FROG_INTERVAL_MS;
        d.otterTimer = constants_1.OTTER_INTERVAL_MS;
        this.render();
    }
    /**
     * Fill the road lanes with the table's car counts (FAQ 6.4).
     *
     * Spread evenly with a little jitter rather than dropped at random: the
     * FAQ's advice is to "plan for gaps to form in the first three lanes so
     * you don't become trapped", and gaps only exist if the traffic is spaced.
     */
    populateRoad(config) {
        const d = this.data;
        for (const lane of d.lanes) {
            if (lane.type !== 'road')
                continue;
            const count = config.cars[lane.lane - 1] ?? 0;
            const type = this.vehicleForLane(lane.lane);
            const width = constants_1.OBJECT_WIDTHS[type];
            const spacing = constants_1.GRID_WIDTH / Math.max(1, count);
            for (let i = 0; i < count; i++) {
                const jitter = Math.random() * Math.max(0, spacing - width - 1);
                lane.objects.push({
                    id: d.vehicleIdCounter++,
                    type,
                    x: i * spacing + jitter,
                    y: lane.y,
                    lane: lane.lane,
                    width,
                    speed: lane.speed * lane.direction,
                });
            }
        }
    }
    vehicleForLane(lane) {
        if (lane === 4)
            return 'racecar';
        return lane % 2 === 0 ? 'truck' : 'car';
    }
    /**
     * Fill the water lanes, each with what the FAQ says belongs in it: sets of
     * turtles in lanes 1 and 4, short logs in 2, long logs in 3, and medium
     * logs - or crocodiles - in 5.
     */
    populateWater(config) {
        const d = this.data;
        for (const lane of d.lanes) {
            if (lane.type !== 'water')
                continue;
            switch (lane.lane) {
                case 1:
                    this.fillTurtleLane(lane, config.turtleSets[0]);
                    break;
                case 4:
                    this.fillTurtleLane(lane, config.turtleSets[1]);
                    break;
                case 2:
                    this.fillLogLane(lane, config.shortLogs, constants_1.OBJECT_WIDTHS.shortLog);
                    break;
                case 3:
                    this.fillLogLane(lane, config.longLogs, constants_1.OBJECT_WIDTHS.longLog);
                    break;
                case 5:
                    this.fillLaneFive(lane, config);
                    break;
            }
        }
    }
    /**
     * A lane of turtle sets, exactly one of which dives.
     *
     * FAQ 6.4's key: "#D = NUMBER OF SETS OF TURTLES ALONG WITH THE SET OF
     * DIVING TURTLES" - the diving set is one of the count, not an extra, and
     * there is always exactly one.
     */
    fillTurtleLane(lane, count) {
        const d = this.data;
        const width = constants_1.OBJECT_WIDTHS.turtle;
        const spacing = constants_1.GRID_WIDTH / Math.max(1, count);
        const diver = Math.floor(Math.random() * Math.max(1, count));
        for (let i = 0; i < count; i++) {
            lane.objects.push({
                id: d.riverObjectIdCounter++,
                type: 'turtle',
                x: i * spacing,
                y: lane.y,
                lane: lane.lane,
                width,
                speed: lane.speed * lane.direction,
                isDiving: false,
                diveTimer: 0,
                canDive: i === diver,
                snakeAt: null,
                ladyFrogAt: null,
            });
        }
    }
    fillLogLane(lane, count, width) {
        const d = this.data;
        const spacing = constants_1.GRID_WIDTH / Math.max(1, count);
        for (let i = 0; i < count; i++) {
            lane.objects.push({
                id: d.riverObjectIdCounter++,
                type: 'log',
                x: i * spacing,
                y: lane.y,
                lane: lane.lane,
                width,
                speed: lane.speed * lane.direction,
                snakeAt: null,
                ladyFrogAt: null,
            });
        }
    }
    /**
     * Water lane 5, which is where the crocodiles live.
     *
     * The table's C means the lane IS crocodiles (levels 5 and 10); otherwise
     * the notes column says every Nth log up here is one instead.
     */
    fillLaneFive(lane, config) {
        const d = this.data;
        if (config.lane5Crocodile) {
            const spacing = constants_1.GRID_WIDTH / constants_1.LANE5_CROCODILE_COUNT;
            for (let i = 0; i < constants_1.LANE5_CROCODILE_COUNT; i++) {
                lane.objects.push(this.makeCrocodile(lane, i * spacing));
            }
            return;
        }
        const spacing = constants_1.GRID_WIDTH / Math.max(1, config.mediumLogs);
        for (let i = 0; i < config.mediumLogs; i++) {
            const isCrocodile = config.crocEveryNth !== null && (i + 1) % config.crocEveryNth === 0;
            if (isCrocodile) {
                lane.objects.push(this.makeCrocodile(lane, i * spacing));
                continue;
            }
            lane.objects.push({
                id: d.riverObjectIdCounter++,
                type: 'log',
                x: i * spacing,
                y: lane.y,
                lane: lane.lane,
                width: constants_1.OBJECT_WIDTHS.mediumLog,
                speed: lane.speed * lane.direction,
                snakeAt: null,
                ladyFrogAt: null,
            });
        }
    }
    makeCrocodile(lane, x) {
        return {
            id: this.data.riverObjectIdCounter++,
            type: 'crocodile',
            x,
            y: lane.y,
            lane: lane.lane,
            width: constants_1.OBJECT_WIDTHS.crocodile,
            speed: lane.speed * lane.direction,
            mouthWidth: 1,
            snakeAt: null,
            ladyFrogAt: null,
        };
    }
    /**
     * Put the level's snakes out (FAQ 6.4: "Snakes appear randomly in either
     * the median, log, or both places").
     */
    placeSnakes(config) {
        const d = this.data;
        const median = d.lanes.find(l => l.type === 'safe' && l.y < constants_1.GRID_HEIGHT - 1);
        const logLane = d.lanes.find(l => l.type === 'water' && l.lane === 3);
        for (let i = 0; i < config.snakes; i++) {
            const onLog = logLane && logLane.objects.length > 0 && Math.random() < 0.5;
            if (onLog) {
                const log = logLane.objects[Math.floor(Math.random() * logLane.objects.length)];
                if (log.snakeAt === null || log.snakeAt === undefined) {
                    log.snakeAt = Math.floor(Math.random() * log.width);
                    continue;
                }
            }
            if (!median)
                continue;
            d.snakes.push({
                id: d.snakeIdCounter++,
                x: Math.random() * constants_1.GRID_WIDTH,
                y: median.y,
                direction: Math.random() < 0.5 ? 1 : -1,
                speed: 1.2,
            });
        }
    }
    /**
     * How much quicker the river is running than it should be.
     *
     * FAQ 7: "if you waste too much time, the things on the river will move
     * quicker so you will have to adjust your strategy accordingly."
     */
    riverSpeedScale() {
        const elapsed = constants_1.INITIAL_TIME - this.data.timeRemaining;
        return elapsed >= constants_1.RIVER_HURRY_AFTER_SECONDS ? constants_1.RIVER_HURRY_MULTIPLIER : 1;
    }
    /**
     * The extra speed lane 4 picks up as a trip drags on.
     *
     * FAQ 6.4: "cars in Lane 4 will travel fast after a specific period of
     * time if they aren't traveling fast already" - a lane the table already
     * marked fast does not get it twice.
     */
    lane4SpeedScale() {
        const config = (0, constants_1.getLevelConfig)(this.data.level);
        if (config.lane4Fast)
            return 1;
        const elapsed = Date.now() - this.data.frogStartTime;
        return elapsed >= constants_1.LANE4_SPEEDUP_AFTER_MS ? constants_1.LANE4_FAST_MULTIPLIER : 1;
    }
    /**
     * Handle direction input
     */
    handleDirection(direction) {
        const d = this.data;
        if (d.frog.isDead)
            return;
        const frog = d.frog;
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
                newX = Math.max(0, Math.round(frog.x) - 1);
                break;
            case 'right':
                newX = Math.min(constants_1.GRID_WIDTH - 1, Math.round(frog.x) + 1);
                break;
        }
        if (newX === frog.x && newY === frog.y)
            return;
        frog.direction = direction;
        frog.isJumping = true;
        frog.jumpProgress = 0;
        // FAQ 6.3: ten points per forward hop, at most a hundred of them per
        // home. A row therefore pays the first time it is reached and never
        // again - hopping up and down the same row used to pay every time.
        if (newY < d.furthestRow) {
            d.furthestRow = newY;
            if (d.hopPointsThisHome < constants_1.SCORES.maxHopPerHome) {
                d.score += constants_1.SCORES.hop;
                d.hopPointsThisHome += constants_1.SCORES.hop;
            }
        }
        frog.x = newX;
        frog.y = newY;
        frog.onObject = null;
        if (newY === 0) {
            this.checkHomeArrival();
        }
        else {
            this.checkCollisions();
        }
        this.render();
    }
    /**
     * Main game update
     */
    update() {
        const d = this.data;
        d.lastUpdateTime = Date.now();
        d.frameCount++;
        // One second per twenty ticks.
        if (d.frameCount % 20 === 0) {
            d.timeRemaining--;
            if (d.timeRemaining <= 0) {
                this.killFrog('timeout');
                return;
            }
        }
        if (d.frog.isJumping) {
            d.frog.jumpProgress += 0.25;
            if (d.frog.jumpProgress >= 1) {
                d.frog.isJumping = false;
                d.frog.jumpProgress = 0;
            }
        }
        if (d.frog.isDead) {
            d.frog.deathFrame++;
            if (d.frog.deathFrame >= 20)
                this.respawnFrog();
            this.render();
            return;
        }
        this.updateObjects();
        this.updateSnakes();
        this.updateVisitors();
        this.updateFrogOnObject();
        if (d.frog.isDead) {
            this.render();
            return;
        }
        this.checkCollisions();
        this.awardExtraLife();
        this.render();
    }
    /** FAQ 6.3: "you get one free frog at 20,000 points". */
    awardExtraLife() {
        const d = this.data;
        if (d.extraLifeAwarded || d.score < constants_1.EXTRA_LIFE_SCORE)
            return;
        d.lives++;
        d.extraLifeAwarded = true;
    }
    /**
     * Update all moving objects
     */
    updateObjects() {
        const step = constants_1.GAME_TICK_MS / 1000;
        const river = this.riverSpeedScale();
        const lane4 = this.lane4SpeedScale();
        for (const lane of this.data.lanes) {
            const scale = lane.type === 'water' ? river :
                lane.type === 'road' && lane.lane === 4 ? lane4 : 1;
            for (const obj of lane.objects) {
                obj.x += obj.speed * step * scale;
                const width = 'width' in obj ? obj.width : 2;
                if (obj.speed > 0 && obj.x > constants_1.GRID_WIDTH) {
                    obj.x = -width;
                }
                else if (obj.speed < 0 && obj.x + width < 0) {
                    obj.x = constants_1.GRID_WIDTH;
                }
                this.updateTurtle(obj);
            }
        }
    }
    /**
     * Surface and dive the turtle sets that dive.
     *
     * FAQ 7: "Be wary of the diving turtles and only use them as a quick
     * bypass to a more solid footing." Only the set the level table marks as
     * divers goes under; the rest are dependable.
     */
    updateTurtle(obj) {
        if (obj.type !== 'turtle' || !obj.canDive)
            return;
        obj.diveTimer = (obj.diveTimer || 0) + constants_1.GAME_TICK_MS;
        if (obj.isDiving && obj.diveTimer >= constants_1.TURTLE_DIVE_DURATION) {
            obj.isDiving = false;
            obj.diveTimer = 0;
        }
        else if (!obj.isDiving && obj.diveTimer >= constants_1.TURTLE_SURFACE_DURATION) {
            obj.isDiving = true;
            obj.diveTimer = 0;
        }
    }
    /** Walk the median snakes back and forth. */
    updateSnakes() {
        for (const snake of this.data.snakes) {
            snake.x += snake.speed * snake.direction * (constants_1.GAME_TICK_MS / 1000);
            if (snake.x <= 0) {
                snake.x = 0;
                snake.direction = 1;
            }
            if (snake.x >= constants_1.GRID_WIDTH - 1) {
                snake.x = constants_1.GRID_WIDTH - 1;
                snake.direction = -1;
            }
        }
    }
    /**
     * The things that come and go: the fly in a home, the crocodile in a home,
     * the lady frog on a lane 2 log, and the otter on the water.
     */
    updateVisitors() {
        const d = this.data;
        const now = this.clock();
        const config = (0, constants_1.getLevelConfig)(d.level);
        // Clear whatever has outstayed its welcome.
        for (const home of d.homes) {
            if (home.visitorUntil && now >= home.visitorUntil) {
                home.hasFly = false;
                home.hasAlligator = false;
                home.visitorUntil = 0;
            }
        }
        // FAQ 7: "if you have the time and necessary footing, you can hold out
        // until the fly appears in your home before you settle your frog in."
        if (now >= d.flyTimer) {
            d.flyTimer = now + constants_1.FLY_SPAWN_INTERVAL_MS;
            const free = d.homes.filter(h => !h.occupied && !h.hasFly && !h.hasAlligator);
            if (free.length > 0) {
                const home = free[Math.floor(Math.random() * free.length)];
                home.hasFly = true;
                home.visitorUntil = now + constants_1.FLY_DURATION_MS;
            }
        }
        // FAQ 6.4: "The crocodile appears randomly in one of the homes", from
        // level 2 on.
        if (config.crocInHome && now >= d.alligatorTimer) {
            d.alligatorTimer = now + constants_1.HOME_CROCODILE_INTERVAL_MS;
            const free = d.homes.filter(h => !h.occupied && !h.hasFly && !h.hasAlligator);
            if (free.length > 0) {
                const home = free[Math.floor(Math.random() * free.length)];
                home.hasAlligator = true;
                home.visitorUntil = now + constants_1.HOME_CROCODILE_DURATION_MS;
            }
        }
        // FAQ 7: the lady frog rides a log in water lane 2.
        if (now >= d.ladyFrogTimer) {
            d.ladyFrogTimer = now + constants_1.LADY_FROG_INTERVAL_MS;
            const lane = d.lanes.find(l => l.type === 'water' && l.lane === 2);
            const logs = (lane?.objects ?? []);
            const carrying = logs.some(l => l.ladyFrogAt !== null && l.ladyFrogAt !== undefined);
            if (!d.carryingLadyFrog && !carrying && logs.length > 0) {
                const log = logs[Math.floor(Math.random() * logs.length)];
                log.ladyFrogAt = Math.floor(Math.random() * log.width);
            }
        }
        // FAQ 6.4: "The otter appears randomly on any of the water lanes."
        if (now >= d.otterTimer) {
            d.otterTimer = now + constants_1.OTTER_INTERVAL_MS;
            const water = d.lanes.filter(l => l.type === 'water');
            const lane = water[Math.floor(Math.random() * water.length)];
            if (lane && !lane.objects.some(o => o.type === 'otter')) {
                lane.objects.push({
                    id: d.riverObjectIdCounter++,
                    type: 'otter',
                    x: lane.direction > 0 ? -constants_1.OBJECT_WIDTHS.otter : constants_1.GRID_WIDTH,
                    y: lane.y,
                    lane: lane.lane,
                    width: constants_1.OBJECT_WIDTHS.otter,
                    speed: lane.speed * lane.direction,
                    mouthWidth: 1,
                    snakeAt: null,
                    ladyFrogAt: null,
                });
            }
        }
    }
    /**
     * Update frog position when riding an object
     */
    updateFrogOnObject() {
        const d = this.data;
        const frog = d.frog;
        if (!frog.onObject)
            return;
        const obj = frog.onObject;
        const lane = d.lanes.find(l => l.y === obj.y);
        const scale = lane?.type === 'water' ? this.riverSpeedScale() : 1;
        frog.x += obj.speed * (constants_1.GAME_TICK_MS / 1000) * scale;
        if (obj.type === 'turtle' && obj.isDiving) {
            this.killFrog('water');
            return;
        }
        // FAQ 7: "Your frog cannot 'wrap-around' the screen so make sure you
        // bail off before that footing disappears off the edge of the screen".
        if (frog.x < 0 || frog.x >= constants_1.GRID_WIDTH) {
            this.killFrog('edge');
            return;
        }
        if (frog.x < obj.x || frog.x >= obj.x + obj.width) {
            frog.onObject = null;
        }
    }
    /**
     * Check all collisions
     */
    checkCollisions() {
        const d = this.data;
        const frog = d.frog;
        const lane = d.lanes.find(l => l.y === frog.y);
        if (!lane)
            return;
        if (lane.type === 'safe') {
            this.checkMedianSnake(lane);
            return;
        }
        if (lane.type === 'road') {
            for (const obj of lane.objects) {
                if (this.overlaps(frog.x, obj.x, obj.width)) {
                    this.killFrog('car');
                    return;
                }
            }
            return;
        }
        if (lane.type !== 'water')
            return;
        for (const raw of lane.objects) {
            const obj = raw;
            if (!this.overlaps(frog.x, obj.x, obj.width))
                continue;
            // A turtle that has gone under is not footing.
            if (obj.type === 'turtle' && obj.isDiving)
                continue;
            // FAQ 7: "You can jump on the backs of the crocodiles and otters.
            // Just don't get near their mouths or they are apt to turn your frog
            // into a meal." The mouth is the leading edge, the way it swims.
            if ((obj.type === 'crocodile' || obj.type === 'otter') && this.inMouth(frog.x, obj)) {
                this.killFrog('crocodile');
                return;
            }
            // FAQ 7: "Watch out for the snakes, they sometimes like to ride on
            // the logs."
            if (obj.snakeAt !== null && obj.snakeAt !== undefined &&
                Math.round(frog.x) === Math.round(obj.x + obj.snakeAt)) {
                this.killFrog('snake');
                return;
            }
            // FAQ 7: "Just cross over this frog to give it a piggyback ride to
            // your home and get an extra 200 points."
            if (obj.ladyFrogAt !== null && obj.ladyFrogAt !== undefined) {
                d.carryingLadyFrog = true;
                obj.ladyFrogAt = null;
            }
            frog.onObject = obj;
            return;
        }
        if (!frog.isJumping)
            this.killFrog('water');
    }
    /** Is the frog on the leading, business end of a crocodile or otter? */
    inMouth(frogX, obj) {
        const mouth = obj.mouthWidth ?? 1;
        return obj.speed >= 0
            ? frogX >= obj.x + obj.width - mouth
            : frogX < obj.x + mouth;
    }
    /** FAQ 7: the snake "is deadly to your frog and you cannot hop over it". */
    checkMedianSnake(lane) {
        const frog = this.data.frog;
        for (const snake of this.data.snakes) {
            if (snake.y !== lane.y)
                continue;
            if (Math.round(snake.x) === Math.round(frog.x)) {
                this.killFrog('snake');
                return;
            }
        }
    }
    overlaps(frogX, objX, objWidth) {
        return frogX >= objX && frogX < objX + objWidth;
    }
    /**
     * Check if frog reached a home slot.
     *
     * FAQ 7: "You must hit exact center or your frog will die." The door used
     * to take anything within two cells.
     */
    checkHomeArrival() {
        const d = this.data;
        if (d.frog.y !== 0)
            return;
        const index = d.homes.findIndex(home => Math.round(d.frog.x) === home.x + constants_1.HOME_CENTRE_OFFSET);
        if (index === -1) {
            this.killFrog('edge');
            return;
        }
        const home = d.homes[index];
        if (home.occupied) {
            this.killFrog('edge');
            return;
        }
        // FAQ 7: "crocodiles like to randomly appear in your home. Make sure
        // that your home is clear before trying to settle your frog down."
        if (home.hasAlligator) {
            this.killFrog('crocodile');
            return;
        }
        this.settleFrogInHome(index);
    }
    /**
     * Put the frog in a home and pay for it (FAQ 6.3).
     */
    settleFrogInHome(index) {
        const d = this.data;
        const home = d.homes[index];
        if (!home || home.occupied)
            return;
        home.occupied = true;
        d.homesCompleted++;
        d.score += constants_1.SCORES.home;
        if (home.hasFly) {
            d.score += constants_1.SCORES.fly;
            home.hasFly = false;
        }
        // FAQ 6.3: "Bringing a Frog to Your Home: 200 points".
        if (d.carryingLadyFrog) {
            d.score += constants_1.SCORES.ladyFrog;
            d.carryingLadyFrog = false;
        }
        d.score += Math.max(0, Math.floor(d.timeRemaining)) * constants_1.SCORES.timeBonus;
        if (d.homesCompleted >= 5) {
            d.score += constants_1.SCORES.levelComplete;
            d.state = 'levelComplete';
        }
        else {
            this.startNextTrip();
        }
        this.render();
    }
    /**
     * Move on to the next level.
     *
     * Driven by the door rather than a timer in here, so that the hand-over
     * can be shown for as long as the door wants to show it.
     */
    advanceLevel() {
        this.data.level++;
        this.initLevel();
        this.data.state = 'playing';
    }
    /**
     * Kill the frog
     */
    killFrog(deathType) {
        const d = this.data;
        if (d.frog.isDead)
            return;
        d.frog.isDead = true;
        d.frog.deathType = deathType;
        d.frog.deathFrame = 0;
        d.frog.onObject = null;
        d.carryingLadyFrog = false;
        d.lives--;
    }
    /**
     * Respawn frog after death
     */
    respawnFrog() {
        if (this.data.lives <= 0) {
            this.data.state = 'gameover';
            return;
        }
        this.startNextTrip();
        this.data.frog.isDead = false;
        this.data.frog.deathType = null;
        this.data.frog.deathFrame = 0;
    }
    /** A fresh trip: back to the bank, full clock, hop points reset. */
    startNextTrip() {
        const d = this.data;
        this.resetFrogPosition();
        d.timeRemaining = constants_1.INITIAL_TIME;
        d.furthestRow = constants_1.GRID_HEIGHT - 1;
        d.hopPointsThisHome = 0;
        d.frogStartTime = Date.now();
        d.carryingLadyFrog = false;
    }
    /**
     * Reset frog to starting position
     */
    resetFrogPosition() {
        const frog = this.data.frog;
        frog.x = Math.floor(constants_1.GRID_WIDTH / 2);
        frog.y = constants_1.GRID_HEIGHT - 1;
        frog.direction = 'up';
        frog.isJumping = false;
        frog.jumpProgress = 0;
        frog.onObject = null;
    }
    /**
     * One move of the machine playing itself, for attract mode.
     *
     * Deliberately cautious rather than clever: it only hops when the row it
     * is hopping into has something to land on, edges towards a free home on
     * the last row, and otherwise waits. A demo that dies every few seconds
     * reads as a broken game rather than an invitation to play.
     */
    demoStep() {
        const d = this.data;
        if (d.frog.isDead || d.state !== 'playing')
            return;
        const targetY = d.frog.y - 1;
        if (targetY < 0)
            return;
        const lane = d.lanes.find(l => l.y === targetY);
        if (!lane)
            return;
        switch (lane.type) {
            case 'safe':
                this.handleDirection('up');
                return;
            case 'road':
                if (this.roadIsClear(lane, d.frog.x))
                    this.handleDirection('up');
                return;
            case 'water':
                if (this.footingAt(lane, d.frog.x))
                    this.handleDirection('up');
                return;
            case 'home':
                this.demoAimForHome();
                return;
        }
    }
    /** Is the cell the demo wants to hop into free of traffic? */
    roadIsClear(lane, x) {
        const margin = 1.5;
        return !lane.objects.some(obj => {
            const width = obj.width;
            // Widen the car by the margin, and by where it will be next tick, so
            // the demo does not hop into the space something is about to fill.
            const ahead = obj.x + obj.speed * (constants_1.GAME_TICK_MS / 1000) * 4;
            const from = Math.min(obj.x, ahead) - margin;
            const to = Math.max(obj.x, ahead) + width + margin;
            return x >= from && x <= to;
        });
    }
    /** Is there something to stand on where the demo wants to hop? */
    footingAt(lane, x) {
        return lane.objects.some(obj => {
            if (obj.type === 'turtle' && obj.isDiving)
                return false;
            if (!this.overlaps(x, obj.x, obj.width))
                return false;
            // Never aim for a mouth or a snake.
            if ((obj.type === 'crocodile' || obj.type === 'otter') && this.inMouth(x, obj))
                return false;
            if (obj.snakeAt !== null && obj.snakeAt !== undefined &&
                Math.round(x) === Math.round(obj.x + obj.snakeAt))
                return false;
            return true;
        });
    }
    /** Line the demo up with a free home, then hop in. */
    demoAimForHome() {
        const d = this.data;
        const free = d.homes.filter(h => !h.occupied && !h.hasAlligator);
        if (free.length === 0)
            return;
        const target = free.reduce((best, home) => Math.abs(home.x - d.frog.x) < Math.abs(best.x - d.frog.x) ? home : best);
        const centre = target.x + constants_1.HOME_CENTRE_OFFSET;
        const here = Math.round(d.frog.x);
        if (here === centre)
            this.handleDirection('up');
        else
            this.handleDirection(here < centre ? 'right' : 'left');
    }
    /**
     * Render the game
     */
    render() {
        const d = this.data;
        const lines = [];
        const buffer = [];
        for (let y = 0; y < constants_1.GRID_HEIGHT; y++) {
            buffer[y] = [];
            for (let x = 0; x < constants_1.GRID_WIDTH; x++)
                buffer[y][x] = ' ';
        }
        // Lane backgrounds
        for (const lane of d.lanes) {
            const bg = lane.type === 'road' ? '.' :
                lane.type === 'water' ? '~' :
                    lane.type === 'safe' ? '_' : ' ';
            for (let x = 0; x < constants_1.GRID_WIDTH; x++)
                buffer[lane.y][x] = bg;
        }
        // Homes, with whatever is sitting in them
        for (const home of d.homes) {
            const glyph = home.occupied ? ['[', '*', ']'] :
                home.hasAlligator ? ['[', 'C', ']'] :
                    home.hasFly ? ['[', 'F', ']'] :
                        ['[', ' ', ']'];
            for (let i = 0; i < glyph.length; i++) {
                const x = home.x + i;
                if (x >= 0 && x < constants_1.GRID_WIDTH)
                    buffer[0][x] = glyph[i];
            }
        }
        // Everything in a lane
        for (const lane of d.lanes) {
            for (const raw of lane.objects) {
                const obj = raw;
                const width = obj.width ?? 2;
                for (let dx = 0; dx < width; dx++) {
                    const x = Math.floor(obj.x + dx);
                    if (x < 0 || x >= constants_1.GRID_WIDTH)
                        continue;
                    buffer[obj.y][x] = this.glyphFor(obj, dx, width);
                }
                // A snake or the lady frog riding this one sits on top of it.
                if (obj.snakeAt !== null && obj.snakeAt !== undefined) {
                    const x = Math.floor(obj.x + obj.snakeAt);
                    if (x >= 0 && x < constants_1.GRID_WIDTH)
                        buffer[obj.y][x] = 'S';
                }
                if (obj.ladyFrogAt !== null && obj.ladyFrogAt !== undefined) {
                    const x = Math.floor(obj.x + obj.ladyFrogAt);
                    if (x >= 0 && x < constants_1.GRID_WIDTH)
                        buffer[obj.y][x] = 'P';
                }
            }
        }
        // Median snakes
        for (const snake of d.snakes) {
            const x = Math.floor(snake.x);
            if (x >= 0 && x < constants_1.GRID_WIDTH && snake.y >= 0 && snake.y < constants_1.GRID_HEIGHT) {
                buffer[snake.y][x] = 'S';
            }
        }
        // The frog
        const fx = Math.floor(d.frog.x);
        const fy = d.frog.y;
        if (fx >= 0 && fx < constants_1.GRID_WIDTH && fy >= 0 && fy < constants_1.GRID_HEIGHT) {
            if (!d.frog.isDead) {
                buffer[fy][fx] = d.frog.isJumping
                    ? (d.frog.direction === 'up' ? '^' :
                        d.frog.direction === 'down' ? 'v' :
                            d.frog.direction === 'left' ? '<' : '>')
                    : '@';
            }
            else {
                const deathChars = ['X', 'x', '+', '.', ' '];
                const frame = Math.min(Math.floor(d.frog.deathFrame / 4), deathChars.length - 1);
                buffer[fy][fx] = deathChars[frame];
            }
        }
        for (let y = 0; y < constants_1.GRID_HEIGHT; y++) {
            let line = '';
            for (let x = 0; x < constants_1.GRID_WIDTH; x++)
                line += this.paint(buffer[y][x]);
            lines.push(line);
        }
        lines.push('');
        const timeBar = '='.repeat(Math.max(0, Math.floor(d.timeRemaining / 2)));
        const timeColor = d.timeRemaining <= 10 ? 'red' : 'yellow';
        lines.push(`{${timeColor}-fg}TIME: [${timeBar.padEnd(30, ' ')}]{/}`);
        this.renderCallback(lines.join('\n'));
    }
    /** The character for one cell of an object. */
    glyphFor(obj, dx, width) {
        switch (obj.type) {
            case 'car':
            case 'racecar':
                return '#';
            case 'truck':
                return 'T';
            case 'log':
                return '=';
            case 'turtle':
                return obj.isDiving ? '~' : 'o';
            case 'crocodile':
            case 'otter': {
                // Draw the mouth end differently, since landing on it is fatal.
                const mouth = obj.speed >= 0 ? dx === width - 1 : dx === 0;
                return mouth ? 'V' : (obj.type === 'otter' ? 'w' : 'c');
            }
            default:
                return '#';
        }
    }
    paint(char) {
        switch (char) {
            case '@':
            case '^':
            case 'v':
            case '<':
            case '>':
                return `{green-fg}${char}{/}`;
            case '#': return `{red-fg}${char}{/}`;
            case 'T': return `{yellow-fg}${char}{/}`;
            case '=': return `{yellow-fg}${char}{/}`;
            case 'o': return `{green-fg}${char}{/}`;
            case 'c':
            case 'w': return `{lightgreen-fg}${char}{/}`;
            case 'V': return `{red-fg}${char}{/}`;
            case 'S': return `{magenta-fg}${char}{/}`;
            case 'P': return `{magenta-fg}${char}{/}`;
            case '*': return `{cyan-fg}${char}{/}`;
            case '[':
            case ']': return `{cyan-fg}${char}{/}`;
            case 'C': return `{lightgreen-fg}${char}{/}`;
            case 'F': return `{magenta-fg}${char}{/}`;
            case '~': return `{blue-fg}${char}{/}`;
            case '.': return `{gray-fg}${char}{/}`;
            case '_': return `{green-fg}${char}{/}`;
            case 'X':
            case 'x':
            case '+': return `{red-fg}${char}{/}`;
            default: return char;
        }
    }
}
exports.FroggerGame = FroggerGame;
//# sourceMappingURL=frogger-game.js.map