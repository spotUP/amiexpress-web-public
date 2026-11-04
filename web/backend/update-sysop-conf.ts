import { db } from "./src/database";

(async () => {
  try {
    const user = await db.getUserByUsername("sysop");
    if (user) {
      console.log(
        "Current confAccess:",
        user.confAccess,
        `(length: ${user.confAccess?.length || 0})`
      );
      // 14 conferences = 14 X's
      await db.updateUser(user.id, { confAccess: "XXXXXXXXXXXXXX" });
      console.log(
        "Updated sysop confAccess to: XXXXXXXXXXXXXX (14 conferences)"
      );
      console.log("\nNow delete user.data and restart servers to regenerate:");
      console.log("  rm ~/Code/AmiExpress/amiexpress-web/user.data");
    } else {
      console.log("Sysop user not found");
    }
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
})();
