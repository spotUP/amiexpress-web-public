"use strict";
/**
 * Tactical Combat Engine - Fire Emblem Style
 *
 * Implements grid-based tactical combat with:
 * - Weapon Triangle system
 * - Turn-based combat (Player Phase → Enemy Phase)
 * - Movement and attack ranges
 * - Terrain effects
 * - Break system
 * - Fog of war
 *
 * @example
 * ```typescript
 * const combat = new TacticalCombatEngine({ gridWidth: 30, gridHeight: 20 });
 *
 * // Create unit
 * const unit = combat.createUnit({
 *   id: 'lyn',
 *   name: 'Lyn',
 *   class: 'Lord',
 *   level: 1,
 *   stats: { hp: 16, str: 4, mag: 0, skl: 7, spd: 9, lck: 5, def: 2, res: 0 },
 *   position: { x: 5, y: 10 }
 * });
 *
 * // Get movement range
 * const moves = combat.getMovementRange(unit);
 *
 * // Get attack targets
 * const targets = combat.getAttackTargets(unit);
 * ```
 */
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TacticalCombatEngine = exports.UnitClass = exports.WeaponRank = exports.WeaponType = exports.TerrainType = void 0;
var events_1 = require("events");
/**
 * Terrain types
 */
var TerrainType;
(function (TerrainType) {
    TerrainType["Plains"] = "plains";
    TerrainType["Forest"] = "forest";
    TerrainType["Mountain"] = "mountain";
    TerrainType["Water"] = "water";
    TerrainType["Wall"] = "wall";
    TerrainType["Floor"] = "floor";
    TerrainType["Fort"] = "fort";
    TerrainType["Throne"] = "throne";
    TerrainType["Village"] = "village";
    TerrainType["Peak"] = "peak";
})(TerrainType || (exports.TerrainType = TerrainType = {}));
/**
 * Weapon types for weapon triangle
 */
var WeaponType;
(function (WeaponType) {
    WeaponType["Sword"] = "Sword";
    WeaponType["Lance"] = "Lance";
    WeaponType["Axe"] = "Axe";
    WeaponType["Bow"] = "Bow";
    WeaponType["Tome"] = "Tome";
    WeaponType["Staff"] = "Staff";
    WeaponType["Knife"] = "Knife";
})(WeaponType || (exports.WeaponType = WeaponType = {}));
/**
 * Weapon rank (experience with weapon type)
 */
var WeaponRank;
(function (WeaponRank) {
    WeaponRank["E"] = "E";
    WeaponRank["D"] = "D";
    WeaponRank["C"] = "C";
    WeaponRank["B"] = "B";
    WeaponRank["A"] = "A";
    WeaponRank["S"] = "S";
})(WeaponRank || (exports.WeaponRank = WeaponRank = {}));
/**
 * Unit class types
 */
var UnitClass;
(function (UnitClass) {
    UnitClass["Lord"] = "Lord";
    UnitClass["Cavalier"] = "Cavalier";
    UnitClass["Knight"] = "Knight";
    UnitClass["Myrmidon"] = "Myrmidon";
    UnitClass["Mercenary"] = "Mercenary";
    UnitClass["Fighter"] = "Fighter";
    UnitClass["Archer"] = "Archer";
    UnitClass["Mage"] = "Mage";
    UnitClass["Cleric"] = "Cleric";
    UnitClass["Pegasus_Knight"] = "Pegasus Knight";
    UnitClass["Wyvern_Rider"] = "Wyvern Rider";
    UnitClass["Thief"] = "Thief";
})(UnitClass || (exports.UnitClass = UnitClass = {}));
/**
 * Tactical Combat Engine
 */
