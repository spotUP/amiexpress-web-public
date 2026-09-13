# WHIP Discord mirror bot sidecar.
# Built from the repo root as context (needs nothing outside bots/whip):
#   docker build -f bots/whip/Dockerfile -t whip-bot .
# Run by docker-compose (whip-bot service): shares the bbs-data volume
# read-only and reads its env from the admin-written volume file
# (BOT_ENV_FILE), so no secrets bake into this image.
FROM node:20-alpine

WORKDIR /app/bot

COPY bots/whip/package*.json ./
RUN npm ci
COPY bots/whip/tsconfig.json ./
COPY bots/whip/src ./src
RUN npx tsc && npm prune --omit=dev && rm -rf /root/.npm

# Non-root - and specifically uid 1001, the same uid the BBS image runs as
# (Dockerfile: `adduser -u 1001 bbsuser`). That is not cosmetic: the backend
# writes this bot's config to the shared volume as
# /app/data/bots/whip.env mode 0600, owned by 1001. Running as node (uid
# 1000) meant the sidecar could see the file and not read it - dotenv
# swallowed the EACCES, loadConfig then threw "Missing required env var
# DISCORD_BOT_TOKEN", and the container crash-looped under
# `restart: unless-stopped` while the admin page showed a config it had
# saved successfully. If the BBS image's uid ever changes, this must follow.
RUN addgroup -g 1001 bbsuser \
    && adduser -D -u 1001 -G bbsuser bbsuser \
    && chown -R bbsuser:bbsuser /app/bot
USER bbsuser

# Which commit this image was built from.
#
# The deploy proves a container is running what was just built by comparing
# THIS label against the SHA it deployed (deploy/deploy.sh, "running images
# match what was just built"). It used to compare docker image IDs instead,
# and that was wrong on this host: under the containerd snapshotter a build
# that exports an attestation manifest gives the container an .Image digest
# that `docker image inspect` cannot resolve at all, so a bot running correct
# code read as STALE and the deploy would have failed on it.
#
# A label the build stamps is the honest answer to "which code is this?" -
# it does not depend on the image store, the builder, or attestations. The
# BBS image has carried it since Dockerfile:251; this one did not, which is
# why the bot was unverifiable.
ARG GIT_SHA=unknown
LABEL org.opencontainers.image.revision="$GIT_SHA"

# Health for compose + the admin status probe (bot's own /health).
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=60s \
  CMD node -e "fetch('http://localhost:3099/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
