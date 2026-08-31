/**
 * Super Qix - Power-Up System
 * Handles power-up spawning, effects, and letter collection
 */

import {
  SuperQixData,
  PowerUp,
  PowerUpType,
  Marker,
  ActiveEffect
} from './types';
import {
  FIELD_WIDTH,
  FIELD_HEIGHT,
  POWERUP_SPAWN_CHANCE,
  SPEED_BOOST_DURATION,
  FREEZE_DURATION,
  POWERUP_EFFECTS,
  SPARE_LETTER_POINTS,
  ONE_UP_CHANCE
} from './constants';

/**
 * Power-up system for spawning and managing power-ups
 */
export class PowerUpSystem {
  private data: SuperQixData;

  constructor(data: SuperQixData) {
    this.data = data;
  }

  /**
   * Try to spawn a power-up after claiming area
   */
  trySpawnPowerUp(): void {
    if (Math.random() > POWERUP_SPAWN_CHANCE) return;

    const d = this.data;

    // Find a valid spawn position (on claimed area near edge)
    const position = this.findSpawnPosition();
    if (!position) return;

    // Determine power-up type
    const type = this.selectPowerUpType();

    d.powerUpIdCounter = (d.powerUpIdCounter || 0) + 1;

    const powerUp: PowerUp = {
      id: d.powerUpIdCounter,
      type,
      x: position.x,
      y: position.y,
      collected: false,
      spawnTime: Date.now()
    };

    // For letter type, assign a letter from the level word
    if (type === 'letter') {
      const letter = this.getNextNeededLetter();
      powerUp.letter = letter ?? undefined;
      if (!letter) {
        // All letters collected, change to different type
        powerUp.type = 'speed';
      }
    }

    d.powerUps.push(powerUp);
  }

