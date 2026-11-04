# Global Wall - the TypeScript port (not installed)

A port of the 68K GLOBAL WALL door to TypeScript. It is kept for reference
and **is not a door on this board**: the sysop's verdict on 2026-09-02 was
that the port "didn't turn out great", so the board runs the original 68K
binary instead.

That is why these sources live here rather than in `Doors/`. Anything under
`Doors/` with a `package.json` is scanned, listed, installed and checked by
the deploy - `docker/verify-door-entries.sh` and
`web/backend/tests/doors/door-dist-is-shipped.test.ts` both walk that
directory - so a door kept "just for reference" there is a door the board
will try to run.

## What the board runs instead

`Doors/GWall/GWall`, an AmigaOS binary, registered by
`Commands/BBSCmd/GWALL.info` as `TYPE=XIM` with
`LOCATION=DOORS:GWall/GWall`. That registration always named the 68K door;
what was missing was the binary, which is why the GWALL command did nothing
for as long as anyone can remember.

The binary came from
`~/Code/Reference/reference-boardBBS/Doors/Gwall/gwall` - the
49088-byte build, chosen over the three older ones beside it because it is
the only one carrying the full wall API (`PUT` and `DELETE` on
`/GlobalWall/api/WallItems`, not just `GET`).

## If this port is ever revived

It needs, at minimum: a directory under `Doors/`, a committed `dist/`, a
`.info` registration of `TYPE=TS` naming its own command, and a decision
about what happens to the 68K door's wall data.
