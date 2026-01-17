"use strict";
/**
 * Game Animations
 *
 * Grade-up, COOL/REGRET, line clear flash, lock glow, etc.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnimationRenderer = exports.AnimationManager = void 0;
/**
 * Animation manager
 */
class AnimationManager {
    constructor() {
        this.animations = [];
        this.placementEffects = [];
        this.floatingTexts = [];
        this.MAX_PLACEMENT_EFFECTS = 3;
        this.MAX_FLOATING_TEXTS = 5;
    }
    /**
     * Trigger grade-up animation
     */
    gradeUp(oldGrade, newGrade, x, y) {
        this.animations.push({
            type: 'gradeUp',
            elapsed: 0,
            duration: 1000,
            data: { oldGrade, newGrade, x, y },
        });
    }
    /**
     * Trigger COOL animation
     */
    cool(section) {
        this.animations.push({
            type: 'cool',
            elapsed: 0,
            duration: 800,
            data: { result: 'COOL', section },
        });
    }
    /**
     * Trigger REGRET animation
     */
    regret(section) {
        this.animations.push({
            type: 'regret',
            elapsed: 0,
            duration: 800,
            data: { result: 'REGRET', section },
        });
    }
    /**
     * Trigger line clear flash
     */
    lineClearFlash(lines, intensity) {
        this.animations.push({
            type: 'lineClearFlash',
            elapsed: 0,
            duration: 200,
            data: { lines, intensity },
        });
    }
    /**
     * Trigger lock glow
     */
    lockGlow(cells, color) {
        this.animations.push({
            type: 'lockGlow',
            elapsed: 0,
            duration: 100,
            data: { cells, color },
        });
    }
    /**
     * Trigger combo counter animation for milestone achievements
     */
    comboCounter(combo, milestone) {
        this.animations.push({
            type: 'comboCounter',
            elapsed: 0,
            duration: 600,
            data: { combo, milestone },
        });
    }
    /**
     * Trigger perfect clear animation
     */
    perfectClear() {
        this.animations.push({
            type: 'perfectClear',
            elapsed: 0,
            duration: 1500,
        });
    }
    /**
     * Trigger T-Spin animation
     */
    tSpin(x, y) {
        this.animations.push({
            type: 'tSpin',
            elapsed: 0,
            duration: 500,
            data: { x, y },
        });
    }
    /**
     * Trigger piece placement effect
     */
    placementEffect(piece, cells, rotation, color) {
        // FIFO enforcement - remove oldest effect if at limit
        if (this.placementEffects.length >= this.MAX_PLACEMENT_EFFECTS) {
            this.placementEffects.shift();
        }
        this.placementEffects.push({
            piece,
            cells,
            rotation: rotation,
            frame: 0,
            color
        });
    }
    /**
     * Trigger floating text animation
     */
    floatingText(text, x, y, color, mode) {
        if (mode === 'off')
            return;
        // FIFO enforcement - remove oldest text if at limit
        if (this.floatingTexts.length >= this.MAX_FLOATING_TEXTS) {
            this.floatingTexts.shift();
        }
        const textLines = Array.isArray(text) ? text : [text];
        this.floatingTexts.push({
            text: textLines,
            x,
            y,
            originY: y,
            timer: 0,
            maxTimer: 100,
            color,
            size: 'normal',
            mode: mode === 'all' ? 'all' : 'offboard'
        });
    }
    /**
     * Trigger back-to-back glow animation
     */
    backToBackGlow(cells, count, type) {
        this.animations.push({
            type: 'backToBackGlow',
            elapsed: 0,
            duration: 300, // 18 frames at 60 FPS = 300ms
            data: { cells, count, type }
        });
    }
    /**
     * Update all animations
     */
    update(deltaTime) {
        // Update standard animations
        this.animations = this.animations.filter(anim => {
            anim.elapsed += deltaTime;
            return anim.elapsed < anim.duration;
        });
        // Update placement effects
        this.placementEffects = this.placementEffects.filter(effect => {
            effect.frame++;
            return effect.frame < 15; // 15-frame duration (250ms at 60 FPS)
        });
        // Update floating texts
        this.floatingTexts = this.floatingTexts.filter(text => {
            text.timer++;
            // Calculate Y position with easing
            const progress = text.timer / text.maxTimer;
            if (progress < 0.66) { // Rise stage (frames 0-66)
                const riseProgress = progress / 0.66;
                text.y = text.originY - (15 * this.easeOutCubic(riseProgress));
            }
            else { // Fall stage (frames 67-100)
                const fallProgress = (progress - 0.66) / 0.34;
                const peakY = text.originY - 15;
                text.y = peakY + (5 * this.easeInCubic(fallProgress));
            }
            return text.timer < text.maxTimer;
        });
    }
    /**
     * Ease-out cubic function for floating text rise
     */
    easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
    }
    /**
     * Ease-in cubic function for floating text fall
     */
    easeInCubic(t) {
        return t * t * t;
    }
    /**
     * Get all active animations
     */
    getAnimations() {
        return this.animations;
    }
    /**
     * Get animations of specific type
     */
    getAnimationsByType(type) {
        return this.animations.filter(anim => anim.type === type);
    }
    /**
     * Check if animation type is active
     */
    hasAnimation(type) {
        return this.animations.some(anim => anim.type === type);
    }
    /**
     * Get all active placement effects
     */
    getPlacementEffects() {
        return this.placementEffects;
    }
    /**
     * Get all active floating texts
     */
    getFloatingTexts() {
        return this.floatingTexts;
    }
    /**
     * Clear all animations
     */
    clear() {
        this.animations = [];
        this.placementEffects = [];
        this.floatingTexts = [];
    }
    /**
     * Clear animations of specific type
     */
    clearType(type) {
        this.animations = this.animations.filter(anim => anim.type !== type);
    }
}
exports.AnimationManager = AnimationManager;
/**
 * Animation rendering helpers
 */
