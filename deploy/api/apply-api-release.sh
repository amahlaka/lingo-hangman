#!/bin/sh
# Puts the API release chosen by the "Production deploy" workflow live.
#
# Like apply-nginx-conf.sh: the workflow's SSH key can only rsync into the
# production folder, so it uploads "<commit SHA> <run id>" as $INBOX/tag, and
# this script (run as root every few seconds by lingo-api-release.timer)
# does the rest:
#
# 1. reads the tag as the deploy user (never following a link it planted) and
#    accepts only a full 40-character commit SHA, so the upload can choose
#    which of our own images runs and nothing else. The compose file, .env and
#    data stay root's and are never taken from the upload;
# 2. pulls $IMAGE:<sha>; if that fails, nothing changes;
# 3. backs up the database (VACUUM INTO, in the running container);
# 4. starts the new container and waits for its health check. If it never
#    turns healthy, the previous release is started again.
#
# The outcome goes to $STATUS/result.txt, "<sha> <run> ok" or "... failed"
# plus a few lines, written as the deploy user (see apply-nginx-conf.sh for
# why). The workflow waits for the line with its SHA and run id; the run id
# lets a re-run retry a release that failed, while each upload is handled once.
#
# Install: see docs/backend.md ("Deploying the API").
set -eu

INBOX=${INBOX:-/srv/lingo-prod/api}
STATUS=${STATUS:-/srv/lingo-prod/api-status}
DIR=${DIR:-/srv/lingo-api}
IMAGE=${IMAGE:-ghcr.io/amahlaka/lingo-hangman-api}
CONTAINER=${CONTAINER:-lingo-api}
DEPLOY_USER=${DEPLOY_USER:-prod-deploy}
HEALTH_WAIT=${HEALTH_WAIT:-90}

upload="$INBOX/tag"
[ -f "$upload" ] && [ ! -L "$upload" ] || exit 0
[ "$(stat -c %s "$upload")" -lt 100 ] || exit 0
request=$(runuser -u "$DEPLOY_USER" -- head -n1 "$upload" | head -c 80)

report() {
  # shellcheck disable=SC2016 # $1 expands in the inner shell
  { echo "$request $1"; shift; printf '%s\n' "$@"; } | runuser -u "$DEPLOY_USER" -- sh -c '
    umask 022 && mkdir -p "$1" && cat > "$1/result.txt.tmp" && mv -f "$1/result.txt.tmp" "$1/result.txt"
  ' sh "$STATUS"
}

if ! printf '%s\n' "$request" | grep -qxE '[0-9a-f]{40} [0-9]{1,20}'; then
  # Report under a fixed name: the bad value itself is not echoed back.
  request=invalid
  if ! runuser -u "$DEPLOY_USER" -- head -n1 "$STATUS/result.txt" 2>/dev/null | grep -q '^invalid '; then
    report failed "Refused: the tag file must hold a full 40-character commit SHA and a run id."
  fi
  exit 0
fi
tag=${request%% *}

# Already handled this upload.
if runuser -u "$DEPLOY_USER" -- head -n1 "$STATUS/result.txt" 2>/dev/null | grep -q "^$request "; then
  exit 0
fi

current=$(cat "$DIR/release-tag" 2>/dev/null || true)
if [ "$tag" = "$current" ] && [ "$(docker inspect -f '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null)" = healthy ]; then
  report ok "Already live."
  exit 0
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

if ! docker pull -q "$IMAGE:$tag" >"$work/pull.log" 2>&1; then
  report failed "Could not pull $IMAGE:$tag:" "$(tail -n 3 "$work/pull.log")"
  logger -t lingo-api-release "pull failed for $tag"
  exit 0
fi

# Back up the database before new migrations can run. The container's root
# filesystem is read-only, but /data is the mounted volume.
if docker inspect "$CONTAINER" >/dev/null 2>&1; then
  stamp=$(date +%Y%m%d-%H%M%S)
  docker exec "$CONTAINER" node -e '
    const fs = require("node:fs");
    const { DatabaseSync } = require("node:sqlite");
    fs.mkdirSync("/data/backups", { recursive: true });
    const db = new DatabaseSync(process.env.DB_PATH || "/data/lingo.db");
    db.exec(`VACUUM INTO '\''/data/backups/lingo-${process.argv[1]}.db'\''`);
  ' "$stamp-${current:-none}" 2>"$work/backup.err" \
    || logger -t lingo-api-release "backup before $tag failed: $(tail -n 1 "$work/backup.err")"
  # Keep the ten newest backups (names are ours: no odd characters).
  # shellcheck disable=SC2012
  ls -1t "$DIR/data/backups/"lingo-*.db 2>/dev/null | tail -n +11 | xargs -r rm -f
fi

start() {
  API_IMAGE=$IMAGE API_TAG=$1 docker compose --project-directory "$DIR" -f "$DIR/docker-compose.yml" \
    up -d --pull never --remove-orphans >"$work/up.log" 2>&1
}

wait_healthy() {
  i=0
  while [ $i -lt "$HEALTH_WAIT" ]; do
    state=$(docker inspect -f '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo missing)
    [ "$state" = healthy ] && return 0
    [ "$state" = unhealthy ] && return 1
    sleep 2
    i=$((i + 2))
  done
  return 1
}

if start "$tag" && wait_healthy; then
  echo "$tag" > "$DIR/release-tag"
  report ok "Healthy."
  logger -t lingo-api-release "running $tag"
else
  logs=$(docker logs --tail 5 "$CONTAINER" 2>&1 || true)
  if [ -n "$current" ] && start "$current" && wait_healthy; then
    report failed "The new release did not turn healthy; $current is running again. Last log lines:" "$logs"
  else
    report failed "The new release did not turn healthy, and no previous release could be restarted. Last log lines:" "$logs" "$(tail -n 3 "$work/up.log")"
  fi
  logger -t lingo-api-release "release $tag failed"
  exit 0
fi

# Remove images of this API other than the current and previous release.
docker images "$IMAGE" --format '{{.Tag}}' | grep -vxE "$tag|${current:-none}" \
  | sed "s|^|$IMAGE:|" | xargs -r docker rmi >/dev/null 2>&1 || true
