import { db } from '../database';
import { BBSSession } from '../index';

/**
 * Database Helper Functions
 *
 * Utility functions for database operations including:
 * - Caller activity logging
 * - User statistics
 * - File operations (search, CRUD)
 * - Conference/message operations
 * - Voting booth operations
 * - Session data management
 */

/**
 * Log caller activity (express.e:9493 callersLog)
 * Logs to database like express.e logs to BBS:Node{X}/CallersLog file
 */
export async function callersLog(userId: string | null, username: string, action: string, details?: string, nodeId: number = 1) {
  try {
    await db.run(
      'INSERT INTO caller_activity (node_id, user_id, username, action, details) VALUES (?, ?, ?, ?, ?)',
      [nodeId, userId, username, action, details || null]
    );
  } catch (error: unknown) {
    // FK violation: userId not in users table (e.g. corpus mock sessions) — retry with null
    if (error instanceof Error && error.message.includes('FOREIGN KEY')) {
      try {
        await db.run(
          'INSERT INTO caller_activity (node_id, user_id, username, action, details) VALUES (?, ?, ?, ?, ?)',
          [nodeId, null, username, action, details || null]
        );
        return;
      } catch {
        // fall through to silent failure below
      }
    }
    console.error('Error logging caller activity:', error);
  }
}

/**
 * Get recent caller activity from database
 */
export async function getRecentCallerActivity(limit: number = 20, nodeId?: number): Promise<any[]> {
  try {
    let query = 'SELECT username, action, details, timestamp FROM caller_activity';
    const params: any[] = [];

    if (nodeId !== undefined) {
      query += ' WHERE node_id = $1';
      params.push(nodeId);
    }

    query += ' ORDER BY timestamp DESC LIMIT $' + (params.length + 1);
    params.push(limit);

    const result = await db.query(query, params);
    return result.rows;
  } catch (error) {
console.error('Error getting caller activity:', error);
    return [];
  }
}

/**
 * Get or initialize user stats
 */
export async function getUserStats(userId: string): Promise<any> {
  try {
    let result = await db.query(
      'SELECT * FROM user_stats WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      // Initialize stats for new user
      await db.query(
        'INSERT INTO user_stats (user_id) VALUES ($1)',
        [userId]
      );
      result = await db.query(
        'SELECT * FROM user_stats WHERE user_id = $1',
        [userId]
      );
    }

    return result.rows[0];
  } catch (error) {
console.error('Error getting user stats:', error);
    return {
      bytes_uploaded: 0,
      bytes_downloaded: 0,
      files_uploaded: 0,
      files_downloaded: 0
    };
  }
}

// ===== FILE OPERATIONS =====

/**
 * Search file descriptions (express.e:26123-26213, zippy function)
 * Searches file_entries table for matching descriptions
 */
export async function searchFileDescriptions(searchPattern: string, conferenceId: number): Promise<any[]> {
  try {
    const query = `
      SELECT
        fe.id,
        fe.filename,
        fe.description,
        fe.size,
        fe.uploader,
        fe.uploaddate,
        fe.downloads,
        fa.name AS areaname,
        fa.id AS areaid
      FROM file_entries fe
      JOIN file_areas fa ON fe.areaid = fa.id
      WHERE fa.conferenceid = $1
        AND (
          UPPER(fe.filename) LIKE $2
          OR UPPER(fe.description) LIKE $2
        )
      ORDER BY fe.uploaddate DESC
    `;

    const result = await db.query(query, [conferenceId, `%${searchPattern}%`]);
    return result.rows;
  } catch (error) {
console.error('[searchFileDescriptions] Database error:', error);
    return [];
  }
}

/**
 * Get file entry by ID
 */
export async function getFileEntry(fileId: number): Promise<any | null> {
  try {
    const result = await db.query(`
      SELECT
        fe.*,
        fa.name AS areaname,
        fa.conferenceid
      FROM file_entries fe
      JOIN file_areas fa ON fe.areaid = fa.id
      WHERE fe.id = $1
    `, [fileId]);
    return result.rows[0] || null;
  } catch (error) {
console.error('[getFileEntry] Error:', error);
    return null;
  }
}

/**
 * Delete file entry from database (express.e:26914, maintenanceFileDelete)
 */
export async function deleteFileEntry(fileId: number): Promise<boolean> {
  try {
    const result = await db.query(`
      DELETE FROM file_entries WHERE id = $1
    `, [fileId]);
    return ((result as any).rowCount || 0) > 0;
  } catch (error) {
console.error('[deleteFileEntry] Error:', error);
    return false;
  }
}

