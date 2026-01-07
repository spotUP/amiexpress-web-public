/**
 * Character Class System
 *
 * Fire Emblem-style class progression, promotion, and skill system.
 *
 * Features:
 * - Base and advanced classes
 * - Class promotion with stat bonuses
 * - Class-specific growth rates
 * - Weapon proficiencies
 * - Learnable skills
 * - Movement types (Infantry, Cavalry, Flying, Armored)
 */
import { EventEmitter } from 'events';
import { WeaponType } from '../../engines/tactical/tactical-combat-engine';
/**
 * Movement type affects terrain traversal
 */
export var MovementType;
(function (MovementType) {
    MovementType["Infantry"] = "Infantry";
    MovementType["Cavalry"] = "Cavalry";
    MovementType["Flying"] = "Flying";
    MovementType["Armored"] = "Armored";
    MovementType["Dragon"] = "Dragon";
})(MovementType || (MovementType = {}));
/**
 * Skill activation types
 */
export var SkillTrigger;
(function (SkillTrigger) {
    SkillTrigger["Always"] = "Always";
    SkillTrigger["OnAttack"] = "OnAttack";
    SkillTrigger["OnDefend"] = "OnDefend";
    SkillTrigger["OnHit"] = "OnHit";
    SkillTrigger["OnCrit"] = "OnCrit";
    SkillTrigger["PerTurn"] = "PerTurn";
    SkillTrigger["Conditional"] = "Conditional"; // Based on HP, stats, etc.
})(SkillTrigger || (SkillTrigger = {}));
/**
 * Character Class System
 *
 * Manages class definitions, promotions, and skill learning.
 */
