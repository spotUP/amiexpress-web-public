# Screens Directory

This directory contains display screens, ANSI art, and templates used throughout the BBS.

## Structure

### `/flt/` - File Listing Templates
Contains templates for displaying file listings in different formats.
- `001.flt.txt` - Default file listing format
- `002.flt.txt` - Alternate format
- `003.flt.txt` - Third format option
- etc.

### `/logoff/` - Logoff Screens
Contains screens displayed when users log off the BBS.
- `001.logoff.txt` - Primary logoff screen
- `002.logoff.txt` - Alternate logoff screen
- `003.logoff.txt` - Additional logoff screen
- etc.

### `/custom/` - Custom Screens
Contains custom-themed screens and ANSI art for the BBS.

## File Formats

- `.txt` - Plain text screens
- `.txt.gr` - Graphics-enhanced versions (ANSI/color)

## Usage

These screens are referenced by the BBS configuration and displayed at various points during user interaction. The system can randomly select from multiple variants (e.g., different logoff screens) to provide variety.

## Notes

- Screens should be compatible with standard terminal widths (typically 80 columns)
- Graphics versions (.gr) may include ANSI escape codes for colors and formatting
- File naming follows traditional AmiExpress conventions