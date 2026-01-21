/**
 * Input box component
 * Text input for chat messages with emoji button
 */
import { Screen, Textarea, Button } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createTextarea, createButton } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { STATUS_HEIGHT } from './status-bar';

export const INPUT_HEIGHT = 3;
export const EMOJI_BUTTON_WIDTH = 6;  // Wide enough for :D with border and padding

export function createInputBox(screen: Screen): Textarea {
  const screenWidth = (screen as any).width || 80;

  return createTextarea({
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
    tags: true,
    mouse: true,
    style: {
      fg: 'white',
      bg: 'black',
      border: { fg: 'yellow' },
    },
  });
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
    border: { type: 'line', fg: 'yellow' },
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
