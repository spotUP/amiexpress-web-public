#!/usr/bin/env python3
"""
BBS API for Python Doors - AmiExpress-Web

This module provides a comprehensive BBS API that gives Python doors
the same capabilities as native 68k Amiga doors and TypeScript doors.

The API communicates with the BBS backend via JSON-RPC over stdin/stdout.

Usage:
    from bbsapi import BBS

    bbs = BBS()
    bbs.write("Hello, World!\\r\\n")
    name = bbs.get_line("Enter your name: ")
    user = bbs.get_user()
"""

import sys
import json
import os
from typing import Optional, Dict, List, Any


class BBS:
    """
    BBS API for Python doors
    Provides full access to BBS functions equivalent to native Amiga doors
    """

    def __init__(self):
        """Initialize BBS API"""
        self._request_id = 0

    def _call(self, method: str, *args, **kwargs) -> Any:
        """
        Call a BBS API method via JSON-RPC

        For now, Python doors use environment variables and direct I/O.
        Future enhancement: Implement JSON-RPC for advanced features.
        """
        # This is a placeholder for future JSON-RPC implementation
        # For now, Python doors use environment variables and stdin/stdout
        pass

    # ========================================
    # OUTPUT FUNCTIONS
    # ========================================

    def write(self, text: str) -> None:
        """Write text to user's terminal"""
        sys.stdout.write(text)
        sys.stdout.flush()

    def writeln(self, text: str = "") -> None:
        """Write text with newline"""
        sys.stdout.write(text + "\r\n")
        sys.stdout.flush()

    def clear_screen(self) -> None:
        """Clear the screen"""
        self.write('\x1b[2J\x1b[H')

    def move_cursor(self, row: int, col: int) -> None:
        """Move cursor to position (1-indexed)"""
        self.write(f'\x1b[{row};{col}H')

    def set_color(self, color_code: int) -> None:
        """Set ANSI color"""
        self.write(f'\x1b[{color_code}m')

    # ========================================
    # INPUT FUNCTIONS
    # ========================================

    def get_line(self, prompt: str = "", max_length: int = 255) -> str:
        """
        Get line of input from user

        Args:
            prompt: Text to display before input
            max_length: Maximum input length

        Returns:
            User's input string
        """
        if prompt:
            self.write(prompt)

        try:
            line = input()
            if len(line) > max_length:
                line = line[:max_length]
            return line
        except EOFError:
            return ""

    def get_key(self, prompt: str = "") -> str:
        """
        Get single keypress from user

        Args:
            prompt: Text to display before input

        Returns:
            Single character pressed
        """
        if prompt:
            self.write(prompt)

        try:
            line = input()
            return line[0] if line else ""
        except EOFError:
            return ""

    def hotkey(self, options: List[str], prompt: str = "") -> str:
        """
        Display menu and get hotkey choice

        Args:
            options: List of valid options
            prompt: Prompt to display

        Returns:
            Key pressed (uppercase)
        """
        if prompt:
            self.write(prompt)

        try:
            line = input()
            return line[0].upper() if line else ""
        except EOFError:
            return ""

    # ========================================
    # USER DATA FUNCTIONS
    # ========================================

    def get_user(self) -> Dict[str, Any]:
        """
        Get current user information from environment

        Returns:
            Dictionary with user info
        """
        return {
            'username': os.getenv('BBS_USERNAME', 'Guest'),
            'user_id': os.getenv('BBS_USER_ID', ''),
            'realname': os.getenv('BBS_REALNAME', ''),
            'location': os.getenv('BBS_LOCATION', ''),
            'sec_level': int(os.getenv('BBS_SECURITY_LEVEL', '0')),
        }

    def get_username(self) -> str:
        """Get username"""
        return os.getenv('BBS_USERNAME', 'Guest')

    def get_security_level(self) -> int:
        """Get user's security level"""
        return int(os.getenv('BBS_SECURITY_LEVEL', '0'))

    def get_time_remaining(self) -> int:
        """Get time remaining in minutes"""
        return int(os.getenv('BBS_TIME_REMAINING', '60'))

    def get_time_online(self) -> int:
        """Get time online in minutes"""
        return int(os.getenv('BBS_TIME_ONLINE', '0'))

    # ========================================
    # CONFERENCE FUNCTIONS
    # ========================================

    def get_current_conference(self) -> int:
        """Get current conference number"""
        return int(os.getenv('BBS_CONFERENCE', '1'))

    def get_conference_name(self) -> str:
        """Get current conference name"""
        return os.getenv('BBS_CONFERENCE_NAME', 'General')

    # ========================================
    # NODE/SYSTEM FUNCTIONS
    # ========================================

    def get_node_number(self) -> int:
        """Get current node number"""
        return int(os.getenv('BBS_NODE', '1'))

    def get_bbs_name(self) -> str:
        """Get BBS name"""
        return 'AmiExpress-Web'

    def get_sysop_name(self) -> str:
        """Get sysop name"""
        return 'Sysop'

    # ========================================
    # FILE I/O FUNCTIONS
    # ========================================

    def read_file(self, filename: str) -> Optional[str]:
        """
        Read text file

        Args:
            filename: File path relative to BBS root or absolute

        Returns:
            File contents or None if error
        """
        try:
            # Get drop file directory from environment
            drop_dir = os.getenv('BBS_DROP_DIR', '.')

            # If filename is not absolute, resolve relative to drop dir
            if not os.path.isabs(filename):
                filename = os.path.join(drop_dir, filename)

            with open(filename, 'r', encoding='utf-8') as f:
                return f.read()
        except Exception as e:
            self.writeln(f"Error reading file: {e}")
            return None

    def write_file(self, filename: str, content: str) -> bool:
        """
        Write text to file

        Args:
            filename: File path relative to BBS root or absolute
            content: Text to write

        Returns:
            True if successful, False otherwise
        """
        try:
            # Get drop file directory from environment
            drop_dir = os.getenv('BBS_DROP_DIR', '.')

            # If filename is not absolute, resolve relative to drop dir
            if not os.path.isabs(filename):
                filename = os.path.join(drop_dir, filename)

            with open(filename, 'w', encoding='utf-8') as f:
                f.write(content)
            return True
        except Exception as e:
            self.writeln(f"Error writing file: {e}")
            return False

    def file_exists(self, filename: str) -> bool:
        """Check if file exists"""
        try:
            drop_dir = os.getenv('BBS_DROP_DIR', '.')
            if not os.path.isabs(filename):
                filename = os.path.join(drop_dir, filename)
            return os.path.exists(filename)
        except:
            return False

    def list_files(self, directory: str = ".", pattern: str = "*") -> List[str]:
        """
        List files in directory

        Args:
            directory: Directory path
            pattern: Glob pattern (simple * and ? wildcards)

        Returns:
            List of filenames
        """
        try:
            import fnmatch

            drop_dir = os.getenv('BBS_DROP_DIR', '.')
            if not os.path.isabs(directory):
                directory = os.path.join(drop_dir, directory)

            files = os.listdir(directory)

            if pattern != "*":
                files = [f for f in files if fnmatch.fnmatch(f, pattern)]

            return files
        except Exception as e:
            self.writeln(f"Error listing directory: {e}")
            return []

    # ========================================
    # DROP FILE FUNCTIONS
    # ========================================

    def get_door_sys_path(self) -> str:
        """Get path to DOOR.SYS drop file"""
        return os.getenv('BBS_DOOR_SYS', 'DOOR.SYS')

    def get_door32_sys_path(self) -> str:
        """Get path to DOOR32.SYS drop file"""
        return os.getenv('BBS_DOOR32_SYS', 'DOOR32.SYS')

    def get_dorinfo_def_path(self) -> str:
        """Get path to DORINFOx.DEF drop file"""
        return os.getenv('BBS_DORINFO_DEF', 'DORINFO1.DEF')

    # ========================================
    # UTILITY FUNCTIONS
    # ========================================

    def pause(self, prompt: str = "\r\n\x1b[32mPress any key to continue...\x1b[0m") -> None:
        """Pause for user keypress"""
        self.get_key(prompt)

    def log_activity(self, action: str, details: str = "") -> None:
        """
        Log to caller's activity log

        Args:
            action: Action description
            details: Additional details
        """
        # Write to stderr for BBS to capture
        sys.stderr.write(f"[LOG] {action}: {details}\n")
        sys.stderr.flush()


# Convenience instance for simple usage
bbs = BBS()


def main():
    """Test the BBS API"""
    bbs.clear_screen()
    bbs.writeln("BBS API Test")
    bbs.writeln("=" * 40)
    bbs.writeln()

    user = bbs.get_user()
    bbs.writeln(f"Username: {user['username']}")
    bbs.writeln(f"Security: {user['sec_level']}")
    bbs.writeln(f"Node:     {bbs.get_node_number()}")
    bbs.writeln(f"Conf:     {bbs.get_conference_name()}")
    bbs.writeln()

    name = bbs.get_line("Enter your name: ")
    if name:
        bbs.writeln(f"Hello, {name}!")

    bbs.pause()


if __name__ == '__main__':
    main()
