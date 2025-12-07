# Known Issues (Summary)
- **FR output**: ASCII art lines still sometimes wrap prematurely and add early line breaks; the parser now captures art lines into the 33-space continuation block, but some corner cases remain, particularly when art contains tabs or unusual punctuation.
- **Pauses**: Default display mode currently waits multiple screens before pausing; the system now reads the user’s screen height, but the door must still trim output to match the original pause frequency precisely.
- **68K SIM doors**: Implementation is paused while we understand the synchronous `FindPort`/`DoorControl` handshake; see the archived `68K_DOOR_EMULATION_SUMMARY.md` and `DOOR_DEBUG_SUMMARY.md` for the specific traps that need alignment.
- **Network access**: `npm` and `npx` commands fail in this sandbox because `registry.npmjs.org` resolves to `ENOTFOUND`; tests that rely on npm downloads or remote fonts (like PetMe64 from the live site) cannot complete until network access is restored or local caches are provided.
- **Reference data**: Legacy docs moved to `archive/` directories; while they are preserved, readers may need to know the canonical summary files to avoid confusion.
