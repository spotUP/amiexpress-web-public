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
import { EventEmitter } from 'events';
/**
 * Terrain types
 */
export var TerrainType;
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
})(TerrainType || (TerrainType = {}));
/**
 * Weapon types for weapon triangle
 */
export var WeaponType;
(function (WeaponType) {
    WeaponType["Sword"] = "Sword";
    WeaponType["Lance"] = "Lance";
    WeaponType["Axe"] = "Axe";
    WeaponType["Bow"] = "Bow";
    WeaponType["Tome"] = "Tome";
    WeaponType["Staff"] = "Staff";
    WeaponType["Knife"] = "Knife";
})(WeaponType || (WeaponType = {}));
/**
 * Weapon rank (experience with weapon type)
 */
export var WeaponRank;
(function (WeaponRank) {
    WeaponRank["E"] = "E";
    WeaponRank["D"] = "D";
    WeaponRank["C"] = "C";
    WeaponRank["B"] = "B";
    WeaponRank["A"] = "A";
    WeaponRank["S"] = "S";
})(WeaponRank || (WeaponRank = {}));
/**
 * Unit class types
 */
export var UnitClass;
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
})(UnitClass || (UnitClass = {}));
/**
 * Tactical Combat Engine
 */
export class TacticalCombatEngine extends EventEmitter {
    constructor(config) {
        super();
        this.units = new Map();
        this.terrain = new Map();
        this.currentPhase = 'player';
        this.turnNumber = 1;
        this.fogOfWar = false;
        this.visionRange = 5;
        // Weapon triangle advantages
        this.weaponTriangle = new Map([
            [WeaponType.Sword, WeaponType.Axe],
            [WeaponType.Axe, WeaponType.Lance],
            [WeaponType.Lance, WeaponType.Sword]
        ]);
        this.gridWidth = config.gridWidth;
        this.gridHeight = config.gridHeight;
        this.fogOfWar = config.fogOfWar || false;
        this.initializeTerrainTypes();
    }
    /**
     * Initialize terrain types
     */
    initializeTerrainTypes() {
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
    }
    /**
     * Create tactical unit
     */
    createUnit(config) {
        const unit = {
            id: config.id,
            name: config.name,
            class: config.class,
            level: config.level,
            exp: 0,
            stats: {
                ...config.stats,
                maxHp: config.stats.hp
            },
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
    }
    /**
     * Get movement range for unit
     */
    getMovementRange(unit, terrainMap) {
        const range = [];
        const visited = new Set();
        const queue = [
            { pos: unit.position, remaining: unit.stats.mov }
        ];
        while (queue.length > 0) {
            const { pos, remaining } = queue.shift();
            const key = `${pos.x},${pos.y}`;
            if (visited.has(key))
                continue;
            visited.add(key);
            // Check if position is valid
            if (pos.x < 0 || pos.x >= this.gridWidth || pos.y < 0 || pos.y >= this.gridHeight) {
                continue;
            }
            // Check if another unit is blocking (can't move through enemies)
            const blockingUnit = this.getUnitAtPosition(pos);
            if (blockingUnit && blockingUnit.id !== unit.id && blockingUnit.team !== unit.team) {
                continue;
            }
            range.push(pos);
            if (remaining > 0) {
                // Add adjacent tiles
                const terrainKey = terrainMap?.get(key) || 'plains';
                const terrain = this.terrain.get(terrainKey);
                const cost = terrain.movementCost;
                if (remaining >= cost) {
                    queue.push({ pos: { x: pos.x + 1, y: pos.y }, remaining: remaining - cost });
                    queue.push({ pos: { x: pos.x - 1, y: pos.y }, remaining: remaining - cost });
                    queue.push({ pos: { x: pos.x, y: pos.y + 1 }, remaining: remaining - cost });
                    queue.push({ pos: { x: pos.x, y: pos.y - 1 }, remaining: remaining - cost });
                }
            }
        }
        return range;
    }
    /**
     * Get attack targets in range
     */
    getAttackTargets(unit) {
        if (!unit.weapon)
            return [];
        const [minRange, maxRange] = unit.weapon.range;
        const targets = [];
        for (const target of this.units.values()) {
            if (target.team === unit.team)
                continue;
            const distance = this.getDistance(unit.position, target.position);
            if (distance >= minRange && distance <= maxRange) {
                targets.push(target);
            }
        }
        return targets;
    }
    /**
     * Calculate battle forecast
     */
    getBattleForecast(attacker, defender) {
        if (!attacker.weapon)
            throw new Error('Attacker has no weapon');
        // Calculate weapon triangle
        const triangle = this.getWeaponTriangle(attacker.weapon.type, defender.weapon?.type);
        // Calculate hit rates
        const attackerHit = this.calculateHitRate(attacker, defender, triangle === 'advantage');
        const defenderHit = defender.weapon
            ? this.calculateHitRate(defender, attacker, triangle === 'disadvantage')
            : 0;
        // Calculate damage
        const attackerDamage = this.calculateDamage(attacker, defender, triangle === 'advantage');
        const defenderDamage = defender.weapon
            ? this.calculateDamage(defender, attacker, triangle === 'disadvantage')
            : 0;
        // Calculate crit rates
        const attackerCrit = this.calculateCritRate(attacker, defender);
        const defenderCrit = defender.weapon ? this.calculateCritRate(defender, attacker) : 0;
        // Check for double attacks (speed difference >= 4)
        const attackerSpeed = attacker.stats.spd - (attacker.weapon.weight - attacker.stats.str);
        const defenderSpeed = defender.weapon
            ? defender.stats.spd - (defender.weapon.weight - defender.stats.str)
            : defender.stats.spd;
        const attackerDoubles = attackerSpeed - defenderSpeed >= 4;
        const defenderDoubles = defenderSpeed - attackerSpeed >= 4;
        // Check if defender can counter
        const distance = this.getDistance(attacker.position, defender.position);
        const canCounter = defender.weapon
            ? distance >= defender.weapon.range[0] && distance <= defender.weapon.range[1]
            : false;
        // Break system (weapon advantage prevents counter)
        const willBreak = triangle === 'advantage';
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
            willBreak
        };
    }
    /**
     * Execute combat between two units
     */
    executeCombat(attacker, defender) {
        const forecast = this.getBattleForecast(attacker, defender);
        const result = {
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
        const attackerHit1 = Math.random() * 100 < forecast.attacker.hit;
        const attackerCrit1 = Math.random() * 100 < forecast.attacker.crit;
        result.attackerHits.push(attackerHit1);
        result.attackerCrits.push(attackerCrit1);
        if (attackerHit1) {
            const damage = attackerCrit1 ? forecast.attacker.damage * 3 : forecast.attacker.damage;
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
            const defenderHit1 = Math.random() * 100 < forecast.defender.hit;
            const defenderCrit1 = Math.random() * 100 < forecast.defender.crit;
            result.defenderHits.push(defenderHit1);
            result.defenderCrits.push(defenderCrit1);
            if (defenderHit1) {
                const damage = defenderCrit1 ? forecast.defender.damage * 3 : forecast.defender.damage;
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
            const attackerHit2 = Math.random() * 100 < forecast.attacker.hit;
            const attackerCrit2 = Math.random() * 100 < forecast.attacker.crit;
            result.attackerHits.push(attackerHit2);
            result.attackerCrits.push(attackerCrit2);
            if (attackerHit2) {
                const damage = attackerCrit2 ? forecast.attacker.damage * 3 : forecast.attacker.damage;
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
            const defenderHit2 = Math.random() * 100 < forecast.defender.hit;
            const defenderCrit2 = Math.random() * 100 < forecast.defender.crit;
            result.defenderHits.push(defenderHit2);
            result.defenderCrits.push(defenderCrit2);
            if (defenderHit2) {
                const damage = defenderCrit2 ? forecast.defender.damage * 3 : forecast.defender.damage;
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
    }
    /**
     * Get weapon triangle relationship
     */
    getWeaponTriangle(attackerType, defenderType) {
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
    }
    /**
     * Calculate hit rate
     */
    calculateHitRate(attacker, defender, hasAdvantage) {
        if (!attacker.weapon)
            return 0;
        const weaponHit = attacker.weapon.hit;
        const attackerSkill = attacker.stats.skl * 2;
        const attackerLuck = attacker.stats.lck;
        const defenderSpeed = defender.stats.spd * 2;
        const defenderLuck = defender.stats.lck;
        const triangleBonus = hasAdvantage ? 15 : 0;
        const hit = weaponHit + attackerSkill + attackerLuck + triangleBonus - (defenderSpeed + defenderLuck);
        return Math.max(0, Math.min(100, hit));
    }
    /**
     * Calculate damage
     */
    calculateDamage(attacker, defender, hasAdvantage) {
        if (!attacker.weapon)
            return 0;
        const weaponMight = attacker.weapon.might;
        const attackStat = attacker.weapon.type === WeaponType.Tome ? attacker.stats.mag : attacker.stats.str;
        const defenseStat = attacker.weapon.type === WeaponType.Tome ? defender.stats.res : defender.stats.def;
        const triangleBonus = hasAdvantage ? 1 : 0;
        const damage = weaponMight + attackStat + triangleBonus - defenseStat;
        return Math.max(0, damage);
    }
    /**
     * Calculate critical hit rate
     */
    calculateCritRate(attacker, defender) {
        if (!attacker.weapon)
            return 0;
        const weaponCrit = attacker.weapon.crit;
        const attackerSkill = Math.floor(attacker.stats.skl / 2);
        const defenderLuck = defender.stats.lck;
        const crit = weaponCrit + attackerSkill - defenderLuck;
        return Math.max(0, Math.min(100, crit));
    }
    /**
     * Calculate experience gained
     */
    calculateExp(attacker, defender, killed) {
        const levelDiff = defender.level - attacker.level;
        let exp = 10 + levelDiff * 2;
        if (killed)
            exp += 30;
        return Math.max(1, Math.min(100, exp));
    }
    /**
     * Grant experience to unit
     */
    grantExp(unit, exp) {
        unit.exp += exp;
        if (unit.exp >= 100) {
            unit.exp -= 100;
            return this.levelUp(unit);
        }
        return false;
    }
    /**
     * Level up unit
     */
    levelUp(unit) {
        unit.level++;
        const gains = {};
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
    }
    /**
     * Get distance between two positions
     */
    getDistance(a, b) {
        return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    }
    /**
     * Get unit at position
     */
    getUnitAt(pos) {
        for (const unit of this.units.values()) {
            if (unit.position.x === pos.x && unit.position.y === pos.y) {
                return unit;
            }
        }
        return null;
    }
    /**
     * Get unit at position (alias for backward compatibility)
     */
    getUnitAtPosition(pos) {
        return this.getUnitAt(pos);
    }
    /**
     * Load a tactical map
     */
    loadMap(map) {
        this.gridWidth = map.width;
        this.gridHeight = map.height;
        // Store terrain information if needed
        this.emit('map-loaded', map);
    }
    /**
     * Move unit to new position
     */
    moveUnit(unitId, position) {
        const unit = this.units.get(unitId);
        if (!unit)
            return false;
        // Check if position is valid
        if (position.x < 0 || position.x >= this.gridWidth || position.y < 0 || position.y >= this.gridHeight) {
            return false;
        }
        // Update position
        unit.position = { ...position };
        unit.hasMoved = true;
        this.emit('unit-moved', unit, position);
        return true;
    }
    /**
     * Find path between two positions (simple A* pathfinding)
     */
    findPath(from, to) {
        // Simple breadth-first search pathfinding
        const queue = [
            { pos: from, path: [from] }
        ];
        const visited = new Set();
        while (queue.length > 0) {
            const { pos, path } = queue.shift();
            const key = `${pos.x},${pos.y}`;
            if (visited.has(key))
                continue;
            visited.add(key);
            // Found target
            if (pos.x === to.x && pos.y === to.y) {
                return path;
            }
            // Add neighbors
            const neighbors = [
                { x: pos.x + 1, y: pos.y },
                { x: pos.x - 1, y: pos.y },
                { x: pos.x, y: pos.y + 1 },
                { x: pos.x, y: pos.y - 1 }
            ];
            for (const next of neighbors) {
                if (next.x < 0 || next.x >= this.gridWidth || next.y < 0 || next.y >= this.gridHeight) {
                    continue;
                }
                const nextKey = `${next.x},${next.y}`;
                if (!visited.has(nextKey)) {
                    queue.push({ pos: next, path: [...path, next] });
                }
            }
        }
        return null; // No path found
    }
    /**
     * End current phase
     */
    endPhase() {
        // Reset units for the phase that just ended
        for (const unit of this.units.values()) {
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
    }
    /**
     * Get current phase
     */
    getCurrentPhase() {
        return this.currentPhase;
    }
    /**
     * Get turn number
     */
    getTurnNumber() {
        return this.turnNumber;
    }
    /**
     * Get all units
     */
    getAllUnits() {
        return Array.from(this.units.values());
    }
    /**
     * Get unit by ID
     */
    getUnit(id) {
        return this.units.get(id);
    }
    /**
     * Cleanup
     */
    dispose() {
        this.units.clear();
        this.removeAllListeners();
    }
}
