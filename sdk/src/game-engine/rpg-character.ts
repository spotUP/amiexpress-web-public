import { CharacterStats } from './types';

/**
 * RPG Character class for managing character stats and progression
 */
export class RPGCharacter {
  private stats: CharacterStats;

  constructor(initialStats?: Partial<CharacterStats>) {
    this.stats = {
      name: 'Hero',
      level: 1,
      experience: 0,
      health: 100,
      maxHealth: 100,
      mana: 50,
      maxMana: 50,
      strength: 10,
      dexterity: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10,
      constitution: 10,
      gold: 0,
      inventory: [],
      equipment: {},
      ...initialStats
    };
  }

  /**
   * Get current stats
   */
  getStats(): CharacterStats {
    return { ...this.stats };
  }

  /**
   * Take damage
   */
  takeDamage(amount: number): boolean {
    this.stats.health = Math.max(0, this.stats.health - amount);
    return this.stats.health > 0;
  }

  /**
   * Heal character
   */
  heal(amount: number): void {
    this.stats.health = Math.min(this.stats.maxHealth, this.stats.health + amount);
  }

  /**
   * Use mana
   */
  useMana(amount: number): boolean {
    if (!this.stats.mana || this.stats.mana < amount) return false;
    this.stats.mana -= amount;
    return true;
  }

  /**
   * Restore mana
   */
  restoreMana(amount: number): void {
    if (this.stats.mana !== undefined && this.stats.maxMana !== undefined) {
      this.stats.mana = Math.min(this.stats.maxMana, this.stats.mana + amount);
    }
  }

  /**
   * Gain experience and level up if needed
   */
  gainExperience(amount: number): boolean {
    this.stats.experience += amount;
    const newLevel = Math.floor(this.stats.experience / 1000) + 1;

    if (newLevel > this.stats.level) {
      this.levelUp(newLevel - this.stats.level);
      return true;
    }
    return false;
  }

  /**
   * Level up character
   */
  private levelUp(levels: number): void {
    this.stats.level += levels;
    const statIncrease = levels * 2;

    this.stats.maxHealth += statIncrease * 10;
    this.stats.health = this.stats.maxHealth; // Full heal on level up

    if (this.stats.maxMana) {
      this.stats.maxMana += statIncrease * 5;
      this.stats.mana = this.stats.maxMana;
    }

    if (this.stats.strength) this.stats.strength += statIncrease;
    if (this.stats.dexterity) this.stats.dexterity += statIncrease;
    if (this.stats.intelligence) this.stats.intelligence += statIncrease;
    if (this.stats.wisdom) this.stats.wisdom += statIncrease;
    if (this.stats.charisma) this.stats.charisma += statIncrease;
    if (this.stats.constitution) this.stats.constitution += statIncrease;
  }

  /**
   * Add item to inventory
   */
  addItem(item: string): void {
    this.stats.inventory.push(item);
  }

  /**
   * Remove item from inventory
   */
  removeItem(item: string): boolean {
    const index = this.stats.inventory.indexOf(item);
    if (index !== -1) {
      this.stats.inventory.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Equip item
   */
  equipItem(slot: string, item: string): boolean {
    if (!this.stats.inventory.includes(item)) return false;

    this.stats.equipment[slot] = item;
    this.removeItem(item);
    return true;
  }

  /**
   * Unequip item
   */
  unequipItem(slot: string): string | null {
    const item = this.stats.equipment[slot];
    if (item) {
      delete this.stats.equipment[slot];
      this.addItem(item);
      return item;
    }
    return null;
  }

  /**
   * Add gold
   */
  addGold(amount: number): void {
    this.stats.gold += amount;
  }

  /**
   * Spend gold
   */
  spendGold(amount: number): boolean {
    if (this.stats.gold >= amount) {
      this.stats.gold -= amount;
      return true;
    }
    return false;
  }

  /**
   * Format character sheet as string
   */
  formatCharacterSheet(): string {
    let output = '';
    output += `${this.stats.name} - Level ${this.stats.level}\r\n`;
    output += '─'.repeat(60) + '\r\n';

    // Basic info
    output += `Experience: ${this.stats.experience}\r\n`;
    output += `Gold: ${this.stats.gold}\r\n\r\n`;

    // Health and mana
    const healthPercent = Math.round((this.stats.health / this.stats.maxHealth) * 100);
    output += `Health: ${this.stats.health}/${this.stats.maxHealth} (${healthPercent}%)\r\n`;

    if (this.stats.mana !== undefined && this.stats.maxMana !== undefined) {
      const manaPercent = Math.round((this.stats.mana / this.stats.maxMana) * 100);
      output += `Mana: ${this.stats.mana}/${this.stats.maxMana} (${manaPercent}%)\r\n`;
    }

    output += '\r\n';

    // Stats
    output += 'Attributes:\r\n';
    output += `Strength:     ${this.stats.strength || 0}\r\n`;
    output += `Dexterity:    ${this.stats.dexterity || 0}\r\n`;
    output += `Intelligence: ${this.stats.intelligence || 0}\r\n`;
    output += `Wisdom:       ${this.stats.wisdom || 0}\r\n`;
    output += `Charisma:     ${this.stats.charisma || 0}\r\n`;
    output += `Constitution: ${this.stats.constitution || 0}\r\n\r\n`;

    // Equipment
    if (Object.keys(this.stats.equipment).length > 0) {
      output += 'Equipment:\r\n';
      Object.entries(this.stats.equipment).forEach(([slot, item]) => {
        output += `${slot}: ${item}\r\n`;
      });
      output += '\r\n';
    }

    // Inventory
    if (this.stats.inventory.length > 0) {
      output += 'Inventory:\r\n';
      this.stats.inventory.forEach(item => {
        output += `- ${item}\r\n`;
      });
    }

    return output;
  }
}
