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
  } catch (error) {
    console.error('Error logging caller activity:', error);
    // Fail silently like express.e would
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
 * Reset new mail scan pointers for all users in a conference/message base
 */
export async function resetNewMailScanPointers(conferenceId: number, messageBaseId: number): Promise<number> {
  try {
    const result = await db.query(`
      UPDATE msg_pointers
      SET lastnewreadconf = 0
      WHERE conferenceid = $1 AND messagebaseid = $2
    `, [conferenceId, messageBaseId]);
    return (result as any).rowCount || 0;
  } catch (error) {
    console.error('[resetNewMailScanPointers] Error:', error);
    return 0;
  }
}

/**
 * Reset last message read pointers for all users in a conference/message base
 */
export async function resetLastMessageReadPointers(conferenceId: number, messageBaseId: number): Promise<number> {
  try {
    const result = await db.query(`
      UPDATE msg_pointers
      SET lastmsgreadconf = 0
      WHERE conferenceid = $1 AND messagebaseid = $2
    `, [conferenceId, messageBaseId]);
    return (result as any).rowCount || 0;
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

    // Get user count with pointers for this conference
    const userResult = await db.query(`
      SELECT COUNT(DISTINCT userid) as count
      FROM msg_pointers
      WHERE conferenceid = $1 AND messagebaseid = $2
    `, [conferenceId, messageBaseId]);

    return {
      messageCount: parseInt(msgResult.rows[0].count),
      lowestMsgNum: parseInt(msgResult.rows[0].lowest),
      highestMsgNum: parseInt(msgResult.rows[0].highest),
      userCount: parseInt(userResult.rows[0].count)
    };
  } catch (error) {
    console.error('[getConferenceStats] Error:', error);
    return {
      messageCount: 0,
      lowestMsgNum: 0,
      highestMsgNum: 0,
      userCount: 0
    };
  }
}

/**
 * Update message number range in mailstat
 */
export async function updateMessageNumberRange(conferenceId: number, messageBaseId: number, lowestKey?: number, highMsgNum?: number): Promise<boolean> {
  try {
    const updates: string[] = [];
    const values: any[] = [conferenceId, messageBaseId];
    let paramIndex = 3;

    if (lowestKey !== undefined) {
      updates.push(`lowest_key = $${paramIndex++}`);
      values.push(lowestKey);
    }

    if (highMsgNum !== undefined) {
      updates.push(`high_msg_num = $${paramIndex++}`);
      values.push(highMsgNum);
    }

    if (updates.length === 0) return false;

    await db.query(`
      UPDATE mailstat
      SET ${updates.join(', ')}
      WHERE conferenceid = $1 AND messagebaseid = $2
    `, values);

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
 * In express.e, reads from BBS:Partdownload/flagged{slot} and dump{slot}
 * For web version, we store in database but maintain exact behavior
 */
export async function loadFlagged(socket: any, session: BBSSession) {
  try {
    // Initialize flaggedFiles list if not exists
    if (!session.tempData) {
      session.tempData = {};
    }
    if (!session.tempData.flaggedFiles) {
      session.tempData.flaggedFiles = [];
    }

    // Load user's flagged files from database
    // Format: array of {confNum: number, fileName: string}
    const result = await db.query(
      'SELECT conf_num, file_name FROM flagged_files WHERE user_id = ?',
      [session.user!.id]
    );

    // Add to session (like express.e's addFlagItem)
    result.rows.forEach(row => {
      session.tempData.flaggedFiles.push({
        confNum: row.conf_num,
        fileName: row.file_name
      });
    });

    // Like express.e:2795 - display notification if files exist
    if (session.tempData.flaggedFiles.length > 0) {
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
  try {
    // Initialize history storage
    if (!session.tempData) {
      session.tempData = {};
    }

    session.tempData.historyBuf = [];
    session.tempData.historyNum = 0;
    session.tempData.historyCycle = 0;

    // Load from database
    const result = await db.query(
      'SELECT history_num, history_cycle, commands FROM command_history WHERE user_id = ?',
      [session.user!.id]
    );

    if (result.rows.length > 0) {
      const history = result.rows[0];
      session.tempData.historyNum = history.history_num || 0;
      session.tempData.historyCycle = history.history_cycle || 0;

      // commands is stored as JSON array
      if (history.commands) {
        session.tempData.historyBuf = Array.isArray(history.commands)
          ? history.commands
          : JSON.parse(history.commands);
      }
    }
  } catch (error) {
    console.error('Error loading command history:', error);
    // Fail silently like express.e would if file doesn't exist
    session.tempData = session.tempData || {};
    session.tempData.historyBuf = [];
    session.tempData.historyNum = 0;
    session.tempData.historyCycle = 0;
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

/**
 * Display system bulletins (SCREEN_BULL equivalent)
 */
export function displaySystemBulletins(socket: any, session: BBSSession) {
  // In AmiExpress, await displayScreen(SCREEN_BULL) shows system bulletins
  socket.emit('ansi-output', '\x1b[2J\x1b[H'); // Clear screen
  socket.emit('ansi-output', '\r\n\x1b[36m-= AmiExpress Web BBS System Bulletins =-\x1b[0m\r\n');
  socket.emit('ansi-output', '\x1b[33mWelcome to AmiExpress Web!\x1b[0m\r\n');
  socket.emit('ansi-output', 'This is a modern web implementation of the classic AmiExpress BBS.\r\n');
  socket.emit('ansi-output', '\r\n\x1b[32mSystem News:\x1b[0m\r\n');
  socket.emit('ansi-output', '- New web interface available\r\n');
  socket.emit('ansi-output', '- Enhanced security features\r\n');
  socket.emit('ansi-output', '- Real-time chat capabilities\r\n');
  socket.emit('ansi-output', '- SQLite database backend\r\n');
  socket.emit('ansi-output', '- Full conference system\r\n');
  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m\r\n');

  // Move to next state after bulletin display
  // express.e:28555-28648 flow: BULL → NODE_BULL → confScan → CONF_BULL → MENU
  const LoggedOnSubState = require('../constants/bbs-states').LoggedOnSubState;
  session.subState = LoggedOnSubState.CONF_SCAN;
}
