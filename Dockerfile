# AmiExpress-Web Dockerfile
# Multi-stage build for production-ready BBS container

# ============================================================================
# Stage 1: Build SDK (needed by terminal and other packages)
# ============================================================================
FROM node:18-alpine AS sdk-builder

WORKDIR /app/sdk

# Copy SDK source and package files
COPY sdk/package*.json ./
COPY sdk/tsconfig.json ./
COPY sdk/tsconfig.client.json ./
COPY sdk ./

# Install dependencies (skip prepare script) and build
RUN npm ci --ignore-scripts && npm run build

# ============================================================================
# Stage 2: Build Terminal Package (needs SDK, needed by frontend)
# ============================================================================
FROM node:18-alpine AS terminal-builder

WORKDIR /app

# Copy built SDK first (terminal depends on it)
COPY --from=sdk-builder /app/sdk ./sdk

WORKDIR /app/packages/terminal

COPY packages/terminal/package*.json ./
RUN npm ci

COPY packages/terminal ./
RUN npm run build

# ============================================================================
# Stage 3: Build Frontend (BBS Terminal)
# ============================================================================
FROM node:18-alpine AS frontend-builder

WORKDIR /app

# Copy SDK and terminal package (frontend depends on both)
COPY --from=sdk-builder /app/sdk ./sdk
COPY --from=terminal-builder /app/packages/terminal ./packages/terminal

WORKDIR /app/web/frontend

COPY web/frontend/package*.json ./
RUN npm ci

COPY web/frontend ./
# Set NODE_ENV for production build
ENV NODE_ENV=production
# Run vite build directly (skip prebuild - terminal already built in separate stage)
RUN echo "[Build] Starting frontend vite build" && \
    npx vite build && \
    echo "[Build] Frontend build complete" && \
    ls -la dist/

# ============================================================================
# Stage 4: Build Config App (Admin UI)
# ============================================================================
FROM node:18-alpine AS config-builder

WORKDIR /app/web/config-app

COPY web/config-app/package*.json ./
RUN npm ci

COPY web/config-app ./
RUN npm run build

# ============================================================================
# Stage 5: Build SDK Preview (needs SDK + terminal)
# ============================================================================
FROM node:18-alpine AS sdk-preview-builder

WORKDIR /app

# Copy SDK and terminal
COPY --from=sdk-builder /app/sdk ./sdk
COPY --from=terminal-builder /app/packages/terminal ./packages/terminal

# Build SDK preview frontend
WORKDIR /app/sdk/tools/preview/frontend
COPY sdk/tools/preview/frontend/package*.json ./
COPY sdk/tools/preview/frontend ./
RUN npm ci --ignore-scripts && npm run build

# ============================================================================
# Stage 6: Build TypeScript Doors
# ============================================================================
FROM node:18-alpine AS doors-builder

WORKDIR /app

# Copy SDK (TypeScript doors depend on it)
COPY --from=sdk-builder /app/sdk ./sdk

# Install build tools
RUN apk add --no-cache bash findutils

# Copy all TypeScript doors
COPY Doors ./Doors

# Build TypeScript doors (top-level only, skip node_modules)
RUN echo "[Build] Building TypeScript doors..." && \
    for doordir in Doors/*/; do \
      doorname=$(basename "$doordir"); \
      if [ -f "${doordir}package.json" ] && [ "$doorname" != "node_modules" ]; then \
        echo "[Build] Building door: $doorname"; \
        cd "/app/$doordir" && \
        (npm ci --ignore-scripts 2>/dev/null || npm install --ignore-scripts 2>/dev/null) && \
        (npm run build 2>&1 || echo "[Build] No build script for $doorname"); \
        cd /app; \
      fi; \
    done && \
    echo "[Build] TypeScript doors build complete"

# ============================================================================
# Stage 7: Build Backend
# ============================================================================
FROM node:18-alpine AS backend-builder

# Install build tools needed for native modules (deasync, better-sqlite3)
RUN apk add --no-cache python3 make g++ build-base

WORKDIR /app/web/backend

COPY web/backend/package*.json ./
# Skip postinstall script (web assets built in separate stages)
RUN npm ci --ignore-scripts

COPY web/backend ./
# Run tsc directly since dependencies are already installed via npm ci
RUN npx tsc --project tsconfig.build.json

# ============================================================================
# Stage 8: Production Image
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
RUN echo "[Docker] Verifying frontend dist was copied:" && \
    ls -la /app/web/frontend/dist/ && \
    echo "[Docker] Assets:" && \
    ls -la /app/web/frontend/dist/assets/ || echo "No assets directory!" && \
    echo "[Docker] Fonts:" && \
    ls -la /app/web/frontend/dist/fonts/ || echo "No fonts directory!"
COPY --from=config-builder /app/web/config-app/dist ./web/config-app/dist
COPY --from=sdk-builder /app/sdk/dist ./sdk/dist
COPY --from=sdk-preview-builder /app/sdk/tools/preview/frontend/dist ./sdk/tools/preview/frontend/dist
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
# Node directories contain questionnaire scripts for new user signup
# Note: If build fails with "not found", check .dockerignore - these must NOT be excluded
COPY Node1 /app/default-data/Node1
COPY Node2 /app/default-data/Node2
COPY Node3 /app/default-data/Node3

# Copy Doors directly to /app/Doors (code expects them at project root, not data dir)
# Note: amigafs module handles case-insensitive path resolution for AmigaOS compatibility
# Copy built TypeScript doors (dist folders only for TS doors, full copy for 68K doors)
COPY --from=doors-builder /app/Doors /app/Doors

# Copy Libs directory (contains AROS fallback kickstart and libraries for 68K emulation)
COPY Libs /app/Libs

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