/**
 * Move file to another area (express.e:27087, maintenanceFileMove)
 */
export async function moveFileEntry(fileId: number, newAreaId: number): Promise<boolean> {
  try {
    const result = await db.query(`
      UPDATE file_entries
      SET areaid = $2
      WHERE id = $1
    `, [fileId, newAreaId]);
    return ((result as any).rowCount || 0) > 0;
  } catch (error) {
console.error('[moveFileEntry] Error:', error);
    return false;
  }
}

/**
 * Update file description
 */
export async function updateFileDescription(fileId: number, newDescription: string): Promise<boolean> {
  try {
    const result = await db.query(`
      UPDATE file_entries
      SET description = $2
      WHERE id = $1
    `, [fileId, newDescription]);
    return ((result as any).rowCount || 0) > 0;
  } catch (error) {
console.error('[updateFileDescription] Error:', error);
    return false;
  }
}

/**
 * Get all file areas in a conference
 */
export async function getFileAreas(conferenceId: number): Promise<any[]> {
  try {
    const result = await db.query(`
      SELECT id, name, description
      FROM file_areas
      WHERE conferenceid = $1
      ORDER BY id
    `, [conferenceId]);
    return result.rows;
  } catch (error) {
console.error('[getFileAreas] Error:', error);
    return [];
  }
}

/**
 * Search files by exact filename match (for FM command)
 */
export async function searchFilesByName(filename: string, conferenceId: number): Promise<any[]> {
  try {
    // Support wildcards: * -> %, ? -> _
    const sqlPattern = filename.toUpperCase()
      .replace(/\*/g, '%')
      .replace(/\?/g, '_');

    const query = `
      SELECT
        fe.id,
        fe.filename,
        fe.description,
        fe.size,
        fe.uploader,
        fe.uploaddate,
        fe.downloads,
        fa.name AS areaname,
        fa.id AS areaid
      FROM file_entries fe
      JOIN file_areas fa ON fe.areaid = fa.id
      WHERE fa.conferenceid = $1
        AND UPPER(fe.filename) LIKE $2
      ORDER BY fe.uploaddate DESC
    `;

    const result = await db.query(query, [conferenceId, sqlPattern]);
    return result.rows;
  } catch (error) {
console.error('[searchFilesByName] Error:', error);
    return [];
  }
}

/**
 * Advanced file search (FM S command) - searches filename, description, and uploader
 */
export async function searchFilesAdvanced(
  searchPattern: string,
  conferenceId: number,
  areaId?: number
): Promise<any[]> {
  try {
    const sqlPattern = `%${searchPattern.toLowerCase()}%`;

    let query = `
      SELECT
        fe.id,
        fe.filename,
        fe.description,
        fe.fileid_diz,
        fe.size,
        fe.uploader,
        fe.uploaddate,
        fe.downloads,
        fa.name AS areaname,
        fa.id AS areaid
      FROM file_entries fe
      JOIN file_areas fa ON fe.areaid = fa.id
      WHERE fa.conferenceid = $1
        AND (
          LOWER(fe.filename) LIKE $2
          OR LOWER(fe.description) LIKE $2
          OR LOWER(fe.fileid_diz) LIKE $2
          OR LOWER(fe.uploader) LIKE $2
        )
    `;

    const params: any[] = [conferenceId, sqlPattern];

    // If specific area requested, add filter
    if (areaId !== undefined) {
      query += ` AND fa.id = $3`;
      params.push(areaId);
    }

    query += ` ORDER BY fe.uploaddate DESC`;

    const result = await db.query(query, params);
    return result.rows;
  } catch (error) {
console.error('[searchFilesAdvanced] Error:', error);
    return [];
  }
}

// ===== CONFERENCE/MESSAGE OPERATIONS =====

/**
 * CM 3 - express.e:22789-22791 updateAllUsers(conf,msgBase,UPDATE_MAILSCAN_PTRS,-1):
 * confRead of every record in the conference's Conf.DB (22482). express.e
 * writes -1 and the next join's clamp (5037-5038) lifts it to lowestNotDel;
 * 0 lands on the same pointer through the same clamp and is what the port's
 * readers have always treated as "unset". The `conf_base` mirror follows.
 */
export async function resetNewMailScanPointers(conferenceId: number, messageBaseId: number): Promise<number> {
  try {
    const { messagePointerFileManager } = require('../services/MessagePointerFileManager');
    const written: number = messagePointerFileManager.updateAllUsers(conferenceId, (rec: { confRead: number }) => { rec.confRead = 0; });
    await db.run(`UPDATE conf_base SET last_new_read_conf = 0 WHERE conference_id = $1 AND message_base_id = $2`,
      [conferenceId, messageBaseId]).catch(() => undefined);
    return written;
  } catch (error) {
    console.error('[resetNewMailScanPointers] Error:', error);
    return 0;
  }
}

