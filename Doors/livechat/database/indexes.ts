/** Database indexes for performance */

export const INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_messages_channel_time
   ON chat_messages(channel_id, created_at DESC)`,

  `CREATE INDEX IF NOT EXISTS idx_messages_thread
   ON chat_messages(thread_id) WHERE thread_id IS NOT NULL`,

  `CREATE INDEX IF NOT EXISTS idx_messages_user
   ON chat_messages(user_id)`,

  `CREATE INDEX IF NOT EXISTS idx_reactions_message
   ON chat_reactions(message_id)`,

  `CREATE INDEX IF NOT EXISTS idx_members_user
   ON chat_channel_members(user_id)`,

  `CREATE INDEX IF NOT EXISTS idx_events_time
   ON bbs_events(created_at DESC)`,

  `CREATE INDEX IF NOT EXISTS idx_events_type
   ON bbs_events(type)`,

  `CREATE INDEX IF NOT EXISTS idx_presence_status
   ON chat_user_presence(status)`
];

/** Create all indexes */
export async function createIndexes(db: any): Promise<void> {
  for (const sql of INDEXES) {
    await db.run(sql);
  }
}
