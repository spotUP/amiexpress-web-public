# InputEngine Quick Reference

Fast lookup for InputEngine APIs. Maps keyboard inputs to game actions.

## Import

```typescript
import { InputEngine } from '@amiexpress/sdk/engines/input';
const input = new InputEngine();
```

## Binding Actions

```typescript
// Bind single key to action
input.bindAction('jump', 'space');
input.bindAction('left', 'a');
input.bindAction('right', 'd');
input.bindAction('up', 'w');
input.bindAction('down', 's');

// Bind multiple keys to same action
input.bindAction('confirm', 'enter');
input.bindAction('confirm', 'space');

// Unbind
input.unbindAction('jump', 'space');
input.unbindAction('jump');  // Remove all bindings for action
```

## Processing Input

```typescript
// Process keypress and get action
const action = input.processInput('space');
// Returns: 'jump' (or null if not bound)

// Check if action is triggered
if (input.processInput(key) === 'jump') {
  player.jump();
}
```

## Common Key Names

| Key | Name |
|-----|------|
| Space | `'space'` |
| Enter | `'enter'` |
| Escape | `'escape'` |
| Tab | `'tab'` |
| Backspace | `'backspace'` |
| Arrows | `'up'`, `'down'`, `'left'`, `'right'` |
| Letters | `'a'` - `'z'` |
| Numbers | `'0'` - `'9'` |
| Function | `'f1'` - `'f12'` |

## Getting Bindings

```typescript
// Get keys bound to action
const jumpKeys = input.getKeysForAction('jump');
// Returns: ['space', 'w']

// Get action for key
const action = input.getActionForKey('space');
// Returns: 'jump'

// Get all bindings
const allBindings = input.getAllBindings();
// Returns: Map<string, string[]>
```

## Configuration

```typescript
// Create with preset bindings
const input = new InputEngine({
  bindings: {
    'jump': ['space', 'w'],
    'left': ['a', 'left'],
    'right': ['d', 'right'],
    'shoot': ['j', 'z'],
    'menu': ['escape']
  }
});
```

## Typical Game Bindings

### Platformer
```typescript
input.bindAction('left', 'a');
input.bindAction('left', 'left');
input.bindAction('right', 'd');
input.bindAction('right', 'right');
input.bindAction('jump', 'space');
input.bindAction('jump', 'w');
input.bindAction('shoot', 'j');
```

### RPG / Menu Navigation
```typescript
input.bindAction('up', 'w');
input.bindAction('up', 'up');
input.bindAction('down', 's');
input.bindAction('down', 'down');
input.bindAction('left', 'a');
input.bindAction('left', 'left');
input.bindAction('right', 'd');
input.bindAction('right', 'right');
input.bindAction('confirm', 'enter');
input.bindAction('confirm', 'space');
input.bindAction('cancel', 'escape');
input.bindAction('menu', 'tab');
```

### Tetris
```typescript
input.bindAction('left', 'a');
input.bindAction('left', 'left');
input.bindAction('right', 'd');
input.bindAction('right', 'right');
input.bindAction('down', 's');
input.bindAction('down', 'down');
input.bindAction('rotate', 'w');
input.bindAction('rotate', 'up');
input.bindAction('drop', 'space');
input.bindAction('hold', 'c');
```

## Integration with Door

```typescript
import { Door } from '@amiexpress/sdk';
import { InputEngine } from '@amiexpress/sdk/engines/input';

const door = new Door('MyGame');
const input = new InputEngine();

// Setup bindings
input.bindAction('quit', 'q');
input.bindAction('help', 'h');

// Process in key handler
door.onKey((key) => {
  const action = input.processInput(key);

  switch (action) {
    case 'quit':
      door.exit();
      break;
    case 'help':
      showHelp();
      break;
    // ... handle other actions
  }
});
```

## Cleanup

```typescript
input.dispose();  // Clear all bindings
```
