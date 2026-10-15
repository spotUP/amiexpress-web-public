import { CharacterStats } from './types';
import { RPGCharacter } from './rpg-character';

/**
 * Result of an attack
 */
export interface AttackResult {
  damage: number;
  hit: boolean;
  critical: boolean;
}

/**
 * Combat System for turn-based combat
 */
export class CombatSystem {
  private attacker: CharacterStats;
  private defender: CharacterStats;

  constructor(attacker: CharacterStats, defender: CharacterStats) {
    this.attacker = attacker;
    this.defender = defender;
  }

  /**
   * Perform an attack
   */
  attack(attacker: RPGCharacter, defender: RPGCharacter): AttackResult {
    const attackerStats = attacker.getStats();
    const defenderStats = defender.getStats();

    // Calculate hit chance (simplified)
    const hitChance = Math.min(95, 50 + ((attackerStats.dexterity || 10) - (defenderStats.dexterity || 10)) * 2);
    const hitRoll = Math.random() * 100;

    if (hitRoll > hitChance) {
      return { damage: 0, hit: false, critical: false };
    }

    // Calculate damage
    const baseDamage = attackerStats.strength || 10;
    const weaponDamage = 5; // Could be based on equipped weapon
    const damageVariation = Math.floor(Math.random() * 6) - 3; // -3 to +3
    let damage = baseDamage + weaponDamage + damageVariation;

    // Critical hit (10% chance)
    const critical = Math.random() < 0.1;
    if (critical) {
      damage *= 2;
    }

    // Apply damage
    defender.takeDamage(damage);

    return { damage, hit: true, critical };
  }

  /**
   * Calculate damage for a spell
   */
  castSpell(attacker: RPGCharacter, defender: RPGCharacter, manaCost: number, spellPower: number): AttackResult {
    const attackerStats = attacker.getStats();

    // Check if attacker has enough mana
    if (!attacker.useMana(manaCost)) {
      return { damage: 0, hit: false, critical: false };
    }

    // Calculate spell damage
    const baseDamage = (attackerStats.intelligence || 10) + spellPower;
    const damageVariation = Math.floor(Math.random() * 6) - 3;
    let damage = baseDamage + damageVariation;

    // Critical hit (15% chance for spells)
    const critical = Math.random() < 0.15;
    if (critical) {
      damage *= 2;
    }

    // Apply damage
    defender.takeDamage(damage);

    return { damage, hit: true, critical };
  }

  /**
   * Calculate healing amount
   */
  heal(healer: RPGCharacter, target: RPGCharacter, manaCost: number, healPower: number): number {
    const healerStats = healer.getStats();

    // Check if healer has enough mana
    if (manaCost > 0 && !healer.useMana(manaCost)) {
      return 0;
    }

    // Calculate heal amount
    const baseHeal = (healerStats.wisdom || 10) + healPower;
    const healVariation = Math.floor(Math.random() * 6) - 3;
    const healAmount = Math.max(1, baseHeal + healVariation);

    // Apply healing
    target.heal(healAmount);

    return healAmount;
  }

  /**
   * Check if attacker hits defender
   */
  rollHit(attacker: CharacterStats, defender: CharacterStats): boolean {
    const hitChance = Math.min(95, 50 + ((attacker.dexterity || 10) - (defender.dexterity || 10)) * 2);
    const hitRoll = Math.random() * 100;
    return hitRoll <= hitChance;
  }

  /**
   * Check for critical hit
   */
  rollCritical(attacker: CharacterStats): boolean {
    const critChance = 10 + (attacker.dexterity || 10) * 0.5;
    return Math.random() * 100 < critChance;
  }

  /**
   * Calculate damage without applying it
   */
  calculateDamage(attacker: CharacterStats, defender: CharacterStats): number {
    const baseDamage = attacker.strength || 10;
    const weaponDamage = 5;
    const damageVariation = Math.floor(Math.random() * 6) - 3;
    const defense = (defender.constitution || 10) * 0.5;

    return Math.max(1, baseDamage + weaponDamage + damageVariation - defense);
  }

  /**
   * Format combat status
   */
  static formatCombatStatus(player: RPGCharacter, enemy: RPGCharacter): string {
    const playerStats = player.getStats();
    const enemyStats = enemy.getStats();

    let output = '';
    output += `Player: ${playerStats.health}/${playerStats.maxHealth} HP\r\n`;
    output += `Enemy:  ${enemyStats.health}/${enemyStats.maxHealth} HP\r\n`;
    return output;
  }

  /**
   * Generate health bar
   */
  static generateHealthBar(current: number, max: number, width: number = 20): string {
    const percent = current / max;
    const filled = Math.round(percent * width);
    const empty = width - filled;

    return '#'.repeat(filled) + '-'.repeat(empty);
  }
}