export class ClassSystem extends EventEmitter {
    constructor() {
        super();
        this.classes = new Map();
        this.skills = new Map();
        this.promotionBonuses = new Map();
        this.initializeClasses();
        this.initializeSkills();
    }
    /**
     * Initialize all Fire Emblem classes
     */
    initializeClasses() {
        // === TIER 1: BASE CLASSES ===
        // Lord - Main character class
        this.registerClass({
            id: 'lord',
            name: 'Lord',
            tier: 1,
            movementType: MovementType.Infantry,
            baseStats: { hp: 18, str: 5, mag: 0, skl: 6, spd: 7, lck: 7, def: 5, res: 2, mov: 5 },
            growthRates: { hp: 80, str: 40, mag: 5, skl: 50, spd: 50, lck: 60, def: 30, res: 25 },
            weaponProficiencies: [WeaponType.Sword],
            maxLevel: 20,
            promotesTo: ['great_lord'],
            promotionLevel: 10,
            learnedSkills: [
                { level: 1, skillId: 'charm' },
                { level: 10, skillId: 'dual_strike' }
            ]
        });
        // Cavalier - Mounted sword/lance user
        this.registerClass({
            id: 'cavalier',
            name: 'Cavalier',
            tier: 1,
            movementType: MovementType.Cavalry,
            baseStats: { hp: 20, str: 6, mag: 0, skl: 5, spd: 6, lck: 3, def: 6, res: 0, mov: 7 },
            growthRates: { hp: 80, str: 40, mag: 0, skl: 35, spd: 35, lck: 30, def: 30, res: 20 },
            weaponProficiencies: [WeaponType.Sword, WeaponType.Lance],
            maxLevel: 20,
            promotesTo: ['paladin', 'great_knight'],
            promotionLevel: 10,
            learnedSkills: [
                { level: 1, skillId: 'canter' },
                { level: 10, skillId: 'discipline' }
            ]
        });
        // Knight - Heavy armored defender
        this.registerClass({
            id: 'knight',
            name: 'Knight',
            tier: 1,
            movementType: MovementType.Armored,
            baseStats: { hp: 22, str: 7, mag: 0, skl: 4, spd: 3, lck: 2, def: 9, res: 0, mov: 4 },
            growthRates: { hp: 90, str: 50, mag: 0, skl: 30, spd: 20, lck: 25, def: 55, res: 15 },
            weaponProficiencies: [WeaponType.Lance],
            maxLevel: 20,
            promotesTo: ['general', 'great_knight'],
            promotionLevel: 10,
            learnedSkills: [
                { level: 1, skillId: 'defense_plus_2' },
                { level: 10, skillId: 'wary_fighter' }
            ]
        });
        // Myrmidon - Fast sword user
        this.registerClass({
            id: 'myrmidon',
            name: 'Myrmidon',
            tier: 1,
            movementType: MovementType.Infantry,
            baseStats: { hp: 17, str: 4, mag: 0, skl: 7, spd: 8, lck: 4, def: 3, res: 1, mov: 5 },
            growthRates: { hp: 70, str: 40, mag: 0, skl: 60, spd: 60, lck: 40, def: 20, res: 20 },
            weaponProficiencies: [WeaponType.Sword],
            maxLevel: 20,
            promotesTo: ['swordmaster', 'assassin'],
            promotionLevel: 10,
            learnedSkills: [
                { level: 1, skillId: 'avoid_plus_10' },
                { level: 10, skillId: 'vantage' }
            ]
        });
        // Mage - Magic user
        this.registerClass({
            id: 'mage',
            name: 'Mage',
            tier: 1,
            movementType: MovementType.Infantry,
            baseStats: { hp: 16, str: 0, mag: 6, skl: 5, spd: 5, lck: 3, def: 2, res: 4, mov: 5 },
            growthRates: { hp: 60, str: 0, mag: 50, skl: 40, spd: 40, lck: 30, def: 15, res: 40 },
            weaponProficiencies: [WeaponType.Tome],
            maxLevel: 20,
            promotesTo: ['sage', 'dark_knight'],
            promotionLevel: 10,
            learnedSkills: [
                { level: 1, skillId: 'magic_plus_2' },
                { level: 10, skillId: 'focus' }
            ]
        });
        // Archer - Bow user
        this.registerClass({
            id: 'archer',
            name: 'Archer',
            tier: 1,
            movementType: MovementType.Infantry,
            baseStats: { hp: 18, str: 5, mag: 0, skl: 6, spd: 5, lck: 4, def: 4, res: 2, mov: 5 },
            growthRates: { hp: 75, str: 45, mag: 0, skl: 50, spd: 45, lck: 35, def: 25, res: 20 },
            weaponProficiencies: [WeaponType.Bow],
            maxLevel: 20,
            promotesTo: ['sniper', 'bow_knight'],
            promotionLevel: 10,
            learnedSkills: [
                { level: 1, skillId: 'skill_plus_2' },
                { level: 10, skillId: 'bowfaire' }
            ]
        });
        // Pegasus Knight - Flying lance user
        this.registerClass({
            id: 'pegasus_knight',
            name: 'Pegasus Knight',
            tier: 1,
            movementType: MovementType.Flying,
            baseStats: { hp: 16, str: 4, mag: 1, skl: 6, spd: 8, lck: 5, def: 3, res: 6, mov: 7 },
            growthRates: { hp: 65, str: 35, mag: 15, skl: 50, spd: 55, lck: 55, def: 20, res: 50 },
            weaponProficiencies: [WeaponType.Lance],
            maxLevel: 20,
            promotesTo: ['falcon_knight', 'wyvern_rider'],
            promotionLevel: 10,
            learnedSkills: [
                { level: 1, skillId: 'speed_plus_2' },
                { level: 10, skillId: 'darting_blow' }
            ]
        });
        // Cleric - Healing staff user
        this.registerClass({
            id: 'cleric',
            name: 'Cleric',
            tier: 1,
            movementType: MovementType.Infantry,
            baseStats: { hp: 16, str: 0, mag: 5, skl: 4, spd: 5, lck: 6, def: 2, res: 6, mov: 5 },
            growthRates: { hp: 55, str: 0, mag: 45, skl: 35, spd: 40, lck: 55, def: 15, res: 55 },
            weaponProficiencies: [WeaponType.Staff],
            maxLevel: 20,
            promotesTo: ['war_cleric', 'sage'],
            promotionLevel: 10,
            learnedSkills: [
                { level: 1, skillId: 'resistance_plus_2' },
                { level: 10, skillId: 'miracle' }
            ]
        });
        // Mercenary - Balanced sword user
        this.registerClass({
            id: 'mercenary',
            name: 'Mercenary',
            tier: 1,
            movementType: MovementType.Infantry,
            baseStats: { hp: 19, str: 6, mag: 0, skl: 6, spd: 6, lck: 3, def: 5, res: 1, mov: 5 },
            growthRates: { hp: 80, str: 45, mag: 0, skl: 50, spd: 45, lck: 35, def: 30, res: 20 },
            weaponProficiencies: [WeaponType.Sword],
            maxLevel: 20,
            promotesTo: ['hero', 'bow_knight'],
            promotionLevel: 10,
            learnedSkills: [
                { level: 1, skillId: 'hp_plus_5' },
                { level: 10, skillId: 'armsthrift' }
            ]
        });
        // Fighter - Axe user
        this.registerClass({
            id: 'fighter',
            name: 'Fighter',
            tier: 1,
            movementType: MovementType.Infantry,
            baseStats: { hp: 21, str: 7, mag: 0, skl: 4, spd: 5, lck: 3, def: 4, res: 0, mov: 5 },
            growthRates: { hp: 85, str: 55, mag: 0, skl: 40, spd: 40, lck: 30, def: 25, res: 15 },
            weaponProficiencies: [WeaponType.Axe],
            maxLevel: 20,
            promotesTo: ['warrior', 'hero'],
            promotionLevel: 10,
            learnedSkills: [
                { level: 1, skillId: 'strength_plus_2' },
                { level: 10, skillId: 'wrath' }
            ]
        });
        // === TIER 2: ADVANCED CLASSES ===
        // Great Lord - Promoted Lord
        this.registerClass({
            id: 'great_lord',
            name: 'Great Lord',
            tier: 2,
            movementType: MovementType.Infantry,
            baseStats: { hp: 22, str: 8, mag: 2, skl: 10, spd: 11, lck: 10, def: 8, res: 5, mov: 6 },
            growthRates: { hp: 85, str: 45, mag: 10, skl: 55, spd: 55, lck: 65, def: 35, res: 30 },
            weaponProficiencies: [WeaponType.Sword, WeaponType.Lance],
            maxLevel: 20,
            learnedSkills: [
                { level: 5, skillId: 'rightful_king' },
                { level: 15, skillId: 'aether' }
            ]
        });
        // Paladin - Promoted Cavalier
        this.registerClass({
            id: 'paladin',
            name: 'Paladin',
            tier: 2,
            movementType: MovementType.Cavalry,
            baseStats: { hp: 24, str: 10, mag: 1, skl: 9, spd: 10, lck: 6, def: 10, res: 4, mov: 8 },
            growthRates: { hp: 85, str: 45, mag: 5, skl: 40, spd: 40, lck: 35, def: 35, res: 25 },
            weaponProficiencies: [WeaponType.Sword, WeaponType.Lance],
            maxLevel: 20,
            learnedSkills: [
                { level: 5, skillId: 'aegis' },
                { level: 15, skillId: 'luna' }
            ]
        });
        // General - Promoted Knight
        this.registerClass({
            id: 'general',
            name: 'General',
            tier: 2,
            movementType: MovementType.Armored,
            baseStats: { hp: 26, str: 11, mag: 0, skl: 8, spd: 6, lck: 5, def: 14, res: 3, mov: 5 },
            growthRates: { hp: 95, str: 55, mag: 0, skl: 35, spd: 25, lck: 30, def: 60, res: 20 },
            weaponProficiencies: [WeaponType.Lance, WeaponType.Axe],
            maxLevel: 20,
            learnedSkills: [
                { level: 5, skillId: 'pavise' },
                { level: 15, skillId: 'armored_blow' }
            ]
        });
        // Swordmaster - Promoted Myrmidon
        this.registerClass({
            id: 'swordmaster',
            name: 'Swordmaster',
            tier: 2,
            movementType: MovementType.Infantry,
            baseStats: { hp: 21, str: 8, mag: 0, skl: 12, spd: 13, lck: 8, def: 6, res: 4, mov: 6 },
            growthRates: { hp: 75, str: 45, mag: 0, skl: 65, spd: 65, lck: 45, def: 25, res: 25 },
            weaponProficiencies: [WeaponType.Sword],
            maxLevel: 20,
            learnedSkills: [
                { level: 5, skillId: 'astra' },
                { level: 15, skillId: 'swordfaire' }
            ]
        });
        // Sage - Promoted Mage
        this.registerClass({
            id: 'sage',
            name: 'Sage',
            tier: 2,
            movementType: MovementType.Infantry,
            baseStats: { hp: 20, str: 1, mag: 11, skl: 9, spd: 9, lck: 6, def: 5, res: 9, mov: 6 },
            growthRates: { hp: 65, str: 0, mag: 55, skl: 45, spd: 45, lck: 35, def: 20, res: 45 },
            weaponProficiencies: [WeaponType.Tome, WeaponType.Staff],
            maxLevel: 20,
            learnedSkills: [
                { level: 5, skillId: 'tomefaire' },
                { level: 15, skillId: 'rally_magic' }
            ]
        });
        // Sniper - Promoted Archer
        this.registerClass({
            id: 'sniper',
            name: 'Sniper',
            tier: 2,
            movementType: MovementType.Infantry,
            baseStats: { hp: 22, str: 9, mag: 0, skl: 11, spd: 9, lck: 8, def: 8, res: 5, mov: 6 },
            growthRates: { hp: 80, str: 50, mag: 0, skl: 55, spd: 50, lck: 40, def: 30, res: 25 },
            weaponProficiencies: [WeaponType.Bow],
            maxLevel: 20,
            learnedSkills: [
                { level: 5, skillId: 'hit_rate_plus_20' },
                { level: 15, skillId: 'bowfaire' }
            ]
        });
        // Falcon Knight - Promoted Pegasus Knight
        this.registerClass({
            id: 'falcon_knight',
            name: 'Falcon Knight',
            tier: 2,
            movementType: MovementType.Flying,
            baseStats: { hp: 20, str: 8, mag: 4, skl: 11, spd: 13, lck: 10, def: 6, res: 11, mov: 8 },
            growthRates: { hp: 70, str: 40, mag: 20, skl: 55, spd: 60, lck: 60, def: 25, res: 55 },
            weaponProficiencies: [WeaponType.Lance, WeaponType.Staff],
            maxLevel: 20,
            learnedSkills: [
                { level: 5, skillId: 'rally_speed' },
                { level: 15, skillId: 'lancefaire' }
            ]
        });
        // Hero - Promoted Mercenary/Fighter
        this.registerClass({
            id: 'hero',
            name: 'Hero',
            tier: 2,
            movementType: MovementType.Infantry,
            baseStats: { hp: 24, str: 10, mag: 0, skl: 10, spd: 10, lck: 7, def: 9, res: 4, mov: 6 },
            growthRates: { hp: 85, str: 50, mag: 0, skl: 55, spd: 50, lck: 40, def: 35, res: 25 },
            weaponProficiencies: [WeaponType.Sword, WeaponType.Axe],
            maxLevel: 20,
            learnedSkills: [
                { level: 5, skillId: 'sol' },
                { level: 15, skillId: 'axebreaker' }
            ]
        });
        // Warrior - Promoted Fighter
        this.registerClass({
            id: 'warrior',
            name: 'Warrior',
            tier: 2,
            movementType: MovementType.Infantry,
            baseStats: { hp: 26, str: 12, mag: 0, skl: 8, spd: 9, lck: 6, def: 8, res: 3, mov: 6 },
            growthRates: { hp: 90, str: 60, mag: 0, skl: 45, spd: 45, lck: 35, def: 30, res: 20 },
            weaponProficiencies: [WeaponType.Axe, WeaponType.Bow],
            maxLevel: 20,
            learnedSkills: [
                { level: 5, skillId: 'counter' },
                { level: 15, skillId: 'axefaire' }
            ]
        });
        // Assassin - Promoted Myrmidon
        this.registerClass({
            id: 'assassin',
            name: 'Assassin',
            tier: 2,
            movementType: MovementType.Infantry,
            baseStats: { hp: 19, str: 7, mag: 0, skl: 13, spd: 14, lck: 9, def: 5, res: 3, mov: 6 },
            growthRates: { hp: 70, str: 40, mag: 0, skl: 65, spd: 70, lck: 50, def: 20, res: 20 },
            weaponProficiencies: [WeaponType.Sword, WeaponType.Bow],
            maxLevel: 20,
            learnedSkills: [
                { level: 5, skillId: 'lethality' },
                { level: 15, skillId: 'pass' }
            ]
        });
        // Set promotion bonuses
        this.setPromotionBonus('great_lord', { hp: 3, str: 2, mag: 1, skl: 2, spd: 2, lck: 1, def: 2, res: 2, mov: 1 });
        this.setPromotionBonus('paladin', { hp: 4, str: 2, mag: 0, skl: 1, spd: 1, lck: 0, def: 2, res: 1, mov: 1 });
        this.setPromotionBonus('general', { hp: 4, str: 2, mag: 0, skl: 1, spd: 0, lck: 0, def: 3, res: 1, mov: 1 });
        this.setPromotionBonus('swordmaster', { hp: 2, str: 1, mag: 0, skl: 2, spd: 3, lck: 1, def: 1, res: 1, mov: 1 });
        this.setPromotionBonus('sage', { hp: 2, str: 0, mag: 3, skl: 1, spd: 1, lck: 0, def: 1, res: 2, mov: 1 });
        this.setPromotionBonus('sniper', { hp: 3, str: 2, mag: 0, skl: 2, spd: 1, lck: 1, def: 2, res: 1, mov: 1 });
        this.setPromotionBonus('falcon_knight', { hp: 2, str: 1, mag: 1, skl: 2, spd: 2, lck: 1, def: 1, res: 2, mov: 1 });
        this.setPromotionBonus('hero', { hp: 3, str: 2, mag: 0, skl: 2, spd: 2, lck: 1, def: 2, res: 1, mov: 1 });
        this.setPromotionBonus('warrior', { hp: 4, str: 3, mag: 0, skl: 1, spd: 1, lck: 0, def: 1, res: 0, mov: 1 });
        this.setPromotionBonus('assassin', { hp: 1, str: 1, mag: 0, skl: 3, spd: 3, lck: 2, def: 0, res: 0, mov: 1 });
    }
    /**
     * Initialize all skills
     */
    initializeSkills() {
        // === PASSIVE SKILLS ===
        this.registerSkill({
            id: 'hp_plus_5',
            name: 'HP +5',
            description: 'Max HP +5',
            trigger: SkillTrigger.Always,
            effect: { statModifiers: { hp: 5, maxHp: 5 } }
        });
        this.registerSkill({
            id: 'strength_plus_2',
            name: 'Strength +2',
            description: 'Strength +2',
            trigger: SkillTrigger.Always,
            effect: { statModifiers: { str: 2 } }
        });
        this.registerSkill({
            id: 'magic_plus_2',
            name: 'Magic +2',
            description: 'Magic +2',
            trigger: SkillTrigger.Always,
            effect: { statModifiers: { mag: 2 } }
        });
        this.registerSkill({
            id: 'skill_plus_2',
            name: 'Skill +2',
            description: 'Skill +2',
            trigger: SkillTrigger.Always,
            effect: { statModifiers: { skl: 2 } }
        });
        this.registerSkill({
            id: 'speed_plus_2',
            name: 'Speed +2',
            description: 'Speed +2',
            trigger: SkillTrigger.Always,
            effect: { statModifiers: { spd: 2 } }
        });
        this.registerSkill({
            id: 'defense_plus_2',
            name: 'Defense +2',
            description: 'Defense +2',
            trigger: SkillTrigger.Always,
            effect: { statModifiers: { def: 2 } }
        });
        this.registerSkill({
            id: 'resistance_plus_2',
            name: 'Resistance +2',
            description: 'Resistance +2',
            trigger: SkillTrigger.Always,
            effect: { statModifiers: { res: 2 } }
        });
        this.registerSkill({
            id: 'avoid_plus_10',
            name: 'Avoid +10',
            description: 'Avoid +10',
            trigger: SkillTrigger.Always,
            effect: { avoidModifier: 10 }
        });
        this.registerSkill({
            id: 'hit_rate_plus_20',
            name: 'Hit Rate +20',
            description: 'Hit rate +20',
            trigger: SkillTrigger.Always,
            effect: { hitModifier: 20 }
        });
        // === COMBAT SKILLS ===
        this.registerSkill({
            id: 'vantage',
            name: 'Vantage',
            description: 'Attack first when HP ≤ 50%',
            trigger: SkillTrigger.OnDefend,
            effect: {}
        });
        this.registerSkill({
            id: 'wrath',
            name: 'Wrath',
            description: 'Critical +50 when HP ≤ 50%',
            trigger: SkillTrigger.Always,
            effect: { critModifier: 50 }
        });
        this.registerSkill({
            id: 'sol',
            name: 'Sol',
            description: 'Restore HP = damage dealt (Skill%)',
            trigger: SkillTrigger.OnHit,
            effect: {}
        });
        this.registerSkill({
            id: 'luna',
            name: 'Luna',
            description: 'Ignore half of enemy Def/Res (Skill%)',
            trigger: SkillTrigger.OnHit,
            effect: {}
        });
        this.registerSkill({
            id: 'astra',
            name: 'Astra',
            description: '5 hits at 50% damage (Skill%)',
            trigger: SkillTrigger.OnAttack,
            effect: {}
        });
        this.registerSkill({
            id: 'aether',
            name: 'Aether',
            description: 'Luna + Sol combined (Skill%)',
            trigger: SkillTrigger.OnAttack,
            effect: {}
        });
        this.registerSkill({
            id: 'lethality',
            name: 'Lethality',
            description: 'Instant kill (Skill/4%)',
            trigger: SkillTrigger.OnHit,
            effect: {}
        });
        this.registerSkill({
            id: 'counter',
            name: 'Counter',
            description: 'Counterattack regardless of range',
            trigger: SkillTrigger.OnDefend,
            effect: {}
        });
        // === DEFENSIVE SKILLS ===
        this.registerSkill({
            id: 'pavise',
            name: 'Pavise',
            description: 'Negate physical damage (Skill%)',
            trigger: SkillTrigger.OnDefend,
            effect: {}
        });
        this.registerSkill({
            id: 'aegis',
            name: 'Aegis',
            description: 'Negate magic damage (Skill%)',
            trigger: SkillTrigger.OnDefend,
            effect: {}
        });
        this.registerSkill({
            id: 'miracle',
            name: 'Miracle',
            description: 'Survive lethal blow with 1 HP (Luck%)',
            trigger: SkillTrigger.OnDefend,
            effect: {}
        });
        // === STANCE SKILLS ===
        this.registerSkill({
            id: 'armored_blow',
            name: 'Armored Blow',
            description: 'Def +10 when attacking',
            trigger: SkillTrigger.OnAttack,
            effect: { statModifiers: { def: 10 } }
        });
        this.registerSkill({
            id: 'darting_blow',
            name: 'Darting Blow',
            description: 'Spd +10 when attacking',
            trigger: SkillTrigger.OnAttack,
            effect: { statModifiers: { spd: 10 } }
        });
        this.registerSkill({
            id: 'wary_fighter',
            name: 'Wary Fighter',
            description: 'Prevent double attacks (both ways)',
            trigger: SkillTrigger.Always,
            effect: {}
        });
        // === UTILITY SKILLS ===
        this.registerSkill({
            id: 'pass',
            name: 'Pass',
            description: 'Move through enemy units',
            trigger: SkillTrigger.Always,
            effect: {}
        });
        this.registerSkill({
            id: 'canter',
            name: 'Canter',
            description: 'Move again after acting',
            trigger: SkillTrigger.Always,
            effect: {}
        });
        this.registerSkill({
            id: 'armsthrift',
            name: 'Armsthrift',
            description: 'Weapon durability not consumed (Luck%)',
            trigger: SkillTrigger.Always,
            effect: {}
        });
        this.registerSkill({
            id: 'discipline',
            name: 'Discipline',
            description: 'Weapon exp x2',
            trigger: SkillTrigger.Always,
            effect: {}
        });
        // === WEAPON SKILLS ===
        this.registerSkill({
            id: 'swordfaire',
            name: 'Swordfaire',
            description: 'Damage +5 with swords',
            trigger: SkillTrigger.Always,
            effect: { damageModifier: 5 }
        });
        this.registerSkill({
            id: 'lancefaire',
            name: 'Lancefaire',
            description: 'Damage +5 with lances',
            trigger: SkillTrigger.Always,
            effect: { damageModifier: 5 }
        });
        this.registerSkill({
            id: 'axefaire',
            name: 'Axefaire',
            description: 'Damage +5 with axes',
            trigger: SkillTrigger.Always,
            effect: { damageModifier: 5 }
        });
        this.registerSkill({
            id: 'bowfaire',
            name: 'Bowfaire',
            description: 'Damage +5 with bows',
            trigger: SkillTrigger.Always,
            effect: { damageModifier: 5 }
        });
        this.registerSkill({
            id: 'tomefaire',
            name: 'Tomefaire',
            description: 'Damage +5 with tomes',
            trigger: SkillTrigger.Always,
            effect: { damageModifier: 5 }
        });
        // === BREAKER SKILLS ===
        this.registerSkill({
            id: 'axebreaker',
            name: 'Axebreaker',
            description: 'Hit/Avoid +50 vs axes',
            trigger: SkillTrigger.Always,
            effect: { hitModifier: 50, avoidModifier: 50 }
        });
        // === SUPPORT SKILLS ===
        this.registerSkill({
            id: 'charm',
            name: 'Charm',
            description: 'Allies within 2 tiles deal +2 damage',
            trigger: SkillTrigger.Always,
            effect: {}
        });
        this.registerSkill({
            id: 'dual_strike',
            name: 'Dual Strike+',
            description: 'Increased dual strike chance',
            trigger: SkillTrigger.Always,
            effect: {}
        });
        this.registerSkill({
            id: 'rally_speed',
            name: 'Rally Speed',
            description: 'Allies within 2 tiles: Spd +4',
            trigger: SkillTrigger.Always,
            effect: {}
        });
        this.registerSkill({
            id: 'rally_magic',
            name: 'Rally Magic',
            description: 'Allies within 2 tiles: Mag +4',
            trigger: SkillTrigger.Always,
            effect: {}
        });
        this.registerSkill({
            id: 'focus',
            name: 'Focus',
            description: 'Critical +10',
            trigger: SkillTrigger.Always,
            effect: { critModifier: 10 }
        });
        this.registerSkill({
            id: 'rightful_king',
            name: 'Rightful King',
            description: 'Skill activation +10%',
            trigger: SkillTrigger.Always,
            effect: {}
        });
    }
    /**
     * Register a character class
     */
    registerClass(classData) {
        this.classes.set(classData.id, classData);
        this.emit('class:registered', classData);
    }
    /**
     * Register a skill
     */
    registerSkill(skill) {
        this.skills.set(skill.id, skill);
        this.emit('skill:registered', skill);
    }
    /**
     * Set promotion bonus for a class
     */
    setPromotionBonus(classId, bonus) {
        this.promotionBonuses.set(classId, bonus);
    }
    /**
     * Get class by ID
     */
    getClass(classId) {
        return this.classes.get(classId);
    }
    /**
     * Get skill by ID
     */
    getSkill(skillId) {
        return this.skills.get(skillId);
    }
    /**
     * Get all classes
     */
    getAllClasses() {
        return Array.from(this.classes.values());
    }
    /**
     * Get classes by tier
     */
    getClassesByTier(tier) {
        return Array.from(this.classes.values()).filter(c => c.tier === tier);
    }
    /**
     * Get promotion options for a class
     */
    getPromotionOptions(classId) {
        const currentClass = this.getClass(classId);
        if (!currentClass || !currentClass.promotesTo) {
            return [];
        }
        return currentClass.promotesTo
            .map(id => this.getClass(id))
            .filter(c => c !== undefined);
    }
    /**
     * Get promotion bonus for a class
     */
    getPromotionBonus(classId) {
        return this.promotionBonuses.get(classId);
    }
    /**
     * Check if unit can promote
     */
    canPromote(currentClassId, level) {
        const currentClass = this.getClass(currentClassId);
        if (!currentClass || !currentClass.promotesTo || currentClass.promotesTo.length === 0) {
            return false;
        }
        const requiredLevel = currentClass.promotionLevel || 10;
        return level >= requiredLevel;
    }
    /**
     * Get skills learned at a specific level for a class
     */
    getSkillsAtLevel(classId, level) {
        const classData = this.getClass(classId);
        if (!classData) {
            return [];
        }
        return classData.learnedSkills
            .filter(ls => ls.level === level)
            .map(ls => this.getSkill(ls.skillId))
            .filter(s => s !== undefined);
    }
    /**
     * Get all skills for a class up to a level
     */
    getAllSkillsUpToLevel(classId, level) {
        const classData = this.getClass(classId);
        if (!classData) {
            return [];
        }
        return classData.learnedSkills
            .filter(ls => ls.level <= level)
            .map(ls => this.getSkill(ls.skillId))
            .filter(s => s !== undefined);
    }
    /**
     * Calculate total stat modifiers from skills
     */
    calculateSkillModifiers(skillIds) {
        const modifiers = {};
        for (const skillId of skillIds) {
            const skill = this.getSkill(skillId);
            if (skill && skill.effect.statModifiers) {
                for (const [stat, value] of Object.entries(skill.effect.statModifiers)) {
                    modifiers[stat] =
                        (modifiers[stat] || 0) + (value || 0);
                }
            }
        }
        return modifiers;
    }
    /**
     * Dispose resources
     */
    dispose() {
        this.removeAllListeners();
        this.classes.clear();
        this.skills.clear();
        this.promotionBonuses.clear();
    }
}
