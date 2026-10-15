"""
AmiExpress BBS Door SDK - Python Bindings

Modern BBS door development with retro aesthetics.

Example:
    >>> from amiexpress_sdk import Door, GraphicsEngine, AudioEngine
    >>>
    >>> door = Door(name="My Game", version="1.0", author="Dev")
    >>> gfx = GraphicsEngine(width=80, height=24)
    >>>
    >>> @door.on_connect
    >>> def handle_connect(user):
    >>>     gfx.clear(AnsiColor.BLACK)
    >>>     gfx.draw_text(10, 5, "Welcome!", AnsiColor.CYAN)
    >>>     output = gfx.render()
    >>>     door.send_ansi(output, user.id)
    >>>
    >>> door.start()
"""

__version__ = "1.0.0"
__author__ = "AmiExpress Team"
__license__ = "MIT"

from .door import Door
from .graphics import GraphicsEngine
from .physics import PhysicsEngine
from .audio import AudioEngine
from .input import InputEngine
from .menu import MenuSystem
from .types import (
    AnsiColor,
    Position,
    Size,
    BBSUser,
    DoorConfig,
    KeyEvent,
    MouseEvent,
    Sprite,
    PhysicsBody,
    Cutscene,
)

__all__ = [
    # Core
    "Door",

    # Engines
    "GraphicsEngine",
    "PhysicsEngine",
    "AudioEngine",
    "InputEngine",

    # Systems
    "MenuSystem",

    # Types
    "AnsiColor",
    "Position",
    "Size",
    "BBSUser",
    "DoorConfig",
    "KeyEvent",
    "MouseEvent",
    "Sprite",
    "PhysicsBody",
    "Cutscene",
]