/**
 * CM 4 - express.e:22792-22794 updateAllUsers(conf,msgBase,UPDATE_LAST_MESSAGE,-1):
 * confYM of every record (22502), with the same 0-for--1 note as CM 3.
 */
export async function resetLastMessageReadPointers(conferenceId: number, messageBaseId: number): Promise<number> {
  try {
    const { messagePointerFileManager } = require('../services/MessagePointerFileManager');
    const written: number = messagePointerFileManager.updateAllUsers(conferenceId, (rec: { confYM: number }) => { rec.confYM = 0; });
    await db.run(`UPDATE conf_base SET last_msg_read_conf = 0 WHERE conference_id = $1 AND message_base_id = $2`,
      [conferenceId, messageBaseId]).catch(() => undefined);
    return written;
  } catch (error) {
    console.error('[resetLastMessageReadPointers] Error:', error);
    return 0;
  }
}

/**
 * Get conference statistics
 */
export async function getConferenceStats(conferenceId: number, messageBaseId: number): Promise<any> {
  try {
    // Get message count
    const msgResult = await db.query(`
      SELECT COUNT(*) as count,
             COALESCE(MIN(id), 0) as lowest,
             COALESCE(MAX(id), 0) as highest
      FROM messages
      WHERE conferenceid = $1 AND messagebaseid = $2
    `, [conferenceId, messageBaseId]);

    // Get user count with entries for this conference
    const userResult = await db.query(`
      SELECT COUNT(DISTINCT user_id) as count
      FROM conf_base
      WHERE conference_id = $1 AND message_base_id = $2
    `, [conferenceId, messageBaseId]);

    // How many users the conference is SIZED for. express.e:22706 takes it
    // from the length of the conference database file; this port keeps it as
    // `conferences.max_users`, which is what Conference Maintenance's D
    // option writes (express.e:22845-22853, "Size in records"). Without it
    // that screen had nothing to divide by and invented a denominator.
    const capacityResult = await db.query(
      `SELECT max_users FROM conferences WHERE id = $1`,
      [conferenceId]
    );

    return {
      messageCount: parseInt(msgResult.rows[0].count),
      lowestMsgNum: parseInt(msgResult.rows[0].lowest),
      highestMsgNum: parseInt(msgResult.rows[0].highest),
      userCount: parseInt(userResult.rows[0].count),
      capacity: parseInt(capacityResult.rows[0]?.max_users ?? 0) || 0
    };
  } catch (error) {
    console.error('[getConferenceStats] Error:', error);
    return {
      messageCount: 0,
      lowestMsgNum: 0,
      highestMsgNum: 0,
      capacity: 0,
      userCount: 0
    };
  }
}

/**
 * Update message number range in mailstat
 */
export async function updateMessageNumberRange(conferenceId: number, _messageBaseId: number, lowestKey?: number, highMsgNum?: number): Promise<boolean> {
  // CM's B and C edit the conference's MailStats file, the one the board
  // reads (message-pointers getMailStatFile). This wrote a `mailstat` table
  // no code reads, with Postgres placeholders, so the edit went nowhere.
  if (lowestKey === undefined && highMsgNum === undefined) return false;
  try {
    const { messageIndexManager } = require('../services/MessageIndexManager');
    const stats = messageIndexManager.readMailStats(conferenceId)
      ?? { lowestKey: 1, highMsgNum: 1, lowestNotDel: 0, pad: Buffer.alloc(6) };
    if (lowestKey !== undefined) stats.lowestKey = lowestKey;
    if (highMsgNum !== undefined) stats.highMsgNum = highMsgNum;
    messageIndexManager.writeMailStats(conferenceId, stats);
    return true;
  } catch (error) {
console.error('[updateMessageNumberRange] Error:', error);
    return false;
  }
}

// ===== VOTING BOOTH OPERATIONS =====

/**
 * Get all active vote topics for a conference
 */
export async function getActiveVoteTopics(conferenceId: number): Promise<any[]> {
  try {
    const result = await db.query(`
      SELECT
        vt.id,
        vt.topic_number,
        vt.title,
        vt.description,
        vt.created_at,
        vt.created_by,
        COUNT(DISTINCT vq.id) as question_count
      FROM vote_topics vt
      LEFT JOIN vote_questions vq ON vt.id = vq.topic_id
      WHERE vt.conference_id = $1 AND vt.is_active = true
      GROUP BY vt.id, vt.topic_number, vt.title, vt.description, vt.created_at, vt.created_by
      ORDER BY vt.topic_number
    `, [conferenceId]);
    return result.rows;
  } catch (error) {
console.error('[getActiveVoteTopics] Error:', error);
    return [];
  }
}

