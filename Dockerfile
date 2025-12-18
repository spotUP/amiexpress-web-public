# AmiExpress-Web Dockerfile
# Multi-stage build for production-ready BBS container

# ============================================================================
# Stage 1: Build Terminal Package (needed by frontend)
# ============================================================================
FROM node:18-alpine AS terminal-builder

WORKDIR /app/packages/terminal

COPY packages/terminal/package*.json ./
RUN npm ci

COPY packages/terminal ./
RUN npm run build

# ============================================================================
# Stage 2: Build Frontend (BBS Terminal)
# ============================================================================
FROM node:18-alpine AS frontend-builder

WORKDIR /app

# Copy terminal package first (frontend depends on it)
COPY --from=terminal-builder /app/packages/terminal ./packages/terminal

WORKDIR /app/web/frontend

COPY web/frontend/package*.json ./
RUN npm ci

COPY web/frontend ./
# Skip prebuild script (terminal already built), just run vite build
RUN npm run build --ignore-scripts || vite build

# ============================================================================
# Stage 3: Build Config App (Admin UI)
# ============================================================================
FROM node:18-alpine AS config-builder

WORKDIR /app/web/config-app

COPY web/config-app/package*.json ./
RUN npm ci

COPY web/config-app ./
RUN npm run build

# ============================================================================
# Stage 4: Build SDK Preview
# ============================================================================
FROM node:18-alpine AS sdk-builder

WORKDIR /app/sdk

# Copy SDK source and package files
COPY sdk/package*.json ./
COPY sdk/tsconfig.json ./
COPY sdk ./

# Install dependencies (skip prepare script) and build
RUN npm ci --ignore-scripts && npm run build

# Copy terminal package (required by SDK preview frontend)
COPY --from=terminal-builder /app/packages/terminal /app/packages/terminal

# Build SDK preview frontend
WORKDIR /app/sdk/tools/preview/frontend
COPY sdk/tools/preview/frontend/package*.json ./
COPY sdk/tools/preview/frontend ./
RUN npm ci --ignore-scripts && npm run build

# ============================================================================
# Stage 5: Build Backend
# ============================================================================
FROM node:18-alpine AS backend-builder

WORKDIR /app/web/backend

COPY web/backend/package*.json ./
# Skip postinstall script (web assets built in separate stages)
RUN npm ci --ignore-scripts

COPY web/backend ./
RUN npm run build

# ============================================================================
# Stage 6: Production Image
# ============================================================================
FROM node:18-alpine

# Install system dependencies (including build tools for native modules)
RUN apk add --no-cache \
    python3 \
    py3-pip \
    sqlite \
    bash \
    curl \
    build-base \
    g++ \
    make

# Create app user (non-root)
RUN addgroup -g 1001 bbsuser && \
    adduser -D -u 1001 -G bbsuser bbsuser

# Set working directory
WORKDIR /app

# Copy backend production dependencies
COPY --from=backend-builder /app/web/backend/package*.json ./web/backend/
WORKDIR /app/web/backend
# Install production deps and rebuild better-sqlite3 for Linux
RUN npm ci --only=production --ignore-scripts && \
    npm rebuild better-sqlite3 && \
    npm cache clean --force

# Copy all built artifacts (frontend assets)
WORKDIR /app
COPY --from=frontend-builder /app/web/frontend/dist ./web/frontend/dist
COPY --from=config-builder /app/web/config-app/dist ./web/config-app/dist
COPY --from=sdk-builder /app/sdk/dist ./sdk/dist
COPY --from=sdk-builder /app/sdk/doors ./sdk/doors
COPY --from=sdk-builder /app/sdk/tools/preview/frontend/dist ./sdk/tools/preview/frontend/dist
COPY --from=terminal-builder /app/packages/terminal/dist ./packages/terminal/dist

# Copy backend source files (backend runs TypeScript directly with tsx)
COPY web/backend/src ./web/backend/src
COPY web/backend/scripts ./web/backend/scripts

# Create directories that will exist in the container (not on persistent disk)
RUN mkdir -p /app/logs /app/default-data

# Copy default BBS data to a template directory (NOT the live data location)
# These will be used to initialize the persistent disk on first run only
COPY Screens /app/default-data/Screens
COPY Bulletins /app/default-data/Bulletins
COPY Commands /app/default-data/Commands
COPY Conf1 /app/default-data/Conf1
COPY Conf2 /app/default-data/Conf2
COPY Conf3 /app/default-data/Conf3
COPY Conf4 /app/default-data/Conf4
COPY Conf5 /app/default-data/Conf5
COPY Conf6 /app/default-data/Conf6
COPY Conf7 /app/default-data/Conf7
COPY Conf8 /app/default-data/Conf8
COPY Conf9 /app/default-data/Conf9
COPY Conf10 /app/default-data/Conf10
COPY Conf11 /app/default-data/Conf11
COPY Conf12 /app/default-data/Conf12
COPY Conf13 /app/default-data/Conf13

# Copy Doors directly to /app/Doors (code expects them at project root, not data dir)
# Note: amigafs module handles case-insensitive path resolution for AmigaOS compatibility
COPY Doors /app/Doors

# Copy entrypoint script
COPY docker-entrypoint.sh /app/docker-entrypoint.sh

# Set permissions
RUN chown -R bbsuser:bbsuser /app && chmod +x /app/docker-entrypoint.sh

# Switch to non-root user
USER bbsuser

# Expose ports
# 3001: HTTP/WebSocket (BBS + Admin + SDK)
# 2323: Telnet
# 2222: SSH
# 8080: SDK backend API
EXPOSE 3001 2323 2222 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3001/ || exit 1

# Set working directory to backend
WORKDIR /app/web/backend

# Use entrypoint to initialize data on first run, then start server
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["npx", "tsx", "src/index.ts"]
