/**
 * Super Qix - Enemy System
 * Handles Qix, Sparx, and Fuse behavior
 */

import {
  SuperQixData,
  Qix,
  Sparx,
  Fuse,
  Point,
  LevelConfig
} from './types';
import {
  FIELD_WIDTH,
  FIELD_HEIGHT,
  QIX_BASE_SPEED,
  QIX_BASE_PULL,
  QIX_LEVEL_PULL,
  QIX_DRAWING_PULL,
  QIX_MAX_PULL,
  QIX_SPLIT_FROM_LEVEL,
  QIX_SPLIT_CHANCE_PER_TICK,
  QIX_MAX_COPIES,
  QIX_SEGMENT_COUNT,
  SPARX_BASE_SPEED,
  SKULLS_AT_LEVEL_START,
  SKULL_REVERSE_COOLDOWN_MS,
  FUSE_BASE_SPEED
} from './constants';

/**
 * Enemy system managing Qix, Sparx, and Fuse
 */
export class EnemySystem {
  private data: SuperQixData;

  constructor(data: SuperQixData) {
    this.data = data;
  }

  /**
   * Initialize enemies for a level
   */
  initLevel(config: LevelConfig): void {
    const d = this.data;

    // Clear existing enemies
    d.qixList = [];
    d.sparxList = [];
    d.fuse = null;

    // Spawn Qix
    for (let i = 0; i < config.qixCount; i++) {
      d.qixList.push(this.createQix(config.qixSpeed, i));
    }

    // Spawn Sparx
    for (let i = 0; i < config.sparxCount; i++) {
      d.sparxList.push(this.createSparx(config.sparxSpeed, i));
    }
  }

  /**
   * Create a new Qix
   */
  private createQix(speedMult: number, index: number): Qix {
    const d = this.data;
    d.qixIdCounter = (d.qixIdCounter || 0) + 1;

    // Random position in unclaimed area
    const x = 10 + Math.random() * (FIELD_WIDTH - 20);
    const y = 5 + Math.random() * (FIELD_HEIGHT - 10);

    // Random initial velocity
    const angle = Math.random() * Math.PI * 2;
    const speed = QIX_BASE_SPEED * speedMult;

    // Create visual segments
    const segments: Point[] = [];
    for (let i = 0; i < QIX_SEGMENT_COUNT; i++) {
      segments.push({
        x: x + (Math.random() - 0.5) * 4,
        y: y + (Math.random() - 0.5) * 4
      });
    }

    return {
      id: d.qixIdCounter,
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      speed,
      segments,
      frozen: false,
      frozenTimer: 0
    };
  }

  /**
   * Create a new Sparx
   */
  /**
   * Create a Skull.
   *
   * FAQ 2.2: "Two of these start directly opposite you at the beginning of
   * each level, and move in opposite directions around the edge of the
   * screen." Opposite means half a lap round the border path from the
   * marker, and the pair then walks away from each other.
   */
  private createSparx(speedMult: number, index: number): Sparx {
    const d = this.data;
    d.sparxIdCounter = (d.sparxIdCounter || 0) + 1;

    const startIndex = this.oppositeMarkerIndex();
    const startPoint = d.borderPath[startIndex] || { x: 0, y: 0 };

    return {
      id: d.sparxIdCounter,
      x: startPoint.x,
      y: startPoint.y,
      pathIndex: startIndex,
      direction: index % 2 === 0 ? 1 : -1,
      speed: SPARX_BASE_SPEED * speedMult,
      lastReversedAt: 0,
      frozen: false,
      frozenTimer: 0
    };
  }

  /**
   * The point on the border path directly opposite the marker - half a lap
   * away, so a Skull released there is as far from the player as the path
   * allows.
   */
  private oppositeMarkerIndex(): number {
    const d = this.data;
    const length = d.borderPath.length;
    if (length === 0) return 0;

    let markerIndex = 0;
    let best = Infinity;
    for (let i = 0; i < length; i++) {
      const p = d.borderPath[i];
      const dist = Math.abs(p.x - d.marker.x) + Math.abs(p.y - d.marker.y);
      if (dist < best) {
        best = dist;
        markerIndex = i;
      }
    }

    return (markerIndex + Math.floor(length / 2)) % length;
  }

