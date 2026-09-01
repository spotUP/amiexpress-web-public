DoorRepo - screen templates for ASCII/ANSI designers
====================================================

What this is
------------

DoorRepo draws its screens itself, in C, using eight colours and plain
ASCII box characters (+ - |). That is a placeholder, not a decision. These
templates describe exactly what the door paints, where, and which parts are
free, so you can redesign it without reading the source.

Work at 80x24. The door adapts to other sizes (see GEOMETRY below), so
anything you design must survive being wider, narrower, taller or shorter -
the templates mark which regions stretch.

Files
-----

  screen-browse.txt   the catalog browser - the door's home screen
  screen-board.txt    the board's installed doors (L), and the same shape
                      is used by the DoorRepo-installed list
  screen-full.txt     the full-width screens: file browser (F), history
                      (H), and documentation/AmigaGuide (V)
  palette.txt         the eight colours, and what each currently means

Each template is a plain 80x24 grid. Every cell carries a letter saying
what the door paints there; the legend is at the foot of each file. Design
over the top of them, keeping the letters where they are - a cell marked D
is written by the door at runtime and anything you draw there is
overwritten on the next keypress.

The rules that are not negotiable
---------------------------------

1. EIGHT COLOURS, plus bold. Black, red, green, yellow, blue, magenta,
   cyan, white - foreground and background, and a bold flag that on most
   terminals brightens the foreground. No 256-colour, no RGB. This is an
   Amiga BBS door and half the people using it are on a real Amiga.

2. NO CURSOR ART OUTSIDE YOUR REGIONS. The door repaints the dynamic
   regions constantly and only blanks what it is about to write. Art that
   strays into a D region flickers; art in an F region stays.

3. CP437 IS AVAILABLE, UTF-8 IS NOT. Single-byte, high-bit characters are
   fine - the line-draw set, the block set, the shade set. The door writes
   bytes through untouched. Anything multi-byte will be cut in half by the
   column arithmetic.

4. THE FOOTER IS BUILT, NOT DRAWN. Its key list changes with what the
   selected row can do (a door with no documentation loses V=Doc), and it
   drops parts that do not fit the width, lowest priority first. You can
   restyle it; you cannot lay it out as fixed art.

5. EVERY ROW COUNTS. 24 rows means 3 header, 1 pane top border, 16 content,
   1 pane bottom border, 3 footer. Taking a row for decoration takes it
   from the list.

GEOMETRY
--------

Everything is computed from the user's terminal size (their own BBS
settings, not ours):

  header          rows 1..3
  panes           row 4 to (rows - 4)
  footer          last 3 rows
  list panel      column 1, width = 35% of columns, minimum 18
  detail panel    starts right after the list, takes the rest
  visible rows    pane height - 2 (its own top and bottom border)

At 80x24 that is: list columns 1-28, detail columns 29-80, content rows
5-20, 16 rows of list.

Some screens run FULL WIDTH - the file browser, the history, and the
documentation viewer, because Amiga documentation is written to 80 columns
and reading it through a 51-column window wraps every line. See
screen-full.txt.

What happens to your work
-------------------------

Send back the .ans (or the annotated template) and we wire it in. Today the
chrome is drawn by code, so a redesign lands as a change to that code - the
box style, the colours, the labels, the header layout. If you want to
iterate without waiting on a programmer each time, say so and we will add a
theme file the door reads at startup: colours and box characters, no
recompile. That is a small piece of work and worth doing if more than one
design is coming.

Questions to whoever sent you this file. Nothing here is fixed except the
eight colours and the byte-at-a-time terminal.
