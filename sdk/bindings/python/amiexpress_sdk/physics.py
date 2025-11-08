"""
Physics Engine - 2D physics simulation
"""

from typing import Optional, Callable, List, Dict, Any
from .types import Position, Size, PhysicsBody
from .client import SyncSDKClient


class PhysicsEngine:
    """
    2D Physics engine for BBS doors

    Features:
        - AABB collision detection
        - Gravity and forces
        - Velocity and acceleration
        - Friction and bounce
        - Static and dynamic bodies
        - Collision callbacks
        - Spatial queries

    Example:
        >>> physics = PhysicsEngine(gravity=Position(0, 9.8))
        >>> player = physics.create_body(
        ...     id="player",
        ...     position=Position(10, 10),
        ...     size=Size(2, 2),
        ...     mass=1
        ... )
        >>> physics.update(0.016)  # 60fps
    """

    def __init__(self, gravity: Optional[Position] = None, friction: float = 0.1):
        self.gravity = gravity or Position(0, 9.8)
        self.friction = friction
        self.client: Optional[SyncSDKClient] = None
        self.engine_id: Optional[str] = None

    def _ensure_client(self) -> SyncSDKClient:
        """Ensure client is connected"""
        if not self.client:
            raise RuntimeError("Physics engine not initialized. Call init() first.")
        return self.client

    def init(self, client: SyncSDKClient) -> None:
        """Initialize physics engine with client"""
        self.client = client
        result = client.send_command(
            "physics.create",
            {
                "gravity": self.gravity.to_dict(),
                "friction": self.friction,
            },
        )
        self.engine_id = result["id"]

    def create_body(
        self,
        id: str,
        position: Position,
        size: Size,
        mass: float,
        static: bool = False,
        category: str = "default",
        friction: Optional[float] = None,
        bounce: float = 0.0,
    ) -> PhysicsBody:
        """Create physics body"""
        self._ensure_client().send_command(
            "physics.createBody",
            {
                "engineId": self.engine_id,
                "id": id,
                "position": position.to_dict(),
                "size": size.to_dict(),
                "mass": mass,
                "static": static,
                "category": category,
                "friction": friction if friction is not None else self.friction,
                "bounce": bounce,
            },
        )

        return PhysicsBody(
            id=id,
            position=position,
            size=size,
            velocity=Position(0, 0),
            acceleration=Position(0, 0),
            mass=mass,
            friction=friction if friction is not None else self.friction,
            bounce=bounce,
            static=static,
            category=category,
            data={},
        )

    def remove_body(self, id: str) -> None:
        """Remove physics body"""
        self._ensure_client().send_command(
            "physics.removeBody", {"engineId": self.engine_id, "id": id}
        )

    def get_body(self, id: str) -> Optional[Dict[str, Any]]:
        """Get body state"""
        result = self._ensure_client().send_command(
            "physics.getBody", {"engineId": self.engine_id, "id": id}
        )
        return result.get("body")

    def apply_force(self, id: str, force: Position) -> None:
        """Apply force to body"""
        self._ensure_client().send_command(
            "physics.applyForce",
            {"engineId": self.engine_id, "id": id, "force": force.to_dict()},
        )

    def apply_impulse(self, id: str, impulse: Position) -> None:
        """Apply impulse to body (instant velocity change)"""
        self._ensure_client().send_command(
            "physics.applyImpulse",
            {"engineId": self.engine_id, "id": id, "impulse": impulse.to_dict()},
        )

    def set_velocity(self, id: str, velocity: Position) -> None:
        """Set body velocity"""
        self._ensure_client().send_command(
            "physics.setVelocity",
            {"engineId": self.engine_id, "id": id, "velocity": velocity.to_dict()},
        )

    def check_collision(self, id_a: str, id_b: str) -> bool:
        """Check if two bodies are colliding"""
        result = self._ensure_client().send_command(
            "physics.checkCollision",
            {"engineId": self.engine_id, "idA": id_a, "idB": id_b},
        )
        return result.get("colliding", False)

    def on_collision(self, callback: Callable[[Dict[str, Any]], None]) -> None:
        """Register collision callback"""
        def handler(data):
            callback(data)

        self._ensure_client().on_event("physics.collision", handler)

    def query_region(
        self, x: int, y: int, width: int, height: int
    ) -> List[Dict[str, Any]]:
        """Query bodies in region"""
        result = self._ensure_client().send_command(
            "physics.queryRegion",
            {
                "engineId": self.engine_id,
                "x": x,
                "y": y,
                "width": width,
                "height": height,
            },
        )
        return result.get("bodies", [])

    def find_nearest(self, position: Position) -> Optional[Dict[str, Any]]:
        """Find nearest body to position"""
        result = self._ensure_client().send_command(
            "physics.findNearest",
            {"engineId": self.engine_id, "position": position.to_dict()},
        )
        return result.get("body")

    def update(self, delta: float) -> None:
        """Update physics simulation"""
        self._ensure_client().send_command(
            "physics.update", {"engineId": self.engine_id, "delta": delta}
        )

    def dispose(self) -> None:
        """Clean up physics engine"""
        if self.client and self.engine_id:
            self._ensure_client().send_command(
                "physics.dispose", {"engineId": self.engine_id}
            )
