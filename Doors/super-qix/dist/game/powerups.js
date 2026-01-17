/**
 * Super Qix - Power-Up System
 * Handles power-up spawning, effects, and letter collection
 */
import { FIELD_WIDTH, FIELD_HEIGHT, POWERUP_SPAWN_CHANCE, SPEED_BOOST_DURATION, FREEZE_DURATION, LETTER_POINTS, WORD_COMPLETE_POINTS } from './constants';
/**
 * Power-up system for spawning and managing power-ups
 */
export class PowerUpSystem {
    constructor(data) {
        this.data = data;
    }
    /**
     * Try to spawn a power-up after claiming area
     */
    trySpawnPowerUp() {
        if (Math.random() > POWERUP_SPAWN_CHANCE)
            return;
        const d = this.data;
        // Find a valid spawn position (on claimed area near edge)
        const position = this.findSpawnPosition();
        if (!position)
            return;
        // Determine power-up type
        const type = this.selectPowerUpType();
        d.powerUpIdCounter = (d.powerUpIdCounter || 0) + 1;
        const powerUp = {
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
    findSpawnPosition() {
        const d = this.data;
        // Find claimed cells that are near unclaimed (edge of claimed area)
        const candidates = [];
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
        if (candidates.length === 0)
            return null;
        return candidates[Math.floor(Math.random() * candidates.length)];
    }
    /**
     * Select a random power-up type
     */
    selectPowerUpType() {
        const types = ['speed', 'shield', 'freeze', 'letter'];
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
    getNextNeededLetter() {
        const d = this.data;
        if (!d.levelWord)
            return null;
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
    checkCollection(marker) {
        const d = this.data;
        for (const powerUp of d.powerUps) {
            if (powerUp.collected)
                continue;
            const dist = Math.abs(powerUp.x - marker.x) + Math.abs(powerUp.y - marker.y);
            if (dist < 1.5) {
                this.collectPowerUp(powerUp);
            }
        }
    }
    /**
     * Collect a power-up and apply its effect
     */
    collectPowerUp(powerUp) {
        const d = this.data;
        powerUp.collected = true;
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
                // Skip to next level - handled by engine
                d.claimedPercent = d.targetPercent + 1;
                break;
            case 'letter':
                if (powerUp.letter) {
                    d.collectedLetters.push(powerUp.letter);
                    d.score += LETTER_POINTS;
                    // Check if word complete
                    if (this.isWordComplete()) {
                        d.score += WORD_COMPLETE_POINTS;
                    }
                }
                break;
        }
    }
    /**
     * Apply speed boost effect
     */
    applySpeedBoost() {
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
    applyFreeze() {
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
    isWordComplete() {
        const d = this.data;
        if (!d.levelWord)
            return false;
        const needed = d.levelWord.split('');
        return needed.every(letter => d.collectedLetters.includes(letter));
    }
    /**
     * Update active effects (tick down timers)
     */
    updateEffects() {
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
        d.powerUps = d.powerUps.filter(p => p.collected || (now - p.spawnTime) < 30000);
    }
    /**
     * Get display string for collected letters
     */
    getLetterDisplay() {
        const d = this.data;
        if (!d.levelWord)
            return '';
        return d.levelWord.split('').map(letter => d.collectedLetters.includes(letter) ? letter : '_').join(' ');
    }
    /**
     * Get active effects for HUD display
     */
    getActiveEffectsDisplay() {
        const d = this.data;
        const effects = [];
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
