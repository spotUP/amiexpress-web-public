"""
Audio Engine - Sound effects and music generation
"""

from typing import Optional, List
from .types import SoundEffect, MusicPrompt
from .client import SyncSDKClient


class AudioEngine:
    """
    Audio engine for procedural sound and music

    Features:
        - Procedural sound effects
        - AI-driven music generation
        - Volume control
        - Multiple simultaneous sounds

    Example:
        >>> audio = AudioEngine()
        >>> audio.init()
        >>> audio.play_sound("beep", 440, 0.5)
        >>> audio.generate_music("upbeat chiptune", 120, "x-x-x-x-")
    """

    def __init__(
        self, master_volume: float = 0.7, music_volume: float = 0.5, sfx_volume: float = 0.8
    ):
        self.master_volume = master_volume
        self.music_volume = music_volume
        self.sfx_volume = sfx_volume
        self.client: Optional[SyncSDKClient] = None
        self.engine_id: Optional[str] = None

    def _ensure_client(self) -> SyncSDKClient:
        """Ensure client is connected"""
        if not self.client:
            raise RuntimeError("Audio engine not initialized. Call init() first.")
        return self.client

    def init(self, client: Optional[SyncSDKClient] = None) -> None:
        """Initialize audio engine"""
        if client:
            self.client = client
            result = client.send_command(
                "audio.create",
                {
                    "masterVolume": self.master_volume,
                    "musicVolume": self.music_volume,
                    "sfxVolume": self.sfx_volume,
                },
            )
            self.engine_id = result["id"]

    def play_sound(
        self,
        type: str,
        frequency: int,
        duration: float,
        envelope: str = "pluck",
        volume: float = 0.5,
    ) -> None:
        """Play sound effect"""
        self._ensure_client().send_command(
            "audio.playSound",
            {
                "engineId": self.engine_id,
                "type": type,
                "frequency": frequency,
                "duration": duration,
                "envelope": envelope,
                "volume": volume,
            },
        )

    def generate_music(
        self,
        prompt: str,
        tempo: int,
        pattern: str,
        instruments: Optional[List[str]] = None,
        duration: Optional[int] = None,
    ) -> None:
        """Generate procedural music"""
        self._ensure_client().send_command(
            "audio.generateMusic",
            {
                "engineId": self.engine_id,
                "prompt": prompt,
                "tempo": tempo,
                "pattern": pattern,
                "instruments": instruments or ["square"],
                "duration": duration,
            },
        )

    def stop_music(self) -> None:
        """Stop music playback"""
        self._ensure_client().send_command(
            "audio.stopMusic", {"engineId": self.engine_id}
        )

    def set_master_volume(self, volume: float) -> None:
        """Set master volume (0.0 - 1.0)"""
        self.master_volume = volume
        self._ensure_client().send_command(
            "audio.setMasterVolume", {"engineId": self.engine_id, "volume": volume}
        )

    def set_music_volume(self, volume: float) -> None:
        """Set music volume (0.0 - 1.0)"""
        self.music_volume = volume
        self._ensure_client().send_command(
            "audio.setMusicVolume", {"engineId": self.engine_id, "volume": volume}
        )

    def set_sfx_volume(self, volume: float) -> None:
        """Set sound effects volume (0.0 - 1.0)"""
        self.sfx_volume = volume
        self._ensure_client().send_command(
            "audio.setSfxVolume", {"engineId": self.engine_id, "volume": volume}
        )

    def dispose(self) -> None:
        """Clean up audio engine"""
        if self.client and self.engine_id:
            self._ensure_client().send_command(
                "audio.dispose", {"engineId": self.engine_id}
            )
