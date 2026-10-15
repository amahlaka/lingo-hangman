# The Lingo API image. Built from the repository root so later phases can
# share code with the app (src/lib): docker build -f server/Dockerfile .
FROM node:24-alpine

ENV NODE_ENV=production \
    DB_PATH=/data/lingo.db \
    PORT=3000

WORKDIR /srv/api
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server/src ./src
COPY server/migrations ./migrations
# Progress rules shared with the app (server/src/routes/sync.js imports them
# from ../../../src/lib, which is /srv/src/lib here).
COPY src/lib/progress.js src/lib/cosmetics.js src/lib/syncEvents.js /srv/src/lib/
RUN echo '{ "type": "module" }' > /srv/src/package.json

ARG LINGO_VERSION=dev
ENV LINGO_VERSION=$LINGO_VERSION

# The data volume is the only writable place; run with --read-only.
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --start-interval=2s --retries=3 \
  CMD ["node", "src/healthcheck.js"]

CMD ["node", "src/server.js"]