  /**
   * Release more Skulls onto the field.
   *
   * FAQ 1: when the Time Meter fills, "two more Skulls are released onto the
   * field and the counter resets"; FAQ 2.2 says they come from the
   * centre-top. They join the ones already patrolling.
   */
  releaseSkulls(count: number, speedMult: number = 1): void {
    const d = this.data;
    const length = d.borderPath.length;

    for (let i = 0; i < count; i++) {
      d.sparxIdCounter = (d.sparxIdCounter || 0) + 1;

      // Centre-top of the border.
      let index = 0;
      let best = Infinity;
      const targetX = Math.floor(FIELD_WIDTH / 2);
      for (let j = 0; j < length; j++) {
        const p = d.borderPath[j];
        const dist = Math.abs(p.x - targetX) + p.y;
        if (dist < best) {
          best = dist;
          index = j;
        }
      }

      const point = d.borderPath[index] || { x: targetX, y: 0 };
      d.sparxList.push({
        id: d.sparxIdCounter,
        x: point.x,
        y: point.y,
        pathIndex: index,
        direction: i % 2 === 0 ? 1 : -1,
        speed: SPARX_BASE_SPEED * speedMult,
        lastReversedAt: 0,
        frozen: false,
        frozenTimer: 0
      });
    }
  }

  /**
   * Cull the Skulls back to the two a level starts with.
   *
   * FAQ 2.2: "If you should die, all but two Skulls will disappear."
   */
  cullSkullsAfterDeath(): void {
    const d = this.data;
    if (d.sparxList.length > SKULLS_AT_LEVEL_START) {
      d.sparxList = d.sparxList.slice(0, SKULLS_AT_LEVEL_START);
    }
  }

  /**
   * Main update loop
   */
  update(): void {
    const d = this.data;

    // Update Qix
    for (const qix of d.qixList) {
      if (!qix.frozen) {
        this.updateQix(qix);
      } else {
        qix.frozenTimer--;
        if (qix.frozenTimer <= 0) {
          qix.frozen = false;
        }
      }
    }

    // The Gremlin may divide on later levels.
    this.maybeSplitQix();

    // Update Skulls. They never promote: FAQ 2.5.3 says Super Qix has no
    // Super Skulls that chase the player up an unfinished line.
    for (const sparx of d.sparxList) {
      if (!sparx.frozen) {
        this.updateSparx(sparx);
      } else {
        sparx.frozenTimer--;
        if (sparx.frozenTimer <= 0) {
          sparx.frozen = false;
        }
      }
    }
  }

  /**
   * Get current level config
   */
  private getLevelConfig(): LevelConfig {
    // Import would cause circular dependency, so inline simple version
    return {
      number: this.data.level,
      qixCount: 1,
      qixSpeed: 1.0,
      sparxCount: 2,
      sparxSpeed: 1.0,
      timeMeterMs: 30000,
      fuseSpeed: 2.0,
      targetPercent: 75,
      word: 'QIX',
      backgroundPattern: 'default'
    };
  }

