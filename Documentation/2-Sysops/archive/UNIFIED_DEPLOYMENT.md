# Unified Deployment Structure

AmiExpress BBS now uses a unified deployment where all three frontend applications are served from a single backend server on one domain.

## URL Structure

```
https://bbs.uprough.net/        → BBS Terminal (main interface)
https://bbs.uprough.net/admin/  → Admin Configuration Panel
https://bbs.uprough.net/sdk/    → SDK Preview Tool
```

## Shared Authentication

All three applications share the same:
- Backend API (Node.js/Express)
- User database (SQLite)
- Authentication tokens (JWT)
- WebSocket connections (Socket.IO)

When you log in to any of the three applications, your authentication token is stored in `localStorage` and will work across all three apps on the same domain.

## Architecture

### Frontend Applications

1. **BBS Terminal** (`web/frontend`)
   - Main BBS interface with xterm.js terminal emulator
   - Served at `/` (root)
   - Vite base: `/`
   - Build output: `web/frontend/dist`

2. **Admin Config** (`web/config-app`)
   - Configuration management interface for sysops
   - Served at `/admin/`
   - Vite base: `/admin/`
   - Build output: `web/config-app/dist`

3. **SDK Preview** (`sdk/tools/preview/frontend`)
   - Door development preview tool
   - Served at `/sdk/`
   - Vite base: `/sdk/`
   - Build output: `sdk/tools/preview/frontend/dist`

### Backend Server

The Node.js Express backend (`web/backend`) serves:
- All three frontend applications as static files
- REST API at `/api/*`
- Authentication endpoints at `/auth/*`
- WebSocket connections at `/socket.io/*`

Static file serving is configured in `web/backend/src/index.ts` (lines 540-564).

## Building for Production

### Build All Frontends

```bash
./dev/scripts/build-all-frontends.sh
```

This script builds all three frontends in the correct order with proper base paths.

### Build Individual Frontends

```bash
# BBS Terminal
cd web/frontend && npm run build

# Admin Config
cd web/config-app && npm run build

# SDK Preview
cd sdk/tools/preview/frontend && npm run build
```

## Development

Each frontend can be developed independently with hot module replacement:

```bash
# BBS Terminal (port 5174)
cd web/frontend && npm run dev

# Admin Config (port 5175)
cd web/config-app && npm run dev

# SDK Preview (port 3000)
cd sdk/tools/preview/frontend && npm run dev
```

All three proxy API requests to `http://localhost:3001` (backend server).

## Deployment Checklist

1. **Build all frontends**:
   ```bash
   ./dev/scripts/build-all-frontends.sh
   ```

2. **Start backend server**:
   ```bash
   cd web/backend
   npm run start
   ```

3. **Verify all paths work**:
   - http://localhost:3001/ → BBS Terminal
   - http://localhost:3001/admin/ → Admin Config
   - http://localhost:3001/sdk/ → SDK Preview

4. **Test authentication**:
   - Log in at any of the three applications
   - Verify token works across all three
   - Check that logout clears token everywhere

## Environment Variables

All three applications use the same environment variables:

```bash
# Backend (required)
DATABASE_DIR=./data
JWT_SECRET=<your-secret>
BACKEND_PORT=3001

# Frontend (optional)
VITE_API_URL=https://bbs.uprough.net

# Production deployment
NODE_ENV=production
```

## Nginx Configuration (Production)

If using Nginx as a reverse proxy:

```nginx
server {
    listen 80;
    server_name bbs.uprough.net;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket support for Socket.IO
    location /socket.io/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## Benefits

1. **Simplified Deployment**: One server, one domain, one deployment
2. **Shared Authentication**: Users log in once, access all tools
3. **Better User Experience**: Seamless navigation between apps
4. **Easier Development**: Clear separation of concerns with shared backend
5. **Cost Effective**: Single server deployment instead of multiple services

## Migration from Old Structure

Previously:
- BBS Terminal: Separate deployment
- Admin Config: Separate deployment on different port
- SDK Preview: Separate server on port 8080

Now:
- All three served from single backend on port 3001
- Unified under one domain with path-based routing
- Shared authentication and user database