var TacticalCombatEngine = /** @class */ (function (_super) {
    __extends(TacticalCombatEngine, _super);
    function TacticalCombatEngine(config) {
        var _this = _super.call(this) || this;
        _this.units = new Map();
        _this.terrain = new Map();
        _this.currentPhase = 'player';
        _this.turnNumber = 1;
        _this.fogOfWar = false;
        _this.visionRange = 5;
        // Weapon triangle advantages
        _this.weaponTriangle = new Map([
            [WeaponType.Sword, WeaponType.Axe],
            [WeaponType.Axe, WeaponType.Lance],
            [WeaponType.Lance, WeaponType.Sword]
        ]);
        _this.gridWidth = config.gridWidth;
        _this.gridHeight = config.gridHeight;
        _this.fogOfWar = config.fogOfWar || false;
        _this.initializeTerrainTypes();
        return _this;
    }
    /**
     * Initialize terrain types
     */
    TacticalCombatEngine.prototype.initializeTerrainTypes = function () {
        this.terrain.set('plains', {
            type: 'plains',
            defenseBonus: 0,
            avoidBonus: 0,
            movementCost: 1,
            healing: 0
        });
        this.terrain.set('forest', {
            type: 'forest',
            defenseBonus: 1,
            avoidBonus: 20,
            movementCost: 2,
            healing: 0
        });
        this.terrain.set('mountain', {
            type: 'mountain',
            defenseBonus: 2,
            avoidBonus: 30,
            movementCost: 3,
            healing: 0
        });
        this.terrain.set('fort', {
            type: 'fort',
            defenseBonus: 2,
            avoidBonus: 20,
            movementCost: 1,
            healing: 5
        });
        this.terrain.set('throne', {
            type: 'throne',
            defenseBonus: 3,
            avoidBonus: 30,
            movementCost: 1,
            healing: 10
        });
    };
    /**
     * Create tactical unit
     */
    TacticalCombatEngine.prototype.createUnit = function (config) {
        var unit = {
            id: config.id,
            name: config.name,
            class: config.class,
            level: config.level,
            exp: 0,
            stats: __assign(__assign({}, config.stats), { maxHp: config.stats.hp }),
            growthRates: config.growthRates,
            position: config.position,
            team: config.team,
            weapon: config.weapon || null,
            inventory: config.weapon ? [config.weapon] : [],
            weaponRanks: new Map(),
            skills: [],
            hasActed: false,
            hasMoved: false,
            supports: new Map()
        };
        this.units.set(unit.id, unit);
        this.emit('unit-created', unit);
        return unit;
    };
    /**
     * Get movement range for unit
     */
    TacticalCombatEngine.prototype.getMovementRange = function (unit, terrainMap) {
        var range = [];
        var visited = new Set();
        var queue = [
            { pos: unit.position, remaining: unit.stats.mov }
        ];
        while (queue.length > 0) {
            var _a = queue.shift(), pos = _a.pos, remaining = _a.remaining;
            var key = "".concat(pos.x, ",").concat(pos.y);
            if (visited.has(key))
                continue;
            visited.add(key);
            // Check if position is valid
            if (pos.x < 0 || pos.x >= this.gridWidth || pos.y < 0 || pos.y >= this.gridHeight) {
                continue;
            }
            // Check if another unit is blocking (can't move through enemies)
            var blockingUnit = this.getUnitAtPosition(pos);
            if (blockingUnit && blockingUnit.id !== unit.id && blockingUnit.team !== unit.team) {
                continue;
            }
            range.push(pos);
            if (remaining > 0) {
                // Add adjacent tiles
                var terrainKey = (terrainMap === null || terrainMap === void 0 ? void 0 : terrainMap.get(key)) || 'plains';
                var terrain = this.terrain.get(terrainKey);
                var cost = terrain.movementCost;
                if (remaining >= cost) {
                    queue.push({ pos: { x: pos.x + 1, y: pos.y }, remaining: remaining - cost });
                    queue.push({ pos: { x: pos.x - 1, y: pos.y }, remaining: remaining - cost });
                    queue.push({ pos: { x: pos.x, y: pos.y + 1 }, remaining: remaining - cost });
                    queue.push({ pos: { x: pos.x, y: pos.y - 1 }, remaining: remaining - cost });
                }
            }
        }
        return range;
    };
    /**
     * Get attack targets in range
     */
    TacticalCombatEngine.prototype.getAttackTargets = function (unit) {
        if (!unit.weapon)
            return [];
        var _a = unit.weapon.range, minRange = _a[0], maxRange = _a[1];
        var targets = [];
        for (var _i = 0, _b = this.units.values(); _i < _b.length; _i++) {
            var target = _b[_i];
            if (target.team === unit.team)
                continue;
            var distance = this.getDistance(unit.position, target.position);
            if (distance >= minRange && distance <= maxRange) {
                targets.push(target);
            }
        }
        return targets;
    };
    /**
     * Calculate battle forecast
     */
    TacticalCombatEngine.prototype.getBattleForecast = function (attacker, defender) {
        var _a;
        if (!attacker.weapon)
            throw new Error('Attacker has no weapon');
        // Calculate weapon triangle
        var triangle = this.getWeaponTriangle(attacker.weapon.type, (_a = defender.weapon) === null || _a === void 0 ? void 0 : _a.type);
        // Calculate hit rates
        var attackerHit = this.calculateHitRate(attacker, defender, triangle === 'advantage');
        var defenderHit = defender.weapon
            ? this.calculateHitRate(defender, attacker, triangle === 'disadvantage')
            : 0;
        // Calculate damage
        var attackerDamage = this.calculateDamage(attacker, defender, triangle === 'advantage');
        var defenderDamage = defender.weapon
            ? this.calculateDamage(defender, attacker, triangle === 'disadvantage')
            : 0;
        // Calculate crit rates
        var attackerCrit = this.calculateCritRate(attacker, defender);
        var defenderCrit = defender.weapon ? this.calculateCritRate(defender, attacker) : 0;
        // Check for double attacks (speed difference >= 4)
        var attackerSpeed = attacker.stats.spd - (attacker.weapon.weight - attacker.stats.str);
        var defenderSpeed = defender.weapon
            ? defender.stats.spd - (defender.weapon.weight - defender.stats.str)
            : defender.stats.spd;
        var attackerDoubles = attackerSpeed - defenderSpeed >= 4;
        var defenderDoubles = defenderSpeed - attackerSpeed >= 4;
        // Check if defender can counter
        var distance = this.getDistance(attacker.position, defender.position);
        var canCounter = defender.weapon
            ? distance >= defender.weapon.range[0] && distance <= defender.weapon.range[1]
            : false;
        // Break system (weapon advantage prevents counter)
        var willBreak = triangle === 'advantage';
        return {
            attacker: {
                unit: attacker,
                damage: attackerDamage,
                hit: attackerHit,
                crit: attackerCrit,
                doubles: attackerDoubles
            },
            defender: {
                unit: defender,
                damage: defenderDamage,
                hit: defenderHit,
                crit: defenderCrit,
                doubles: defenderDoubles,
                canCounter: canCounter && !willBreak
            },
            weaponTriangle: triangle,
            willBreak: willBreak
        };
    };
    /**
     * Execute combat between two units
     */
    TacticalCombatEngine.prototype.executeCombat = function (attacker, defender) {
        var forecast = this.getBattleForecast(attacker, defender);
        var result = {
            attackerDamage: [],
            defenderDamage: [],
            attackerCrits: [],
            defenderCrits: [],
            attackerHits: [],
            defenderHits: [],
            attackerKilled: false,
            defenderKilled: false,
            expGained: 0
        };
        // Attacker's first strike
        var attackerHit1 = Math.random() * 100 < forecast.attacker.hit;
        var attackerCrit1 = Math.random() * 100 < forecast.attacker.crit;
        result.attackerHits.push(attackerHit1);
        result.attackerCrits.push(attackerCrit1);
        if (attackerHit1) {
            var damage = attackerCrit1 ? forecast.attacker.damage * 3 : forecast.attacker.damage;
            result.attackerDamage.push(damage);
            defender.stats.hp -= damage;
            if (defender.stats.hp <= 0) {
                result.defenderKilled = true;
                this.units.delete(defender.id);
                result.expGained = this.calculateExp(attacker, defender, true);
                this.emit('unit-killed', defender);
                return result;
            }
        }
        // Defender's counter (if able)
        if (forecast.defender.canCounter) {
            var defenderHit1 = Math.random() * 100 < forecast.defender.hit;
            var defenderCrit1 = Math.random() * 100 < forecast.defender.crit;
            result.defenderHits.push(defenderHit1);
            result.defenderCrits.push(defenderCrit1);
            if (defenderHit1) {
                var damage = defenderCrit1 ? forecast.defender.damage * 3 : forecast.defender.damage;
                result.defenderDamage.push(damage);
                attacker.stats.hp -= damage;
                if (attacker.stats.hp <= 0) {
                    result.attackerKilled = true;
                    this.units.delete(attacker.id);
                    this.emit('unit-killed', attacker);
                    return result;
                }
            }
        }
        // Attacker's double attack
        if (forecast.attacker.doubles && defender.stats.hp > 0) {
            var attackerHit2 = Math.random() * 100 < forecast.attacker.hit;
            var attackerCrit2 = Math.random() * 100 < forecast.attacker.crit;
            result.attackerHits.push(attackerHit2);
            result.attackerCrits.push(attackerCrit2);
            if (attackerHit2) {
                var damage = attackerCrit2 ? forecast.attacker.damage * 3 : forecast.attacker.damage;
                result.attackerDamage.push(damage);
                defender.stats.hp -= damage;
                if (defender.stats.hp <= 0) {
                    result.defenderKilled = true;
                    this.units.delete(defender.id);
                    result.expGained = this.calculateExp(attacker, defender, true);
                    this.emit('unit-killed', defender);
                    return result;
                }
            }
        }
        // Defender's double attack
        if (forecast.defender.doubles && forecast.defender.canCounter && attacker.stats.hp > 0) {
            var defenderHit2 = Math.random() * 100 < forecast.defender.hit;
            var defenderCrit2 = Math.random() * 100 < forecast.defender.crit;
            result.defenderHits.push(defenderHit2);
            result.defenderCrits.push(defenderCrit2);
            if (defenderHit2) {
                var damage = defenderCrit2 ? forecast.defender.damage * 3 : forecast.defender.damage;
                result.defenderDamage.push(damage);
                attacker.stats.hp -= damage;
                if (attacker.stats.hp <= 0) {
                    result.attackerKilled = true;
                    this.units.delete(attacker.id);
                    this.emit('unit-killed', attacker);
                    return result;
                }
            }
        }
        // Calculate experience
        result.expGained = this.calculateExp(attacker, defender, result.defenderKilled);
        // Reduce weapon durability
        if (attacker.weapon) {
            attacker.weapon.durability--;
            if (attacker.weapon.durability <= 0) {
                attacker.weapon = null;
                this.emit('weapon-broke', attacker);
            }
        }
        this.emit('combat-complete', result);
        return result;
    };
    /**
     * Get weapon triangle relationship
     */
    TacticalCombatEngine.prototype.getWeaponTriangle = function (attackerType, defenderType) {
        if (!defenderType)
            return 'neutral';
        // Check advantage
        if (this.weaponTriangle.get(attackerType) === defenderType) {
            return 'advantage';
        }
        // Check disadvantage
        if (this.weaponTriangle.get(defenderType) === attackerType) {
            return 'disadvantage';
        }
        return 'neutral';
    };
    /**
     * Calculate hit rate
     */
    TacticalCombatEngine.prototype.calculateHitRate = function (attacker, defender, hasAdvantage) {
        if (!attacker.weapon)
            return 0;
        var weaponHit = attacker.weapon.hit;
        var attackerSkill = attacker.stats.skl * 2;
        var attackerLuck = attacker.stats.lck;
        var defenderSpeed = defender.stats.spd * 2;
        var defenderLuck = defender.stats.lck;
        var triangleBonus = hasAdvantage ? 15 : 0;
        var hit = weaponHit + attackerSkill + attackerLuck + triangleBonus - (defenderSpeed + defenderLuck);
        return Math.max(0, Math.min(100, hit));
    };
    /**
     * Calculate damage
     */
    TacticalCombatEngine.prototype.calculateDamage = function (attacker, defender, hasAdvantage) {
        if (!attacker.weapon)
            return 0;
        var weaponMight = attacker.weapon.might;
        var attackStat = attacker.weapon.type === WeaponType.Tome ? attacker.stats.mag : attacker.stats.str;
        var defenseStat = attacker.weapon.type === WeaponType.Tome ? defender.stats.res : defender.stats.def;
        var triangleBonus = hasAdvantage ? 1 : 0;
        var damage = weaponMight + attackStat + triangleBonus - defenseStat;
        return Math.max(0, damage);
    };
    /**
     * Calculate critical hit rate
     */
    TacticalCombatEngine.prototype.calculateCritRate = function (attacker, defender) {
        if (!attacker.weapon)
            return 0;
        var weaponCrit = attacker.weapon.crit;
        var attackerSkill = Math.floor(attacker.stats.skl / 2);
        var defenderLuck = defender.stats.lck;
        var crit = weaponCrit + attackerSkill - defenderLuck;
        return Math.max(0, Math.min(100, crit));
    };
    /**
     * Calculate experience gained
     */
    TacticalCombatEngine.prototype.calculateExp = function (attacker, defender, killed) {
        var levelDiff = defender.level - attacker.level;
        var exp = 10 + levelDiff * 2;
        if (killed)
            exp += 30;
        return Math.max(1, Math.min(100, exp));
    };
    /**
     * Grant experience to unit
     */
    TacticalCombatEngine.prototype.grantExp = function (unit, exp) {
        unit.exp += exp;
        if (unit.exp >= 100) {
            unit.exp -= 100;
            return this.levelUp(unit);
        }
        return false;
    };
    /**
     * Level up unit
     */
    TacticalCombatEngine.prototype.levelUp = function (unit) {
        unit.level++;
        var gains = {};
        // Roll for stat increases
        if (Math.random() * 100 < unit.growthRates.hp) {
            unit.stats.hp++;
            unit.stats.maxHp++;
            gains.hp = unit.stats.hp;
        }
        if (Math.random() * 100 < unit.growthRates.str) {
            unit.stats.str++;
            gains.str = unit.stats.str;
        }
        if (Math.random() * 100 < unit.growthRates.mag) {
            unit.stats.mag++;
            gains.mag = unit.stats.mag;
        }
        if (Math.random() * 100 < unit.growthRates.skl) {
            unit.stats.skl++;
            gains.skl = unit.stats.skl;
        }
        if (Math.random() * 100 < unit.growthRates.spd) {
            unit.stats.spd++;
            gains.spd = unit.stats.spd;
        }
        if (Math.random() * 100 < unit.growthRates.lck) {
            unit.stats.lck++;
            gains.lck = unit.stats.lck;
        }
        if (Math.random() * 100 < unit.growthRates.def) {
            unit.stats.def++;
            gains.def = unit.stats.def;
        }
        if (Math.random() * 100 < unit.growthRates.res) {
            unit.stats.res++;
            gains.res = unit.stats.res;
        }
        this.emit('level-up', unit, gains);
        return true;
    };
    /**
     * Get distance between two positions
     */
    TacticalCombatEngine.prototype.getDistance = function (a, b) {
        return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    };
    /**
     * Get unit at position
     */
    TacticalCombatEngine.prototype.getUnitAt = function (pos) {
        for (var _i = 0, _a = this.units.values(); _i < _a.length; _i++) {
            var unit = _a[_i];
            if (unit.position.x === pos.x && unit.position.y === pos.y) {
                return unit;
            }
        }
        return null;
    };
    /**
     * Get unit at position (alias for backward compatibility)
     */
    TacticalCombatEngine.prototype.getUnitAtPosition = function (pos) {
        return this.getUnitAt(pos);
    };
    /**
     * Load a tactical map
     */
    TacticalCombatEngine.prototype.loadMap = function (map) {
        this.gridWidth = map.width;
        this.gridHeight = map.height;
        // Store terrain information if needed
        this.emit('map-loaded', map);
    };
    /**
     * Move unit to new position
     */
    TacticalCombatEngine.prototype.moveUnit = function (unitId, position) {
        var unit = this.units.get(unitId);
        if (!unit)
            return false;
        // Check if position is valid
        if (position.x < 0 || position.x >= this.gridWidth || position.y < 0 || position.y >= this.gridHeight) {
            return false;
        }
        // Update position
        unit.position = __assign({}, position);
        unit.hasMoved = true;
        this.emit('unit-moved', unit, position);
        return true;
    };
    /**
     * Find path between two positions (simple A* pathfinding)
     */
    TacticalCombatEngine.prototype.findPath = function (from, to) {
        // Simple breadth-first search pathfinding
        var queue = [
            { pos: from, path: [from] }
        ];
        var visited = new Set();
        while (queue.length > 0) {
            var _a = queue.shift(), pos = _a.pos, path = _a.path;
            var key = "".concat(pos.x, ",").concat(pos.y);
            if (visited.has(key))
                continue;
            visited.add(key);
            // Found target
            if (pos.x === to.x && pos.y === to.y) {
                return path;
            }
            // Add neighbors
            var neighbors = [
                { x: pos.x + 1, y: pos.y },
                { x: pos.x - 1, y: pos.y },
                { x: pos.x, y: pos.y + 1 },
                { x: pos.x, y: pos.y - 1 }
            ];
            for (var _i = 0, neighbors_1 = neighbors; _i < neighbors_1.length; _i++) {
                var next = neighbors_1[_i];
                if (next.x < 0 || next.x >= this.gridWidth || next.y < 0 || next.y >= this.gridHeight) {
                    continue;
                }
                var nextKey = "".concat(next.x, ",").concat(next.y);
                if (!visited.has(nextKey)) {
                    queue.push({ pos: next, path: __spreadArray(__spreadArray([], path, true), [next], false) });
                }
            }
        }
        return null; // No path found
    };
    /**
     * End current phase
     */
    TacticalCombatEngine.prototype.endPhase = function () {
        // Reset units for the phase that just ended
        for (var _i = 0, _a = this.units.values(); _i < _a.length; _i++) {
            var unit = _a[_i];
            if (unit.team === this.currentPhase) {
                unit.hasActed = false;
                unit.hasMoved = false;
            }
        }
        // Advance to next phase
        if (this.currentPhase === 'player') {
            this.currentPhase = 'enemy';
        }
        else if (this.currentPhase === 'enemy') {
            this.currentPhase = 'ally';
        }
        else if (this.currentPhase === 'ally') {
            this.currentPhase = 'other';
        }
        else {
            this.currentPhase = 'player';
            this.turnNumber++;
        }
        this.emit('phase-changed', this.currentPhase, this.turnNumber);
    };
    /**
     * Get current phase
     */
    TacticalCombatEngine.prototype.getCurrentPhase = function () {
        return this.currentPhase;
    };
    /**
     * Get turn number
     */
    TacticalCombatEngine.prototype.getTurnNumber = function () {
        return this.turnNumber;
    };
    /**
     * Get all units
     */
    TacticalCombatEngine.prototype.getAllUnits = function () {
        return Array.from(this.units.values());
    };
    /**
     * Get unit by ID
     */
    TacticalCombatEngine.prototype.getUnit = function (id) {
        return this.units.get(id);
    };
    /**
     * Cleanup
     */
    TacticalCombatEngine.prototype.dispose = function () {
        this.units.clear();
        this.removeAllListeners();
    };
    return TacticalCombatEngine;
}(events_1.EventEmitter));
exports.TacticalCombatEngine = TacticalCombatEngine;
