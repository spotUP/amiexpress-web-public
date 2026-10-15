"""
Main Door class for BBS door development
"""

from typing import Optional, Callable, Dict, Any
from .types import DoorConfig, BBSUser
from .client import SyncSDKClient
import logging

logger = logging.getLogger(__name__)


class Door:
    """
    BBS Door main class

    This is the central class for creating BBS doors. It handles connection
    management, user sessions, and event routing.

    Example:
        >>> door = Door(
        ...     name="My Game",
        ...     version="1.0.0",
        ...     author="Developer",
        ...     description="A fun game"
        ... )
        >>>
        >>> @door.on_connect
        >>> def handle_connect(user):
        ...     print(f"User {user.name} connected!")
        >>>
        >>> door.start()
    """

    def __init__(
        self,
        name: str,
        version: str,
        author: str,
        description: Optional[str] = None,
        min_security: int = 0,
        max_time: int = 0,
        multiplayer: bool = False,
        host: str = "localhost",
        port: int = 3002,
    ):
        self.config = DoorConfig(
            name=name,
            version=version,
            author=author,
            description=description,
            min_security=min_security,
            max_time=max_time,
            multiplayer=multiplayer,
        )
        self.host = host
        self.port = port
        self.client: Optional[SyncSDKClient] = None
        self.door_id: Optional[str] = None

        # Event handlers
        self._on_connect_handler: Optional[Callable[[BBSUser], None]] = None
        self._on_disconnect_handler: Optional[Callable[[BBSUser], None]] = None
        self._on_input_handler: Optional[Callable[[str, int], None]] = None
        self._on_render_handler: Optional[Callable[[int], None]] = None

    def on_connect(self, handler: Callable[[BBSUser], None]) -> Callable:
        """
        Decorator for connection event

        Example:
            >>> @door.on_connect
            >>> def handle_connect(user):
            >>>     print(f"Welcome {user.name}!")
        """
        self._on_connect_handler = handler
        return handler

    def on_disconnect(self, handler: Callable[[BBSUser], None]) -> Callable:
        """
        Decorator for disconnection event

        Example:
            >>> @door.on_disconnect
            >>> def handle_disconnect(user):
            >>>     print(f"Goodbye {user.name}!")
        """
        self._on_disconnect_handler = handler
        return handler

    def on_input(self, handler: Callable[[str, int], None]) -> Callable:
        """
        Decorator for input event

        Args:
            handler: Function that receives (key, user_id)

        Example:
            >>> @door.on_input
            >>> def handle_input(key, user_id):
            >>>     if key == 'q':
            >>>         door.disconnect(user_id)
        """
        self._on_input_handler = handler
        return handler

    def on_render(self, handler: Callable[[int], None]) -> Callable:
        """
        Decorator for render event

        Args:
            handler: Function that receives (delta_time)

        Example:
            >>> @door.on_render
            >>> def handle_render(delta):
            >>>     gfx.clear()
            >>>     gfx.draw_sprite('player')
            >>>     output = gfx.render()
            >>>     door.send_ansi(output, user_id)
        """
        self._on_render_handler = handler
        return handler

    def start(self) -> None:
        """Start the door"""
        logger.info(f"Starting door: {self.config.name} v{self.config.version}")

        # Connect to SDK backend
        self.client = SyncSDKClient(self.host, self.port)
        self.client.connect()

        # Register door with backend
        result = self.client.send_command(
            "door.create",
            {
                "name": self.config.name,
                "version": self.config.version,
                "author": self.config.author,
                "description": self.config.description,
                "minSecurity": self.config.min_security,
                "maxTime": self.config.max_time,
                "multiplayer": self.config.multiplayer,
            },
        )
        self.door_id = result["id"]

        # Register event handlers
        if self._on_connect_handler:
            self.client.on_event("door.connect", self._handle_connect_event)

        if self._on_disconnect_handler:
            self.client.on_event("door.disconnect", self._handle_disconnect_event)

        if self._on_input_handler:
            self.client.on_event("door.input", self._handle_input_event)

        if self._on_render_handler:
            self.client.on_event("door.render", self._handle_render_event)

        logger.info(f"Door started with ID: {self.door_id}")

        # Keep running
        try:
            import time

            while True:
                time.sleep(0.1)
        except KeyboardInterrupt:
            logger.info("Shutting down door...")
            self.stop()

    def stop(self) -> None:
        """Stop the door"""
        if self.client and self.door_id:
            self.client.send_command("door.dispose", {"doorId": self.door_id})
            self.client.disconnect()
        logger.info("Door stopped")

    def _handle_connect_event(self, data: Dict[str, Any]) -> None:
        """Handle connect event"""
        if self._on_connect_handler:
            user = BBSUser(
                id=data["id"],
                name=data["name"],
                security_level=data["securityLevel"],
                node=data["node"],
                time_left=data["timeLeft"],
                graphics_mode=data["graphicsMode"],
                term_width=data["termWidth"],
                term_height=data["termHeight"],
                data=data.get("data", {}),
            )
            self._on_connect_handler(user)

    def _handle_disconnect_event(self, data: Dict[str, Any]) -> None:
        """Handle disconnect event"""
        if self._on_disconnect_handler:
            user = BBSUser(
                id=data["id"],
                name=data["name"],
                security_level=data.get("securityLevel", 0),
                node=data.get("node", 0),
                time_left=data.get("timeLeft", 0),
                graphics_mode=data.get("graphicsMode", "ANSI"),
                term_width=data.get("termWidth", 80),
                term_height=data.get("termHeight", 24),
                data=data.get("data", {}),
            )
            self._on_disconnect_handler(user)

    def _handle_input_event(self, data: Dict[str, Any]) -> None:
        """Handle input event"""
        if self._on_input_handler:
            self._on_input_handler(data["key"], data["userId"])

    def _handle_render_event(self, data: Dict[str, Any]) -> None:
        """Handle render event"""
        if self._on_render_handler:
            self._on_render_handler(data.get("delta", 16))

    def send(self, text: str, user_id: int) -> None:
        """Send text to user"""
        if self.client:
            self.client.send_command(
                "door.send", {"doorId": self.door_id, "userId": user_id, "text": text}
            )

    def send_ansi(self, ansi: str, user_id: int) -> None:
        """Send ANSI to user"""
        if self.client:
            self.client.send_command(
                "door.sendAnsi",
                {"doorId": self.door_id, "userId": user_id, "ansi": ansi},
            )

    def clear_screen(self, user_id: int) -> None:
        """Clear user's screen"""
        self.send_ansi("\x1b[2J\x1b[H", user_id)

    def disconnect(self, user_id: int) -> None:
        """Disconnect user"""
        if self.client:
            self.client.send_command(
                "door.disconnect", {"doorId": self.door_id, "userId": user_id}
            )

    def wait_for_input(self, user_id: int, timeout: int = 0) -> str:
        """Wait for user input"""
        if self.client:
            result = self.client.send_command(
                "door.waitInput",
                {"doorId": self.door_id, "userId": user_id, "timeout": timeout},
            )
            return result.get("key", "")
        return ""

    def get_client(self) -> SyncSDKClient:
        """Get SDK client for initializing engines"""
        if not self.client:
            raise RuntimeError("Door not started. Call start() first.")
        return self.client
