# AmiExpress Backend Deployment Guide - Render.com

This guide explains how to deploy the AmiExpress backend with WebSocket support to Render.com.

## Why Render.com?

- **WebSocket Support**: Full Socket.io compatibility
- **Automatic HTTPS**: Secure WebSocket connections (wss://)
- **Easy Scaling**: Handles WebSocket connections properly
- **Database Support**: SQLite works out of the box

## Deployment Steps

### 1. Prepare Your Code

```bash
cd backend
npm install
npm run build
```

### 2. Deploy to Render.com

#### Option A: Using Render.com Dashboard
1. Go to [render.com](https://render.com) and sign up/login
2. Click "New" → "Web Service"
3. Connect your GitHub repository
4. Configure the service:
   - **Name**: `amiexpress-backend`
   - **Runtime**: `Node.js`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Port**: `3001`

#### Option B: Using Render CLI
```bash
# Install Render CLI
npm install -g @render/cli

# Login to Render
render login

# Create service
render create web --name amiexpress-backend --runtime node --build-command "npm install" --start-command "npm start"
```

### 3. Environment Variables

Add these environment variables in your Render.com dashboard:

```bash
NODE_ENV=production
PORT=3001
```

### 4. Deploy

```bash
# Push to trigger auto-deployment
git add .
git commit -m "Deploy AmiExpress backend with WebSocket support"
git push origin main
```

## WebSocket Configuration

The backend is configured to accept WebSocket connections from:
- `http://localhost:5173` (development)
- `http://localhost:3000` (development)
- `*.vercel.app` (frontend deployments)
- Your Render.com domain (auto-added)

## Testing the Deployment

1. **Check Backend Health**:
   ```bash
   curl https://your-backend.render.com
   # Should return: {"message":"AmiExpress Backend API"}
   ```

2. **Test WebSocket Connection**:
   - Open browser console on your frontend
   - Check for Socket.io connection logs
   - Try login/registration functionality

## Troubleshooting

### WebSocket Connection Issues
- Ensure your frontend URL is in the CORS allowed origins
- Check Render.com logs for connection errors
- Verify the service is running and healthy

### Database Issues
- SQLite database is stored in-memory for Render.com
- Data persists for the lifetime of the container
- For persistent data, consider upgrading to PostgreSQL

### Performance Issues
- Render.com free tier has limitations
- Consider upgrading for production use
- WebSocket connections may be limited

## Production Considerations

1. **Database**: Consider PostgreSQL for production
2. **Environment Variables**: Use Render.com secrets
3. **Monitoring**: Enable Render.com logging
4. **Backups**: Set up database backups if using persistent storage

## Frontend Configuration

Update your frontend `.env` file:

```bash
VITE_BACKEND_URL=https://your-backend.render.com
```

## Support

- **Render.com Documentation**: https://render.com/docs
- **Socket.io Documentation**: https://socket.io/docs/v4/
- **AmiExpress Issues**: Check GitHub issues