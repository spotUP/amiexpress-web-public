/**
 * Super Qix - Enemy System
 * Handles Qix, Sparx, and Fuse behavior
 */
import { FIELD_WIDTH, FIELD_HEIGHT, QIX_BASE_SPEED, QIX_SEGMENT_COUNT, SPARX_BASE_SPEED, SUPER_SPARX_SPEED_MULT, FUSE_BASE_SPEED } from './constants';
/**
 * Enemy system managing Qix, Sparx, and Fuse
 */
export class EnemySystem {
    constructor(data) {
        this.data = data;
    }
    /**
     * Initialize enemies for a level
     */
    initLevel(config) {
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
    createQix(speedMult, index) {
        const d = this.data;
        d.qixIdCounter = (d.qixIdCounter || 0) + 1;
        // Random position in unclaimed area
        const x = 10 + Math.random() * (FIELD_WIDTH - 20);
        const y = 5 + Math.random() * (FIELD_HEIGHT - 10);
        // Random initial velocity
        const angle = Math.random() * Math.PI * 2;
        const speed = QIX_BASE_SPEED * speedMult;
        // Create visual segments
        const segments = [];
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
    createSparx(speedMult, index) {
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
    update() {
        const d = this.data;
        // Update Qix
        for (const qix of d.qixList) {
            if (!qix.frozen) {
                this.updateQix(qix);
            }
            else {
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
            }
            else {
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
    getLevelConfig() {
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
     * Nearest unclaimed cell to a point, searched outwards in rings.
     *
     * Used to free a Qix that ended up inside claimed ground - which happens
     * when a completed stix converts the cells it is standing on.
     */
    findNearestOpenCell(x, y) {
        const startX = Math.floor(x);
        const startY = Math.floor(y);
        const maxRadius = Math.max(FIELD_WIDTH, FIELD_HEIGHT);
        for (let r = 1; r < maxRadius; r++) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    // Only the perimeter of this ring; the inside was already searched.
                    if (Math.abs(dx) !== r && Math.abs(dy) !== r)
                        continue;
                    const cx = startX + dx;
                    const cy = startY + dy;
                    if (cx < 1 || cx > FIELD_WIDTH - 2)
                        continue;
                    if (cy < 1 || cy > FIELD_HEIGHT - 2)
                        continue;
                    if (this.data.field[cy]?.[cx] !== 'unclaimed')
                        continue;
                    // Centre of the cell, so it is not sitting on a boundary.
                    return { x: cx + 0.5, y: cy + 0.5 };
                }
            }
        }
        return null;
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
    isBlockedForQix(x, y) {
        const cx = Math.floor(x);
        const cy = Math.floor(y);
        if (cx < 1 || cx > FIELD_WIDTH - 2)
            return true;
        if (cy < 1 || cy > FIELD_HEIGHT - 2)
            return true;
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
    updateQix(qix) {
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
        }
        else {
            // Interior corner: both axes were individually fine but the diagonal
            // is not. Reverse completely rather than tunnelling through it.
            qix.vx = -qix.vx;
            qix.vy = -qix.vy;
        }
        // Keep the Qix wandering rather than tracing one straight line forever.
        // The nudge rotates the direction and preserves the speed, so it cannot
        // decay the way the old positional jitter did.
        if (Math.random() < 0.05) {
            const speed = Math.hypot(qix.vx, qix.vy) || qix.speed;
            const angle = Math.atan2(qix.vy, qix.vx) + (Math.random() - 0.5) * 0.8;
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
    reanchorBorderPositions() {
        const d = this.data;
        if (d.borderPath.length === 0)
            return;
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
    updateSparx(sparx) {
        const d = this.data;
        if (d.borderPath.length === 0)
            return;
        // Move along border path
        sparx.pathIndex += sparx.direction * sparx.speed * 0.1;
        // Wrap around
        if (sparx.pathIndex >= d.borderPath.length) {
            sparx.pathIndex = 0;
        }
        else if (sparx.pathIndex < 0) {
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
    updateFuse(stixPoints) {
        const d = this.data;
        if (stixPoints.length === 0)
            return;
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
        if (!d.fuse.active)
            return;
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
    checkQixCollision(marker, stix) {
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
    checkSparxCollision(marker) {
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
    checkFuseCollision(marker) {
        const d = this.data;
        if (!d.fuse || !d.fuse.active)
            return false;
        const dist = Math.abs(d.fuse.x - marker.x) + Math.abs(d.fuse.y - marker.y);
        return dist < 1.2;
    }
    /**
     * Freeze all enemies
     */
    freezeEnemies(duration) {
        const d = this.data;
        const ticks = Math.floor(duration / 33); // Convert ms to ticks
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
    resetFuse() {
        const d = this.data;
        d.fuse = null;
    }
}
