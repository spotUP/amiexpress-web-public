"""
Input Engine - Advanced keyboard and mouse handling
"""

from typing import Optional, Callable, List, Dict, Any
from .types import KeyEvent, MouseEvent, Position
from .client import SyncSDKClient


class InputEngine:
    """
    Advanced input handling engine

    Features:
        - Key mapping (e.g., WASD → Arrow keys)
        - Keyboard macros (combo detection)
        - Action binding
        - Input recording and playback
        - Mouse emulation

    Example:
        >>> input = InputEngine()
        >>> input.map_key('w', 'ArrowUp')
        >>> input.bind_action('jump', ' ', lambda: player.jump())
        >>> input.add_macro('konami', ['up', 'up', 'down', 'down'])
    """

    def __init__(self):
        self.client: Optional[SyncSDKClient] = None
        self.engine_id: Optional[str] = None

    def _ensure_client(self) -> SyncSDKClient:
        """Ensure client is connected"""
        if not self.client:
            raise RuntimeError("Input engine not initialized. Call init() first.")
        return self.client

    def init(self, client: SyncSDKClient) -> None:
        """Initialize input engine"""
        self.client = client
        result = client.send_command("input.create", {})
        self.engine_id = result["id"]

    def map_key(self, from_key: str, to_key: str) -> None:
        """Map one key to another"""
        self._ensure_client().send_command(
            "input.mapKey",
            {"engineId": self.engine_id, "fromKey": from_key, "toKey": to_key},
        )

    def clear_mapping(self, key: str) -> None:
        """Clear key mapping"""
        self._ensure_client().send_command(
            "input.clearMapping", {"engineId": self.engine_id, "key": key}
        )

    def clear_all_mappings(self) -> None:
        """Clear all key mappings"""
        self._ensure_client().send_command(
            "input.clearAllMappings", {"engineId": self.engine_id}
        )

    def add_macro(self, name: str, sequence: List[str], timeout: int = 500) -> None:
        """Add keyboard macro (key combo)"""
        self._ensure_client().send_command(
            "input.addMacro",
            {
                "engineId": self.engine_id,
                "name": name,
                "sequence": sequence,
                "timeout": timeout,
            },
        )

    def is_macro_triggered(self, name: str) -> bool:
        """Check if macro was triggered"""
        result = self._ensure_client().send_command(
            "input.isMacroTriggered", {"engineId": self.engine_id, "name": name}
        )
        return result.get("triggered", False)

    def reset_macro(self, name: str) -> None:
        """Reset macro state"""
        self._ensure_client().send_command(
            "input.resetMacro", {"engineId": self.engine_id, "name": name}
        )

    def clear_macro(self, name: str) -> None:
        """Remove macro"""
        self._ensure_client().send_command(
            "input.clearMacro", {"engineId": self.engine_id, "name": name}
        )

    def bind_action(
        self,
        name: str,
        key: str,
        callback: Callable[[], None],
        ctrl: bool = False,
        alt: bool = False,
        shift: bool = False,
    ) -> None:
        """Bind action to key"""
        # Store callback locally and register with backend
        action_id = f"{name}_{key}"

        def handler(data):
            callback()

        self._ensure_client().on_event(f"input.action.{action_id}", handler)

        self._ensure_client().send_command(
            "input.bindAction",
            {
                "engineId": self.engine_id,
                "name": name,
                "key": key,
                "actionId": action_id,
                "ctrl": ctrl,
                "alt": alt,
                "shift": shift,
            },
        )

    def unbind_action(self, name: str) -> None:
        """Unbind action"""
        self._ensure_client().send_command(
            "input.unbindAction", {"engineId": self.engine_id, "name": name}
        )

    def clear_all_actions(self) -> None:
        """Clear all action bindings"""
        self._ensure_client().send_command(
            "input.clearAllActions", {"engineId": self.engine_id}
        )

    def process_input(self, event: KeyEvent) -> KeyEvent:
        """Process input event"""
        result = self._ensure_client().send_command(
            "input.processInput", {"engineId": self.engine_id, "event": event.to_dict()}
        )
        data = result.get("event", {})
        return KeyEvent(
            key=data.get("key", ""),
            ctrl=data.get("ctrl", False),
            alt=data.get("alt", False),
            shift=data.get("shift", False),
            code=data.get("code", 0),
        )

    def start_recording(self) -> None:
        """Start recording input"""
        self._ensure_client().send_command(
            "input.startRecording", {"engineId": self.engine_id}
        )

    def stop_recording(self) -> List[Dict[str, Any]]:
        """Stop recording and get recording"""
        result = self._ensure_client().send_command(
            "input.stopRecording", {"engineId": self.engine_id}
        )
        return result.get("recording", [])

    def is_recording(self) -> bool:
        """Check if recording"""
        result = self._ensure_client().send_command(
            "input.isRecording", {"engineId": self.engine_id}
        )
        return result.get("recording", False)

    def playback_recording(self, recording: List[Dict[str, Any]]) -> None:
        """Playback recorded input"""
        self._ensure_client().send_command(
            "input.playbackRecording",
            {"engineId": self.engine_id, "recording": recording},
        )

    def clear_recording(self) -> None:
        """Clear current recording"""
        self._ensure_client().send_command(
            "input.clearRecording", {"engineId": self.engine_id}
        )

    def emulate_mouse_click(self, x: int, y: int, button: int = 1) -> MouseEvent:
        """Emulate mouse click"""
        result = self._ensure_client().send_command(
            "input.emulateMouseClick",
            {"engineId": self.engine_id, "x": x, "y": y, "button": button},
        )
        data = result.get("event", {})
        return MouseEvent(
            position=Position(data["position"]["x"], data["position"]["y"]),
            button=data["button"],
            type=data["type"],
        )

    def emulate_mouse_move(self, x: int, y: int) -> MouseEvent:
        """Emulate mouse movement"""
        result = self._ensure_client().send_command(
            "input.emulateMouseMove", {"engineId": self.engine_id, "x": x, "y": y}
        )
        data = result.get("event", {})
        return MouseEvent(
            position=Position(data["position"]["x"], data["position"]["y"]),
            button=0,
            type=data["type"],
        )

    def dispose(self) -> None:
        """Clean up input engine"""
        if self.client and self.engine_id:
            self._ensure_client().send_command(
                "input.dispose", {"engineId": self.engine_id}
            )