/**
 * Get a specific vote topic by conference and topic number
 */
export async function getVoteTopic(conferenceId: number, topicNumber: number): Promise<any | null> {
  try {
    const result = await db.query(`
      SELECT * FROM vote_topics
      WHERE conference_id = $1 AND topic_number = $2 AND is_active = true
    `, [conferenceId, topicNumber]);
    return result.rows[0] || null;
  } catch (error) {
console.error('[getVoteTopic] Error:', error);
    return null;
  }
}

/**
 * Get all questions for a vote topic
 */
export async function getVoteQuestions(topicId: number): Promise<any[]> {
  try {
    const result = await db.query(`
      SELECT * FROM vote_questions
      WHERE topic_id = $1
      ORDER BY question_number
    `, [topicId]);
    return result.rows;
  } catch (error) {
console.error('[getVoteQuestions] Error:', error);
    return [];
  }
}

/**
 * Get all answers for a question
 */
export async function getVoteAnswers(questionId: number): Promise<any[]> {
  try {
    const result = await db.query(`
      SELECT * FROM vote_answers
      WHERE question_id = $1
      ORDER BY answer_letter
    `, [questionId]);
    return result.rows;
  } catch (error) {
console.error('[getVoteAnswers] Error:', error);
    return [];
  }
}

/**
 * Check if user has already voted on a topic
 */
export async function hasUserVoted(userId: string, topicId: number): Promise<boolean> {
  try {
    const result = await db.query(`
      SELECT 1 FROM vote_status
      WHERE user_id = $1 AND topic_id = $2
    `, [userId, topicId]);
    return result.rows.length > 0;
  } catch (error) {
console.error('[hasUserVoted] Error:', error);
    return false;
  }
}

/**
 * Submit user's votes for a topic
 */
export async function submitVote(userId: string, topicId: number, conferenceId: number, votes: Array<{questionId: number, answerId: number}>): Promise<boolean> {
  const client = await (db as any).pool.connect();
  try {
    await client.query('BEGIN');

    // Insert all vote results
    for (const vote of votes) {
      // Insert or update the user's vote
      await client.query(`
        INSERT INTO vote_results (user_id, topic_id, question_id, answer_id)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id, question_id)
        DO UPDATE SET answer_id = $4, voted_at = CURRENT_TIMESTAMP
      `, [userId, topicId, vote.questionId, vote.answerId]);

      // Increment the answer's vote count
      await client.query(`
        UPDATE vote_answers
        SET vote_count = vote_count + 1
        WHERE id = $1
      `, [vote.answerId]);
    }

    // Mark the topic as voted by this user
    await client.query(`
      INSERT INTO vote_status (user_id, topic_id, conference_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, topic_id) DO NOTHING
    `, [userId, topicId, conferenceId]);

    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
console.error('[submitVote] Error:', error);
    return false;
  } finally {
    client.release();
  }
}

/**
 * Get voting statistics for a topic
 */
export async function getVoteStatistics(topicId: number): Promise<any[]> {
  try {
    const result = await db.query(`
      SELECT
        vq.id as question_id,
        vq.question_number,
        vq.question_text,
        va.id as answer_id,
        va.answer_letter,
        va.answer_text,
        va.vote_count,
        (SELECT COUNT(*) FROM vote_results WHERE question_id = vq.id) as total_question_votes
      FROM vote_questions vq
      LEFT JOIN vote_answers va ON vq.id = va.question_id
      WHERE vq.topic_id = $1
      ORDER BY vq.question_number, va.answer_letter
    `, [topicId]);
    return result.rows;
  } catch (error) {
console.error('[getVoteStatistics] Error:', error);
    return [];
  }
}

/**
 * Create new vote topic (sysop function)
 */
