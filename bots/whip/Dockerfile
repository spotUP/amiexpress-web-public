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

# Non-root, like the rest of the stack expects of sidecars.
USER node

# Health for compose + the admin status probe (bot's own /health).
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=60s \
  CMD node -e "fetch('http://localhost:3099/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
