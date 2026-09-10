# Third-party teletext code in this directory

## TheMarco/teletext — packet engine (CC BY 4.0)

Source: https://github.com/TheMarco/teletext
Author: Marco van Hylckama Vlieg
License: Creative Commons Attribution 4.0 International (CC BY 4.0) —
you may share and adapt, even commercially, with credit.

Vendored: `tti/` (record lexer/parser/mapper/translations, index),
`model/`, `compile/`, `state-machine/`, `render-ansi/`,
`packet-decoder/hamming.ts`. `tti-lexer.ts` sits beside them as the
detection entry (same file, renamed for this tree).

Modifications from upstream, and only these:
- Import specifiers rewritten from `./x.js` to `./x`: this tree compiles
  with `moduleResolution: node`, which does not resolve TypeScript
  sources through `.js` suffixes.
- This NOTICE file.

Not vendored: the browser editor, the CRT shader viewer, the terminal
viewer script, demo content, T42 import/export, docs. Nothing here was
reworded or restructured: upstream's tests still describe these copies
(the one upstream failure, a stale DEC-sequence expectation in
render-ansi, is theirs - row duplication is what xterm needs anyway).

Credit is due wherever these modules ship: keep this file with them.
