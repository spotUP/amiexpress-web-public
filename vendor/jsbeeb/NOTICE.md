# jsbeeb, vendored

BBC Micro emulator by Matt Godbolt, heavily based on Sarah Walker's B-Em.

- Upstream: https://github.com/mattgodbolt/jsbeeb
- Version: 2.2.0 (built from a shallow clone of `main`, 2026-09-17)
- Licence: **GNU GPL v3** - see `LICENSE` in this directory.

## What this is, and why it sits here rather than in `package.json`

This is the built bundle, unmodified, served as its own program at `/beeb/`.
It is NOT compiled into this board's code and nothing here imports from it:
the board serves it and links to it. That is aggregation rather than
linking, so the GPL does not reach this repository's own source - but the
licence above must stay with these files, and its source must remain
offerable to anyone the board distributes it to.

## What was deliberately NOT vendored

The upstream build is 44 MB. This is 2 MB, because five directories were
left out on purpose:

| Removed | Size | Why |
|---|---|---|
| `roms/` | 2.7 MB | **Acorn's copyrighted ROM images** (BASIC, OS, DFS, ADFS). Acorn never granted redistribution permission - they asked archives to take them down. The board serves this path from `<bbsRoot>/Beeb/roms/` instead, from ROMs the sysop supplies, exactly as `KickstartRom.ts` does for the Amiga. |
| `discs/` | 3.4 MB | Bundled disc images. The board serves this path from `<bbsRoot>/Beeb/software/` instead, so a sysop runs what they have the right to run. |
| `tapes/` | 64 KB | Same reasoning as `discs/`. |
| `teletext/` | 23 MB | Recorded teletext broadcast streams for jsbeeb's teletext-adapter feature. Not needed to run software, and it is third-party recorded content. |
| `econet/` | 10 MB | Econet fileserver images. Not needed to run software. |

Source maps were dropped too; they are only useful when debugging jsbeeb
itself, and for that you want the upstream repository anyway.

## Rebuilding

```
git clone --depth 1 https://github.com/mattgodbolt/jsbeeb.git
cd jsbeeb && npm install && npm run build
```

Then copy `dist/index.html`, `dist/favicon.ico`, `dist/jsbeeb-icon.png`,
`dist/robots.txt`, `dist/assets/*.js`, `dist/assets/*.css`, `dist/images/`
and `dist/sounds/` here, along with `LICENSE`. Do not copy `roms/`,
`discs/`, `tapes/`, `teletext/` or `econet/` - see the table above.
