"""
Menu System - Interactive menus
"""

from typing import Optional, List, Callable
from .types import MenuItem, MenuConfig, Position
from .client import SyncSDKClient


class MenuSystem:
    """
    Interactive menu system

    Example:
        >>> menu = MenuSystem(
        ...     title="Main Menu",
        ...     style="retro-neon",
        ...     navigation="arrow-keys"
        ... )
        >>> menu.add_item("Start Game", lambda: start_game(), key='S')
        >>> menu.add_item("Quit", lambda: quit_game(), key='Q')
        >>> menu.show()
    """

    def __init__(
        self,
        title: str,
        style: str = "classic",
        navigation: str = "arrow-keys",
        modal: bool = True,
        position: Optional[Position] = None,
    ):
        self.title = title
        self.style = style
        self.navigation = navigation
        self.modal = modal
        self.position = position
        self.items: List[MenuItem] = []
        self.client: Optional[SyncSDKClient] = None
        self.menu_id: Optional[str] = None

    def _ensure_client(self) -> SyncSDKClient:
        """Ensure client is connected"""
        if not self.client:
            raise RuntimeError("Menu system not initialized.")
        return self.client

    def init(self, client: SyncSDKClient) -> None:
        """Initialize menu system"""
        self.client = client

    def add_item(
        self,
        text: str,
        action: Callable[[], None],
        key: Optional[str] = None,
        enabled: bool = True,
        visible: bool = True,
    ) -> None:
        """Add menu item"""
        self.items.append(
            MenuItem(
                text=text,
                action=action,
                key=key,
                enabled=enabled,
                visible=visible,
            )
        )

    def show(self) -> None:
        """Show menu"""
        if not self.client:
            raise RuntimeError("Menu not initialized")

        # Register item actions
        item_configs = []
        for i, item in enumerate(self.items):
            action_id = f"menu_{id(self)}_{i}"

            # Register callback
            def handler(data, action=item.action):
                action()

            self.client.on_event(f"menu.action.{action_id}", handler)

            item_configs.append(
                {
                    "text": item.text,
                    "key": item.key,
                    "actionId": action_id,
                    "enabled": item.enabled,
                    "visible": item.visible,
                }
            )

        # Show menu
        self._ensure_client().send_command(
            "menu.show",
            {
                "title": self.title,
                "style": self.style,
                "navigation": self.navigation,
                "modal": self.modal,
                "position": self.position.to_dict() if self.position else None,
                "items": item_configs,
            },
        )

    def hide(self) -> None:
        """Hide menu"""
        if self.menu_id:
            self._ensure_client().send_command("menu.hide", {"menuId": self.menu_id})
