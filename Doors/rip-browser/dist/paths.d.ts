/**
 * Where the .RIP files are: `RIPgraphics` under the BBS root.
 *
 * This was the absolute path of one developer's checkout -
 * ~/Code/amiexpress-web/RIPgraphics - which cannot exist on the
 * board, a Linux container with no /Users at all. The graphics have been in
 * /app/data/bbs/RIPgraphics the whole time while the door told every user who
 * opened it "Directory not found".
 *
 * RIPgraphics is not inside the door, so this is the BBS root rather than the
 * door root: resolveBbsRoot prefers BBS_DATA_DIR, which the container sets,
 * and otherwise walks up to the directory holding Commands/BBSCmd.
 *
 * Its own module so a test can check the path without importing the door,
 * which pulls in the whole SDK.
 */
export declare const RIP_GRAPHICS_DIRNAME = "RIPgraphics";
export declare function ripGraphicsDir(startDir?: string): string;
