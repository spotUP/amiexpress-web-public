# Project File Structure (Summary)
**Detailed directory mappings now live in `archive/DIRECTORY_STRUCTURE_ANALYSIS.md`.**

- `Screens/`, `Commands/`, `Files/`, etc., mirror the express.e layout (Conf1..ConfN, Dir1..DirN) to keep BBS data untouched.
- Config files (`bbsConfig.info`, `.env`, `commands.json`) are read exactly as the original BBS expected; the importer archives the raw files in `001`/`002` directories for fidelity.
- Documentation now resides under `Documentation/1-6`, while raw reference sources (petscii, door binaries) live in `Documentation/7-Reference Sources`.

**Need a diagram?** The archive contains a full tree with descriptions; this summary keeps the essentials for quick orientation.
