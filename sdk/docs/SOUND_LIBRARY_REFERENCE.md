# SDK Sound Library Reference

Procedural Tone.js sounds for BBS doors. All sounds are synthesized in real-time - no audio files needed.

## Quick Start

```typescript
import { AudioEngine } from '@amiexpress/bbs-door-sdk';

const audio = new AudioEngine();

// Initialize (requires user interaction in browser)
await audio.init();

// Play any sound by name
audio.playSound('click');
audio.playSound('sword-swing');
audio.playSound('card-deal');
```

## Hybrid Door Pattern

For hybrid doors (server UI + client audio):

**client.ts:**
```typescript
import { ClientDoor } from '@amiexpress/bbs-door-sdk/client';
import * as Tone from 'tone';

const door = new ClientDoor({ name: 'MyGame', hybrid: true });

let audioReady = false;

door.onMessage('sound', async (data: { type: string }) => {
  if (!audioReady) {
    await Tone.start();
    audioReady = true;
  }
  // Use AudioEngine or custom Tone.js sounds
  audio.playSound(data.type);
});
```

**server.ts:**
```typescript
// Emit sound to client
session.socket.emit('door:message', { type: 'sound', data: { type: 'card-deal' } });
```

---

## Sound Categories

### UI Sounds

| Sound ID | Description | Use Case |
|----------|-------------|----------|
| `click` | Crisp UI click | Button press, menu selection |
| `hover` | Subtle tick | Mouse hover, focus change |
| `error` | Dissonant buzz | Invalid input, failed action |
| `success` | Bright ascending | Completed action, save success |
| `notification` | Gentle bell | New message, alert |
| `typing` | Keyboard tick | Text input feedback |
| `confirm` | Positive arpeggio | Dialog confirm, accept |
| `cancel` | Descending tones | Dialog cancel, back |
| `toggle` | Switch click | Checkbox, toggle switch |
| `menu-beep` | Simple beep | Legacy menu sound |

**Example:**
```typescript
// Form validation
if (isValid) {
  audio.playSound('success');
} else {
  audio.playSound('error');
}

// Menu navigation
menuList.on('select', () => audio.playSound('click'));
menuList.on('focus', () => audio.playSound('hover'));
```

---

### Combat Sounds

| Sound ID | Description | Use Case |
|----------|-------------|----------|
| `sword-swing` | Whoosh + metallic | Melee attack |
| `arrow` | Quick whistle | Ranged attack |
| `magic-cast` | Mystical shimmer | Spell casting |
| `shield-block` | Metallic clang | Blocking attack |
| `critical-hit` | Impact + noise | Critical damage |
| `punch` | Deep thud | Unarmed strike |
| `slash` | Quick cut | Fast melee |
| `parry` | Light deflect | Defensive move |
| `hit` | White noise burst | Generic damage |
| `laser` | Saw wave sweep | Sci-fi weapon |
| `explosion` | Pink noise decay | Area damage |

**Example:**
```typescript
function attack(type: string, isCritical: boolean) {
  if (type === 'sword') {
    audio.playSound('sword-swing');
  } else if (type === 'bow') {
    audio.playSound('arrow');
  } else if (type === 'fireball') {
    audio.playSound('magic-cast');
  }

  if (isCritical) {
    audio.playSound('critical-hit');
  }
}

function takeDamage(blocked: boolean) {
  if (blocked) {
    audio.playSound('shield-block');
  } else {
    audio.playSound('hit');
  }
}
```

---

### Item Sounds

| Sound ID | Description | Use Case |
|----------|-------------|----------|
| `pickup` | Ascending tones | Collect item |
| `drop` | Descending tones | Drop item |
| `equip` | Metallic click | Equip gear |
| `potion-drink` | Gulp sequence | Use consumable |
| `chest-open` | Creak + sparkle | Open container |
| `key-collect` | Metallic jingle | Get key item |
| `gold-collect` | High coin clink | Get currency |
| `coin` | Classic coin sound | Legacy alias |

**Example:**
```typescript
function collectItem(item: Item) {
  if (item.type === 'gold') {
    audio.playSound('gold-collect');
  } else if (item.type === 'key') {
    audio.playSound('key-collect');
  } else {
    audio.playSound('pickup');
  }
}

function openChest() {
  audio.playSound('chest-open');
  // Show loot...
}

function usePotion() {
  audio.playSound('potion-drink');
  player.heal(50);
}
```

---

### Movement Sounds

| Sound ID | Description | Use Case |
|----------|-------------|----------|
| `footstep` | Soft step | Walking |
| `jump` | Ascending square | Jump start |
| `land` | Impact thud | Landing |
| `dash` | Quick whoosh | Sprint/dodge |
| `teleport` | Sci-fi warp | Instant travel |
| `swim` | Water splash | Swimming |
| `climb` | Grip sound | Climbing |

**Example:**
```typescript
function move(direction: string) {
  audio.playSound('footstep');
  player.position += direction;
}

function jump() {
  audio.playSound('jump');
  // On landing:
  audio.playSound('land');
}

function dash() {
  audio.playSound('dash');
  player.invulnerable = true;
}
```

---

### Environment Sounds

| Sound ID | Description | Use Case |
|----------|-------------|----------|
| `door-open` | Creaky hinge | Open door |
| `door-close` | Thud | Close door |
| `switch` | Mechanical click | Activate lever/switch |
| `alarm` | Warning siren | Alert, danger |

**Example:**
```typescript
function interactDoor(door: Door) {
  if (door.isOpen) {
    audio.playSound('door-close');
    door.close();
  } else {
    audio.playSound('door-open');
    door.open();
  }
}

function triggerAlarm() {
  audio.playSound('alarm');
  spawnEnemies();
}
```

