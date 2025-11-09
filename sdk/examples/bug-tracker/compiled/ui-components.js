"use strict";
/**
 * UI Components - Reusable Visual Elements
 *
 * Features:
 * - Toast notifications
 * - Loading spinners
 * - Progress bars
 * - Breadcrumb navigation
 * - Status badges
 * - Modal dialogs
 * - Confirmation prompts
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.UIComponents = exports.ToastType = void 0;
var ToastType;
(function (ToastType) {
    ToastType["SUCCESS"] = "success";
    ToastType["ERROR"] = "error";
    ToastType["WARNING"] = "warning";
    ToastType["INFO"] = "info";
})(ToastType || (exports.ToastType = ToastType = {}));
class UIComponents {
    constructor(door, userId) {
        this.toastQueue = [];
        this.door = door;
        this.userId = userId;
    }
    /**
     * Show toast notification
     */
    showToast(message, type = ToastType.INFO, duration = 3000) {
        const toast = { message, type, timestamp: Date.now() };
        this.toastQueue.push(toast);
        this.renderToast(toast);
        setTimeout(() => {
            const index = this.toastQueue.indexOf(toast);
            if (index !== -1) {
                this.toastQueue.splice(index, 1);
                this.clearToast();
            }
        }, duration);
    }
    renderToast(toast) {
        let icon = 'ℹ';
        let color = '\x1b[36m'; // Cyan
        switch (toast.type) {
            case ToastType.SUCCESS:
                icon = '✓';
                color = '\x1b[32m'; // Green
                break;
            case ToastType.ERROR:
                icon = '✗';
                color = '\x1b[31m'; // Red
                break;
            case ToastType.WARNING:
                icon = '⚠';
                color = '\x1b[33m'; // Yellow
                break;
        }
        const width = Math.min(toast.message.length + 6, 76);
        const x = Math.floor((80 - width) / 2);
        const y = 22;
        let output = '';
        output += `\x1b[${y};${x}H`;
        output += `${color}╔${'═'.repeat(width - 2)}╗\x1b[0m`;
        output += `\x1b[${y + 1};${x}H`;
        output += `${color}║\x1b[0m ${icon} ${toast.message.padEnd(width - 6)} ${color}║\x1b[0m`;
        output += `\x1b[${y + 2};${x}H`;
        output += `${color}╚${'═'.repeat(width - 2)}╝\x1b[0m`;
        this.door.sendAnsi(output, this.userId);
    }
    clearToast() {
        let output = '';
        for (let i = 0; i < 3; i++) {
            output += `\x1b[${22 + i};1H\x1b[2K`;
        }
        this.door.sendAnsi(output, this.userId);
    }
    /**
     * Show loading spinner
     */
    startSpinner(message, x = 30, y = 12) {
        const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
        let frameIndex = 0;
        this.spinnerInterval = setInterval(() => {
            let output = `\x1b[${y};${x}H`;
            output += `\x1b[36m${frames[frameIndex]}\x1b[0m ${message}`;
            this.door.sendAnsi(output, this.userId);
            frameIndex = (frameIndex + 1) % frames.length;
        }, 80);
    }
    /**
     * Stop loading spinner
     */
    stopSpinner(y = 12) {
        if (this.spinnerInterval) {
            clearInterval(this.spinnerInterval);
            this.spinnerInterval = undefined;
        }
        // Clear the line
        let output = `\x1b[${y};1H\x1b[2K`;
        this.door.sendAnsi(output, this.userId);
    }
    /**
     * Draw breadcrumb navigation
     */
    drawBreadcrumbs(path, y = 1) {
        const breadcrumb = path.join(' › ');
        let output = `\x1b[${y};2H\x1b[2K`;
        output += `\x1b[90m${breadcrumb}\x1b[0m`;
        this.door.sendAnsi(output, this.userId);
    }
    /**
     * Draw status badge
     */
    drawBadge(text, type, x, y) {
        let color = '\x1b[36m'; // Cyan for info
        let bgColor = '\x1b[46m'; // Cyan background
        switch (type) {
            case 'success':
                color = '\x1b[32m';
                bgColor = '\x1b[42m';
                break;
            case 'error':
                color = '\x1b[31m';
                bgColor = '\x1b[41m';
                break;
            case 'warning':
                color = '\x1b[33m';
                bgColor = '\x1b[43m';
                break;
        }
        let output = `\x1b[${y};${x}H`;
        output += `${bgColor}\x1b[30m ${text} \x1b[0m`;
        this.door.sendAnsi(output, this.userId);
    }
    /**
     * Show confirmation dialog
     */
    async confirm(message, defaultYes = false) {
        const x = 15;
        const y = 10;
        const width = 50;
        // Draw modal
        let output = '\x1b[2J\x1b[H'; // Clear screen
        // Semi-transparent background
        for (let i = 0; i < 24; i++) {
            output += `\x1b[${i + 1};1H\x1b[44m${' '.repeat(80)}\x1b[0m`;
        }
        // Dialog box
        output += `\x1b[${y};${x}H\x1b[37m╔${'═'.repeat(width - 2)}╗\x1b[0m`;
        output += `\x1b[${y + 1};${x}H\x1b[37m║\x1b[0m ${' '.repeat(width - 4)} \x1b[37m║\x1b[0m`;
        output += `\x1b[${y + 2};${x}H\x1b[37m║\x1b[0m  ${message.padEnd(width - 6)} \x1b[37m║\x1b[0m`;
        output += `\x1b[${y + 3};${x}H\x1b[37m║\x1b[0m ${' '.repeat(width - 4)} \x1b[37m║\x1b[0m`;
        output += `\x1b[${y + 4};${x}H\x1b[37m╠${'═'.repeat(width - 2)}╣\x1b[0m`;
        output += `\x1b[${y + 5};${x}H\x1b[37m║\x1b[0m ${' '.repeat(width - 4)} \x1b[37m║\x1b[0m`;
        const yesHighlight = defaultYes ? '\x1b[43m\x1b[30m' : '\x1b[37m';
        const noHighlight = !defaultYes ? '\x1b[43m\x1b[30m' : '\x1b[37m';
        output += `\x1b[${y + 6};${x + 10}H${yesHighlight} Yes \x1b[0m  ${noHighlight} No \x1b[0m`;
        output += `\x1b[${y + 7};${x}H\x1b[37m║\x1b[0m ${' '.repeat(width - 4)} \x1b[37m║\x1b[0m`;
        output += `\x1b[${y + 8};${x}H\x1b[37m╚${'═'.repeat(width - 2)}╝\x1b[0m`;
        output += `\x1b[${y + 10};${x}H\x1b[90m[←→] Select  [Enter] Confirm  [ESC] Cancel\x1b[0m`;
        this.door.sendAnsi(output, this.userId);
        return new Promise((resolve) => {
            let selected = defaultYes;
            const handler = (user, keyEvent) => {
                const key = keyEvent.key;
                if (key === 'ArrowLeft' || key === 'ArrowRight') {
                    selected = !selected;
                    // Update highlights
                    const yesH = selected ? '\x1b[43m\x1b[30m' : '\x1b[37m';
                    const noH = !selected ? '\x1b[43m\x1b[30m' : '\x1b[37m';
                    let update = `\x1b[${y + 6};${x + 10}H${yesH} Yes \x1b[0m  ${noH} No \x1b[0m`;
                    this.door.sendAnsi(update, this.userId);
                }
                else if (key === 'Enter' || key === '\r') {
                    this.door.off('input', handler);
                    resolve(selected);
                }
                else if (key === 'Escape' || key === '\x1b') {
                    this.door.off('input', handler);
                    resolve(false);
                }
            };
            this.door.onInput(handler);
        });
    }
    /**
     * Show modal dialog
     */
    showModal(title, content, width = 60, height = 15) {
        const x = Math.floor((80 - width) / 2);
        const y = Math.floor((24 - height) / 2);
        let output = '';
        // Box
        output += `\x1b[${y};${x}H\x1b[36m╔${'═'.repeat(width - 2)}╗\x1b[0m`;
        output += `\x1b[${y + 1};${x}H\x1b[36m║\x1b[0m ${title.padEnd(width - 4)} \x1b[36m║\x1b[0m`;
        output += `\x1b[${y + 2};${x}H\x1b[36m╠${'═'.repeat(width - 2)}╣\x1b[0m`;
        // Content
        for (let i = 0; i < height - 4; i++) {
            output += `\x1b[${y + 3 + i};${x}H\x1b[36m║\x1b[0m `;
            if (i < content.length) {
                output += content[i].substring(0, width - 4).padEnd(width - 4);
            }
            else {
                output += ' '.repeat(width - 4);
            }
            output += ` \x1b[36m║\x1b[0m`;
        }
        output += `\x1b[${y + height - 1};${x}H\x1b[36m╚${'═'.repeat(width - 2)}╝\x1b[0m`;
        this.door.sendAnsi(output, this.userId);
    }
    /**
     * Draw horizontal separator
     */
    drawSeparator(y, char = '─', color = '\x1b[36m') {
        let output = `\x1b[${y};1H${color}${char.repeat(80)}\x1b[0m`;
        this.door.sendAnsi(output, this.userId);
    }
    /**
     * Draw fancy header
     */
    drawFancyHeader(title, subtitle) {
        let output = '\x1b[2J\x1b[H'; // Clear screen
        // Top border
        output += '\x1b[1;1H\x1b[36m╔' + '═'.repeat(78) + '╗\x1b[0m';
        // Title
        const titleX = Math.floor((80 - title.length) / 2);
        output += `\x1b[2;${titleX}H\x1b[35m\x1b[1m${title}\x1b[0m`;
        // Subtitle
        if (subtitle) {
            const subtitleX = Math.floor((80 - subtitle.length) / 2);
            output += `\x1b[3;${subtitleX}H\x1b[90m${subtitle}\x1b[0m`;
        }
        // Bottom border
        output += `\x1b[4;1H\x1b[36m╚` + '═'.repeat(78) + '╝\x1b[0m';
        this.door.sendAnsi(output, this.userId);
    }
    /**
     * Animated loading bar
     */
    async showLoadingBar(message, durationMs = 2000) {
        const y = 12;
        const x = 20;
        const width = 40;
        const steps = 20;
        const stepDuration = durationMs / steps;
        for (let i = 0; i <= steps; i++) {
            const filled = Math.floor((i / steps) * width);
            const empty = width - filled;
            const percentage = Math.floor((i / steps) * 100);
            let output = `\x1b[${y};${x}H${message}`;
            output += `\x1b[${y + 1};${x}H[\x1b[32m${'█'.repeat(filled)}\x1b[90m${'░'.repeat(empty)}\x1b[0m] ${percentage}%`;
            this.door.sendAnsi(output, this.userId);
            if (i < steps) {
                await new Promise(resolve => setTimeout(resolve, stepDuration));
            }
        }
    }
    /**
     * Show keyboard shortcuts help
     */
    showShortcuts(shortcuts) {
        const y = 20;
        const x = 2;
        let output = `\x1b[${y};${x}H\x1b[90m`;
        shortcuts.forEach((sc, idx) => {
            if (idx > 0)
                output += '  │  ';
            output += `\x1b[33m[${sc.key}]\x1b[90m ${sc.description}`;
        });
        output += '\x1b[0m';
        this.door.sendAnsi(output, this.userId);
    }
    /**
     * Draw fancy box with title
     */
    drawBox(title, x, y, width, height, color = '\x1b[36m') {
        let output = '';
        // Top with title
        const titlePadded = ` ${title} `;
        const titleX = x + Math.floor((width - titlePadded.length) / 2);
        const leftBorder = Math.floor((width - titlePadded.length) / 2) - 1;
        const rightBorder = width - titlePadded.length - leftBorder - 2;
        output += `\x1b[${y};${x}H${color}╔${'═'.repeat(leftBorder)}╡\x1b[37m${titlePadded}\x1b[0m${color}╞${'═'.repeat(rightBorder)}╗\x1b[0m`;
        // Sides
        for (let i = 1; i < height - 1; i++) {
            output += `\x1b[${y + i};${x}H${color}║\x1b[0m`;
            output += `\x1b[${y + i};${x + width - 1}H${color}║\x1b[0m`;
        }
        // Bottom
        output += `\x1b[${y + height - 1};${x}H${color}╚${'═'.repeat(width - 2)}╝\x1b[0m`;
        this.door.sendAnsi(output, this.userId);
    }
    /**
     * Show countdown timer
     */
    async countdown(seconds, x, y) {
        for (let i = seconds; i >= 0; i--) {
            let output = `\x1b[${y};${x}H`;
            if (i > 5) {
                output += `\x1b[32m${i}\x1b[0m`;
            }
            else if (i > 0) {
                output += `\x1b[33m${i}\x1b[0m`;
            }
            else {
                output += `\x1b[31m${i}\x1b[0m`;
            }
            this.door.sendAnsi(output, this.userId);
            if (i > 0) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }
    /**
     * Show loading spinner (alias for startSpinner)
     */
    showLoadingSpinner(message, x = 30, y = 12) {
        this.startSpinner(message, x, y);
    }
    /**
     * Handle input events (placeholder for toast management)
     */
    handleInput(key) {
        // This method can be used to handle keyboard shortcuts for toast management
        // Currently just a placeholder
    }
}
exports.UIComponents = UIComponents;
