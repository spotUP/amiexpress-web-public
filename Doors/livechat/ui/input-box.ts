/**
 * Input box component
 * Text input for chat messages with emoji button
 */
import { Screen, Textarea } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createTextarea, createButton } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { STATUS_HEIGHT } from './status-bar';

export const INPUT_HEIGHT = 3;
export const EMOJI_BUTTON_WIDTH = 6;  // Width for emoji button ":)"

export function createInputBox(screen: Screen): { inputBox: Textarea; emojiButton: any } {
  const screenWidth = (screen as any).width || 80;

  const inputBox = createTextarea({
    parent: screen,
    bottom: STATUS_HEIGHT,
    left: 0,
    width: screenWidth - EMOJI_BUTTON_WIDTH,
    height: INPUT_HEIGHT,
    label: ' Message ',
    border: { type: 'line' },
    inputOnFocus: true,
    mouse: true,
    style: {
      fg: 'white',
      bg: 'black',
      border: { fg: 'yellow' },
    },
  });

  const emojiButton = createButton({
    parent: screen,
    bottom: STATUS_HEIGHT + 1,  // +1 to align with input content (skip top border)
    right: 1,
    width: EMOJI_BUTTON_WIDTH - 2,  // -2 for spacing
    height: 1,
    content: ':)',
    mouse: true,
    clickable: true,
    style: {
      fg: 'yellow',
      bg: 'black',
      hover: {
        fg: 'black',
        bg: 'yellow',
      },
      focus: {
        fg: 'black',
        bg: 'yellow',
      },
    },
  });

  return { inputBox, emojiButton };
}
