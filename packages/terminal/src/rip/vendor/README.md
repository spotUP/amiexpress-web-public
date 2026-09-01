# RIPtermJS, vendored

`BGI.js` and `ripterm.js` are from https://github.com/cgorringe/RIPtermJS
by Carl Gorringe, licensed under the Mozilla Public License 2.0 (see
`LICENSE` here). RIPtermJS asks that sites using it give credit and link to
the repository; the terminal prints that credit to the console when RIP
mode first starts.

Taken at the repository head of 2026-08-31. The only edits are an ES module
import at the top of `ripterm.js` and an `export` at the end of each file,
so the classes can be bundled rather than loaded as global scripts. Modified
files remain under the MPL.

The fonts (`fonts/`) and icons (`icons/`) it fetches at runtime live in
`web/frontend/public/rip/` and are served from the site root.
