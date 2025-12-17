/** Create input box component */
export function createInputBox(blessed: any, screen: any) {
  return blessed.box({
    parent: screen,
    bottom: 1,
    left: 16,
    width: '100%-16',
    height: 3,
    border: { type: 'line' },
    label: ' Message ',
    style: {
      fg: 'white',
      bg: 'black',
      border: { fg: 'green' },
      label: { fg: 'green' }
    },
    tags: true,
    content: '> _'
  });
}

/** Update input box content */
export function updateInputBox(box: any, buffer: string): void {
  box.setContent(`> ${buffer}_`);
}

/** Clear input box */
export function clearInputBox(box: any): void {
  box.setContent('> _');
}

/** Show input hint */
export function showInputHint(box: any, hint: string): void {
  box.setContent(`{gray-fg}${hint}{/gray-fg}`);
}

/** Set input box focus style */
export function setInputFocused(box: any, focused: boolean): void {
  if (focused) {
    box.style.border.fg = 'yellow';
  } else {
    box.style.border.fg = 'green';
  }
}
