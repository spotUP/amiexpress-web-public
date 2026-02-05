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
# Stage 6: Build TypeScript Doors (DISABLED - built at runtime or pre-built)
# ============================================================================
# Doors are now expected to be pre-built or built at runtime
# This dramatically speeds up Docker builds
FROM node:18-alpine AS doors-builder
WORKDIR /app
COPY Doors ./Doors
RUN echo "[Build] Doors stage - copying pre-built doors only"

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
# Install production deps and rebuild native modules for Linux
RUN npm ci --only=production --ignore-scripts && \
    npm rebuild better-sqlite3 && \
    npm rebuild deasync && \
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
COPY Conf14 /app/default-data/Conf14
# Node directories contain questionnaire scripts for new user signup
# Note: If build fails with "not found", check .dockerignore - these must NOT be excluded
# Copying Node0-Node40 (41 nodes total)
COPY Node0 /app/default-data/Node0
COPY Node1 /app/default-data/Node1
COPY Node2 /app/default-data/Node2
COPY Node3 /app/default-data/Node3
COPY Node4 /app/default-data/Node4
COPY Node5 /app/default-data/Node5
COPY Node6 /app/default-data/Node6
COPY Node7 /app/default-data/Node7
COPY Node8 /app/default-data/Node8
COPY Node9 /app/default-data/Node9
COPY Node10 /app/default-data/Node10
COPY Node11 /app/default-data/Node11
COPY Node12 /app/default-data/Node12
COPY Node13 /app/default-data/Node13
COPY Node14 /app/default-data/Node14
COPY Node15 /app/default-data/Node15
COPY Node16 /app/default-data/Node16
COPY Node17 /app/default-data/Node17
COPY Node18 /app/default-data/Node18
COPY Node19 /app/default-data/Node19
COPY Node20 /app/default-data/Node20
COPY Node21 /app/default-data/Node21
COPY Node22 /app/default-data/Node22
COPY Node23 /app/default-data/Node23
COPY Node24 /app/default-data/Node24
COPY Node25 /app/default-data/Node25
COPY Node26 /app/default-data/Node26
COPY Node27 /app/default-data/Node27
COPY Node28 /app/default-data/Node28
COPY Node29 /app/default-data/Node29
COPY Node30 /app/default-data/Node30
COPY Node31 /app/default-data/Node31
COPY Node32 /app/default-data/Node32
COPY Node33 /app/default-data/Node33
COPY Node34 /app/default-data/Node34
COPY Node35 /app/default-data/Node35
COPY Node36 /app/default-data/Node36
COPY Node37 /app/default-data/Node37
COPY Node38 /app/default-data/Node38
COPY Node39 /app/default-data/Node39
COPY Node40 /app/default-data/Node40

# Copy Doors to default-data (will be copied to persistent disk by entrypoint)
# BBS expects Doors at $BBS_DATA_DIR/Doors/ (e.g., /app/data/bbs/Doors/)
COPY --from=doors-builder /app/Doors /app/default-data/Doors

# Copy Libs to default-data (will be copied to persistent disk by entrypoint)
# BBS expects Libs at $BBS_DATA_DIR/Libs/ (e.g., /app/data/bbs/Libs/)
COPY Libs /app/default-data/Libs

# Copy AROS ROM files for 68K emulation (Kickstart not included - user must provide)
# These go to /app/data/amiga-roms which is on persistent disk mount
# The entrypoint will copy them if they don't exist on the persistent disk
COPY data/amiga-roms/aros-rom.bin /app/default-data/amiga-roms/aros-rom.bin
COPY data/amiga-roms/aros-ext.bin /app/default-data/amiga-roms/aros-ext.bin

# Copy root-level .info configuration files (critical for conference names and file areas)
# These are binary Amiga icon files containing tooltypes (key=value pairs)
# ConfConfig.info: NCONFS, NAME.n, LOCATION.n (conference list)
# Conf*.info: Per-conference settings (NDIRS, DLPATH, ULPATH for file areas)
# Note: bbsConfig.info is gitignored (user-specific) - backend uses defaults
COPY ConfConfig.info /app/default-data/ConfConfig.info
COPY Conf1.info Conf2.info Conf3.info Conf4.info Conf5.info Conf6.info Conf7.info /app/default-data/
COPY Conf8.info Conf9.info Conf10.info Conf11.info Conf12.info Conf13.info Conf14.info /app/default-data/

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
