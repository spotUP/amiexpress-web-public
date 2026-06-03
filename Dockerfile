# AmiExpress-Web Dockerfile
# Multi-stage build for production-ready BBS container

# ============================================================================
# Stage 1: Build SDK (needed by terminal and other packages)
# ============================================================================
FROM node:20-alpine AS sdk-builder

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
FROM node:20-alpine AS terminal-builder

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
FROM node:20-alpine AS frontend-builder

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
FROM node:20-alpine AS config-builder

WORKDIR /app/web/config-app

COPY web/config-app/package*.json ./
RUN npm ci

COPY web/config-app ./
RUN npm run build

# ============================================================================
# Stage 5: Build SDK Preview (needs SDK + terminal)
# ============================================================================
FROM node:20-alpine AS sdk-preview-builder

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
FROM node:20-alpine AS doors-builder
WORKDIR /app
# Copy SDK source (moduleResolution:node follows source .ts files in engines/ etc.)
# sdk/node_modules is excluded by .dockerignore; only source + compiled output needed.
COPY sdk ./sdk
COPY --from=sdk-builder /app/sdk/dist ./sdk/dist
COPY --from=sdk-builder /app/sdk/node_modules ./sdk/node_modules
COPY Doors ./Doors
# Build all TypeScript doors that have a dist/ convention.
# This ensures dist/ is always fresh from source regardless of what was committed.
WORKDIR /app/Doors/door-manager
# npm install reads package.json and triggers the SDK's build scripts via
# the file: dependency even with --ignore-scripts. Bypass by installing
# typescript globally (no package.json read), then symlinking the pre-built
# SDK and running tsc directly.
RUN npm install -g typescript@5 && \
    mkdir -p node_modules/@amiexpress && \
    ln -sf /app/sdk node_modules/@amiexpress/bbs-door-sdk && \
    tsc
WORKDIR /app

# ============================================================================
# Stage 7: Build Backend
# ============================================================================
FROM node:20-alpine AS backend-builder

# Install build tools needed for native modules (deasync, better-sqlite3)
RUN apk add --no-cache python3 make g++ build-base curl autoconf automake libtool

# Build original lha (jca02266 fork of Japanese lha) — supports 'a' (create) unlike lhasa
RUN set -eux; \
    curl -fsSL https://github.com/jca02266/lha/archive/refs/heads/master.tar.gz -o /tmp/lha.tgz; \
    cd /tmp && tar xzf lha.tgz; \
    cd lha-master; \
    autoreconf -fi 2>/dev/null || true; \
    ./configure --prefix=/usr/local; \
    make -j"$(nproc)"; \
    install -m 755 src/lha /usr/local/bin/lha; \
    rm -rf /tmp/lha*

# lrzsz: not in any Alpine repo. Build from upstream sources, but tell
# gcc 14 to treat the K&R-era code as C89 (`-std=gnu89`) so `func()`
# means "args unspecified" instead of "zero args". The xstrtol.h /
# long-options.c errors that broke earlier builds are all C89-vs-C23
# function-prototype mismatches.
RUN set -eux; \
    curl -fsSL https://www.ohse.de/uwe/releases/lrzsz-0.12.20.tar.gz -o /tmp/lrzsz.tgz; \
    cd /tmp && tar xzf lrzsz.tgz; \
    cd lrzsz-0.12.20; \
    CFLAGS='-O2 -std=gnu89 -fcommon -Wno-error=implicit-function-declaration -Wno-error=implicit-int -Wno-error=incompatible-pointer-types -Wno-error=return-mismatch' \
    ./configure --prefix=/usr/local --disable-nls --disable-rpath \
      || { echo '--- config.log tail ---'; tail -80 config.log; exit 1; }; \
    make -j"$(nproc)" CFLAGS='-O2 -std=gnu89 -fcommon -Wno-error=implicit-function-declaration -Wno-error=implicit-int -Wno-error=incompatible-pointer-types -Wno-error=return-mismatch'; \
    make install; \
    # lrzsz installs as lsz/lrz/lsb/lrb/lsx/lrx (Forsberg's "l" prefix).
    # Add classic sz/rz/sb/rb/sx/rx symlinks so isLrzszAvailable() finds them.
    for p in sz rz sb rb sx rx; do ln -sf "/usr/local/bin/l$p" "/usr/local/bin/$p"; done; \
    /usr/local/bin/sz --version

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
FROM node:20-alpine

# Embed the git SHA into the image so the running container can report
# which revision it was built from. Set via docker-compose build-args
# (GIT_SHA defaults to "unknown" in docker-compose.yml when not passed).
# The CI deploy workflow always passes the resolved SHA. The /app/.git-sha
# file is written below after WORKDIR /app establishes the directory.
ARG GIT_SHA=unknown
LABEL org.opencontainers.image.revision="$GIT_SHA"

# Install system dependencies (including build tools for native modules).
RUN apk add --no-cache \
    python3 \
    py3-pip \
    sqlite \
    bash \
    curl \
    build-base \
    g++ \
    make \
    p7zip