  /**
   * Nearest unclaimed cell to a point, searched outwards in rings.
   *
   * Used to free a Qix that ended up inside claimed ground - which happens
   * when a completed stix converts the cells it is standing on.
   */
  private findNearestOpenCell(x: number, y: number): Point | null {
    const startX = Math.floor(x);
    const startY = Math.floor(y);
    const maxRadius = Math.max(FIELD_WIDTH, FIELD_HEIGHT);

    for (let r = 1; r < maxRadius; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          // Only the perimeter of this ring; the inside was already searched.
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;

          const cx = startX + dx;
          const cy = startY + dy;
          if (cx < 1 || cx > FIELD_WIDTH - 2) continue;
          if (cy < 1 || cy > FIELD_HEIGHT - 2) continue;
          if (this.data.field[cy]?.[cx] !== 'unclaimed') continue;

          // Centre of the cell, so it is not sitting on a boundary.
          return { x: cx + 0.5, y: cy + 0.5 };
        }
      }
    }

    return null;
  }

  /**
   * How strongly the Gremlin steers towards the marker, 0 (pure wander) to
   * 1 (straight at them).
   *
   * There is always a slight lean, so it drifts into whichever corner the
   * player is working in. Detaching to draw raises it, and on later levels
   * it rises further - the "zoom towards you every time you detach" the FAQ
   * describes for the upper levels.
   */
  private markerPull(): number {
    const d = this.data;

    const levelFactor = Math.min(1, (d.level - 1) / 15);   // 0 at L1, 1 at L16
    const base = QIX_BASE_PULL + levelFactor * QIX_LEVEL_PULL;

    if (!d.marker.isDrawing) return base;
    return Math.min(QIX_MAX_PULL, base + QIX_DRAWING_PULL * (0.5 + levelFactor));
  }

  /**
   * Split a Gremlin in two.
   *
   * FAQ 2.2: "In later levels, the Gremlin will actually split into multiple
   * independently-moving copies of himself", and FAQ 2.5.3 notes there is
   * "usually only one Gremlin in Super Qix (though he sometimes divides into
   * two or more during a level)". The copy starts where the original is,
   * heading the other way.
   */
  splitQix(qix: Qix): Qix | null {
    const d = this.data;
    if (d.qixList.length >= QIX_MAX_COPIES) return null;

    d.qixIdCounter = (d.qixIdCounter || 0) + 1;
    const copy: Qix = {
      id: d.qixIdCounter,
      x: qix.x,
      y: qix.y,
      vx: -qix.vx,
      vy: -qix.vy,
      speed: qix.speed,
      segments: qix.segments.map(s => ({ ...s })),
      frozen: qix.frozen,
      frozenTimer: qix.frozenTimer,
    };

    d.qixList.push(copy);
    return copy;
  }

  /**
   * Should the Gremlin divide this tick?
   *
   * Only on later levels, and only rarely, so a level normally has the one
   * Gremlin the FAQ describes.
   */
  maybeSplitQix(): void {
    const d = this.data;
    if (d.level < QIX_SPLIT_FROM_LEVEL) return;
    if (d.qixList.length >= QIX_MAX_COPIES) return;
    if (Math.random() >= QIX_SPLIT_CHANCE_PER_TICK) return;

    const original = d.qixList[0];
    if (original) this.splitQix(original);
  }

  /**
   * Is this position off limits to a Qix?
   *
   * The Qix roams the unclaimed interior only. The playable range is the
   * non-border cells, x in [1, FIELD_WIDTH-2] and y in [1, FIELD_HEIGHT-2] -
   * the SAME range the movement code keeps it inside, so the bounce test and
   * the bounds can never disagree.
   *
   * A stix is deliberately not blocking: running over the player's line is
   * how the Qix kills, and checkQixCollision handles that.
   */
  private isBlockedForQix(x: number, y: number): boolean {
    const cx = Math.floor(x);
    const cy = Math.floor(y);

    if (cx < 1 || cx > FIELD_WIDTH - 2) return true;
    if (cy < 1 || cy > FIELD_HEIGHT - 2) return true;

    const cell = this.data.field[cy]?.[cx];
    return cell === 'claimed' || cell === 'border';
  }

  /**
   * Update a single Qix
   *
   * Previously the Qix glued itself to the edge of the playfield and stopped
   * moving: the bounce test fired at FIELD_HEIGHT-1 (the border row) but the
   * position was then clamped to FIELD_HEIGHT-2, so in the gap between the
   * two the Qix was pushed back every tick without its velocity ever being
   * reversed. vy stayed at full speed into the wall forever, the random
   * per-bounce jitter shook the other axis down to nothing, and it parked on
   * the bottom row - measured at 98% of ticks against a wall, moving on only
   * 2% of them, visiting 13 of 576 cells. That is also why it killed the
   * player on nearly every draw: it sat exactly where the marker starts.
   *
   * Movement is now axis-separated reflection against isBlockedForQix, so a
   * wall reverses the component that hit it and the Qix keeps its speed.
   */
  private updateQix(qix: Qix): void {
    const step = 0.1;
    let nextX = qix.x + qix.vx * step;
    let nextY = qix.y + qix.vy * step;

    // Reflect each axis independently, so sliding along a wall works and a
    // head-on hit reverses only the component that struck it.
    if (this.isBlockedForQix(nextX, qix.y)) {
      qix.vx = -qix.vx;
      nextX = qix.x;
    }
    if (this.isBlockedForQix(qix.x, nextY)) {
      qix.vy = -qix.vy;
      nextY = qix.y;
    }

    if (!this.isBlockedForQix(nextX, nextY)) {
      qix.x = nextX;
      qix.y = nextY;
    } else {
      // Interior corner: both axes were individually fine but the diagonal
      // is not. Reverse completely rather than tunnelling through it.
      qix.vx = -qix.vx;
      qix.vy = -qix.vy;
    }

    // Keep the Qix wandering rather than tracing one straight line forever.
    // The nudge rotates the direction and preserves the speed, so it cannot
    // decay the way the old positional jitter did.
    //
    // FAQ 2.2: the Gremlin's bounce is "random in pattern, though apparently
    // weighted somewhat towards your marker - he will tend to find his way
    // into whichever corner of the field you happen to be working in", and
    // "in later levels ... he will get extremely aggressive and zoom towards
    // you every time you detach from a wall". So the nudge is pulled towards
    // the marker rather than being uniformly random, and pulled harder while
    // the player is drawing on a later level.
    if (Math.random() < 0.05) {
      const speed = Math.hypot(qix.vx, qix.vy) || qix.speed;
      const current = Math.atan2(qix.vy, qix.vx);
      const wander = (Math.random() - 0.5) * 0.8;

      const towardsMarker = Math.atan2(
        this.data.marker.y - qix.y,
        this.data.marker.x - qix.x
      );
      const pull = this.markerPull();

      // Shortest way round from the current heading to the marker's.
      let turn = towardsMarker - current;
      while (turn > Math.PI) turn -= Math.PI * 2;
      while (turn < -Math.PI) turn += Math.PI * 2;

      const angle = current + wander + turn * pull;
      qix.vx = Math.cos(angle) * speed;
      qix.vy = Math.sin(angle) * speed;
    }

    // Last resort: if the Qix is somehow inside claimed ground (the player's
    // completed line converts cells underneath it), walk it back to open
    // space instead of letting it sit there stuck.
    if (this.isBlockedForQix(qix.x, qix.y)) {
      const escape = this.findNearestOpenCell(qix.x, qix.y);
      if (escape) {
        qix.x = escape.x;
        qix.y = escape.y;
      }
    }

    // Update visual segments (trailing effect)
    for (let i = qix.segments.length - 1; i > 0; i--) {
      qix.segments[i] = { ...qix.segments[i - 1] };
    }
    qix.segments[0] = { x: qix.x, y: qix.y };

    // Add random perturbation to segments
    for (let i = 1; i < qix.segments.length; i++) {
      qix.segments[i].x += (Math.random() - 0.5) * 0.5;
      qix.segments[i].y += (Math.random() - 0.5) * 0.5;
    }
  }

  /**
   * Re-anchor every Sparx's pathIndex after d.borderPath has been rebuilt.
   *
   * updateBorderPath() rebuilds the array by re-scanning the field, so a
   * claim can change both its length and the order of its points - the old
   * pathIndex no longer names the same physical cell. Left unfixed, the next
   * updateSparx() snaps sparx.x/y to whatever cell the stale index now
   * lands on, which can be right on top of the marker that just finished
   * drawing and trips checkSparxCollision. Re-anchoring to the nearest
   * point keeps each Sparx where it visually was.
   */
  reanchorBorderPositions(): void {
    const d = this.data;
    if (d.borderPath.length === 0) return;

    for (const sparx of d.sparxList) {
      let bestIndex = 0;
      let bestDist = Infinity;

      for (let i = 0; i < d.borderPath.length; i++) {
        const p = d.borderPath[i];
        const dist = Math.abs(p.x - sparx.x) + Math.abs(p.y - sparx.y);
        if (dist < bestDist) {
          bestDist = dist;
          bestIndex = i;
        }
      }

      sparx.pathIndex = bestIndex;
      const anchor = d.borderPath[bestIndex];
      sparx.x = anchor.x;
      sparx.y = anchor.y;
    }
  }

  /**
   * Update a single Sparx
   */
  private updateSparx(sparx: Sparx): void {
    const d = this.data;

    if (d.borderPath.length === 0) return;

    // Move along border path
    sparx.pathIndex += sparx.direction * sparx.speed * 0.1;

    // Wrap around rather than reversing: FAQ 2.2 says a Skull never
    // instantly turns round on a line, so reaching the end of the path
    // continues the same way about, it does not bounce back.
    if (sparx.pathIndex >= d.borderPath.length) {
      sparx.pathIndex = 0;
    } else if (sparx.pathIndex < 0) {
      sparx.pathIndex = d.borderPath.length - 1;
    }

    // Update position
    const pathPoint = d.borderPath[Math.floor(sparx.pathIndex)];
    if (pathPoint) {
      sparx.x = pathPoint.x;
      sparx.y = pathPoint.y;
    }

  }

  /**
   * Turn a Skull round, if it is allowed to.
   *
   * FAQ 2.2: "Skulls will never instantly reverse direction on a line (i.e.
   * after you dodge around one by drawing a small box, they can't
   * immediately turn around and chase you)". A reversal is therefore
   * refused while one is still fresh.
   */
  reverseSkull(sparx: Sparx, now: number = Date.now()): boolean {
    if (now - sparx.lastReversedAt < SKULL_REVERSE_COOLDOWN_MS) return false;

    sparx.direction = sparx.direction === 1 ? -1 : 1;
    sparx.lastReversedAt = now;
    return true;
  }

  /**
   * Update fuse (burns along stix when player stops)
   */
  updateFuse(stixPoints: Point[]): void {
    const d = this.data;

    if (stixPoints.length === 0) return;

    if (!d.fuse) {
      // Start fuse at beginning of stix
      const startPoint = stixPoints[0];
      d.fuse = {
        x: startPoint.x,
        y: startPoint.y,
        pathIndex: 0,
        active: true,
        burnSpeed: FUSE_BASE_SPEED
      };
    }

    if (!d.fuse.active) return;

    // Advance fuse along stix
    d.fuse.pathIndex += d.fuse.burnSpeed * 0.1;

    if (d.fuse.pathIndex >= stixPoints.length) {
      // Fuse reached player - will be handled in collision check
      d.fuse.pathIndex = stixPoints.length - 1;
    }

    // Update fuse position
    const fusePoint = stixPoints[Math.floor(d.fuse.pathIndex)];
    if (fusePoint) {
      d.fuse.x = fusePoint.x;
      d.fuse.y = fusePoint.y;
    }
  }

  /**
   * Check Qix collision with marker or stix
   */
  checkQixCollision(marker: Point, stix: Point[]): boolean {
    const d = this.data;

    for (const qix of d.qixList) {
      // Check marker collision
      const markerDist = Math.abs(qix.x - marker.x) + Math.abs(qix.y - marker.y);
      if (markerDist < 1.5) {
        return true;
      }

      // Check stix collision
      for (const point of stix) {
        const stixDist = Math.abs(qix.x - point.x) + Math.abs(qix.y - point.y);
        if (stixDist < 1.5) {
          return true;
        }
      }

      // Check segment collisions
      for (const seg of qix.segments) {
        const segMarkerDist = Math.abs(seg.x - marker.x) + Math.abs(seg.y - marker.y);
        if (segMarkerDist < 1.5) {
          return true;
        }

        for (const point of stix) {
          const segStixDist = Math.abs(seg.x - point.x) + Math.abs(seg.y - point.y);
          if (segStixDist < 1.5) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Check Sparx collision with marker
   */
  checkSparxCollision(marker: Point): boolean {
    const d = this.data;

    // FAQ 2.1: "When you are Drawing a line, the Skulls can't reach
    // you" - they travel the lines, and the player is out in the open
    // field. Only the Gremlin is a danger then.
    if (d.marker.isDrawing) return false;

    for (const sparx of d.sparxList) {
      const dist = Math.abs(sparx.x - marker.x) + Math.abs(sparx.y - marker.y);
      if (dist < 1.2) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check Fuse collision with marker
   */
  checkFuseCollision(marker: Point): boolean {
    const d = this.data;

    if (!d.fuse || !d.fuse.active) return false;

    const dist = Math.abs(d.fuse.x - marker.x) + Math.abs(d.fuse.y - marker.y);
    return dist < 1.2;
  }

  /**
   * Freeze all enemies
   */
  freezeEnemies(duration: number): void {
    const d = this.data;
    const ticks = Math.floor(duration / 33);  // Convert ms to ticks

    for (const qix of d.qixList) {
      qix.frozen = true;
      qix.frozenTimer = ticks;
    }

    for (const sparx of d.sparxList) {
      sparx.frozen = true;
      sparx.frozenTimer = ticks;
    }

    // Also freeze fuse
    if (d.fuse) {
      d.fuse.active = false;
    }
  }

  /**
   * Reset fuse (when player starts moving again)
   */
  resetFuse(): void {
    const d = this.data;
    d.fuse = null;
  }
}
