"use strict";
/**
 * Settings Configuration Screen
 *
 * Interactive settings editor with real-time preview
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsScreen = void 0;
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
/**
 * Friendly names for key bindings
 */
const KEY_DISPLAY_NAMES = {
    'left': 'Left Arrow',
    'right': 'Right Arrow',
    'up': 'Up Arrow',
    'down': 'Down Arrow',
    'a': 'A',
    'd': 'D',
    's': 'S',
    'w': 'W',
    'z': 'Z',
    'x': 'X',
    'c': 'C',
    'space': 'Space',
    'return': 'Enter',
    'enter': 'Enter',
    'escape': 'Escape',
    'p': 'P',
    'lshift': 'Left Shift',
    'rshift': 'Right Shift',
    'lcontrol': 'Left Ctrl',
    'rcontrol': 'Right Ctrl',
    'pageup': 'Page Up',
    'pagedown': 'Page Down',
};
function formatKeyBinding(keys) {
    return keys.map(k => KEY_DISPLAY_NAMES[k] || k.toUpperCase()).join(' / ');
}
/**
 * Settings screen
 */
class SettingsScreen {
    constructor(screen, state, sounds) {
        this.screen = screen;
        this.state = state;
        this.sounds = sounds;
    }
    /**
     * Show settings editor and wait for exit
     */
    async show() {
        // Enable mouse control for settings interaction
        this.screen.program.enableMouse();
        return new Promise((resolve) => {
            // Clear screen
            this.screen.children.forEach(child => child.destroy());
            // Title box
            const title = (0, blessed_helpers_1.createBox)({
                parent: this.screen,
                top: 0,
                left: 'center',
                width: 60,
                height: 3,
                content: '{bold}{yellow-fg}SETTINGS{/yellow-fg}{/bold}',
                style: { fg: 'white', bg: 'black' },
            });
            // Settings menu
            const menu = (0, blessed_helpers_1.createList)({
                parent: this.screen,
                top: 3,
                left: 10,
                width: 60,
                height: 15,
                border: { type: 'line' },
                label: ' Settings ',
                scrollable: true,
                alwaysScroll: true,
                scrollbar: {
                    ch: ' ',
                    style: { bg: 'cyan' },
                },
                style: {
                    border: { fg: 'cyan' },
                    selected: { bg: 'cyan', fg: 'black' },
                    item: { fg: 'white' },
                },
                keys: true,
                vi: true,
                mouse: true,
                items: this.getMenuItems(),
            });
            // Description box
            const descBox = (0, blessed_helpers_1.createBox)({
                parent: this.screen,
                top: 18,
                left: 10,
                width: 60,
                height: 5,
                border: { type: 'line' },
                style: { border: { fg: 'gray' }, fg: 'gray' },
                content: this.getDescription(0),
                fixed: true,
            });
            // Cleanup function for exiting settings
            const exitSettings = () => {
                title.destroy();
                menu.destroy();
                descBox.destroy();
                this.screen.render();
                resolve();
            };
            // Update description on selection change
            menu.on('select item', (_item, index) => {
                // Play navigation sound when scrolling through settings
                this.sounds.playSfx('menu_select');
                descBox.setContent(this.getDescription(index));
                this.screen.render();
            });
            // Handle item selection - wrap async handler for blessed's sync event requirement
            menu.on('select', (_item, index) => {
                // Check for Save & Exit (last item, index 31)
                if (index === 31) {
                    this.sounds.playSfx('menu_ok');
                    exitSettings();
                    return;
                }
                // Play selection sound when opening a setting
                this.sounds.playSfx('menu_ok');
                this.handleSelection(index, menu).then(() => {
                    menu.focus();
                    this.screen.render();
                });
            });
            // Handle quit key
            menu.key(['q', 'Q', 'escape'], () => {
                exitSettings();
            });
            // Focus and render
            menu.focus();
            this.screen.render();
        });
    }
    /**
     * Get menu items
     */
    getMenuItems() {
        const s = this.state.settings;
        const kb = s.keyBindings;
        return [
            `Rotation System:   {yellow-fg}${s.rotationSystem}{/yellow-fg}`,
            `DAS (ms):          {yellow-fg}${s.das}{/yellow-fg}`,
            `ARR (ms):          {yellow-fg}${s.arr}{/yellow-fg}`,
            `Soft Drop Speed:   {yellow-fg}${s.softDropSpeed}x{/yellow-fg}`,
            `Ghost Piece:       {yellow-fg}${s.ghostPiece ? 'ON' : 'OFF'}{/yellow-fg}`,
            `Lock Delay (ms):   {yellow-fg}${s.lockDelay}{/yellow-fg}`,
            `Preview Count:     {yellow-fg}${s.previewCount}{/yellow-fg}`,
            `Music Volume:      {yellow-fg}${Math.floor(s.musicVolume * 100)}%{/yellow-fg}`,
            `SFX Volume:        {yellow-fg}${Math.floor(s.sfxVolume * 100)}%{/yellow-fg}`,
            '',
            '{cyan-fg}--- VISUAL EFFECTS ---{/cyan-fg}',
            `Block Glow:        {yellow-fg}${s.blockGlow ? 'ON' : 'OFF'}{/yellow-fg}`,
            `Glow Intensity:    {yellow-fg}${Math.floor(s.glowIntensity * 100)}%{/yellow-fg}`,
            `Clear Style:       {yellow-fg}${s.clearStyle.toUpperCase()}{/yellow-fg}`,
            `Clear Direction:   {yellow-fg}${s.clearDirection.toUpperCase()}{/yellow-fg}`,
            `Placement Effects: {yellow-fg}${s.placementEffects ? 'ON' : 'OFF'}{/yellow-fg}`,
            `Floating Text:     {yellow-fg}${s.floatTextMode.toUpperCase()}{/yellow-fg}`,
            `B2B Glow:          {yellow-fg}${s.b2bGlowEnabled ? 'ON' : 'OFF'}{/yellow-fg}`,
            `Connected Blocks:  {yellow-fg}${s.connectedBlocks ? 'ON' : 'OFF'}{/yellow-fg}`,
            '',
            '{cyan-fg}--- KEY BINDINGS ---{/cyan-fg}',
            `Move Left:         {yellow-fg}${formatKeyBinding(kb.left)}{/yellow-fg}`,
            `Move Right:        {yellow-fg}${formatKeyBinding(kb.right)}{/yellow-fg}`,
            `Rotate CW (X):     {yellow-fg}${formatKeyBinding(kb.rotateCW)}{/yellow-fg}`,
            `Rotate CCW (Z):    {yellow-fg}${formatKeyBinding(kb.rotateCCW)}{/yellow-fg}`,
            `Rotate 180:        {yellow-fg}${formatKeyBinding(kb.rotate180)}{/yellow-fg}`,
            `Soft Drop:         {yellow-fg}${formatKeyBinding(kb.softDrop)}{/yellow-fg}`,
            `Hard Drop:         {yellow-fg}${formatKeyBinding(kb.hardDrop)}{/yellow-fg}`,
            `Hold:              {yellow-fg}${formatKeyBinding(kb.hold)}{/yellow-fg}`,
            `Pause:             {yellow-fg}${formatKeyBinding(kb.pause)}{/yellow-fg}`,
            '',
            '{green-fg}Save & Exit{/green-fg}',
        ];
    }
    /**
     * Get description for menu item
     */
    getDescription(index) {
        const descriptions = [
            'Rotation system (SRS, ARS, NRS, BARS)',
            'Delayed Auto-Shift: time before auto-repeat starts',
            'Auto-Repeat Rate: time between repeats',
            'Soft drop speed multiplier',
            'Show ghost piece at drop position',
            'Lock delay: time before piece locks',
            'Number of next pieces to preview',
            'Background music volume',
            'Sound effects volume',
            '',
            '', // VISUAL EFFECTS header
            'Enable/disable block glow effects',
            'Glow intensity (0-100%)',
            'Line clear animation style (inward/outward/instant/directional)',
            'Clear direction for directional style (in/out)',
            'Enable/disable piece placement effects',
            'Floating text mode (off/offboard/all)',
            'Enable/disable back-to-back glow bonus',
            'Enable/disable connected block rendering',
            '',
            '', // KEY BINDINGS header
            'Press any key to rebind Move Left',
            'Press any key to rebind Move Right',
            'Press any key to rebind Rotate Clockwise',
            'Press any key to rebind Rotate Counter-Clockwise',
            'Press any key to rebind Rotate 180',
            'Press any key to rebind Soft Drop',
            'Press any key to rebind Hard Drop',
            'Press any key to rebind Hold',
            'Press any key to rebind Pause',
            '',
            'Save changes and return to menu',
        ];
        return `${descriptions[index] || ''}`;
    }
    /**
     * Handle menu selection
     */
    async handleSelection(index, menu) {
        const s = this.state.settings;
        switch (index) {
            case 0: // Rotation System
                await this.cycleRotationSystem();
                break;
            case 1: // DAS
                await this.adjustValue('das', 10, 50, 300, 10);
                break;
            case 2: // ARR
                await this.adjustValue('arr', 0, 1, 50, 1);
                break;
            case 3: // Soft Drop Speed
                await this.adjustValue('softDropSpeed', 1, 1, 40, 1);
                break;
            case 4: // Ghost Piece
                s.ghostPiece = !s.ghostPiece;
                break;
            case 5: // Lock Delay
                await this.adjustValue('lockDelay', 100, 100, 2000, 50);
                break;
            case 6: // Preview Count
                await this.adjustValue('previewCount', 1, 1, 6, 1);
                break;
            case 7: // Music Volume
                await this.adjustVolume('musicVolume');
                break;
            case 8: // SFX Volume
                await this.adjustVolume('sfxVolume');
                break;
            // Visual Effects (index 10 = header, 11-18 = settings)
            case 11: // Block Glow
                s.blockGlow = !s.blockGlow;
                break;
            case 12: // Glow Intensity
                await this.adjustGlowIntensity();
                break;
            case 13: // Clear Style
                await this.cycleClearStyle();
                break;
            case 14: // Clear Direction
                s.clearDirection = s.clearDirection === 'in' ? 'out' : 'in';
                break;
            case 15: // Placement Effects
                s.placementEffects = !s.placementEffects;
                break;
            case 16: // Floating Text
                await this.cycleFloatTextMode();
                break;
            case 17: // B2B Glow
                s.b2bGlowEnabled = !s.b2bGlowEnabled;
                break;
            case 18: // Connected Blocks
                s.connectedBlocks = !s.connectedBlocks;
                break;
            // Key bindings (index 20 = header, 21-29 = bindings)
            case 21: // Move Left
                await this.editKeyBinding('left', 'Move Left');
                break;
            case 22: // Move Right
                await this.editKeyBinding('right', 'Move Right');
                break;
            case 23: // Rotate CW
                await this.editKeyBinding('rotateCW', 'Rotate Clockwise');
                break;
            case 24: // Rotate CCW
                await this.editKeyBinding('rotateCCW', 'Rotate Counter-Clockwise');
                break;
            case 25: // Rotate 180
                await this.editKeyBinding('rotate180', 'Rotate 180');
                break;
            case 26: // Soft Drop
                await this.editKeyBinding('softDrop', 'Soft Drop');
                break;
            case 27: // Hard Drop
                await this.editKeyBinding('hardDrop', 'Hard Drop');
                break;
            case 28: // Hold
                await this.editKeyBinding('hold', 'Hold');
                break;
            case 29: // Pause
                await this.editKeyBinding('pause', 'Pause');
                break;
            // Note: Save & Exit (case 31) is handled directly in menu.on('select')
        }
        // Update menu items
        menu.setItems(this.getMenuItems());
    }
    /**
     * Cycle rotation system
     */
    async cycleRotationSystem() {
        const systems = ['SRS', 'ARS', 'NRS', 'BARS'];
        const current = systems.indexOf(this.state.settings.rotationSystem);
        const next = (current + 1) % systems.length;
        this.state.settings.rotationSystem = systems[next];
    }
    /**
     * Adjust numeric value
     */
    async adjustValue(key, value, min, max, step) {
        const current = this.state.settings[key];
        // Show input dialog
        const inputBox = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            top: 'center',
            left: 'center',
            width: 50,
            height: 8,
            border: { type: 'line' },
            style: { border: { fg: 'yellow' } },
            content: `{bold}${key.toUpperCase()}{/bold}\n\n` +
                `Current: {yellow-fg}${current}{/yellow-fg}\n` +
                `Range: ${min} - ${max}\n\n` +
                `{gray-fg}Use Left/Right arrows to adjust{/gray-fg}\n` +
                `{gray-fg}Press Enter to confirm{/gray-fg}`,
            fixed: true,
            focusable: true, // Steal focus from menu so Enter doesn't re-trigger menu.on('select')
        });
        inputBox.focus();
        let newValue = current;
        return new Promise((resolve) => {
            const settingKey = key; // Capture the setting key before it gets shadowed
            const keyHandler = (_ch, keyEvent) => {
                if (keyEvent.name === 'left') {
                    newValue = Math.max(min, newValue - step);
                    this.sounds.playSfx('menu_select');
                    inputBox.setContent(`{bold}${settingKey.toUpperCase()}{/bold}\n\n` +
                        `Current: {yellow-fg}${newValue}{/yellow-fg}\n` +
                        `Range: ${min} - ${max}\n\n` +
                        `{gray-fg}Use Left/Right arrows to adjust{/gray-fg}\n` +
                        `{gray-fg}Press Enter to confirm{/gray-fg}`);
                    this.screen.render();
                }
                else if (keyEvent.name === 'right') {
                    newValue = Math.min(max, newValue + step);
                    this.sounds.playSfx('menu_select');
                    inputBox.setContent(`{bold}${settingKey.toUpperCase()}{/bold}\n\n` +
                        `Current: {yellow-fg}${newValue}{/yellow-fg}\n` +
                        `Range: ${min} - ${max}\n\n` +
                        `{gray-fg}Use Left/Right arrows to adjust{/gray-fg}\n` +
                        `{gray-fg}Press Enter to confirm{/gray-fg}`);
                    this.screen.render();
                }
                else if (keyEvent.name === 'return' || keyEvent.name === 'enter') {
                    this.state.settings[settingKey] = newValue; // Use settingKey, not keyEvent
                    this.sounds.playSfx('menu_ok');
                    this.screen.removeListener('keypress', keyHandler);
                    inputBox.destroy();
                    this.screen.render();
                    resolve();
                }
                else if (keyEvent.name === 'escape') {
                    this.sounds.playSfx('menu_select');
                    this.screen.removeListener('keypress', keyHandler);
                    inputBox.destroy();
                    this.screen.render();
                    resolve();
                }
            };
            this.screen.on('keypress', keyHandler);
            this.screen.render();
        });
    }
    /**
     * Adjust volume (0.0 - 1.0)
     */
    async adjustVolume(settingKey) {
        const current = Math.floor(this.state.settings[settingKey] * 100);
        // Show volume bar
        const volumeBox = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            top: 'center',
            left: 'center',
            width: 50,
            height: 7,
            border: { type: 'line' },
            style: { border: { fg: 'yellow' } },
            content: '',
            fixed: true,
            focusable: true, // Steal focus from menu so Enter doesn't re-trigger menu.on('select')
        });
        let volume = current;
        const updateDisplay = () => {
            const bar = '='.repeat(Math.floor(volume / 5)) + ' '.repeat(20 - Math.floor(volume / 5));
            volumeBox.setContent(`{bold}${settingKey === 'musicVolume' ? 'MUSIC' : 'SFX'} VOLUME{/bold}\n\n` +
                `[${bar}] {yellow-fg}${volume}%{/yellow-fg}\n\n` +
                `{gray-fg}Left/Right: Adjust | Enter: Confirm{/gray-fg}`);
        };
        updateDisplay();
        volumeBox.focus();
        return new Promise((resolve) => {
            const keyHandler = (_ch, keyEvent) => {
                if (keyEvent.name === 'left') {
                    volume = Math.max(0, volume - 5);
                    this.sounds.playSfx('menu_select');
                    updateDisplay();
                    this.screen.render();
                }
                else if (keyEvent.name === 'right') {
                    volume = Math.min(100, volume + 5);
                    this.sounds.playSfx('menu_select');
                    updateDisplay();
                    this.screen.render();
                }
                else if (keyEvent.name === 'return' || keyEvent.name === 'enter') {
                    this.state.settings[settingKey] = volume / 100;
                    this.sounds.playSfx('menu_ok');
                    this.screen.removeListener('keypress', keyHandler);
                    volumeBox.destroy();
                    this.screen.render();
                    resolve();
                }
                else if (keyEvent.name === 'escape') {
                    this.sounds.playSfx('menu_select');
                    this.screen.removeListener('keypress', keyHandler);
                    volumeBox.destroy();
                    this.screen.render();
                    resolve();
                }
            };
            this.screen.on('keypress', keyHandler);
            this.screen.render();
        });
    }
    /**
     * Edit a key binding
     */
    async editKeyBinding(bindingKey, displayName) {
        const kb = this.state.settings.keyBindings;
        const currentKeys = kb[bindingKey];
        // Show key binding dialog
        const bindingBox = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            top: 'center',
            left: 'center',
            width: 55,
            height: 12,
            border: { type: 'line' },
            style: { border: { fg: 'cyan' } },
            content: '',
            fixed: true,
            focusable: true, // Steal focus from menu so Enter doesn't re-trigger menu.on('select')
        });
        const keys = [...(currentKeys || [])];
        const updateDisplay = () => {
            bindingBox.setContent(`{bold}{cyan-fg}${displayName.toUpperCase()}{/cyan-fg}{/bold}\n\n` +
                `Current: {yellow-fg}${formatKeyBinding(keys)}{/yellow-fg}\n\n` +
                `{gray-fg}Press a key to add it to the binding{/gray-fg}\n` +
                `{gray-fg}Press Backspace to remove last key{/gray-fg}\n` +
                `{gray-fg}Press Delete to clear all keys{/gray-fg}\n` +
                `{gray-fg}Press Enter to save, Escape to cancel{/gray-fg}`);
        };
        updateDisplay();
        bindingBox.focus();
        this.screen.render();
        return new Promise((resolve) => {
            const keyHandler = (_ch, key) => {
                if (!key)
                    return;
                const keyName = key.full || key.name;
                if (keyName === 'return' || keyName === 'enter') {
                    // Save binding
                    if (keys.length > 0) {
                        kb[bindingKey] = keys;
                    }
                    this.screen.removeListener('keypress', keyHandler);
                    bindingBox.destroy();
                    this.screen.render();
                    resolve();
                }
                else if (keyName === 'escape') {
                    // Cancel
                    this.screen.removeListener('keypress', keyHandler);
                    bindingBox.destroy();
                    this.screen.render();
                    resolve();
                }
                else if (keyName === 'backspace') {
                    // Remove last key
                    if (keys.length > 0) {
                        keys.pop();
                        updateDisplay();
                        this.screen.render();
                    }
                }
                else if (keyName === 'delete') {
                    // Clear all keys
                    keys.length = 0;
                    updateDisplay();
                    this.screen.render();
                }
                else {
                    // Add key if not already present
                    if (!keys.includes(keyName) && keys.length < 4) {
                        keys.push(keyName);
                        updateDisplay();
                        this.screen.render();
                    }
                }
            };
            this.screen.on('keypress', keyHandler);
        });
    }
    /**
     * Adjust glow intensity
     */
    async adjustGlowIntensity() {
        const current = Math.floor(this.state.settings.glowIntensity * 100);
        const min = 0;
        const max = 100;
        const step = 10;
        // Cycle through values
        let next = current + step;
        if (next > max)
            next = min;
        this.state.settings.glowIntensity = next / 100;
    }
    /**
     * Cycle clear style
     */
    async cycleClearStyle() {
        const styles = ['inward', 'outward', 'instant', 'directional'];
        const current = styles.indexOf(this.state.settings.clearStyle);
        const next = (current + 1) % styles.length;
        this.state.settings.clearStyle = styles[next];
    }
    /**
     * Cycle floating text mode
     */
    async cycleFloatTextMode() {
        const modes = ['off', 'offboard', 'all'];
        const current = modes.indexOf(this.state.settings.floatTextMode);
        const next = (current + 1) % modes.length;
        this.state.settings.floatTextMode = modes[next];
    }
}
exports.SettingsScreen = SettingsScreen;
//# sourceMappingURL=settings-screen.js.map