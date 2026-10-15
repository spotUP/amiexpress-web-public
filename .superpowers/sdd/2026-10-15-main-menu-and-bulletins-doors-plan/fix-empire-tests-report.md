# Fix empire tests

Cause: 7e3add850 made Bulls.CFG the live board's file (10 names, 20-flag masks). Tests from 431ec7945/5c48abe5d pinned 20 rows and mask text.
Intent kept: byte-identity round trip, position = identity, mask rows carry Conference comments, conf_N_mask edits row N. Pinned counts/text dropped.

- bull rows test: expected count parsed from bullnames section; row i is bull(i+1).txt; <= 20; edits keep other field; out of range refused.
- mask rows test: count and first row parsed from cnfaccess section; every mask 20 chars of X/-; edit pads in place, comment column fixed.
- append test: count relative to before.
- manifest test: conf_N_mask equals parsed mask row N for every N.

RED (mutate, restore): mask row 19 chars -> mask test fails; bull3 renamed bull33 -> bull rows test fails; parser mask slice -> mask + round-trip fail; manifest conf_13 cfgRow 12->11 -> manifest test fails. Note conf_1 row 0->1 was NOT detectable (masks 1-12 identical), hence the conf_13 mutation.
Jest 11/11 green, tsc clean.