export async function createVoteTopic(conferenceId: number, topicNumber: number, title: string, description: string, userId: string): Promise<number | null> {
  try {
    const result = await db.query(`
      INSERT INTO vote_topics (conference_id, topic_number, title, description, created_by)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, [conferenceId, topicNumber, title, description, userId]);
    return result.rows[0].id;
  } catch (error) {
console.error('[createVoteTopic] Error:', error);
    return null;
  }
}

/**
 * Create vote question
 */
export async function createVoteQuestion(topicId: number, questionNumber: number, questionText: string): Promise<number | null> {
  try {
    const result = await db.query(`
      INSERT INTO vote_questions (topic_id, question_number, question_text)
      VALUES ($1, $2, $3)
      RETURNING id
    `, [topicId, questionNumber, questionText]);
    return result.rows[0].id;
  } catch (error) {
console.error('[createVoteQuestion] Error:', error);
    return null;
  }
}

/**
 * Create vote answer
 */
export async function createVoteAnswer(questionId: number, answerLetter: string, answerText: string): Promise<number | null> {
  try {
    const result = await db.query(`
      INSERT INTO vote_answers (question_id, answer_letter, answer_text)
      VALUES ($1, $2, $3)
      RETURNING id
    `, [questionId, answerLetter.toUpperCase(), answerText]);
    return result.rows[0].id;
  } catch (error) {
console.error('[createVoteAnswer] Error:', error);
    return null;
  }
}

/**
 * Delete vote topic (sysop function)
 */
export async function deleteVoteTopic(topicId: number): Promise<boolean> {
  try {
    // CASCADE will handle deleting questions, answers, results, and status
    await db.query(`
      DELETE FROM vote_topics WHERE id = $1
    `, [topicId]);
    return true;
  } catch (error) {
console.error('[deleteVoteTopic] Error:', error);
    return false;
  }
}

/**
 * Get next available topic number for a conference
 */
export async function getNextTopicNumber(conferenceId: number): Promise<number> {
  try {
    const result = await db.query(`
      SELECT COALESCE(MAX(topic_number), 0) + 1 as next_number
      FROM vote_topics
      WHERE conference_id = $1
    `, [conferenceId]);
    const nextNum = result.rows[0].next_number;
    return nextNum <= 25 ? nextNum : 0; // Return 0 if all 25 slots are full
  } catch (error) {
console.error('[getNextTopicNumber] Error:', error);
    return 0;
  }
}

// ===== SESSION DATA MANAGEMENT =====

/**
 * Load flagged files for user (express.e:2757)
 * Reads from Partdownload/flagged{slot} using FileFlagManager (express.e:2765+)
 */
export async function loadFlagged(socket: any, session: BBSSession) {
  try {
    // Ensure flag manager exists for this session
    if (!session.flagManager) {
      const { FileFlagManager } = require('../utils/file-flag.util');
      const { config } = require('../config');
      const dataDir = config.get('dataDir');
      const slot = session.user?.slotNumber || 0;
      session.flagManager = new FileFlagManager(dataDir, slot, session.nodeId || 0);
    }

    await session.flagManager.load();

    const flagCount = session.flagManager.getCount();
    if (flagCount > 0) {
      socket.emit('ansi-output', '\r\n** Flagged File(s) Exist **\r\n');
      socket.emit('ansi-output', '\x07'); // sendBELL()
    }
  } catch (error) {
console.error('Error loading flagged files:', error);
    // Fail silently like express.e would if file doesn't exist
  }
}

/**
 * Load command history for user (express.e:2669)
 * In express.e, reads from {historyFolder}/history{slot}
 * For web version, we store in database but maintain exact behavior
 */
export async function loadHistory(session: BBSSession) {
  // Load command history from disk files (express.e:2669-2688, 28577)
  // Uses the user's slot number (ID) to load persisted history
  if (!session.user) {
console.log('[CommandHistory] No user logged in, skipping loadHistory');
    return;
  }

  try {
    const { loadHistory: loadHistoryUtil } = require('../utils/command-history.util');
    await loadHistoryUtil(session, session.user.id);
console.log(`[CommandHistory] Loaded ${session.commandHistory.length} commands for user ${session.user.username}`);
  } catch (error) {
console.error('[CommandHistory] Error in loadHistory wrapper:', error);
  }
}

/**
 * Process queued online messages (express.e:29108)
 */
export function processOlmMessageQueue(socket: any, session: BBSSession, showMessages: boolean) {
  // In express.e, this displays queued online messages (OLM)
  // These are instant messages from other users that arrived while busy

  if (!session.tempData?.olmQueue) {
    session.tempData = session.tempData || {};
    session.tempData.olmQueue = [];
  }

  if (session.tempData.olmQueue.length > 0) {
    if (showMessages) {
      socket.emit('ansi-output', '\r\nDisplaying Message Queue\r\n');
      session.tempData.olmQueue.forEach((msg: string) => {
        socket.emit('ansi-output', msg + '\r\n');
      });
    }
    session.tempData.olmQueue = [];
  }
}