---

### Card/Casino Sounds

| Sound ID | Description | Use Case |
|----------|-------------|----------|
| `card-deal` | Quick snap | Deal card |
| `card-flip` | Layered snap | Reveal card |
| `card-shuffle` | Multiple snaps | Shuffle deck |
| `card-flap` | Single flap | Card movement |
| `chips-bet` | Ceramic click | Place bet |
| `chips-win` | Cascading chips | Win pot |
| `chips-pot` | Single chip | Add to pot |
| `dice-roll` | Rattling | Roll dice |
| `slot-spin` | Mechanical whir | Slot machine |
| `jackpot` | Celebratory fanfare | Big win |

**Example:**
```typescript
// Poker game
function dealCard(player: Player) {
  audio.playSound('card-deal');
  player.hand.push(deck.draw());
}

function revealCommunityCard() {
  audio.playSound('card-flip');
  board.push(deck.draw());
}

function placeBet(amount: number) {
  audio.playSound('chips-bet');
  pot += amount;
}

function winPot(player: Player) {
  audio.playSound('chips-win');
  player.chips += pot;
}

// Blackjack
function shuffle() {
  audio.playSound('card-shuffle');
  deck.shuffle();
}

// Slots
function spin() {
  audio.playSound('slot-spin');
  if (isJackpot()) {
    audio.playSound('jackpot');
  }
}
```

---

### Retro/Chiptune Sounds

| Sound ID | Description | Use Case |
|----------|-------------|----------|
| `blip` | Classic high beep | Selection, cursor |
| `boop` | Lower beep | Alternate selection |
| `zap` | Electric sweep | Damage, shock |
| `warp` | Teleport whoosh | Scene transition |
| `1up` | Extra life jingle | Bonus life |
| `death` | Descending notes | Player death |
| `pause` | Pause sound | Game pause |
| `unpause` | Resume sound | Game resume |
| `select` | Menu select | Cursor movement |
| `start` | Game start | Begin game |
| `powerup` | Ascending arpeggio | Get power-up |
| `gameover` | Sad descending | Game over |
| `level-up` | Achievement jingle | Level complete |
| `countdown` | Countdown beep | Timer tick |
| `countdown-go` | Final beep | Timer complete |

**Example:**
```typescript
// Classic game flow
function startGame() {
  audio.playSound('start');
  gameState = 'playing';
}

function pauseGame() {
  audio.playSound('pause');
  gameState = 'paused';
}

function resumeGame() {
  audio.playSound('unpause');
  gameState = 'playing';
}

function playerDied() {
  lives--;
  if (lives > 0) {
    audio.playSound('death');
    respawn();
  } else {
    audio.playSound('gameover');
    showGameOver();
  }
}

function collectPowerUp() {
  audio.playSound('powerup');
  player.powered = true;
}

function completeLevel() {
  audio.playSound('level-up');
  level++;
}

function countdown(seconds: number) {
  for (let i = seconds; i > 0; i--) {
    setTimeout(() => audio.playSound('countdown'), (seconds - i) * 1000);
  }
  setTimeout(() => audio.playSound('countdown-go'), seconds * 1000);
}
```

---

## Volume Control

```typescript
// Master volume (affects everything)
audio.setMasterVolume(0.8);  // 0.0 - 1.0

// Music volume
audio.setMusicVolume(0.5);

// SFX volume
audio.setSFXVolume(0.9);

// Mute/unmute
audio.setEnabled(false);  // Mute all
audio.setEnabled(true);   // Unmute
```

---

## Custom Sounds

For sounds not in the library:

```typescript
audio.playCustomSound({
  type: 'custom',
  frequency: 440,      // Hz
  duration: 0.2,       // seconds
  volume: 0.7,         // 0.0 - 1.0
  envelope: 'pluck'    // 'pluck' | 'sustain' | 'fade'
});
```

---

## Configuration

```typescript
const audio = new AudioEngine({
  masterVolume: 0.7,   // Default master volume
  musicVolume: 0.5,    // Default music volume
  sfxVolume: 0.8,      // Default SFX volume
  enabled: true        // Audio enabled by default
});
```

---

## Complete Sound List

All 65 available sounds:

**UI (10):** click, hover, error, success, notification, typing, confirm, cancel, toggle, menu-beep

**Combat (11):** sword-swing, arrow, magic-cast, shield-block, critical-hit, punch, slash, parry, hit, laser, explosion

**Items (8):** pickup, drop, equip, potion-drink, chest-open, key-collect, gold-collect, coin

**Movement (7):** footstep, jump, land, dash, teleport, swim, climb

**Environment (4):** door-open, door-close, switch, alarm

**Cards/Casino (10):** card-deal, card-flip, card-shuffle, card-flap, chips-bet, chips-win, chips-pot, dice-roll, slot-spin, jackpot

**Retro (15):** blip, boop, zap, warp, 1up, death, pause, unpause, select, start, powerup, gameover, level-up, countdown, countdown-go

---

## Best Practices

1. **Initialize after user interaction** - Browsers require user gesture before audio
2. **Use appropriate sounds** - Match sound to action for intuitive feedback
3. **Don't overdo it** - Too many sounds becomes annoying
4. **Test volume levels** - Some sounds are louder than others
5. **Dispose when done** - Call `audio.dispose()` when door exits

```typescript
// Proper lifecycle
door.onConnect(async () => {
  await audio.init();
});

door.onDisconnect(() => {
  audio.dispose();
});
```
