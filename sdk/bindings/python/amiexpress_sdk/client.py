"""
WebSocket client for SDK backend communication
"""

import json
import asyncio
import websockets
from typing import Any, Dict, Optional, Callable
from threading import Thread, Event
import logging

logger = logging.getLogger(__name__)


class SDKClient:
    """
    WebSocket client for communicating with AmiExpress SDK backend
    """

    def __init__(self, host: str = "localhost", port: int = 3002):
        self.host = host
        self.port = port
        self.url = f"ws://{host}:{port}"
        self.websocket: Optional[websockets.WebSocketClientProtocol] = None
        self.connected = Event()
        self.running = False
        self.request_id = 0
        self.pending_responses: Dict[int, asyncio.Future] = {}
        self.event_handlers: Dict[str, Callable] = {}

    async def connect(self) -> None:
        """Establish WebSocket connection"""
        try:
            self.websocket = await websockets.connect(self.url)
            self.connected.set()
            self.running = True
            logger.info(f"Connected to SDK backend at {self.url}")

            # Start message listener
            asyncio.create_task(self._listen())

        except Exception as e:
            logger.error(f"Failed to connect to SDK backend: {e}")
            raise ConnectionError(f"Could not connect to {self.url}") from e

    async def disconnect(self) -> None:
        """Close WebSocket connection"""
        self.running = False
        if self.websocket:
            await self.websocket.close()
        self.connected.clear()
        logger.info("Disconnected from SDK backend")

    async def _listen(self) -> None:
        """Listen for messages from backend"""
        while self.running and self.websocket:
            try:
                message = await self.websocket.recv()
                data = json.loads(message)

                # Handle response
                if "id" in data and data["id"] in self.pending_responses:
                    future = self.pending_responses.pop(data["id"])
                    future.set_result(data)

                # Handle event
                elif "event" in data:
                    event_type = data["event"]
                    if event_type in self.event_handlers:
                        self.event_handlers[event_type](data.get("data"))

            except websockets.exceptions.ConnectionClosed:
                logger.info("Connection closed")
                break
            except Exception as e:
                logger.error(f"Error receiving message: {e}")

    async def send_command(
        self, command: str, params: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Send command to SDK backend and wait for response

        Args:
            command: Command name
            params: Command parameters

        Returns:
            Response data
        """
        if not self.websocket or not self.connected.is_set():
            raise ConnectionError("Not connected to SDK backend")

        self.request_id += 1
        request_id = self.request_id

        message = {"id": request_id, "command": command, "params": params}

        # Create future for response
        future = asyncio.Future()
        self.pending_responses[request_id] = future

        # Send request
        await self.websocket.send(json.dumps(message))

        # Wait for response (with timeout)
        try:
            response = await asyncio.wait_for(future, timeout=10.0)
            if "error" in response:
                raise Exception(response["error"])
            return response.get("result", {})
        except asyncio.TimeoutError:
            self.pending_responses.pop(request_id, None)
            raise TimeoutError(f"Command '{command}' timed out")

    def on_event(self, event_type: str, handler: Callable) -> None:
        """
        Register event handler

        Args:
            event_type: Event type to listen for
            handler: Callback function
        """
        self.event_handlers[event_type] = handler

    def __enter__(self):
        """Context manager entry"""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit"""
        if self.running:
            asyncio.run(self.disconnect())


class SyncSDKClient:
    """
    Synchronous wrapper for SDKClient using asyncio event loop in background thread
    """

    def __init__(self, host: str = "localhost", port: int = 3002):
        self.client = SDKClient(host, port)
        self.loop: Optional[asyncio.AbstractEventLoop] = None
        self.thread: Optional[Thread] = None

    def connect(self) -> None:
        """Connect to SDK backend"""
        self.loop = asyncio.new_event_loop()
        self.thread = Thread(target=self._run_loop, daemon=True)
        self.thread.start()

        # Wait for connection
        future = asyncio.run_coroutine_threadsafe(
            self.client.connect(), self.loop
        )
        future.result(timeout=5.0)

    def _run_loop(self) -> None:
        """Run asyncio event loop in background thread"""
        asyncio.set_event_loop(self.loop)
        self.loop.run_forever()

    def disconnect(self) -> None:
        """Disconnect from SDK backend"""
        if self.loop:
            future = asyncio.run_coroutine_threadsafe(
                self.client.disconnect(), self.loop
            )
            future.result(timeout=5.0)
            self.loop.call_soon_threadsafe(self.loop.stop)

    def send_command(self, command: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """Send command synchronously"""
        if not self.loop:
            raise ConnectionError("Not connected")

        future = asyncio.run_coroutine_threadsafe(
            self.client.send_command(command, params), self.loop
        )
        return future.result(timeout=10.0)

    def on_event(self, event_type: str, handler: Callable) -> None:
        """Register event handler"""
        self.client.on_event(event_type, handler)

    def __enter__(self):
        """Context manager entry"""
        self.connect()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit"""
        self.disconnect()