# lrzsz binaries built in backend-builder (Alpine v3.23 dropped the package).
# Copy the real binaries (lsz/lrz) and recreate the classic sz/rz symlinks
# in the production layer — symlinks don't always survive COPY --from cleanly.
COPY --from=backend-builder /usr/local/bin/lsz /usr/local/bin/lsz
COPY --from=backend-builder /usr/local/bin/lrz /usr/local/bin/lrz
COPY --from=backend-builder /usr/local/bin/lha /usr/local/bin/lha
RUN ln -sf /usr/local/bin/lsz /usr/local/bin/sz \
 && ln -sf /usr/local/bin/lsz /usr/local/bin/sb \
 && ln -sf /usr/local/bin/lsz /usr/local/bin/sx \
 && ln -sf /usr/local/bin/lrz /usr/local/bin/rz \
 && ln -sf /usr/local/bin/lrz /usr/local/bin/rb \
 && ln -sf /usr/local/bin/lrz /usr/local/bin/rx \
 && /usr/local/bin/sz --version

# Create app user (non-root)
RUN addgroup -g 1001 bbsuser && \
    adduser -D -u 1001 -G bbsuser bbsuser

# Set working directory
WORKDIR /app

# Record the build's git SHA so the running container can answer
# "which revision is this?". fetch-live-logs.yml reads this file.
RUN echo "${GIT_SHA}" > /app/.git-sha && echo "[Docker] image built from $(cat /app/.git-sha)"

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
# Copy SDK dist, package.json, AND node_modules (required for runtime dependencies like 'tone')
COPY --from=sdk-builder /app/sdk/dist ./sdk/dist
COPY --from=sdk-builder /app/sdk/package.json ./sdk/package.json
COPY --from=sdk-builder /app/sdk/node_modules ./sdk/node_modules
COPY --from=sdk-preview-builder /app/sdk/tools/preview/frontend/dist ./sdk/tools/preview/frontend/dist
COPY --from=terminal-builder /app/packages/terminal/dist ./packages/terminal/dist

# Copy backend source files (backend runs TypeScript directly with tsx)
COPY web/backend/src ./web/backend/src
COPY web/backend/scripts ./web/backend/scripts
COPY web/backend/seeds ./web/backend/seeds
# tsconfig.json MUST be present at runtime — tsx delegates to esbuild,
# which only enables experimentalDecorators / emitDecoratorMetadata when
# it can read them from a tsconfig.json walking up from each source
# file. Without this copy, files using DI decorators (e.g.
# services/use-cases/authentication.use-case.ts) throw
# "Parameter decorators only work when experimental decorators are
# enabled" the first time they're imported, which crashes the telnet/SSH
# login path and silently drops the connection.
COPY web/backend/tsconfig.json ./web/backend/tsconfig.json

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
# Note: bbsConfig.info is gitignored (user-specific) - synced via deploy/sync-to-server.sh
COPY ConfConfig.info Conf.DB Doors.info NamesNotAllowed.info /app/default-data/
COPY Conf1.info Conf2.info Conf3.info Conf4.info Conf5.info Conf6.info Conf7.info /app/default-data/
COPY Conf8.info Conf9.info Conf10.info Conf11.info Conf12.info Conf13.info Conf14.info /app/default-data/
COPY Node0.info Node1.info Node2.info Node3.info Node4.info Node5.info Node6.info /app/default-data/

# Copy BBS config directories (access levels, protocols, file checkers, etc.)
COPY Access /app/default-data/Access
COPY Languages /app/default-data/Languages
COPY Protocols /app/default-data/Protocols
COPY FCheck /app/default-data/FCheck
COPY Storage /app/default-data/Storage
COPY SysopStats /app/default-data/SysopStats
COPY Zoom /app/default-data/Zoom
COPY HELP /app/default-data/HELP
COPY Utils /app/default-data/Utils

# Copy AmigaOS system directories (C commands, Devs, L handlers, S startup, Scripts)
COPY C /app/default-data/C
COPY Devs /app/default-data/Devs
COPY L /app/default-data/L
COPY S /app/default-data/S
COPY Scripts /app/default-data/Scripts
COPY System /app/default-data/System
COPY AmiXnet /app/default-data/AmiXnet
COPY RIPgraphics /app/default-data/RIPgraphics
COPY Partdownload /app/default-data/Partdownload

# Copy remaining root-level .info files (batch configs, system configs)
COPY Access.info Commands.info ComputerList.info Drives.info /app/default-data/
COPY ScreenTypes.info Protocols.info Storage.info SysopStats.info /app/default-data/
COPY Private.info HELP.info Languages.info Utils.info FCheck.info /app/default-data/
COPY Zoom.info Areas.info AmiXnet.info UUCP.info /app/default-data/
COPY batch0.info batch1.info batch2.info batch3.info batch4.info batch5.info batch6.info batch000.info /app/default-data/

# Copy batch files (AmigaDOS maintenance scripts) and other root data files
COPY batch0 batch1 batch2 batch3 batch4 batch5 batch6 batch000 /app/default-data/
COPY acp.dat acpConnections.dat BBSHelp.txt SystemStats cplistan1000.dat /app/default-data/
COPY express /app/default-data/express

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
