# API Reference

Complete reference for all SDK classes, methods, and types.

## Core API

### Door

Main door class for handling BBS connections and game loop.

#### Constructor

```typescript
new Door(config: DoorConfig)
```

**Parameters:**
- `config.name` (string): Door name
- `config.version` (string): Version string
- `config.author` (string): Author name
- `config.description` (string, optional): Description
- `config.minSecurity` (number, optional): Minimum security level (0-255)
- `config.maxTime` (number, optional): Max time limit in minutes
- `config.multiplayer` (boolean, optional): Enable multiplayer

#### Methods

##### start()
Start the door and begin accepting connections.

```typescript
door.start(): void
```

##### onConnect(handler)
Register connection handler.

```typescript
door.onConnect((user: BBSUser) => void): void
```

##### onDisconnect(handler)
Register disconnection handler.

```typescript
door.onDisconnect((user: BBSUser) => void): void
```

##### onInput(handler)
Register keyboard input handler.

```typescript
door.onInput((user: BBSUser, key: KeyEvent) => void): void
```

##### onUpdate(handler)
Register game update handler (called every frame).

```typescript
door.onUpdate((delta: number) => void): void
```

##### onRender(handler)
Register render handler (called every frame after update).

```typescript
door.onRender((frame: number) => void): void
```

##### send(text, userId?)
Send text output to user(s).

```typescript
door.send(text: string, userId?: number): void
```

##### sendAnsi(ansi, userId?)
Send ANSI formatted output.

```typescript
door.sendAnsi(ansi: string, userId?: number): void
```

##### clearScreen(userId?)
Clear the screen.

```typescript
door.clearScreen(userId?: number): void
```

##### moveCursor(x, y, userId?)
Move cursor to position.

```typescript
door.moveCursor(x: number, y: number, userId?: number): void
```

##### waitForInput(userId, timeout?)
Wait for user input (async).

```typescript
await door.waitForInput(userId: number, timeout?: number): Promise<KeyEvent | null>
```

##### prompt(prompt, userId, timeout?)
Prompt user for input (async).

```typescript
await door.prompt(prompt: string, userId: number, timeout?: number): Promise<string>
```

##### wait(ms)
Wait for specified time (async).

```typescript
await door.wait(ms: number): Promise<void>
```

---

## Graphics Engine

### GraphicsEngine

Advanced ANSI/ASCII graphics rendering.

#### Constructor

```typescript
new GraphicsEngine(config: {
  width: number;
  height: number;
  doubleBuffer?: boolean;
})
```

#### Methods

##### clear(color?)
Clear the screen.

```typescript
gfx.clear(color?: AnsiColor): void
```

##### drawChar(x, y, char, fg?, bg?)
Draw single character.

```typescript
gfx.drawChar(x: number, y: number, char: string, fg?: AnsiColor, bg?: AnsiColor): void
```

##### drawText(x, y, text, fg?, bg?)
Draw text at position.

```typescript
gfx.drawText(x: number, y: number, text: string, fg?: AnsiColor, bg?: AnsiColor): void
```

##### drawRect(rect, char?, fg?, bg?)
Draw filled rectangle.

```typescript
gfx.drawRect(rect: Rect, char?: string, fg?: AnsiColor, bg?: AnsiColor): void
```

##### drawBox(rect, style?, fg?)
Draw box outline.

```typescript
gfx.drawBox(rect: Rect, style?: 'single' | 'double' | 'ascii', fg?: AnsiColor): void
```

##### createSprite(config)
Create animated sprite.

```typescript
gfx.createSprite(config: {
  id: string;
  frames: AnimationFrame[] | string[];
  position: Position;
  size?: Size;
  loop?: boolean;
  zIndex?: number;
}): Sprite
```

##### playSprite(id)
Play sprite animation.

```typescript
gfx.playSprite(id: string): void
```

##### drawSprite(id)
Draw sprite at current position.

```typescript
gfx.drawSprite(id: string): void
```

##### addParallaxLayer(config)
Add parallax scrolling layer.

```typescript
gfx.addParallaxLayer(config: {
  image: string;
  scrollSpeed: number;
  depth: number;
  opacity?: number;
}): void
```

##### createParticleSystem(config)
Create particle system.

```typescript
gfx.createParticleSystem(config: ParticleSystemConfig): void
```

##### render()
Render frame and return ANSI output.

```typescript
gfx.render(): string
```

---

## Physics Engine

### PhysicsEngine

2D physics simulation.

#### Constructor

```typescript
new PhysicsEngine(config?: {
  gravity?: number;
  friction?: number;
  timeStep?: number;
})
```

#### Methods

##### createBody(config)
Create physics body.

```typescript
physics.createBody(config: {
  id: string;
  position: Position;
  size: Size;
  velocity?: Position;
  mass?: number;
  friction?: number;
  bounce?: number;
  static?: boolean;
  category?: string;
}): PhysicsBody
```

##### applyForce(body, force)
Apply force to body.

```typescript
physics.applyForce(body: PhysicsBody | string, force: Position): void
```

##### applyImpulse(body, impulse)
Apply instant velocity change.

```typescript
physics.applyImpulse(body: PhysicsBody | string, impulse: Position): void
```

