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
  QIX_SEGMENT_COUNT,
  SPARX_BASE_SPEED,
  SUPER_SPARX_SPEED_MULT,
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
  private createSparx(speedMult: number, index: number): Sparx {
    const d = this.data;
    d.sparxIdCounter = (d.sparxIdCounter || 0) + 1;

    // Start at different positions on the border
    const borderLength = d.borderPath.length;
    const startIndex = Math.floor((index / 4) * borderLength) % borderLength;
    const startPoint = d.borderPath[startIndex] || { x: 0, y: 0 };

    return {
      id: d.sparxIdCounter,
      x: startPoint.x,
      y: startPoint.y,
      pathIndex: startIndex,
      direction: index % 2 === 0 ? 1 : -1,
      speed: SPARX_BASE_SPEED * speedMult,
      isSuper: false,
      frozen: false,
      frozenTimer: 0
    };
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

    // Update Sparx
    const levelTime = Date.now() - d.levelStartTime;
    const config = this.getLevelConfig();

    for (const sparx of d.sparxList) {
      // Check for Super Sparx transformation
      if (!sparx.isSuper && levelTime > config.superSparxTime) {
        sparx.isSuper = true;
        sparx.speed *= SUPER_SPARX_SPEED_MULT;
      }

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
      superSparxTime: 30000,
      fuseSpeed: 2.0,
      targetPercent: 75,
      word: 'QIX',
      backgroundPattern: 'default'
    };
  }

  /**
   * Update a single Qix
   */
  private updateQix(qix: Qix): void {
    const d = this.data;

    // Move Qix
    const nextX = qix.x + qix.vx * 0.1;
    const nextY = qix.y + qix.vy * 0.1;

    // Check bounds and bounce
    let bounced = false;

    // Check collision with borders and claimed areas
    const checkX = Math.floor(nextX);
    const checkY = Math.floor(nextY);

    if (checkX <= 0 || checkX >= FIELD_WIDTH - 1) {
      qix.vx = -qix.vx;
      bounced = true;
    }

    if (checkY <= 0 || checkY >= FIELD_HEIGHT - 1) {
      qix.vy = -qix.vy;
      bounced = true;
    }

    // Check collision with claimed area
    if (!bounced && checkX >= 0 && checkX < FIELD_WIDTH && checkY >= 0 && checkY < FIELD_HEIGHT) {
      const cell = d.field[checkY][checkX];
      if (cell === 'claimed' || cell === 'border') {
        // Random bounce direction
        const angle = Math.random() * Math.PI * 2;
        qix.vx = Math.cos(angle) * qix.speed;
        qix.vy = Math.sin(angle) * qix.speed;
        bounced = true;
      }
    }

    // Update position
    if (!bounced) {
      qix.x = nextX;
      qix.y = nextY;
    } else {
      // Small random perturbation on bounce
      qix.x += (Math.random() - 0.5) * 0.5;
      qix.y += (Math.random() - 0.5) * 0.5;
    }

    // Keep in bounds
    qix.x = Math.max(1, Math.min(FIELD_WIDTH - 2, qix.x));
    qix.y = Math.max(1, Math.min(FIELD_HEIGHT - 2, qix.y));

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
   * Update a single Sparx
   */
  private updateSparx(sparx: Sparx): void {
    const d = this.data;

    if (d.borderPath.length === 0) return;

    // Move along border path
    sparx.pathIndex += sparx.direction * sparx.speed * 0.1;

    // Wrap around
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

    // Super Sparx can follow stix
    if (sparx.isSuper && d.currentStix && d.currentStix.points.length > 0) {
      // Check if near the start of stix
      const stixStart = d.currentStix.points[0];
      const dist = Math.abs(sparx.x - stixStart.x) + Math.abs(sparx.y - stixStart.y);

      if (dist <= 2) {
        // Start following stix
        // This would need more complex pathing - simplified for now
      }
    }
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
