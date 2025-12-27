/**
 * Input box component
 * Text input for chat messages
 */
import blessed, { Screen, Textbox } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { STATUS_HEIGHT } from './status-bar';

export const INPUT_HEIGHT = 3;

export function createInputBox(screen: Screen): Textbox {
  return blessed.textbox({
    parent: screen,
    bottom: STATUS_HEIGHT,
    left: 0,
    width: '100%',
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
}
