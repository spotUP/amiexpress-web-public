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

# Install system dependencies
RUN apk add --no-cache \
    python3 \
    py3-pip \
    sqlite \
    bash \
    curl

# Create app user (non-root)
RUN addgroup -g 1001 bbsuser && \
    adduser -D -u 1001 -G bbsuser bbsuser

# Set working directory
WORKDIR /app

# Copy backend production dependencies
COPY --from=backend-builder /app/web/backend/package*.json ./web/backend/
WORKDIR /app/web/backend
RUN npm ci --only=production --ignore-scripts && npm cache clean --force

# Copy all built artifacts (frontend assets)
WORKDIR /app
COPY --from=frontend-builder /app/web/frontend/dist ./web/frontend/dist
COPY --from=config-builder /app/web/config-app/dist ./web/config-app/dist
COPY --from=sdk-builder /app/sdk/dist ./sdk/dist
COPY --from=sdk-builder /app/sdk/tools/preview/frontend/dist ./sdk/tools/preview/frontend/dist
COPY --from=terminal-builder /app/packages/terminal/dist ./packages/terminal/dist

# Copy backend source files (backend runs TypeScript directly with tsx)
COPY web/backend/src ./web/backend/src
COPY web/backend/scripts ./web/backend/scripts

# Create BBS data directories
RUN mkdir -p \
    /app/data/bbs \
    /app/data/amiga-roms \
    /app/logs \
    /app/Doors \
    /app/Commands \
    /app/Screens \
    /app/Bulletins \
    /app/Users \
    /app/db \
    /app/Conf1 /app/Conf2 /app/Conf3 /app/Conf4 /app/Conf5 \
    /app/Conf6 /app/Conf7 /app/Conf8 /app/Conf9 /app/Conf10 \
    /app/Conf11 /app/Conf12 /app/Conf13

# Copy default BBS data files
COPY Screens /app/Screens
COPY Bulletins /app/Bulletins
COPY Commands /app/Commands
COPY Conf1 /app/Conf1
COPY Conf2 /app/Conf2
COPY Conf3 /app/Conf3
COPY Conf4 /app/Conf4
COPY Conf5 /app/Conf5
COPY Conf6 /app/Conf6
COPY Conf7 /app/Conf7
COPY Conf8 /app/Conf8
COPY Conf9 /app/Conf9
COPY Conf10 /app/Conf10
COPY Conf11 /app/Conf11
COPY Conf12 /app/Conf12
COPY Conf13 /app/Conf13

# Set permissions
RUN chown -R bbsuser:bbsuser /app

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

# Start the BBS server (runs TypeScript directly with tsx)
CMD ["npx", "tsx", "src/index.ts"]
