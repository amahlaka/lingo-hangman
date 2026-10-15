#!/bin/sh
# Puts the nginx config uploaded by the "Production deploy" workflow live.
#
# The workflow's SSH key can only rsync into the production folder, so it
# can't reload nginx itself. It uploads deploy/preview/nginx.conf to
# $INBOX/nginx.conf; this script (run as root every few seconds by
# lingo-nginx-conf.timer) checks it with `nginx -t` in a throwaway container
# with the same image and mounts, and only then copies it over the live
# config and reloads nginx. A config that fails the check never goes live.
#
# The deploy key can already change the site's files; this must not let it do
# more. So the file is read as the deploy user (a link it plants to a root-only
# file can't be read), and a config is refused if it could reach anything but
# the static folders: no *_pass to other containers or hosts, no include,
# upstream, resolver, mirror or modules, and root/alias only under /srv/.
#
# The outcome goes to $STATUS/result.txt (a folder the deploy user can read
# but not write): "<sha256 of the uploaded file> ok" or "... failed", then
# nginx's message. The workflow waits for the line with its file's checksum.
#
# Install: see docs/preview-deployments.md ("Config deploys").
set -eu

INBOX=${INBOX:-/srv/lingo-prod/nginx}
STATUS=${STATUS:-/srv/lingo-prod/nginx-status}
LIVE=${LIVE:-/srv/lingo-previews/nginx.conf}
CONTAINER=${CONTAINER:-lingo-previews}
IMAGE=${IMAGE:-nginx:1.27-alpine}
MOUNTS=${MOUNTS:-"-v /srv/previews:/srv/previews:ro -v /srv/lingo-prod:/srv/lingo-prod:ro"}
DEPLOY_USER=${DEPLOY_USER:-prod-deploy}

upload="$INBOX/nginx.conf"
# Only a plain file the deploy user put there; never follow a link it made.
[ -f "$upload" ] && [ ! -L "$upload" ] || exit 0
[ "$(stat -c %s "$upload")" -lt 1000000 ] || exit 0

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
runuser -u "$DEPLOY_USER" -- cat "$upload" > "$work/candidate.conf"
sum=$(sha256sum "$work/candidate.conf" | cut -d' ' -f1)

# Already handled this exact file.
if [ -f "$STATUS/result.txt" ] && head -n1 "$STATUS/result.txt" | grep -q "^$sum "; then
  exit 0
fi

report() {
  install -d -m 755 "$STATUS"
  { echo "$sum $1"; shift; printf '%s\n' "$@"; } > "$STATUS/result.txt.tmp"
  chmod 644 "$STATUS/result.txt.tmp"
  mv -f "$STATUS/result.txt.tmp" "$STATUS/result.txt"
}

if cmp -s "$work/candidate.conf" "$LIVE"; then
  report ok "Already live."
  exit 0
fi

# Directives that reach beyond the static folders. Comments are ignored.
code=$(sed 's/#.*//' "$work/candidate.conf")
banned=$(printf '%s\n' "$code" | grep -noE '\b([a-z_]+_pass|include|upstream|resolver|mirror|load_module|perl[a-z_]*|js_[a-z_]+|lua[a-z_]*|proxy_[a-z_]+|fastcgi_[a-z_]+|uwsgi_[a-z_]+|scgi_[a-z_]+|grpc_[a-z_]+)\b' || true)
# One statement per line, then every root/alias must point under /srv/.
outside=$(printf '%s\n' "$code" | tr '{};' '\n\n\n' | grep -E '^[[:space:]]*(root|alias)[[:space:]]' \
  | grep -vE '^[[:space:]]*(root|alias)[[:space:]]+/srv/[^.[:space:]]*[[:space:]]*$' || true)
if [ -n "$banned$outside" ]; then
  report failed "Refused: only static files under /srv/ may be served. Lines:" "$banned" "$outside"
  logger -t lingo-nginx-conf "refused config $sum"
  exit 0
fi

chmod 644 "$work/candidate.conf"
# shellcheck disable=SC2086 # MOUNTS is a list of options
if ! check=$(docker run --rm --network none $MOUNTS \
    -v "$work/candidate.conf:/etc/nginx/conf.d/default.conf:ro" \
    "$IMAGE" nginx -t 2>&1); then
  report failed "$(printf '%s\n' "$check" | tail -n 5)"
  logger -t lingo-nginx-conf "rejected config $sum"
  exit 0
fi

cp -p "$LIVE" "$LIVE.auto-$(date +%Y%m%d-%H%M%S)"
# Write in place: the container mounts this one file, and a new file (mv)
# would leave it reading the old one.
cat "$work/candidate.conf" > "$LIVE"
if docker exec "$CONTAINER" nginx -s reload 2>"$work/reload.err"; then
  report ok "Reloaded."
  logger -t lingo-nginx-conf "applied config $sum"
else
  report failed "Checked, copied, but reload failed:" "$(tail -n 5 "$work/reload.err")"
  logger -t lingo-nginx-conf "reload failed for $sum"
fi

# Keep the ten newest of these backups (hand-made .bak-* ones are left alone).
ls -1t "$LIVE".auto-* 2>/dev/null | tail -n +11 | xargs -r rm -f