##### applyGravity(body, gravity?)
Apply gravity to body.

```typescript
physics.applyGravity(body: PhysicsBody | string, gravity?: number): void
```

##### onCollision(categoryA, categoryB, callback)
Register collision callback.

```typescript
physics.onCollision(
  categoryA: string,
  categoryB: string,
  callback: (collision: Collision) => void
): void
```

##### update(deltaTime)
Update physics simulation.

```typescript
physics.update(deltaTime: number): void
```

##### raycast(start, end, category?)
Perform raycast.

```typescript
physics.raycast(start: Position, end: Position, category?: string): PhysicsBody | null
```

---

## Audio Engine

### AudioEngine

Procedural sound effects and music generation.

#### Constructor

```typescript
new AudioEngine(config?: Partial<AudioConfig>)
```

#### Methods

##### init()
Initialize audio context (call after user interaction).

```typescript
await audio.init(): Promise<void>
```

##### playSound(soundId, params?)
Play pre-defined sound effect.

```typescript
audio.playSound(soundId: string, params?: Partial<SoundEffect>): void
```

**Available sounds:**
- `laser` - Laser/shoot sound
- `explosion` - Explosion effect
- `jump` - Jump sound
- `coin` - Coin/pickup sound
- `hit` - Hit/damage sound
- `powerup` - Power-up sound
- `menu-beep` - Menu navigation beep
- `gameover` - Game over sound

##### playCustomSound(params)
Play custom sound effect.

```typescript
audio.playCustomSound(params: SoundEffect): void
```

##### generateMusic(prompt)
Generate music from text prompt (AI-powered).

```typescript
audio.generateMusic(prompt: MusicPrompt): void
```

##### setMusicState(state, intensity?, transition?)
Set adaptive music state.

```typescript
audio.setMusicState(
  state: string,
  intensity?: number,
  transition?: 'immediate' | 'crossfade' | 'fade'
): void
```

##### stopMusic()
Stop all music.

```typescript
audio.stopMusic(): void
```

##### setMasterVolume(volume)
Set master volume (0.0 - 1.0).

```typescript
audio.setMasterVolume(volume: number): void
```

---

## Components

### MenuSystem

Interactive menu system.

#### Constructor

```typescript
new MenuSystem(config: MenuConfig)
```

#### Methods

##### addItem(text, action, options?)
Add menu item.

```typescript
menu.addItem(
  text: string,
  action: () => void | Promise<void>,
  options?: {
    key?: string;
    enabled?: boolean;
    visible?: boolean;
    submenu?: MenuItem[];
  }
): void
```

##### show(door, userId)
Show menu and handle input.

```typescript
await menu.show(door: Door, userId: number): Promise<void>
```

##### hide()
Hide menu.

```typescript
menu.hide(): void
```

---

### HUDBuilder

HUD (Heads-Up Display) builder.

#### Methods

##### addHealthBar(config)
Add health bar.

```typescript
hud.addHealthBar(config: {
  position: Position;
  width: number;
  style?: 'solid' | 'gradient' | 'blocks';
  color?: AnsiColor;
}): string
```

##### addScoreCounter(config)
Add score counter.

```typescript
hud.addScoreCounter(config: {
  position: Position;
  format?: string;
  color?: AnsiColor;
  animateOnChange?: boolean;
}): string
```

##### addTimer(config)
Add timer/countdown.

```typescript
hud.addTimer(config: {
  position: Position;
  startTime: number;
  format?: string;
  countDown?: boolean;
}): string
```

##### setValue(key, value)
Set HUD value.

```typescript
hud.setValue(key: string, value: number | string): void
```

##### update(delta)
Update HUD (call each frame).

```typescript
hud.update(delta: number): void
```

##### render()
Render HUD to ANSI.

```typescript
hud.render(): string
```

---

## Types

### BBSUser

```typescript
interface BBSUser {
  id: number;
  name: string;
  securityLevel: number;
  node: number;
  timeLeft: number;
  graphicsMode: 'ANSI' | 'ASCII' | 'RIP';
  termWidth: number;
  termHeight: number;
  data: Record<string, any>;
}
```

### Position

```typescript
interface Position {
  x: number;
  y: number;
}
```

### Size

```typescript
interface Size {
  width: number;
  height: number;
}
```

### AnsiColor

```typescript
enum AnsiColor {
  Black = 0,
  Red = 1,
  Green = 2,
  Yellow = 3,
  Blue = 4,
  Magenta = 5,
  Cyan = 6,
  White = 7,
  BrightBlack = 8,
  BrightRed = 9,
  BrightGreen = 10,
  BrightYellow = 11,
  BrightBlue = 12,
  BrightMagenta = 13,
  BrightCyan = 14,
  BrightWhite = 15
}
```

---

## Tools

### ReleasePacker

BBS release archive generator.

```typescript
import { ReleasePacker } from '@amiexpress/sdk/tools/packer';

const packer = new ReleasePacker({
  name: 'my-door',
  version: '1.0.0',
  author: 'Your Name',
  description: 'Amazing BBS door',
  category: 'Game',
  sourceDir: './build',
  outputDir: './releases'
});

await packer.pack();
```

---

For more examples, see the `examples/` directory.
For tutorials, see `docs/tutorials/`.
