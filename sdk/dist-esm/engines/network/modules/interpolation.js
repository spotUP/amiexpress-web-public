/**
 * Entity Interpolation Module
 *
 * Smooth entity movement between network updates with:
 * - Position interpolation (linear, cubic, hermite)
 * - Rotation interpolation (quaternion slerp)
 * - Extrapolation for prediction
 * - Dead reckoning (physics-based prediction)
 * - Snap threshold for teleportation
 */
import { EventEmitter } from 'events';
// Default interpolation configuration
const DEFAULT_CONFIG = {
    method: 'linear',
    bufferSize: 10,
    bufferTime: 100,
    extrapolationLimit: 200,
    snapThreshold: 500,
    rotationSnapThreshold: 0.5,
};
/**
 * Interpolation Engine
 *
 * Provides smooth movement interpolation between network updates.
 */
export class InterpolationEngine extends EventEmitter {
    constructor(config = {}) {
        super();
        this.name = 'interpolation';
        this.entities = new Map();
        this.renderTime = 0;
        this.config = { ...DEFAULT_CONFIG, ...config };
    }
    /**
     * Initialize interpolation engine
     */
    async init() {
        // Nothing to initialize
    }
    /**
     * Configure interpolation
     */
    configure(config) {
        this.config = { ...this.config, ...config };
    }
    /**
     * Add snapshot for entity
     */
    addSnapshot(entityId, snapshot) {
        let buffer = this.entities.get(entityId);
        if (!buffer) {
            buffer = {
                snapshots: [],
                lastUpdate: Date.now(),
            };
            this.entities.set(entityId, buffer);
        }
        // Check for teleportation (snap)
        if (buffer.snapshots.length > 0) {
            const lastSnapshot = buffer.snapshots[buffer.snapshots.length - 1];
            const distance = this.vectorDistance(lastSnapshot.position, snapshot.position);
            if (distance > this.config.snapThreshold) {
                // Clear buffer on teleport
                buffer.snapshots = [];
                this.emit('entity:teleported', entityId, snapshot.position);
            }
        }
        buffer.snapshots.push(snapshot);
        buffer.lastUpdate = Date.now();
        // Trim buffer
        while (buffer.snapshots.length > this.config.bufferSize) {
            buffer.snapshots.shift();
        }
    }
    /**
     * Get interpolated entity state
     */
    getInterpolated(entityId, time) {
        const buffer = this.entities.get(entityId);
        if (!buffer || buffer.snapshots.length === 0) {
            return null;
        }
        const renderTime = time ?? (Date.now() - this.config.bufferTime);
        // Find snapshots to interpolate between
        let before = null;
        let after = null;
        for (let i = 0; i < buffer.snapshots.length - 1; i++) {
            if (buffer.snapshots[i].timestamp <= renderTime &&
                buffer.snapshots[i + 1].timestamp >= renderTime) {
                before = buffer.snapshots[i];
                after = buffer.snapshots[i + 1];
                break;
            }
        }
        // Extrapolation if we're ahead of our buffer
        if (!before && !after && buffer.snapshots.length >= 2) {
            const last = buffer.snapshots[buffer.snapshots.length - 1];
            const secondLast = buffer.snapshots[buffer.snapshots.length - 2];
            if (renderTime > last.timestamp) {
                const extrapolationTime = renderTime - last.timestamp;
                if (extrapolationTime <= this.config.extrapolationLimit) {
                    return this.extrapolate(secondLast, last, renderTime, buffer.deadReckoning);
                }
                else {
                    // Beyond extrapolation limit, return last known state
                    return {
                        entityId,
                        position: last.position,
                        rotation: last.rotation,
                        velocity: last.velocity,
                        interpolationFactor: 1,
                        isExtrapolating: true,
                    };
                }
            }
        }
        // No snapshots to interpolate
        if (!before) {
            const latest = buffer.snapshots[buffer.snapshots.length - 1];
            return {
                entityId,
                position: latest.position,
                rotation: latest.rotation,
                velocity: latest.velocity,
                interpolationFactor: 1,
                isExtrapolating: false,
            };
        }
        if (!after) {
            return {
                entityId,
                position: before.position,
                rotation: before.rotation,
                velocity: before.velocity,
                interpolationFactor: 0,
                isExtrapolating: false,
            };
        }
        // Calculate interpolation factor
        const duration = after.timestamp - before.timestamp;
        const elapsed = renderTime - before.timestamp;
        const t = Math.max(0, Math.min(1, elapsed / duration));
        // Interpolate based on method
        let position;
        let rotation;
        switch (this.config.method) {
            case 'cubic':
                position = this.cubicInterpolate(buffer.snapshots, renderTime);
                rotation = this.slerpQuaternion(before.rotation, after.rotation, t);
                break;
            case 'hermite':
                position = this.hermiteInterpolate(before, after, t);
                rotation = this.slerpQuaternion(before.rotation, after.rotation, t);
                break;
            case 'catmull-rom':
                position = this.catmullRomInterpolate(buffer.snapshots, renderTime);
                rotation = this.slerpQuaternion(before.rotation, after.rotation, t);
                break;
            case 'linear':
            default:
                position = this.lerpVector(before.position, after.position, t);
                rotation = this.slerpQuaternion(before.rotation, after.rotation, t);
                break;
        }
        // Interpolate velocity if available
        let velocity;
        if (before.velocity && after.velocity) {
            velocity = this.lerpVector(before.velocity, after.velocity, t);
        }
        return {
            entityId,
            position,
            rotation,
            velocity,
            interpolationFactor: t,
            isExtrapolating: false,
        };
    }
    /**
     * Extrapolate entity position
     */
    extrapolate(secondLast, last, time, deadReckoning) {
        const dt = (time - last.timestamp) / 1000; // Convert to seconds
        const dtSnapshots = (last.timestamp - secondLast.timestamp) / 1000;
        let position;
        if (deadReckoning?.enabled && last.velocity) {
            // Physics-based extrapolation
            position = this.applyDeadReckoning(last, dt, deadReckoning);
        }
        else {
            // Linear velocity extrapolation
            const vx = (last.position.x - secondLast.position.x) / dtSnapshots;
            const vy = (last.position.y - secondLast.position.y) / dtSnapshots;
            const vz = (last.position.z - secondLast.position.z) / dtSnapshots;
            position = {
                x: last.position.x + vx * dt,
                y: last.position.y + vy * dt,
                z: last.position.z + vz * dt,
            };
        }
        // Extrapolate rotation (simple linear)
        const rotDt = (last.timestamp - secondLast.timestamp) / 1000;
        const angVelX = (last.rotation.x - secondLast.rotation.x) / rotDt;
        const angVelY = (last.rotation.y - secondLast.rotation.y) / rotDt;
        const angVelZ = (last.rotation.z - secondLast.rotation.z) / rotDt;
        const angVelW = (last.rotation.w - secondLast.rotation.w) / rotDt;
        const rotation = this.normalizeQuaternion({
            x: last.rotation.x + angVelX * dt,
            y: last.rotation.y + angVelY * dt,
            z: last.rotation.z + angVelZ * dt,
            w: last.rotation.w + angVelW * dt,
        });
        return {
            entityId: last.entityId,
            position,
            rotation,
            velocity: last.velocity,
            interpolationFactor: 1 + dt,
            isExtrapolating: true,
        };
    }
    /**
     * Apply dead reckoning physics
     */
    applyDeadReckoning(snapshot, dt, config) {
        const v = snapshot.velocity;
        const physics = config.physics || { gravity: 0, friction: 0, maxSpeed: Infinity };
        // Apply gravity
        let vy = v.y - physics.gravity * dt;
        // Apply friction (simplified)
        const speed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
        let factor = 1;
        if (speed > 0 && physics.friction > 0) {
            factor = Math.max(0, 1 - physics.friction * dt);
        }
        // Clamp to max speed
        const newSpeed = speed * factor;
        if (newSpeed > physics.maxSpeed) {
            factor = physics.maxSpeed / speed;
        }
        return {
            x: snapshot.position.x + v.x * factor * dt,
            y: snapshot.position.y + vy * dt,
            z: snapshot.position.z + v.z * factor * dt,
        };
    }
    /**
     * Set dead reckoning config for entity
     */
    setDeadReckoning(entityId, config) {
        let buffer = this.entities.get(entityId);
        if (!buffer) {
            buffer = {
                snapshots: [],
                lastUpdate: Date.now(),
            };
            this.entities.set(entityId, buffer);
        }
        buffer.deadReckoning = config;
    }
    /**
     * Linear interpolation of vectors
     */
    lerpVector(a, b, t) {
        return {
            x: a.x + (b.x - a.x) * t,
            y: a.y + (b.y - a.y) * t,
            z: a.z + (b.z - a.z) * t,
        };
    }
    /**
     * Spherical linear interpolation of quaternions
     */
    slerpQuaternion(a, b, t) {
        // Calculate dot product
        let dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
        // Adjust for shortest path
        let bCopy = { ...b };
        if (dot < 0) {
            dot = -dot;
            bCopy = { x: -b.x, y: -b.y, z: -b.z, w: -b.w };
        }
        // If very close, use linear interpolation
        if (dot > 0.9995) {
            return this.normalizeQuaternion({
                x: a.x + (bCopy.x - a.x) * t,
                y: a.y + (bCopy.y - a.y) * t,
                z: a.z + (bCopy.z - a.z) * t,
                w: a.w + (bCopy.w - a.w) * t,
            });
        }
        // Calculate interpolation parameters
        const theta0 = Math.acos(dot);
        const theta = theta0 * t;
        const sinTheta = Math.sin(theta);
        const sinTheta0 = Math.sin(theta0);
        const s0 = Math.cos(theta) - dot * sinTheta / sinTheta0;
        const s1 = sinTheta / sinTheta0;
        return {
            x: a.x * s0 + bCopy.x * s1,
            y: a.y * s0 + bCopy.y * s1,
            z: a.z * s0 + bCopy.z * s1,
            w: a.w * s0 + bCopy.w * s1,
        };
    }
    /**
     * Normalize quaternion
     */
    normalizeQuaternion(q) {
        const len = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
        if (len === 0)
            return { x: 0, y: 0, z: 0, w: 1 };
        return {
            x: q.x / len,
            y: q.y / len,
            z: q.z / len,
            w: q.w / len,
        };
    }
    /**
     * Cubic (Bezier) interpolation
     */
    cubicInterpolate(snapshots, time) {
        if (snapshots.length < 4) {
            // Fall back to linear
            const last = snapshots[snapshots.length - 1];
            const prev = snapshots[Math.max(0, snapshots.length - 2)];
            const t = snapshots.length > 1
                ? (time - prev.timestamp) / (last.timestamp - prev.timestamp)
                : 0;
            return this.lerpVector(prev.position, last.position, Math.max(0, Math.min(1, t)));
        }
        // Find the four control points
        let idx = snapshots.length - 2;
        for (let i = 0; i < snapshots.length - 1; i++) {
            if (snapshots[i].timestamp <= time && snapshots[i + 1].timestamp >= time) {
                idx = i;
                break;
            }
        }
        const p0 = snapshots[Math.max(0, idx - 1)].position;
        const p1 = snapshots[idx].position;
        const p2 = snapshots[Math.min(snapshots.length - 1, idx + 1)].position;
        const p3 = snapshots[Math.min(snapshots.length - 1, idx + 2)].position;
        const t = (time - snapshots[idx].timestamp) /
            (snapshots[idx + 1].timestamp - snapshots[idx].timestamp);
        const t2 = t * t;
        const t3 = t2 * t;
        return {
            x: 0.5 * ((2 * p1.x) +
                (-p0.x + p2.x) * t +
                (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
                (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
            y: 0.5 * ((2 * p1.y) +
                (-p0.y + p2.y) * t +
                (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
                (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
            z: 0.5 * ((2 * p1.z) +
                (-p0.z + p2.z) * t +
                (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 +
                (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
        };
    }
    /**
     * Hermite interpolation (uses velocity)
     */
    hermiteInterpolate(before, after, t) {
        const v0 = before.velocity || { x: 0, y: 0, z: 0 };
        const v1 = after.velocity || { x: 0, y: 0, z: 0 };
        const t2 = t * t;
        const t3 = t2 * t;
        const h1 = 2 * t3 - 3 * t2 + 1;
        const h2 = -2 * t3 + 3 * t2;
        const h3 = t3 - 2 * t2 + t;
        const h4 = t3 - t2;
        const dt = (after.timestamp - before.timestamp) / 1000;
        return {
            x: h1 * before.position.x + h2 * after.position.x + h3 * v0.x * dt + h4 * v1.x * dt,
            y: h1 * before.position.y + h2 * after.position.y + h3 * v0.y * dt + h4 * v1.y * dt,
            z: h1 * before.position.z + h2 * after.position.z + h3 * v0.z * dt + h4 * v1.z * dt,
        };
    }
    /**
     * Catmull-Rom spline interpolation
     */
    catmullRomInterpolate(snapshots, time) {
        // Same as cubic for simplicity
        return this.cubicInterpolate(snapshots, time);
    }
    /**
     * Calculate distance between vectors
     */
    vectorDistance(a, b) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dz = b.z - a.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    /**
     * Clear entity interpolation data
     */
    clear(entityId) {
        if (entityId) {
            this.entities.delete(entityId);
        }
        else {
            this.entities.clear();
        }
    }
    /**
     * Get all entity IDs being tracked
     */
    getTrackedEntities() {
        return Array.from(this.entities.keys());
    }
    /**
     * Get entity buffer statistics
     */
    getBufferStats(entityId) {
        const buffer = this.entities.get(entityId);
        if (!buffer || buffer.snapshots.length === 0) {
            return null;
        }
        const now = Date.now();
        return {
            count: buffer.snapshots.length,
            oldestMs: now - buffer.snapshots[0].timestamp,
            newestMs: now - buffer.snapshots[buffer.snapshots.length - 1].timestamp,
        };
    }
    /**
     * Dispose of interpolation engine
     */
    dispose() {
        this.entities.clear();
        this.removeAllListeners();
    }
}
export default InterpolationEngine;
