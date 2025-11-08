#!/usr/bin/env python3
"""
Hello World Python Door for AmiExpress-Web
Demonstrates Python door capabilities with full BBS API
"""

import sys
import os

# Add current directory to path for bbsapi import
sys.path.insert(0, os.path.dirname(__file__))

from bbsapi import bbs


def main():
    # Use BBS API for all operations
    bbs.clear_screen()

    # Display header using BBS API
    bbs.write('\x1b[0;36m╔══════════════════════════════════════════════════════════════════════════════╗\x1b[0m\r\n')
    bbs.write('\x1b[0;36m║\x1b[0;33m                        PYTHON DOOR - HELLO WORLD                             \x1b[0;36m║\x1b[0m\r\n')
    bbs.write('\x1b[0;36m║\x1b[0;32m                Demonstrates Full BBS API Capabilities                        \x1b[0;36m║\x1b[0m\r\n')
    bbs.write('\x1b[0;36m╚══════════════════════════════════════════════════════════════════════════════╝\x1b[0m\r\n\r\n')

    # Get user information from BBS API
    user = bbs.get_user()
    bbs.write('\x1b[0;36m[ User Information ]\x1b[0m\r\n')
    bbs.writeln(f"  Username:      {user['username']}")
    bbs.writeln(f"  Real Name:     {user.get('realname', 'Not set')}")
    bbs.writeln(f"  Location:      {user.get('location', 'Unknown')}")
    bbs.writeln(f"  Security:      {user['sec_level']}")
    bbs.writeln()

    # Get node and system information
    node_id = bbs.get_node_number()
    bbs_name = bbs.get_bbs_name()
    sysop = bbs.get_sysop_name()
    conference = bbs.get_conference_name()

    bbs.write('\x1b[0;36m[ System Information ]\x1b[0m\r\n')
    bbs.writeln(f"  BBS Name:      {bbs_name}")
    bbs.writeln(f"  Sysop:         {sysop}")
    bbs.writeln(f"  Node:          {node_id}")
    bbs.writeln(f"  Conference:    {conference}")
    bbs.writeln(f"  Time Online:   {bbs.get_time_online()} minutes")
    bbs.writeln(f"  Time Left:     {bbs.get_time_remaining()} minutes")
    bbs.writeln()

    # Interactive examples demonstrating input functions
    bbs.write('\x1b[0;36m[ Interactive Demo ]\x1b[0m\r\n')

    # Example 1: get_line() - Get text input
    language = bbs.get_line('\x1b[0;33mEnter your favorite programming language: \x1b[0m')
    if language and language.strip():
        bbs.writeln(f'\x1b[0;32m✓ Great choice! {language.strip()} is awesome!\x1b[0m')
    else:
        bbs.writeln('\x1b[0;32m✓ Python is pretty great too!\x1b[0m')
    bbs.writeln()

    # Example 2: get_key() - Get single keypress
    bbs.write('\x1b[0;33mTest file operations? (Y/N): \x1b[0m')
    choice = bbs.get_key()
    bbs.writeln(choice.upper())

    if choice.upper() == 'Y':
        bbs.writeln()
        bbs.write('\x1b[0;36m[ File I/O Demo ]\x1b[0m\r\n')

        # Test file operations
        test_file = 'test-python-door.txt'
        from datetime import datetime
        test_content = f"Hello from Python door!\nWritten at: {datetime.now().isoformat()}\n"

        if bbs.write_file(test_file, test_content):
            bbs.writeln('\x1b[0;32m✓ File written successfully\x1b[0m')

            read_content = bbs.read_file(test_file)
            if read_content:
                bbs.writeln('\x1b[0;32m✓ File read successfully:\x1b[0m')
                bbs.write('\x1b[0;33m')
                bbs.write(read_content)
                bbs.writeln('\x1b[0m')
        else:
            bbs.writeln('\x1b[0;31m✗ File write failed\x1b[0m')

    # Display available API functions
    bbs.writeln()
    bbs.write('\x1b[0;36m[ BBS API Functions Available ]\x1b[0m\r\n')
    bbs.writeln('  ✓ write/writeln - Output text')
    bbs.writeln('  ✓ clear_screen - Clear display')
    bbs.writeln('  ✓ move_cursor - Position cursor')
    bbs.writeln('  ✓ get_line - Get text input')
    bbs.writeln('  ✓ get_key - Get single key')
    bbs.writeln('  ✓ get_user - Get user information')
    bbs.writeln('  ✓ get_time_remaining - Check time')
    bbs.writeln('  ✓ read_file/write_file - File I/O')
    bbs.writeln('  ✓ list_files - Directory listing')
    bbs.writeln('  ✓ log_activity - Log actions')
    bbs.writeln('  ✓ And many more!')
    bbs.writeln()

    # Log activity
    bbs.log_activity('Tested Python door', 'All API functions working')

    # Pause before exit
    bbs.pause('\r\n\x1b[0;32mPress any key to exit...\x1b[0m')

    return 0


if __name__ == '__main__':
    sys.exit(main())
