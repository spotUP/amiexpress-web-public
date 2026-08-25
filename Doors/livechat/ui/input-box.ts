/**
 * Input box component
 * Text input for chat messages with emoji button
 */
import { Screen, textarea, Button } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createButton } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { STATUS_HEIGHT } from './status-bar';
import { PANEL_BORDER, PANEL_BORDER_FOCUS } from './theme';

export const INPUT_HEIGHT = 3;
export const EMOJI_BUTTON_WIDTH = 6;  // Wide enough for :D with border and padding

export function createInputBox(screen: Screen) {
  const screenWidth = (screen as any).width || 80;

  // Use SDK custom Textarea class (via factory function) which has built-in
  // effect rendering via _convertEffectTags() that converts ~wave~, ~rainbow~, etc.
  // to blessed color tags automatically while preserving selection markers.
  const input = textarea({
    parent: screen,
    bottom: STATUS_HEIGHT,
    left: 0,
    width: screenWidth - EMOJI_BUTTON_WIDTH,  // Leave space for emoji button
    height: INPUT_HEIGHT,
    label: ' Message ',
    border: {
      type: 'line',
      labelStyle: { fg: 'white', bg: 'blue' }  // Blue background for label
    },
    inputOnFocus: true,
    // tags: true is forced by factory function
    mouse: true,
    ch: ' ',  // CRITICAL: Fill background to prevent corruption from overlapping widgets
    style: {
      fg: 'white',
      bg: 'black',
      border: { fg: PANEL_BORDER },
      focus: { border: { fg: PANEL_BORDER_FOCUS } },
    },
    // @ts-ignore - zIndex exists but not in types
    zIndex: 5000,  // Below command suggestions (10000) but above other elements
  });

  // Ensure input renders after other elements
  input.setIndex(500);

  return input;
}

export function createEmojiButton(screen: Screen): Button {
  const screenWidth = (screen as any).width || 80;

  return createButton({
    parent: screen,
    bottom: STATUS_HEIGHT,
    left: screenWidth - EMOJI_BUTTON_WIDTH,  // Position at right edge
    width: EMOJI_BUTTON_WIDTH,
    height: INPUT_HEIGHT,
    content: '{center}{yellow-fg}:D{/yellow-fg}{/center}',
    border: { type: 'line', fg: PANEL_BORDER },
    tags: true,  // Enable tag parsing for content
    mouse: true,
    keys: true,
    clickable: true,
    style: {
      fg: 'yellow',
      bg: 'black',
      focus: {
        fg: 'black',
        bg: 'yellow'
      },
      hover: {
        fg: 'black',
        bg: 'yellow'
      }
    },
  });
}
