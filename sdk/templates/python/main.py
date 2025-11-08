"""
{{displayName}}
Version {{version}}

{{description}}

Created with AmiExpress BBS Door SDK
https://github.com/amiexpress/sdk
"""

from amiexpress_sdk import Door, GraphicsEngine, AudioEngine, MenuSystem, AnsiColor

# Create door
door = Door(
    name='{{displayName}}',
    version='{{version}}',
    author='{{author}}',
    description='{{description}}',
    min_security=0,
    max_time=30
)

# Initialize engines
gfx = GraphicsEngine(width=80, height=24)
audio = AudioEngine()

# Game state
score = 0
lives = 3
game_running = False


def show_main_menu(user_id: int):
    """Show main menu"""
    menu = MenuSystem(
        title='{{displayName}}',
        style='retro-neon',
        navigation='arrow-keys',
        position={'x': 25, 'y': 8}
    )

    menu.add_item('Start Game', lambda: start_game(user_id), key='S')
    menu.add_item('Instructions', lambda: show_instructions(user_id), key='I')
    menu.add_item('Quit', lambda: quit_game(user_id), key='Q')

    menu.show(door, user_id)


def start_game(user_id: int):
    """Start game"""
    global game_running, score, lives

    game_running = True
    score = 0
    lives = 3

    # Play music
    audio.generate_music({
        'prompt': 'upbeat game music',
        'tempo': 120,
        'pattern': 'x-x-x-x-',
        'instruments': ['square']
    })

    # Game loop
    game_loop(user_id)


def game_loop(user_id: int):
    """Main game loop"""
    global game_running

    while game_running and lives > 0:
        # Handle input
        key = door.wait_for_input(user_id, timeout=0)
        if key:
            handle_input(key, user_id)

        # Update game
        update_game()

        # Render
        render_game(user_id)

        # Small delay
        door.wait(16)  # ~60 FPS

    if lives == 0:
        game_over(user_id)


def handle_input(key: str, user_id: int):
    """Handle keyboard input"""
    global game_running

    # TODO: Implement game controls
    if key.lower() == 'q':
        game_running = False
        show_main_menu(user_id)


def update_game():
    """Update game state"""
    # TODO: Implement game logic
    pass


def render_game(user_id: int):
    """Render game frame"""
    gfx.clear(AnsiColor.Black)

    # TODO: Draw game graphics
    gfx.draw_text(10, 10, '{{displayName}}', AnsiColor.Cyan)
    gfx.draw_text(10, 12, 'Game running...', AnsiColor.White)
    gfx.draw_text(10, 14, 'Press Q to quit', AnsiColor.Gray)

    # Send to terminal
    output = gfx.render()
    door.send_ansi(output, user_id)


def game_over(user_id: int):
    """Game over screen"""
    audio.play_sound('gameover')
    audio.stop_music()

    door.clear_screen(user_id)
    door.send('\\r\\n\\r\\n', user_id)
    door.send('╔════════════════════╗\\r\\n', user_id)
    door.send('║    GAME OVER!     ║\\r\\n', user_id)
    door.send('╚════════════════════╝\\r\\n', user_id)
    door.send(f'\\r\\nFinal Score: {score}\\r\\n\\r\\n', user_id)
    door.send('Press any key...\\r\\n', user_id)

    door.wait_for_input(user_id)
    show_main_menu(user_id)


def show_instructions(user_id: int):
    """Show instructions"""
    door.clear_screen(user_id)
    door.send('\\r\\n', user_id)
    door.send('╔══════════════════════╗\\r\\n', user_id)
    door.send('║   INSTRUCTIONS     ║\\r\\n', user_id)
    door.send('╚══════════════════════╝\\r\\n', user_id)
    door.send('\\r\\n', user_id)
    door.send('TODO: Add game instructions here\\r\\n', user_id)
    door.send('\\r\\n', user_id)
    door.send('Press any key...\\r\\n', user_id)

    door.wait_for_input(user_id)
    show_main_menu(user_id)


def quit_game(user_id: int):
    """Quit game"""
    audio.dispose()
    door.disconnect(user_id)


# Handle connection
@door.on_connect
def handle_connect(user):
    audio.init()
    show_main_menu(user.id)


# Start door
if __name__ == '__main__':
    door.start()
