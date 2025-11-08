# AmiExpress SDK - Python Bindings

Modern BBS door development with retro aesthetics, powered by Python.

## Features

- 🎨 **Graphics Engine**: ANSI/ASCII rendering, sprites, parallax scrolling, particles, cutscenes
- ⚡ **Physics Engine**: 2D collision detection, gravity, forces, spatial queries
- 🔊 **Audio Engine**: Procedural sound effects and AI-driven music generation
- ⌨️ **Input Engine**: Key mapping, macros, action binding, input recording
- 📋 **Menu System**: Interactive retro-styled menus
- 🌐 **Multiplayer Support**: Real-time and turn-based multiplayer (coming soon)

## Installation

```bash
pip install amiexpress-sdk
```

Or install from source:

```bash
git clone https://github.com/amiexpress/sdk.git
cd sdk/bindings/python
pip install -e .
```

## Quick Start

```python
from amiexpress_sdk import Door, GraphicsEngine, AudioEngine, AnsiColor

# Create door
door = Door(
    name="My BBS Game",
    version="1.0.0",
    author="Developer Name"
)

# Initialize engines
gfx = GraphicsEngine(width=80, height=24)
audio = AudioEngine()

@door.on_connect
def handle_connect(user):
    # Initialize engines
    client = door.get_client()
    gfx.init(client)
    audio.init(client)

    # Clear screen and show welcome
    gfx.clear(AnsiColor.BLACK)
    gfx.draw_text(25, 10, "Welcome to My Game!", AnsiColor.CYAN)
    gfx.draw_text(20, 12, f"Hello, {user.name}!", AnsiColor.YELLOW)

    # Play sound
    audio.play_sound("welcome", 440, 0.5)

    # Render and send to terminal
    output = gfx.render()
    door.send_ansi(output, user.id)

# Start the door
door.start()
```

## Complete Game Example

```python
from amiexpress_sdk import (
    Door, GraphicsEngine, PhysicsEngine, AudioEngine, InputEngine,
    AnsiColor, Position, Size
)

# Create door
door = Door(name="Platform Game", version="1.0", author="Dev")

# Initialize engines
gfx = GraphicsEngine(width=80, height=24)
physics = PhysicsEngine(gravity=Position(0, 9.8))
audio = AudioEngine()
input = InputEngine()

# Game state
player_id = None
score = 0
game_running = False

@door.on_connect
def handle_connect(user):
    global player_id, game_running

    # Initialize engines
    client = door.get_client()
    gfx.init(client)
    physics.init(client)
    audio.init(client)
    input.init(client)

    # Create player physics body
    player_body = physics.create_body(
        id="player",
        position=Position(40, 10),
        size=Size(2, 2),
        mass=1.0
    )

    # Create player sprite
    gfx.create_sprite(
        id="player",
        frames=[" O \n/|\\\n/ \\"],
        position=Position(40, 10),
        size=Size(3, 3)
    )

    # Create platform
    physics.create_body(
        id="ground",
        position=Position(0, 20),
        size=Size(80, 2),
        mass=0,
        static=True
    )

    # Setup controls
    input.map_key('w', 'ArrowUp')
    input.map_key('a', 'ArrowLeft')
    input.map_key('s', 'ArrowDown')
    input.map_key('d', 'ArrowRight')

    input.bind_action('jump', 'ArrowUp', lambda: jump_player())
    input.bind_action('left', 'ArrowLeft', lambda: move_player(-5, 0))
    input.bind_action('right', 'ArrowRight', lambda: move_player(5, 0))

    # Start background music
    audio.generate_music("upbeat platformer music", 120, "x-x-x-x-")

    game_running = True
    game_loop(user.id)

def jump_player():
    physics.apply_impulse("player", Position(0, -15))
    audio.play_sound("jump", 600, 0.2)

def move_player(dx, dy):
    physics.apply_force("player", Position(dx, dy))

def game_loop(user_id):
    global game_running

    while game_running:
        # Update physics
        physics.update(0.016)  # 60 FPS

        # Get player position
        player = physics.get_body("player")
        if player:
            # Sync sprite with physics
            gfx.move_sprite("player", Position(
                int(player["position"]["x"]),
                int(player["position"]["y"])
            ))

        # Render frame
        gfx.clear(AnsiColor.BLACK)
        gfx.draw_sprite("player")
        gfx.draw_rect(0, 20, 80, 2, "=", AnsiColor.GREEN)
        gfx.draw_text(2, 1, f"Score: {score}", AnsiColor.YELLOW)

        output = gfx.render()
        door.send_ansi(output, user_id)

        # Handle input
        key = door.wait_for_input(user_id, timeout=16)
        if key == 'q':
            game_running = False
            break

@door.on_disconnect
def handle_disconnect(user):
    audio.dispose()
    gfx.dispose()
    physics.dispose()

door.start()
```

## Graphics Engine

### Basic Drawing

```python
from amiexpress_sdk import GraphicsEngine, AnsiColor

gfx = GraphicsEngine(width=80, height=24)

# Clear screen
gfx.clear(AnsiColor.BLACK)

# Draw text
gfx.draw_text(10, 5, "Hello World!", AnsiColor.CYAN)

# Draw box
gfx.draw_box(5, 3, 30, 10, AnsiColor.YELLOW, AnsiColor.BLUE)

# Load and draw ANSI art
with open("logo.ans", "r") as f:
    gfx.load_ansi("logo", f.read())
gfx.draw_ansi("logo", 20, 5)

# Render to ANSI
output = gfx.render()
```

### Sprites

