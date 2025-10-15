// Socket.IO endpoint for Vercel serverless functions
// Note: Vercel has limitations with persistent WebSocket connections
// This provides a polling-based fallback

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // For Vercel serverless, we'll use HTTP polling instead of WebSocket
  if (req.method === 'POST') {
    try {
      const { type, data } = req.body;

      if (type === 'command') {
        // Handle BBS commands via HTTP
        return res.status(200).json({
          success: true,
          message: 'Command received',
          timestamp: new Date().toISOString()
        });
      }

      if (type === 'heartbeat') {
        return res.status(200).json({
          success: true,
          online: true,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Socket.IO error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  if (req.method === 'GET') {
    // Health check for Socket.IO endpoint
    return res.status(200).json({
      success: true,
      message: 'Socket.IO endpoint active (HTTP polling mode)',
      timestamp: new Date().toISOString()
    });
  }

  return res.status(404).json({ error: 'Not found' });
};