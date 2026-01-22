/**
 * Effect Renderer - Converts effect codes to visual representations for live preview
 *
 * Maps animation effect codes to static blessed tags for real-time display
 */

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
export function renderEffectsForInput(text: string): string {
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
 * Overrides the _updateContent method to render effects in real-time
 */
export function enableLiveEffectRendering(textarea: any): void {
  // Store original _updateContent method
  const originalUpdateContent = textarea._updateContent;
  if (!originalUpdateContent) return;

  // Override _updateContent to render effects
  textarea._updateContent = function() {
    // Get the raw value with effect codes
    const rawValue = this.value;

    // Temporarily set value to rendered version for display
    const renderedValue = renderEffectsForInput(rawValue);

    // Store raw value
    const savedValue = this.value;
    this.value = renderedValue;

    // Call original update (this renders the display)
    originalUpdateContent.call(this);

    // Restore raw value (so getValue() returns codes intact)
    this.value = savedValue;
  };
}
