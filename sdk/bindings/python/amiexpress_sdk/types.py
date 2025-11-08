"""
Type definitions for AmiExpress SDK
"""

from enum import IntEnum
from typing import Any, Callable, Dict, List, Optional, Tuple
from dataclasses import dataclass


class AnsiColor(IntEnum):
    """ANSI color codes (0-15)"""
    BLACK = 0
    RED = 1
    GREEN = 2
    YELLOW = 3
    BLUE = 4
    MAGENTA = 5
    CYAN = 6
    WHITE = 7
    BRIGHT_BLACK = 8
    BRIGHT_RED = 9
    BRIGHT_GREEN = 10
    BRIGHT_YELLOW = 11
    BRIGHT_BLUE = 12
    BRIGHT_MAGENTA = 13
    BRIGHT_CYAN = 14
    BRIGHT_WHITE = 15


@dataclass
class Position:
    """2D position"""
    x: int
    y: int

    def to_dict(self) -> Dict[str, int]:
        return {"x": self.x, "y": self.y}


@dataclass
class Size:
    """2D size dimensions"""
    width: int
    height: int

    def to_dict(self) -> Dict[str, int]:
        return {"width": self.width, "height": self.height}


@dataclass
class BBSUser:
    """BBS user session information"""
    id: int
    name: str
    security_level: int
    node: int
    time_left: int
    graphics_mode: str
    term_width: int
    term_height: int
    data: Dict[str, Any]


@dataclass
class DoorConfig:
    """Door configuration"""
    name: str
    version: str
    author: str
    description: Optional[str] = None
    min_security: int = 0
    max_time: int = 0
    multiplayer: bool = False
    config: Optional[Dict[str, Any]] = None


@dataclass
class KeyEvent:
    """Keyboard input event"""
    key: str
    ctrl: bool
    alt: bool
    shift: bool
    code: int

    def to_dict(self) -> Dict[str, Any]:
        return {
            "key": self.key,
            "ctrl": self.ctrl,
            "alt": self.alt,
            "shift": self.shift,
            "code": self.code,
        }


@dataclass
class MouseEvent:
    """Mouse input event"""
    position: Position
    button: int
    type: str  # 'click', 'move', 'down', 'up'

    def to_dict(self) -> Dict[str, Any]:
        return {
            "position": self.position.to_dict(),
            "button": self.button,
            "type": self.type,
        }


@dataclass
class AnimationFrame:
    """Sprite animation frame"""
    data: str
    duration: int


@dataclass
class Sprite:
    """Sprite definition"""
    id: str
    position: Position
    size: Size
    frames: List[AnimationFrame]
    current_frame: int = 0
    playing: bool = False
    loop: bool = True
    visible: bool = True
    z_index: int = 0


@dataclass
class PhysicsBody:
    """Physics body for collision and movement"""
    id: str
    position: Position
    size: Size
    velocity: Position
    acceleration: Position
    mass: float
    friction: float
    bounce: float
    static: bool
    category: str
    data: Dict[str, Any]


@dataclass
class ParallaxLayer:
    """Parallax scrolling layer"""
    image: str
    scroll_speed: float
    depth: int
    offset: Position
    opacity: float


@dataclass
class ParticleSystemConfig:
    """Particle system configuration"""
    type: str
    count: int
    lifetime: int
    velocity_min: float
    velocity_max: float
    position: Optional[Position] = None
    color: Optional[AnsiColor] = None
    gravity: float = 0.0


@dataclass
class SoundEffect:
    """Sound effect parameters"""
    type: str
    frequency: int
    duration: float
    envelope: str  # 'pluck', 'fade', 'sustain'
    volume: float


@dataclass
class MusicPrompt:
    """Music generation parameters"""
    prompt: str
    tempo: int
    pattern: str
    instruments: List[str]
    duration: Optional[int] = None


@dataclass
class CutsceneScene:
    """Cutscene scene definition"""
    image: str
    duration: int
    transition: Optional[str] = None  # 'fade', 'slide', 'instant'
    text: Optional[str] = None
    text_position: Optional[Position] = None


@dataclass
class Cutscene:
    """Cutscene definition"""
    id: str
    scenes: List[CutsceneScene]
    skippable: bool
    on_complete: Optional[Callable[[], None]] = None


@dataclass
class MenuItem:
    """Menu item definition"""
    text: str
    action: Callable[[], None]
    key: Optional[str] = None
    enabled: bool = True
    visible: bool = True
    submenu: Optional[List['MenuItem']] = None


@dataclass
class MenuConfig:
    """Menu configuration"""
    title: str
    style: str = 'classic'  # 'classic', 'retro-neon', 'minimalist', 'boxed'
    navigation: str = 'arrow-keys'  # 'arrow-keys', 'number-keys', 'hotkeys'
    modal: bool = True
    position: Optional[Position] = None


@dataclass
class SaveData:
    """Save game data"""
    slot: int
    timestamp: str
    state: Dict[str, Any]
    progress: float
    metadata: Dict[str, Any]


@dataclass
class HighScoreEntry:
    """High score entry"""
    rank: int
    player: str
    score: int
    date: str
    data: Optional[Dict[str, Any]] = None
