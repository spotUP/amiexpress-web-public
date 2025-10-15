// Vercel serverless API for AmiExpress BBS
const { db } = require('../backend/dist/src/database.js');

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'POST' && req.url === '/api/login') {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
      }

      const user = await db.getUserByUsername(username);
      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const isValidPassword = await db.verifyPassword(password, user.passwordHash);
      if (!isValidPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Update login stats
      await db.updateUser(user.id, {
        lastLogin: new Date(),
        calls: user.calls + 1,
        callsToday: user.callsToday + 1
      });

      return res.status(200).json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          realname: user.realname,
          secLevel: user.secLevel
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  if (req.method === 'GET' && req.url === '/api/conferences') {
    try {
      const conferences = await db.getConferences();
      return res.status(200).json({ conferences });
    } catch (error) {
      console.error('Get conferences error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  if (req.method === 'GET' && req.url === '/api/message-bases') {
    try {
      const conferenceId = req.query.conferenceId;
      if (!conferenceId) {
        return res.status(400).json({ error: 'Conference ID required' });
      }

      const messageBases = await db.getMessageBases(parseInt(conferenceId));
      return res.status(200).json({ messageBases });
    } catch (error) {
      console.error('Get message bases error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  if (req.method === 'GET' && req.url === '/api/messages') {
    try {
      const conferenceId = req.query.conferenceId;
      const messageBaseId = req.query.messageBaseId;

      if (!conferenceId || !messageBaseId) {
        return res.status(400).json({ error: 'Conference ID and Message Base ID required' });
      }

      const messages = await db.getMessages(parseInt(conferenceId), parseInt(messageBaseId));
      return res.status(200).json({ messages });
    } catch (error) {
      console.error('Get messages error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Health check endpoint
  if (req.method === 'GET' && req.url === '/api/health') {
    return res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development'
    });
  }

  return res.status(404).json({ error: 'Not found' });
};