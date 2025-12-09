# AmiExpress-Web Dockerfile
# Multi-stage build for production-ready BBS container

# ============================================================================
# Stage 1: Build Frontend
# ============================================================================
FROM node:18-alpine AS frontend-builder

WORKDIR /app/web/frontend

# Copy frontend package files
COPY web/frontend/package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy frontend source
COPY web/frontend ./

# Build frontend
RUN npm run build

# ============================================================================
# Stage 2: Build Backend
# ============================================================================
FROM node:18-alpine AS backend-builder

WORKDIR /app/web/backend

# Copy backend package files
COPY web/backend/package*.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm ci

# Copy backend source
COPY web/backend ./

# Build backend (TypeScript compilation)
RUN npm run build

# ============================================================================
# Stage 3: Production Image
# ============================================================================
FROM node:18-alpine

# Install system dependencies
# - python3: For Python doors
# - sqlite: For database
# - bash: For scripts
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

# Copy backend production dependencies only
COPY --from=backend-builder /app/web/backend/package*.json ./web/backend/
WORKDIR /app/web/backend
RUN npm ci --only=production && npm cache clean --force

# Copy built backend from builder
COPY --from=backend-builder /app/web/backend/dist ./dist

# Copy built frontend from builder
WORKDIR /app
COPY --from=frontend-builder /app/web/frontend/dist ./web/frontend/dist

# Copy necessary runtime files
COPY package*.json ./
COPY web/backend/src ./web/backend/src
COPY web/config-app/dist ./web/config-app/dist
COPY sdk ./sdk

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
    /app/db

# Copy default BBS data (screens, commands, etc.)
COPY Screens ./Screens
COPY Commands ./Commands
COPY Bulletins ./Bulletins
COPY Conf*.info ./
COPY Conf* ./

# Set ownership to bbsuser
RUN chown -R bbsuser:bbsuser /app

# Switch to non-root user
USER bbsuser

# Environment variables (can be overridden)
ENV NODE_ENV=production \
    PORT=3001 \
    DATABASE_DIR=/app/db \
    BBS_DATA_DIR=/app/data/bbs \
    ROM_DIR=/app/data/amiga-roms

# Expose ports
# 3001: HTTP/WebSocket (main BBS interface)
# 2323: Telnet
# 2222: SSH
# 8080: SDK Preview (optional)
EXPOSE 3001 2323 2222 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3001/ || exit 1

# Start command
CMD ["node", "/app/web/backend/dist/src/index.js"]
