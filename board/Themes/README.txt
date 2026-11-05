SCREEN THEMES - what this directory is, and what will eat your work
===================================================================

A theme is a full set of the board's screens, drawn by one artist, that a
caller can choose to wear. It is SCREEN FILES ONLY: no prompts, no colour
palettes, and nothing to do with the door theme picker (THEMEC), which paints
the inside of doors and is a separate preference.

  Themes/<slug>/
    THEME.txt      your own notes. Nothing reads this file.
    Node/          screens a NODE serves     - LOGON.txt, Logon100.txt, BBSTITLE.SEQ
    Conf/<n>/      screens a CONFERENCE serves, by conference NUMBER - Conf/1/MENU250.TXT
    Board/         screens the BOARD serves  - BULL.TXT, GOODBYE.TXT
    Files/         a mirror of the board root, for screens reached by PATH
                   (bulletins, ~SR_ pools) - Files/Screens/reference-board/001.txt

<slug> is lowercase letters, digits and hyphens, 31 characters at most. It is
a directory name on an Amiga volume and a query parameter, so it is fixed when
the theme is created and never rewritten afterwards.

FILES ARE NAMED EXACTLY AS THEY ARE ON THE BOARD. No renaming, no theme
suffix. The filename IS the routing: the security level (Logon100.txt) and the
extension (flt.txt.gr, BBSTITLE.SEQ, MENU_C64.seq, bbstitle.rip) decide which
caller is served. `LOGON.neon.txt` would simply never be shown to anybody.

A PARTIAL THEME IS FINE. Any screen your theme does not carry falls back to
the board's own - so redrawing one logon screen is a valid theme, and you can
ship the rest later.

The registry is `Themes.info` at the board root: one entry per theme, with its
slug, title, author, owner, directory, widths, an optional companion door
theme, and a status (draft / review / live). A draft is visible only to its
owner and to sysops.


THE PART THAT COSTS WORK IF YOU SKIP IT
---------------------------------------

Your theme lives ONLY on the board's data volume. It is not in the repo and
not in the image, which is what keeps every deploy from overwriting it - and
also means a lost volume is a lost theme. The deploy takes an art backup
(`bbs-art-<stamp>.tar.gz`, the last twenty kept) which covers `Themes/`,
`Screens/` and the conference screens. Keep your own copy of anything you
would not want to redraw.

DO NOT put a theme under `Screens/`. Two things there will destroy it:

  1. the deploy extracts the image's `Screens/` archive over the volume, so
     any path the repo also ships is replaced - silently, on the day the repo
     gains a file with your path
  2. `FORCE_REINIT_SCREENS=1` runs `rm -rf` on `Screens/` and on every
     conference's `Screens/`. It is the switch a sysop reaches for when the
     board's art looks wrong, which is exactly when a theme experiment has
     gone sideways

`Themes/` is in neither of those paths. That is the whole reason it is a
top-level directory.

A theme the PROJECT ships (not one you upload) is tracked instead: the image
leads until you edit a file, your edit is then kept, and a file you delete
stays deleted across deploys.