class AnimationRenderer {
    /**
     * Render grade-up animation
     */
    static renderGradeUp(anim) {
        const data = anim.data;
        const progress = anim.elapsed / anim.duration;
        // Fade in, hold, fade out
        let alpha = 1;
        if (progress < 0.2) {
            alpha = progress / 0.2;
        }
        else if (progress > 0.8) {
            alpha = (1 - progress) / 0.2;
        }
        // Pulse effect
        const scale = 1 + Math.sin(progress * Math.PI * 4) * 0.1;
        // Color based on grade
        const color = this.getGradeColor(data.newGrade);
        return `{${color}-fg}{bold}GRADE UP!{/bold}\n${data.oldGrade} → ${data.newGrade}{/${color}-fg}`;
    }
    /**
     * Render COOL/REGRET banner
     */
    static renderSectionResult(anim) {
        const data = anim.data;
        const progress = anim.elapsed / anim.duration;
        // Slide in from right
        const slideX = progress < 0.3
            ? Math.floor((1 - progress / 0.3) * 20)
            : 0;
        // Fade out
        const alpha = progress > 0.7
            ? (1 - progress) / 0.3
            : 1;
        if (data.result === 'COOL') {
            return `{cyan-fg}{bold}${'  '.repeat(slideX)}COOL!{/bold}{/cyan-fg}`;
        }
        else {
            return `{red-fg}{bold}${'  '.repeat(slideX)}REGRET{/bold}{/red-fg}`;
        }
    }
    /**
     * Get line clear flash intensity
     */
    static getFlashIntensity(anim) {
        const progress = anim.elapsed / anim.duration;
        // Quick flash, exponential decay
        return Math.pow(1 - progress, 2);
    }
    /**
     * Get lock glow intensity
     */
    static getLockGlowIntensity(anim) {
        const progress = anim.elapsed / anim.duration;
        // Quick bright flash, then fade
        if (progress < 0.2) {
            return 1;
        }
        else {
            return Math.pow((1 - progress) / 0.8, 2);
        }
    }
    /**
     * Get grade color
     */
    static getGradeColor(grade) {
        if (grade === 'GM')
            return 'yellow';
        if (grade.startsWith('M'))
            return 'red';
        if (grade.startsWith('m'))
            return 'magenta';
        if (grade.startsWith('S'))
            return 'cyan';
        return 'white';
    }
    /**
     * Render placement effect
     *
     * Returns the character to render for a specific cell in the placement effect.
     * Scale and alpha based on frame progression.
     */
    static renderPlacementEffect(effect, x, y) {
        const { frame, color, cells } = effect;
        const progress = frame / 15;
        // Check if this cell is part of the effect
        const isEffectCell = cells.some(cell => cell.x === x && cell.y === y);
        if (!isEffectCell)
            return null;
        // Calculate scale and alpha
        const scale = this.calculateScale(progress);
        const alpha = this.calculateAlpha(progress);
        // Render based on scale and alpha
        if (alpha < 0.33) {
            return '  '; // Nearly invisible
        }
        else if (alpha < 0.66) {
            return `{${color}-fg}░░{/${color}-fg}`; // Faded
        }
        else if (scale > 1.1) {
            const bright = this.getBrightColor(color);
            return `{${bright}-bg}{white-fg}██{/white-fg}{/${bright}-bg}`; // Bright + scaled
        }
        else {
            return `{${color}-fg}██{/${color}-fg}`; // Normal
        }
    }
    /**
     * Calculate scale for placement effect
     *
     * Frames 0-4: Scale up 0.8 → 1.2
     * Frames 5-9: Hold at 1.2
     * Frames 10-14: Scale down 1.2 → 1.0
     */
    static calculateScale(progress) {
        if (progress < 0.27) { // Frames 0-4
            return 0.8 + (progress / 0.27) * 0.4;
        }
        else if (progress < 0.6) { // Frames 5-9
            return 1.2;
        }
        else { // Frames 10-14
            return 1.2 - ((progress - 0.6) / 0.4) * 0.2;
        }
    }
    /**
     * Calculate alpha for placement effect
     *
     * Frames 0-9: Alpha 1.0
     * Frames 10-14: Fade out 1.0 → 0.0
     */
    static calculateAlpha(progress) {
        return progress < 0.67 ? 1.0 : 1.0 - ((progress - 0.67) / 0.33);
    }
    /**
     * Render back-to-back glow overlay
     *
     * Returns the character to render for B2B glow effect.
     */
    static renderBackToBackGlow(data, elapsed, duration, x, y) {
        const progress = elapsed / duration;
        // Check if this cell is part of the B2B effect
        const isB2BCell = data.cells.some(cell => cell.x === x && cell.y === y);
        if (!isB2BCell)
            return null;
        // Quick flash then exponential fade
        let intensity = 0;
        if (progress < 0.3) { // Frames 0-5
            intensity = progress / 0.3;
        }
        else { // Frames 6-18
            intensity = Math.exp(-((progress - 0.3) / 0.7) * 3);
        }
        // Color based on type
        const primaryColor = data.type === 'tetris' ? 'yellow' : 'magenta';
        const secondaryColor = data.type === 'tetris' ? 'white' : 'cyan';
        // Alternate between colors for double outline effect
        const color = Math.floor(elapsed / 100) % 2 === 0 ? primaryColor : secondaryColor;
        // Apply glow based on intensity
        if (intensity > 0.5) {
            return `{${color}-bg}{white-fg}██{/white-fg}{/${color}-bg}`;
        }
        else if (intensity > 0.2) {
            return `{${color}-fg}██{/${color}-fg}`;
        }
        else {
            return null; // Too faint, don't render
        }
    }
    /**
     * Get bright version of color for glow effects
     */
    static getBrightColor(color) {
        const brightMap = {
            'red': 'lightred',
            'green': 'lightgreen',
            'yellow': 'lightyellow',
            'blue': 'lightblue',
            'magenta': 'lightmagenta',
            'cyan': 'lightcyan',
            'white': 'white',
            'gray': 'white'
        };
        return brightMap[color] || color;
    }
    /**
     * Extract color from blessed-tagged string
     *
     * Example: "{cyan-fg}██{/cyan-fg}" → "cyan"
     */
    static extractColor(taggedString) {
        const match = taggedString.match(/\{([a-z]+)-fg\}/);
        return match ? match[1] : 'white';
    }
}
exports.AnimationRenderer = AnimationRenderer;
//# sourceMappingURL=animations.js.map