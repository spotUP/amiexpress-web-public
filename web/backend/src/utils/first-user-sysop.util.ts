/**
 * First registered caller becomes sysop.
 *
 * A fresh board has no account at all (database.ts seeds none). At startup the
 * board counts level >= 200 users; with none, the NEXT new-user registration
 * is promoted to level 255 by new-user.handler.ts createAccountRecord, which
 * then clears the flag so the second caller is an ordinary user.
 */
export interface FirstUserSysopDb {
  query(sql: string, params?: any[]): Promise<{ rows?: Array<{ count?: unknown }> }>;
}

export async function initFirstUserIsSysopFlag(db: FirstUserSysopDb): Promise<void> {
  try {
    const result = await db.query('SELECT COUNT(*) as count FROM users WHERE seclevel >= 200');
    const sysopCount = Number(result.rows?.[0]?.count ?? 0);
    if (sysopCount === 0) {
      console.log('[SETUP] No sysop-level users found - FIRST new user will automatically become sysop (level 255)');
      (global as any).firstUserIsSysop = true;
    } else {
      console.log(`[SETUP] Found ${sysopCount} sysop-level user(s)`);
      (global as any).firstUserIsSysop = false;
    }
  } catch (err: any) {
    console.warn('[SETUP] Failed to check for sysop users:', err.message || err);
    (global as any).firstUserIsSysop = false;
  }
}
