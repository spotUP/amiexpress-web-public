"""
Graphics Engine - ANSI/ASCII rendering
"""

from typing import Optional, List, Dict, Any
from .types import AnsiColor, Position, Size, Sprite, AnimationFrame, Cutscene, ParallaxLayer
from .client import SyncSDKClient


class GraphicsEngine:
    """
    Advanced graphics engine for BBS doors

    Features:
        - ANSI/ASCII rendering
        - Animated sprites
        - Parallax scrolling backgrounds
        - Particle systems
        - Cinematic cutscenes
        - Tile-based rendering

    Example:
        >>> gfx = GraphicsEngine(width=80, height=24)
        >>> gfx.clear(AnsiColor.BLACK)
        >>> gfx.draw_text(10, 5, "Hello World!", AnsiColor.CYAN)
        >>> output = gfx.render()
    """

    def __init__(
        self, width: int = 80, height: int = 24, double_buffer: bool = True
    ):
        self.width = width
        self.height = height
        self.double_buffer = double_buffer
        self.client: Optional[SyncSDKClient] = None
        self.engine_id: Optional[str] = None

    def _ensure_client(self) -> SyncSDKClient:
        """Ensure client is connected"""
        if not self.client:
            raise RuntimeError("Graphics engine not initialized. Call init() first.")
        return self.client

    def init(self, client: SyncSDKClient) -> None:
        """Initialize graphics engine with client"""
        self.client = client
        result = client.send_command(
            "graphics.create",
            {
                "width": self.width,
                "height": self.height,
                "doubleBuffer": self.double_buffer,
            },
        )
        self.engine_id = result["id"]

    def clear(self, color: AnsiColor = AnsiColor.BLACK) -> None:
        """Clear screen with background color"""
        self._ensure_client().send_command(
            "graphics.clear", {"id": self.engine_id, "color": int(color)}
        )

    def draw_text(
        self, x: int, y: int, text: str, color: AnsiColor = AnsiColor.WHITE
    ) -> None:
        """Draw text at position"""
        self._ensure_client().send_command(
            "graphics.drawText",
            {"id": self.engine_id, "x": x, "y": y, "text": text, "color": int(color)},
        )

    def draw_char(
        self,
        x: int,
        y: int,
        char: str,
        fg_color: AnsiColor = AnsiColor.WHITE,
        bg_color: AnsiColor = AnsiColor.BLACK,
    ) -> None:
        """Draw single character"""
        self._ensure_client().send_command(
            "graphics.drawChar",
            {
                "id": self.engine_id,
                "x": x,
                "y": y,
                "char": char,
                "fgColor": int(fg_color),
                "bgColor": int(bg_color),
            },
        )

    def draw_rect(
        self,
        x: int,
        y: int,
        width: int,
        height: int,
        char: str = "#",
        color: AnsiColor = AnsiColor.WHITE,
    ) -> None:
        """Draw filled rectangle"""
        self._ensure_client().send_command(
            "graphics.drawRect",
            {
                "id": self.engine_id,
                "x": x,
                "y": y,
                "width": width,
                "height": height,
                "char": char,
                "color": int(color),
            },
        )

    def draw_box(
        self,
        x: int,
        y: int,
        width: int,
        height: int,
        fg_color: AnsiColor = AnsiColor.WHITE,
        bg_color: AnsiColor = AnsiColor.BLACK,
    ) -> None:
        """Draw bordered box"""
        self._ensure_client().send_command(
            "graphics.drawBox",
            {
                "id": self.engine_id,
                "x": x,
                "y": y,
                "width": width,
                "height": height,
                "fgColor": int(fg_color),
                "bgColor": int(bg_color),
            },
        )

    def load_ansi(self, id: str, ansi_data: str) -> None:
        """Load ANSI art into cache"""
        self._ensure_client().send_command(
            "graphics.loadAnsi",
            {"id": self.engine_id, "ansiId": id, "data": ansi_data},
        )

    def draw_ansi(self, id: str, x: int = 0, y: int = 0) -> None:
        """Draw loaded ANSI art"""
        self._ensure_client().send_command(
            "graphics.drawAnsi",
            {"id": self.engine_id, "ansiId": id, "x": x, "y": y},
        )

    def create_sprite(
        self,
        id: str,
        frames: List[str],
        position: Position,
        size: Size,
        frame_duration: int = 100,
    ) -> Sprite:
        """Create animated sprite"""
        self._ensure_client().send_command(
            "graphics.createSprite",
            {
                "id": self.engine_id,
                "spriteId": id,
                "frames": [{"data": f, "duration": frame_duration} for f in frames],
                "position": position.to_dict(),
                "size": size.to_dict(),
            },
        )

        return Sprite(
            id=id,
            position=position,
            size=size,
            frames=[AnimationFrame(data=f, duration=frame_duration) for f in frames],
        )

    def play_sprite(self, id: str) -> None:
        """Start sprite animation"""
        self._ensure_client().send_command(
            "graphics.playSprite", {"id": self.engine_id, "spriteId": id}
        )

    def stop_sprite(self, id: str) -> None:
        """Stop sprite animation"""
        self._ensure_client().send_command(
            "graphics.stopSprite", {"id": self.engine_id, "spriteId": id}
        )

    def move_sprite(self, id: str, position: Position) -> None:
        """Move sprite to new position"""
        self._ensure_client().send_command(
            "graphics.moveSprite",
            {"id": self.engine_id, "spriteId": id, "position": position.to_dict()},
        )

    def draw_sprite(self, id: str) -> None:
        """Draw sprite at current position"""
        self._ensure_client().send_command(
            "graphics.drawSprite", {"id": self.engine_id, "spriteId": id}
        )

    def add_parallax_layer(
        self, image: str, scroll_speed: float, depth: int, opacity: float = 1.0
    ) -> None:
        """Add parallax scrolling layer"""
        self._ensure_client().send_command(
            "graphics.addParallaxLayer",
            {
                "id": self.engine_id,
                "image": image,
                "scrollSpeed": scroll_speed,
                "depth": depth,
                "opacity": opacity,
            },
        )

    def update_parallax(self, scroll_x: float, scroll_y: float = 0) -> None:
        """Update parallax scroll position"""
        self._ensure_client().send_command(
            "graphics.updateParallax",
            {"id": self.engine_id, "scrollX": scroll_x, "scrollY": scroll_y},
        )

    def draw_parallax(self) -> None:
        """Draw all parallax layers"""
        self._ensure_client().send_command(
            "graphics.drawParallax", {"id": self.engine_id}
        )

    def create_particle_system(
        self,
        type: str,
        count: int,
        lifetime: int,
        velocity_min: float,
        velocity_max: float,
        position: Optional[Position] = None,
        color: Optional[AnsiColor] = None,
        gravity: float = 0.0,
    ) -> None:
        """Create particle system"""
        params: Dict[str, Any] = {
            "id": self.engine_id,
            "type": type,
            "count": count,
            "lifetime": lifetime,
            "velocity": {"min": velocity_min, "max": velocity_max},
            "gravity": gravity,
        }

        if position:
            params["position"] = position.to_dict()
        if color:
            params["color"] = int(color)

        self._ensure_client().send_command("graphics.createParticleSystem", params)

    def update_particles(self, delta: int) -> None:
        """Update particle systems"""
        self._ensure_client().send_command(
            "graphics.updateParticles", {"id": self.engine_id, "delta": delta}
        )

    def draw_particles(self) -> None:
        """Draw all particles"""
        self._ensure_client().send_command(
            "graphics.drawParticles", {"id": self.engine_id}
        )

    def play_cutscene(self, cutscene: Cutscene) -> None:
        """Play cinematic cutscene"""
        scenes = [
            {
                "image": s.image,
                "duration": s.duration,
                "transition": s.transition,
                "text": s.text,
                "textPosition": s.text_position.to_dict() if s.text_position else None,
            }
            for s in cutscene.scenes
        ]

        self._ensure_client().send_command(
            "graphics.playCutscene",
            {
                "id": self.engine_id,
                "cutscene": {
                    "id": cutscene.id,
                    "scenes": scenes,
                    "skippable": cutscene.skippable,
                },
            },
        )

    def update_cutscene(self, delta: int) -> bool:
        """Update cutscene playback"""
        result = self._ensure_client().send_command(
            "graphics.updateCutscene", {"id": self.engine_id, "delta": delta}
        )
        return result.get("playing", False)

    def stop_cutscene(self) -> None:
        """Stop cutscene playback"""
        self._ensure_client().send_command(
            "graphics.stopCutscene", {"id": self.engine_id}
        )

    def is_cutscene_playing(self) -> bool:
        """Check if cutscene is playing"""
        result = self._ensure_client().send_command(
            "graphics.isCutscenePlaying", {"id": self.engine_id}
        )
        return result.get("playing", False)

    def set_camera(self, position: Position) -> None:
        """Set camera position"""
        self._ensure_client().send_command(
            "graphics.setCamera",
            {"id": self.engine_id, "position": position.to_dict()},
        )

    def move_camera(self, dx: int, dy: int) -> None:
        """Move camera by delta"""
        self._ensure_client().send_command(
            "graphics.moveCamera", {"id": self.engine_id, "dx": dx, "dy": dy}
        )

    def render(self) -> str:
        """Render frame to ANSI output"""
        result = self._ensure_client().send_command(
            "graphics.render", {"id": self.engine_id}
        )
        return result.get("ansi", "")

    def dispose(self) -> None:
        """Clean up graphics engine"""
        if self.client and self.engine_id:
            self._ensure_client().send_command(
                "graphics.dispose", {"id": self.engine_id}
            )