  /**
   * Find a valid position to spawn a power-up
   */
  private findSpawnPosition(): { x: number; y: number } | null {
    const d = this.data;

    // Find claimed cells that are near unclaimed (edge of claimed area)
    const candidates: { x: number; y: number }[] = [];

    for (let y = 2; y < FIELD_HEIGHT - 2; y++) {
      for (let x = 2; x < FIELD_WIDTH - 2; x++) {
        if (d.field[y][x] === 'claimed') {
          // Check if adjacent to unclaimed
          const hasUnclaimedNeighbor = [
            d.field[y - 1]?.[x],
            d.field[y + 1]?.[x],
            d.field[y]?.[x - 1],
            d.field[y]?.[x + 1]
          ].some(cell => cell === 'unclaimed');

          if (hasUnclaimedNeighbor) {
            candidates.push({ x, y });
          }
        }
      }
    }

    if (candidates.length === 0) return null;

    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  /**
   * Select a random power-up type
   */
  private selectPowerUpType(): PowerUpType {
    const types: PowerUpType[] = ['speed', 'shield', 'freeze', 'letter'];

    // The 1-UP is rarer than anything else (FAQ 2.3.1).
    if (Math.random() < ONE_UP_CHANCE) {
      return 'oneUp';
    }

    // Warp is rare
    if (Math.random() < 0.05) {
      return 'warp';
    }

    // Letter is more common if word not complete
    const d = this.data;
    if (d.levelWord && d.collectedLetters.length < d.levelWord.length) {
      if (Math.random() < 0.4) {
        return 'letter';
      }
    }

    return types[Math.floor(Math.random() * types.length)];
  }

  /**
   * Get the next letter needed to complete the word
   */
  private getNextNeededLetter(): string | null {
    const d = this.data;
    if (!d.levelWord) return null;

    const needed = d.levelWord.split('');
    const collected = new Set(d.collectedLetters);

    for (const letter of needed) {
      if (!collected.has(letter)) {
        return letter;
      }
    }

    return null;
  }

  /**
   * Check if marker collects any power-ups
   */
  checkCollection(marker: Marker): void {
    const d = this.data;

    for (const powerUp of d.powerUps) {
      if (powerUp.collected) continue;

      const dist = Math.abs(powerUp.x - marker.x) + Math.abs(powerUp.y - marker.y);
      if (dist < 1.5) {
        this.collectPowerUp(powerUp);
      }
    }
  }

  /**
   * Collect a power-up and apply its effect
   */
  private collectPowerUp(powerUp: PowerUp): void {
    const d = this.data;

    powerUp.collected = true;

    // FAQ 2.3.1: "The Power-ups are mutually exclusive, i.e. if you have a
    // Shield and then pick up a Hurry, you will lose the Shield and begin
    // moving faster. The exception seems to be the stacking-effect of
    // multiple Hurry's: getting another Power-up such as Freeze will only
    // cancel the LAST Hurry". A letter is a bonus, not a power-up.
    if (powerUp.type !== 'letter') {
      this.clearActivePowerUps(powerUp.type);
    }

    switch (powerUp.type) {
      case 'speed':
        this.applySpeedBoost();
        break;

      case 'shield':
        d.marker.hasShield = true;
        break;

      case 'freeze':
        this.applyFreeze();
        break;

      case 'warp':
        // FAQ 2.3.1: the Warp "opens a small doorway at the point you picked
        // it up". Reaching it while open is what advances the level; picking
        // the power-up up does not by itself.
        d.warp = { x: powerUp.x, y: powerUp.y, openedAt: Date.now() };
        break;

      case 'oneUp':
        // FAQ 2.3.1: "An extremely rare bonus, which gives you one free life."
        d.lives++;
        break;

      case 'letter':
        this.collectLetter(powerUp.letter);
        break;
    }
  }

  /**
   * Take a letter.
   *
   * FAQ 2.3: "Collecting the Letters needed to spell the level's name will
   * not give you any points until you complete the level ... Getting Letters
   * you already have or which are not part of the current word give you an
   * instant 500 points."
   */
  private collectLetter(letter: string | undefined): void {
    const d = this.data;
    if (!letter) return;

    const needed = d.levelWord.includes(letter);
    const alreadyHave = d.collectedLetters.includes(letter);

    if (needed && !alreadyHave) {
      // Banked, not paid. The end-of-level bonus settles it.
      d.collectedLetters.push(letter);
      return;
    }

    d.score += SPARE_LETTER_POINTS;
  }

  /**
   * Drop whatever power-up is running, because a new one has been taken.
   * Hurry is the exception: only the most recent is cancelled, so a stack of
   * them keeps some of its benefit.
   */
  private clearActivePowerUps(incoming: PowerUpType): void {
    const d = this.data;

    if (incoming === 'speed') return;   // Hurries stack

    const lastSpeed = d.activeEffects.map(e => e.type).lastIndexOf('speed');
    if (lastSpeed >= 0) {
      d.activeEffects.splice(lastSpeed, 1);
      if (!d.activeEffects.some(e => e.type === 'speed')) {
        d.marker.speedBoost = false;
        d.marker.speedBoostTimer = 0;
      }
    }

    d.marker.hasShield = false;
    d.activeEffects = d.activeEffects.filter(e => e.type === 'speed');
  }

  /**
   * Apply speed boost effect
   */
  private applySpeedBoost(): void {
    const d = this.data;

    d.marker.speedBoost = true;
    d.marker.speedBoostTimer = Math.floor(SPEED_BOOST_DURATION / 33);

    // Add to active effects for tracking
    d.activeEffects.push({
      type: 'speed',
      remainingTime: SPEED_BOOST_DURATION
    });
  }

  /**
   * Apply freeze effect to all enemies
   */
  private applyFreeze(): void {
    const d = this.data;

    // Freeze Qix
    for (const qix of d.qixList) {
      qix.frozen = true;
      qix.frozenTimer = Math.floor(FREEZE_DURATION / 33);
    }

    // Freeze Sparx
    for (const sparx of d.sparxList) {
      sparx.frozen = true;
      sparx.frozenTimer = Math.floor(FREEZE_DURATION / 33);
    }

    // Add to active effects
    d.activeEffects.push({
      type: 'freeze',
      remainingTime: FREEZE_DURATION
    });
  }

  /**
   * Check if the level word is complete
   */
  private isWordComplete(): boolean {
    const d = this.data;
    if (!d.levelWord) return false;

    const needed = d.levelWord.split('');
    return needed.every(letter => d.collectedLetters.includes(letter));
  }

  /**
   * Update active effects (tick down timers)
   */
  updateEffects(): void {
    const d = this.data;

    // Update speed boost
    if (d.marker.speedBoost) {
      d.marker.speedBoostTimer--;
      if (d.marker.speedBoostTimer <= 0) {
        d.marker.speedBoost = false;
      }
    }

    // Update active effects list
    d.activeEffects = d.activeEffects.filter(effect => {
      effect.remainingTime -= 33;
      return effect.remainingTime > 0;
    });

    // Clean up old power-ups (expire after 30 seconds)
    const now = Date.now();
    d.powerUps = d.powerUps.filter(p =>
      p.collected || (now - p.spawnTime) < 30000
    );
  }

  /**
   * Get display string for collected letters
   */
  getLetterDisplay(): string {
    const d = this.data;
    if (!d.levelWord) return '';

    return d.levelWord.split('').map(letter =>
      d.collectedLetters.includes(letter) ? letter : '_'
    ).join(' ');
  }

  /**
   * Get active effects for HUD display
   */
  getActiveEffectsDisplay(): string[] {
    const d = this.data;
    const effects: string[] = [];

    if (d.marker.speedBoost) {
      effects.push('SPEED');
    }

    if (d.marker.hasShield) {
      effects.push('SHIELD');
    }

    const hasFreeze = d.activeEffects.some(e => e.type === 'freeze');
    if (hasFreeze) {
      effects.push('FREEZE');
    }

    return effects;
  }
}
