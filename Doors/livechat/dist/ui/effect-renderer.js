"use strict";
/**
 * Effect Renderer - Converts effect codes to visual representations for live preview
 *
 * Maps animation effect codes to static blessed tags for real-time display
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderEffectsForInput = renderEffectsForInput;
exports.enableLiveEffectRendering = enableLiveEffectRendering;
/**
 * Convert effect codes to blessed tags for live preview in input field
 *
 * Effect mappings:
 * - ~rainbow~text~/rainbow~ → Rainbow gradient (uses magenta as primary)
 * - ~pulse~text~/pulse~ → Pulsing bright text (uses bright cyan + bold)
 * - ~sparkle~text~/sparkle~ → Sparkling text (uses bright yellow)
 * - ~shake~text~/shake~ → Shaking text (uses red for attention)
 * - ~wave~text~/wave~ → Wave effect (uses bright blue)
 * - ~gradient~text~/gradient~ → Gradient (uses first color if specified)
 */
function renderEffectsForInput(text) {
    let result = text;
    // Rainbow effect → magenta (vibrant color representing rainbow)
    result = result.replace(/~rainbow~(.*?)~\/rainbow~/g, '{magenta-fg}{bold}$1{/bold}{/}');
    // Pulse effect → bright cyan + bold
    result = result.replace(/~pulse~(.*?)~\/pulse~/g, '{cyan-fg}{bold}$1{/bold}{/}');
    // Sparkle effect → bright yellow
    result = result.replace(/~sparkle~(.*?)~\/sparkle~/g, '{yellow-fg}{bold}$1{/bold}{/}');
    // Shake effect → red (attention-grabbing)
    result = result.replace(/~shake~(.*?)~\/shake~/g, '{red-fg}{bold}$1{/bold}{/}');
    // Wave effect → bright blue
    result = result.replace(/~wave~(.*?)~\/wave~/g, '{blue-fg}{bold}$1{/bold}{/}');
    // Gradient effect → extract first color or use default
    result = result.replace(/~gradient\s+from=(\w+)\s+to=\w+~(.*?)~\/gradient~/g, '{$1-fg}$2{/}');
    result = result.replace(/~gradient~(.*?)~\/gradient~/g, '{cyan-fg}$1{/}'); // Fallback
    return result;
}
/**
 * Enable live effect rendering for a textarea
 * Hooks into the change event to update display with rendered effects
 */
function enableLiveEffectRendering(textarea) {
    // Store raw value separately
    let rawValue = textarea.value || '';
    // Override setValue to intercept and store raw value
    const originalSetValue = textarea.setValue.bind(textarea);
    textarea.setValue = function (value) {
        rawValue = value;
        const rendered = renderEffectsForInput(value);
        originalSetValue(rendered);
    };
    // Override getValue to return raw value with codes
    const originalGetValue = textarea.getValue.bind(textarea);
    textarea.getValue = function () {
        return rawValue;
    };
    // Hook into change events to update display
    textarea.on('change', function (value) {
        // Store the raw value
        rawValue = value;
        // Update internal value to rendered version for display
        const rendered = renderEffectsForInput(value);
        if (textarea.value !== rendered) {
            textarea.value = rendered;
            // Force display update
            if (typeof textarea.setContent === 'function') {
                textarea.setContent(rendered);
            }
            // Trigger render
            if (textarea.screen) {
                textarea.screen.render();
            }
        }
    });
    // Apply initial rendering
    if (rawValue) {
        const rendered = renderEffectsForInput(rawValue);
        originalSetValue(rendered);
    }
}
