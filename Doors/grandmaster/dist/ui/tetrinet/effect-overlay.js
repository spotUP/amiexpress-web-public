"use strict";
/**
 * TetriNET Effect Overlay
 *
 * Visual overlays for continuous effects:
 * - Darkness: Hides the piece preview
 * - Confusion: Shows scrambled controls indicator
 * - Immunity: Shows protective shield effect
 * - Mutation: Shows piece randomization warning
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EffectOverlay = void 0;
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
/**
 * Effect Overlay component
 */
class EffectOverlay {
    constructor(options) {
        this.parent = options.parent;
        this.boardTop = options.boardTop;
        this.boardLeft = options.boardLeft;
        this.boardWidth = options.boardWidth;
        this.boardHeight = options.boardHeight;
        this.createOverlays();
    }
    /**
     * Create all overlay elements
     */
    createOverlays() {
        // Darkness overlay - covers piece preview area
        this.darknessOverlay = new blessed_1.Box({
            parent: this.parent,
            top: this.boardTop,
            right: 0,
            width: 16,
            height: 8,
            hidden: true,
            style: { bg: 'black' },
            content: '{gray-fg}\n  DARKNESS\n\n  Preview\n  Hidden{/gray-fg}',
            tags: true
        });
        // Confusion indicator - shows reversed controls warning
        this.confusionIndicator = new blessed_1.Box({
            parent: this.parent,
            top: 0,
            left: 'center',
            width: 20,
            height: 1,
            hidden: true,
            content: '{magenta-fg}{bold}CONTROLS REVERSED{/bold}{/magenta-fg}',
            tags: true
        });
        // Immunity border - glowing border around board
        this.immunityBorder = new blessed_1.Box({
            parent: this.parent,
            top: this.boardTop - 1,
            left: this.boardLeft - 1,
            width: this.boardWidth + 2,
            height: this.boardHeight + 2,
            hidden: true,
            border: { type: 'line' },
            style: { border: { fg: 'cyan' }, transparent: true },
        });
        // Mutation indicator - shows remaining pieces
        this.mutationIndicator = new blessed_1.Box({
            parent: this.parent,
            top: 0,
            right: 0,
            width: 16,
            height: 1,
            hidden: true,
            content: '{red-fg}MUTATION: 5{/red-fg}',
            tags: true
        });
        // Status bar for all active effects
        this.statusBar = new blessed_1.Box({
            parent: this.parent,
            bottom: 0,
            left: 0,
            width: '100%',
            height: 1,
            hidden: true,
            content: '',
            tags: true
        });
    }
    /**
     * Update overlays based on effect manager state
     */
    update(effects) {
        // Update darkness
        if (effects.hasDarkness()) {
            this.darknessOverlay.show();
            const remaining = Math.ceil(effects.getTimeRemaining('darkness') / 1000);
            this.darknessOverlay.setContent(`{gray-fg}\n  DARKNESS\n\n  Preview\n  Hidden\n\n  ${remaining}s{/gray-fg}`);
        }
        else {
            this.darknessOverlay.hide();
        }
        // Update confusion
        if (effects.hasConfusion()) {
            this.confusionIndicator.show();
            const remaining = Math.ceil(effects.getTimeRemaining('confusion') / 1000);
            this.confusionIndicator.setContent(`{magenta-fg}{bold}CONTROLS REVERSED (${remaining}s){/bold}{/magenta-fg}`);
        }
        else {
            this.confusionIndicator.hide();
        }
        // Update immunity
        if (effects.hasImmunity()) {
            this.immunityBorder.show();
            // Animate border color
            const time = Date.now() % 1000;
            const color = time < 500 ? 'cyan' : 'white';
            if (this.immunityBorder.style.border) {
                this.immunityBorder.style.border.fg = color;
            }
        }
        else {
            this.immunityBorder.hide();
        }
        // Update mutation
        if (effects.hasMutation()) {
            this.mutationIndicator.show();
            const remaining = effects.getMutationRemaining();
            this.mutationIndicator.setContent(`{red-fg}MUTATION: ${remaining} pieces{/red-fg}`);
        }
        else {
            this.mutationIndicator.hide();
        }
        // Update status bar with all active effects
        this.updateStatusBar(effects);
    }
    /**
     * Update status bar with all active effects summary
     */
    updateStatusBar(effects) {
        const activeEffects = [];
        if (effects.hasImmunity()) {
            const remaining = Math.ceil(effects.getTimeRemaining('immunity') / 1000);
            activeEffects.push(`{cyan-fg}[I]${remaining}s{/cyan-fg}`);
        }
        if (effects.hasDarkness()) {
            const remaining = Math.ceil(effects.getTimeRemaining('darkness') / 1000);
            activeEffects.push(`{gray-fg}[D]${remaining}s{/gray-fg}`);
        }
        if (effects.hasConfusion()) {
            const remaining = Math.ceil(effects.getTimeRemaining('confusion') / 1000);
            activeEffects.push(`{magenta-fg}[F]${remaining}s{/magenta-fg}`);
        }
        if (effects.hasMutation()) {
            const remaining = effects.getMutationRemaining();
            activeEffects.push(`{red-fg}[M]${remaining}pc{/red-fg}`);
        }
        if (activeEffects.length > 0) {
            this.statusBar.show();
            this.statusBar.setContent(`Effects: ${activeEffects.join(' ')}`);
        }
        else {
            this.statusBar.hide();
        }
    }
    /**
     * Show incoming attack warning
     */
    showIncomingWarning(attackType) {
        const warningBox = new blessed_1.Box({
            parent: this.parent,
            top: 'center',
            left: 'center',
            width: 30,
            height: 5,
            border: { type: 'line' },
            style: { border: { fg: 'red' }, bg: 'black' },
            content: `{red-fg}{bold}INCOMING ATTACK!\n\n${attackType.toUpperCase()}{/bold}{/red-fg}`,
            tags: true
        });
        // Remove after animation
        setTimeout(() => {
            warningBox.destroy();
        }, 1000);
    }
    /**
     * Show immunity blocked message
     */
    showImmunityBlocked() {
        const messageBox = new blessed_1.Box({
            parent: this.parent,
            top: 'center',
            left: 'center',
            width: 20,
            height: 3,
            border: { type: 'line' },
            style: { border: { fg: 'cyan' }, bg: 'black' },
            content: '{cyan-fg}{bold}BLOCKED!{/bold}{/cyan-fg}',
            tags: true
        });
        setTimeout(() => {
            messageBox.destroy();
        }, 500);
    }
    /**
     * Show sudden death warning
     */
    showSuddenDeathWarning() {
        const warningBox = new blessed_1.Box({
            parent: this.parent,
            top: 2,
            left: 'center',
            width: 30,
            height: 3,
            border: { type: 'line' },
            style: { border: { fg: 'red' }, bg: 'black' },
            content: '{red-fg}{bold}SUDDEN DEATH ACTIVE!{/bold}{/red-fg}',
            tags: true
        });
        // Flash and then hide
        let flashes = 6;
        const flashInterval = setInterval(() => {
            if (flashes <= 0) {
                clearInterval(flashInterval);
                warningBox.destroy();
                return;
            }
            warningBox.hidden = !warningBox.hidden;
            flashes--;
        }, 250);
    }
    /**
     * Show sudden death line addition
     */
    showSuddenDeathLine(totalLines) {
        const messageBox = new blessed_1.Box({
            parent: this.parent,
            top: 5,
            left: 'center',
            width: 20,
            height: 1,
            content: `{red-fg}+1 LINE (${totalLines} total){/red-fg}`,
            tags: true
        });
        setTimeout(() => {
            messageBox.destroy();
        }, 1500);
    }
    /**
     * Hide darkness overlay (for preview)
     */
    hideDarkness() {
        this.darknessOverlay.hide();
    }
    /**
     * Show darkness overlay
     */
    showDarkness() {
        this.darknessOverlay.show();
    }
    /**
     * Check if darkness is active
     */
    isDarknessActive() {
        return !this.darknessOverlay.hidden;
    }
    /**
     * Destroy all overlays
     */
    destroy() {
        this.darknessOverlay.destroy();
        this.confusionIndicator.destroy();
        this.immunityBorder.destroy();
        this.mutationIndicator.destroy();
        this.statusBar.destroy();
    }
}
exports.EffectOverlay = EffectOverlay;
//# sourceMappingURL=effect-overlay.js.map