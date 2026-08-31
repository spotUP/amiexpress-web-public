/**
 * Super Qix - Power-Up System
 * Handles power-up spawning, effects, and letter collection
 */

import {
  SuperQixData,
  PowerUp,
  PowerUpType,
  Marker,
  ActiveEffect,
  Point
} from './types';
import {
  FIELD_WIDTH,
  FIELD_HEIGHT,
  POWERUP_SPAWN_CHANCE,
  SPEED_BOOST_DURATION,
  FREEZE_DURATION,
  POWERUP_EFFECTS,
  SPARE_LETTER_POINTS,
  ONE_UP_CHANCE,
  POWERUP_DRIFT_SPEED,
  grantLife
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
  /**
   * @param filled the cells the claim just took, if any. FAQ 2.3 releases a
   *   bonus from the area you have just filled, so that is where it starts.
   */
  trySpawnPowerUp(filled?: Point[]): void {
    if (Math.random() > POWERUP_SPAWN_CHANCE) return;

    const d = this.data;

    const position = this.findSpawnPosition(filled);
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
    this.launch(powerUp);
  }

  /**
   * Send a freshly released bonus on its way (FAQ 2.3).
   *
   * "When created, Letters will tend to drift across the playing field in a
   * straight line towards the far wall, then move back around the edges. In
   * contrast, Power-ups will begin following the nearest lines ('stix')
   * already laid down". Both used to be dropped where they spawned and sit
   * there until they expired, which made catching one a matter of walking
   * to it rather than heading it off.
   */
  launch(powerUp: PowerUp): void {
    if (powerUp.type === 'letter') {
      // A letter FLIES. FAQ 2.3 has it drifting across the field, and it is
      // caught either by running into it or by taking the ground it is
      // flying over - so it has to stay out in the open where both are
      // possible, rather than settling onto the lines where only one is.
      const heading = this.farthestWall(powerUp);
      powerUp.drift = 'cross';
      powerUp.vx = heading.x;
      powerUp.vy = heading.y;
      return;
    }

    const line = this.nearestLine(powerUp);
    powerUp.drift = 'seek';
    powerUp.vx = line.x;
    powerUp.vy = line.y;
  }


  /** A unit heading towards whichever wall is farthest away. */
  private farthestWall(from: Point): Point {
    const left = from.x;
    const right = (FIELD_WIDTH - 1) - from.x;
    const up = from.y;
    const down = (FIELD_HEIGHT - 1) - from.y;

    const farthest = Math.max(left, right, up, down);
    if (farthest === right) return { x: 1, y: 0 };
    if (farthest === left) return { x: -1, y: 0 };
    if (farthest === down) return { x: 0, y: 1 };
    return { x: 0, y: -1 };
  }

  /** A unit heading towards the closest line the bonus could follow. */
  private nearestLine(from: Point): Point {
    const d = this.data;

    let best: Point | null = null;
    let bestDistance = Infinity;

    for (let y = 0; y < FIELD_HEIGHT; y++) {
      for (let x = 0; x < FIELD_WIDTH; x++) {
        const cell = d.field[y]?.[x];
        if (cell !== 'border' && cell !== 'claimed') continue;

        const distance = Math.hypot(x - from.x, y - from.y);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = { x, y };
        }
      }
    }

    if (!best || bestDistance === 0) return { x: 0, y: 0 };

    return {
      x: (best.x - from.x) / bestDistance,
      y: (best.y - from.y) / bestDistance,
    };
  }

  /**
   * Move every uncollected bonus one tick (FAQ 2.3).
   *
   * A Letter crosses the field until it meets a line, a Power-up makes
   * straight for the nearest one, and both then walk the lines - "but like
   * the Skulls, can sometimes get lost following internal lines which you
   * can't reach anymore", which falls out of following the same path the
   * Skulls patrol.
   */
  updateMovement(): void {
    const d = this.data;

    for (const powerUp of d.powerUps) {
      if (powerUp.collected) continue;
      if (!powerUp.drift) this.launch(powerUp);

      if (powerUp.drift === 'edge') {
        this.walkEdge(powerUp);
        continue;
      }

      const nextX = powerUp.x + (powerUp.vx ?? 0) * POWERUP_DRIFT_SPEED;
      const nextY = powerUp.y + (powerUp.vy ?? 0) * POWERUP_DRIFT_SPEED;
      const cell = d.field[Math.round(nextY)]?.[Math.round(nextX)];
      const blocked = !cell || cell === 'border' || cell === 'claimed';

      // A letter bounces off the edges of the open field and keeps flying.
      // It used to stop at the first line it met and walk the border from
      // there, which put it out of reach of a claim and left it circling
      // the frame instead of crossing the board.
      if (blocked && powerUp.type === 'letter') {
        this.bounce(powerUp);
        continue;
      }

      if (blocked) {
        // A power-up follows the lines, which is what FAQ 2.3 says it does.
        this.joinEdge(powerUp);
        continue;
      }

      powerUp.x = nextX;
      powerUp.y = nextY;
    }
  }

  /**
   * Turn a flying letter away from whatever it just met.
   *
   * Each axis is tried on its own, so a letter meeting a wall head-on
   * reverses and one meeting a corner reverses both - the same reflection
   * the Gremlin uses.
   */
  private bounce(powerUp: PowerUp): void {
    const d = this.data;
    const open = (x: number, y: number) => {
      const cell = d.field[Math.round(y)]?.[Math.round(x)];
      return cell === 'unclaimed' || cell === 'stix';
    };

    const vx = powerUp.vx ?? 0;
    const vy = powerUp.vy ?? 0;
    const step = POWERUP_DRIFT_SPEED;

    if (!open(powerUp.x + vx * step, powerUp.y)) powerUp.vx = -vx;
    if (!open(powerUp.x, powerUp.y + vy * step)) powerUp.vy = -vy;

    // Still boxed in - the claim closed around it - so turn right round.
    if (!open(powerUp.x + (powerUp.vx ?? 0) * step, powerUp.y + (powerUp.vy ?? 0) * step)) {
      powerUp.vx = -(powerUp.vx ?? 0);
      powerUp.vy = -(powerUp.vy ?? 0);
      return;
    }

    powerUp.x += (powerUp.vx ?? 0) * step;
    powerUp.y += (powerUp.vy ?? 0) * step;
  }

  /**
   * Take every bonus standing on ground the player has just claimed.
   *
   * FAQ 5.2's whole strategy is boxing letters in rather than chasing them
   * down: "you can sometimes zip out into the field and quickly catch them
   * before they get too far" is the alternative, not the only way.
   */
  collectEnclosed(cells: Point[]): void {
    if (cells.length === 0) return;

    const taken = new Set(cells.map(c => `${Math.round(c.x)},${Math.round(c.y)}`));

    for (const powerUp of this.data.powerUps) {
      if (powerUp.collected) continue;
      if (taken.has(`${Math.round(powerUp.x)},${Math.round(powerUp.y)}`)) {
        this.collectPowerUp(powerUp);
      }
    }
  }


  /** Anchor a bonus to the line network at the closest point on it. */
  private joinEdge(powerUp: PowerUp): void {
    const d = this.data;

    let bestIndex = 0;
    let bestDistance = Infinity;

    d.borderPath.forEach((point, index) => {
      const distance = Math.hypot(point.x - powerUp.x, point.y - powerUp.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });

    powerUp.drift = 'edge';
    powerUp.pathIndex = bestIndex;

    const anchor = d.borderPath[bestIndex];
    if (anchor) {
      powerUp.x = anchor.x;
      powerUp.y = anchor.y;
    }
  }

  /** One step along the lines. */
  private walkEdge(powerUp: PowerUp): void {
    const d = this.data;
    if (d.borderPath.length === 0) return;

    const direction = (powerUp.vx ?? 0) < 0 || (powerUp.vy ?? 0) < 0 ? -1 : 1;
    let index = (powerUp.pathIndex ?? 0) + direction * POWERUP_DRIFT_SPEED;

    if (index >= d.borderPath.length) index = 0;
    if (index < 0) index = d.borderPath.length - 1;

    powerUp.pathIndex = index;

    const point = d.borderPath[Math.floor(index)];
    if (point) {
      powerUp.x = point.x;
      powerUp.y = point.y;
    }
  }

  /**
   * Find a valid position to spawn a power-up
   */
  /**
   * Where a released bonus starts.
   *
   * FAQ 2.3: "Every time you fill an area of the picture (no matter how
   * small), there's a chance a random Letter or heart-shaped Power-up will
   * be released" - so it is released from the ground just filled.
   *
   * This used to scan the whole board for a claimed cell touching open
   * field, and only between x,y of 2 and FIELD-2. A claim hugging an edge -
   * which is what almost every claim is, and what FAQ 5.2's strategy is
   * built on - lands on the row that scan excludes, so it found nothing and
   * no bonus was ever released. Nobody had seen a letter.
   */
  private findSpawnPosition(filled?: Point[]): { x: number; y: number } | null {
    const d = this.data;

    const inField = (p: Point) =>
      p.x > 0 && p.x < FIELD_WIDTH - 1 && p.y > 0 && p.y < FIELD_HEIGHT - 1;

    // The ground just taken, preferring an edge of it so the bonus is out
    // where it can be chased rather than buried in the middle.
    if (filled && filled.length > 0) {
      const inside = filled.filter(inField);
      const pool = inside.length > 0 ? inside : filled;

      const edges = pool.filter(p =>
        [
          d.field[p.y - 1]?.[p.x], d.field[p.y + 1]?.[p.x],
          d.field[p.y]?.[p.x - 1], d.field[p.y]?.[p.x + 1],
        ].some(cell => cell === 'unclaimed')
      );

      const from = edges.length > 0 ? edges : pool;
      return { ...from[Math.floor(Math.random() * from.length)] };
    }

    // Nothing was handed in: fall back to any claimed edge on the board.
    const candidates: Point[] = [];
    for (let y = 1; y < FIELD_HEIGHT - 1; y++) {
      for (let x = 1; x < FIELD_WIDTH - 1; x++) {
        if (d.field[y][x] !== 'claimed') continue;

        const touchesOpen = [
          d.field[y - 1]?.[x], d.field[y + 1]?.[x],
          d.field[y]?.[x - 1], d.field[y]?.[x + 1],
        ].some(cell => cell === 'unclaimed');

        if (touchesOpen) candidates.push({ x, y });
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
        // Through grantLife, so the ceiling holds however the life arrives.
        grantLife(d);
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