```python
# Create animated sprite
gfx.create_sprite(
    id="player",
    frames=["frame1", "frame2", "frame3"],
    position=Position(10, 10),
    size=Size(3, 3),
    frame_duration=100
)

# Play animation
gfx.play_sprite("player")

# Move sprite
gfx.move_sprite("player", Position(20, 15))

# Draw sprite
gfx.draw_sprite("player")
```

### Parallax Scrolling

```python
# Add background layers
gfx.add_parallax_layer("mountains", scroll_speed=0.3, depth=5)
gfx.add_parallax_layer("clouds", scroll_speed=0.5, depth=3)
gfx.add_parallax_layer("trees", scroll_speed=0.7, depth=1)

# Update scroll position
gfx.update_parallax(scroll_x=10, scroll_y=0)

# Draw all layers
gfx.draw_parallax()
```

### Particles

```python
# Create particle explosion
gfx.create_particle_system(
    type="explosion",
    count=50,
    lifetime=1000,
    velocity_min=1.0,
    velocity_max=5.0,
    position=Position(40, 12),
    color=AnsiColor.RED
)

# Update particles each frame
gfx.update_particles(delta=16)

# Draw particles
gfx.draw_particles()
```

### Cutscenes

```python
from amiexpress_sdk import Cutscene, CutsceneScene

cutscene = Cutscene(
    id="intro",
    scenes=[
        CutsceneScene(
            image="scene1",
            duration=3000,
            transition="fade"
        ),
        CutsceneScene(
            image="scene2",
            duration=2000,
            text="Chapter 1: The Beginning",
            text_position=Position(20, 20),
            transition="slide"
        )
    ],
    skippable=True,
    on_complete=lambda: start_game()
)

gfx.play_cutscene(cutscene)

# In game loop
if gfx.is_cutscene_playing():
    gfx.update_cutscene(delta)
```

## Physics Engine

```python
from amiexpress_sdk import PhysicsEngine, Position, Size

physics = PhysicsEngine(gravity=Position(0, 9.8))

# Create dynamic body
player = physics.create_body(
    id="player",
    position=Position(10, 10),
    size=Size(2, 2),
    mass=1.0,
    bounce=0.3
)

# Create static body (platform)
platform = physics.create_body(
    id="ground",
    position=Position(0, 20),
    size=Size(80, 2),
    mass=0,
    static=True
)

# Apply force
physics.apply_force("player", Position(10, 0))

# Apply impulse (instant velocity change)
physics.apply_impulse("player", Position(0, -20))

# Set velocity directly
physics.set_velocity("player", Position(5, 0))

# Update simulation
physics.update(delta=0.016)

# Check collision
if physics.check_collision("player", "enemy"):
    print("Hit!")

# Collision callback
def on_collision(collision):
    print(f"Collision: {collision['bodyA']['id']} vs {collision['bodyB']['id']}")

physics.on_collision(on_collision)
```

## Audio Engine

```python
from amiexpress_sdk import AudioEngine

audio = AudioEngine()

# Play sound effect
audio.play_sound(
    type="beep",
    frequency=440,  # A4 note
    duration=0.5,   # seconds
    envelope="pluck",
    volume=0.7
)

# Generate background music
audio.generate_music(
    prompt="retro chiptune music",
    tempo=140,
    pattern="x-x-x-x-",
    instruments=["square", "triangle"]
)

# Control volume
audio.set_master_volume(0.8)
audio.set_music_volume(0.5)
audio.set_sfx_volume(0.9)

# Stop music
audio.stop_music()
```

## Input Engine

```python
from amiexpress_sdk import InputEngine, KeyEvent

input = InputEngine()

# Map keys (WASD to arrows)
input.map_key('w', 'ArrowUp')
input.map_key('a', 'ArrowLeft')
input.map_key('s', 'ArrowDown')
input.map_key('d', 'ArrowRight')

# Bind actions
input.bind_action('jump', ' ', lambda: player.jump())
input.bind_action('attack', 'x', lambda: player.attack())

# Add keyboard macro (Konami code)
input.add_macro('konami', [
    'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
    'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
    'b', 'a'
], timeout=500)

if input.is_macro_triggered('konami'):
    unlock_cheat_mode()

# Record input
input.start_recording()
# ... player actions ...
recording = input.stop_recording()

# Playback
input.playback_recording(recording)

# Mouse emulation
mouse_event = input.emulate_mouse_click(40, 12)
```

## Menu System

```python
from amiexpress_sdk import MenuSystem, Position

menu = MenuSystem(
    title="Main Menu",
    style="retro-neon",  # 'classic', 'retro-neon', 'minimalist', 'boxed'
    navigation="arrow-keys",
    position=Position(25, 8)
)

menu.add_item("Start Game", lambda: start_game(), key='S')
menu.add_item("Options", lambda: show_options(), key='O')
menu.add_item("High Scores", lambda: show_scores(), key='H')
menu.add_item("Quit", lambda: quit_game(), key='Q')

menu.show()
```

## Type Hints

The SDK is fully typed for IDE support:

```python
from amiexpress_sdk import Door, BBSUser, Position, AnsiColor
from typing import Optional

def handle_user(user: BBSUser) -> None:
    pos: Position = Position(x=10, y=5)
    color: AnsiColor = AnsiColor.CYAN
    # Full autocomplete and type checking!
```

## Documentation

Full documentation available at: https://docs.amiexpress.org

## Examples

See the `examples/` directory for complete game examples:
- Platform game
- Puzzle game
- RPG
- Multiplayer shooter

## Requirements

- Python 3.8+
- AmiExpress SDK backend running (default: localhost:3002)

## License

MIT License - see LICENSE file for details

## Contributing

Contributions welcome! Please see CONTRIBUTING.md for guidelines.

## Support

- Documentation: https://docs.amiexpress.org
- Issues: https://github.com/amiexpress/sdk/issues
- Discord: https://discord.gg/amiexpress
