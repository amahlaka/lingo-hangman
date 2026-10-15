# Backend (optional)

`server/` is Lingo's optional backend. It will add accounts with passkeys,
progress shared across devices, reminders, on-demand speech, reports and
suggestions. **The app never depends on it:** progress is saved on the device
first, and every backend feature hides itself when the API can't be reached or
the learner is signed out. Previews run without a backend.

Built in phases, one pull request each:

1. Skeleton: the service, its database, image and deploys.
2. **Accounts** (this): passkeys, with a one-time email code as the fallback.
3. Reports and suggestions (signed-in learners), then progress sync.
4. On-demand speech through the Kokoro TTS server, with daily limits.
5. Reminders by web push.
6. Statistics, opt-in anonymous leaderboards and learning paths.

## How it fits together

```
Browser ──https──▶ reverse proxy ── /api/* ──▶ lingo-api container :3000
           │                                        │
           └── everything else ──▶ static nginx     └── SQLite file on /data
```

- **Same origin.** The reverse proxy forwards `/api/` of the app's own address
  to the `lingo-api` container, so there is no CORS and the CSP's
  `connect-src 'self'` already allows it. The route lives in the reverse proxy,
  not in `deploy/preview/nginx.conf`: that config may only serve static files.
- **Node + Fastify + SQLite.** SQLite through Node's built-in `node:sqlite`, so
  there are no native modules. The database is one file on the container's
  `/data` volume.
- **Migrations** are numbered files in `server/migrations/`, run in order at
  start-up, each in a transaction. They only add tables and columns, never
  remove them, because rolling back a release does not roll back the database.

## Working on it

```bash
cd server
npm install
npm test          # node --test, against an in-memory database
npm run dev       # http://localhost:3000/api/health, data in server/data/
```

With the API running, `npm run dev` in the repository root forwards `/api` to
it, so the app talks to it exactly as in production.

Settings come from environment variables (`server/src/config.js`, and
`deploy/api/env.example` for the server). Secrets are only ever set on the
server. Locally the defaults work with `npm run dev` in the root: passkeys for
`localhost`, the origin `http://localhost:5173`, and `MAILER=log`, which sends
nothing. To see sign-in codes locally, run a mail catcher such as Mailpit with
TLS and set `MAILER=smtp` and the `SMTP_*` values.

## Accounts

Accounts are optional and the app never asks for one. The Account page
(`src/app/Account.jsx`) is linked from Settings only when the API answers.

- **Passkeys first.** Signing in uses a discoverable passkey
  (`@simplewebauthn/server` and `/browser`), so nothing has to be typed.
- **Email code.** A 6-digit code, valid for 10 minutes and 5 tries, signs in
  when a device has no passkey. It also creates the account the first time,
  which proves the address. After a code sign-in the app offers to add a
  passkey. A code, not a link: on iPhone a link opens in Safari instead of the
  installed app.
- **Sessions** are a random id in an HttpOnly, Secure, SameSite=Lax cookie on
  `/api`; the database keeps only its hash. They last 180 days and are
  extended while used. Learners see their devices and can sign any of them out.
- **Requests that change something** need the `X-Lingo: 1` header and, when the
  browser sends one, an `Origin` from `ORIGINS`. Cross-site pages can't send
  that header without a CORS preflight, which the API never allows.
- **Limits:** code requests per IP (20/h) and per email (5/h, 20/day), code
  checks per IP (30/h), passkey starts per IP (60/h), and 200 mails an hour in
  total.
- **Mail** (`server/src/mail/`): sign-in codes and account notices only, in
  Finnish or English, with a plain-text and an HTML part. Mail is queued in
  the database and sent by a background worker with retries, so a slow mail
  server never fails a request. A code mail that is still unsent when the code
  expires is dropped. Logs name the recipient and template, never the content.
  `MAILER=smtp` requires STARTTLS (or port 465) and login, with certificate
  checks on.
- **Your data:** learners can download what the account holds and delete it,
  confirming with their email. The privacy page (`/privacy`) says what is kept.
- **Admins** are the accounts whose email is in `ADMIN_EMAILS`.

## Deploying the API

*Production deploy* (`.github/workflows/production.yml`) also tests the API,
builds its image, pushes it to `ghcr.io/<owner>/<repo>-api:<commit SHA>` and,
after the static release is live, asks the server to run it. The deploy key can
still only rsync: it uploads `"<SHA> <run id>"` to `api/tag` in the production
folder, and a root timer on the server
(`deploy/api/apply-api-release.sh`) does the rest:

1. accepts only a full commit SHA, so the upload can pick which of our own
   images runs and nothing else (the compose file, `.env` and data are never
   taken from the upload);
2. pulls the image; if that fails, nothing changes;
3. backs up the database to `data/backups/` (`VACUUM INTO`, newest ten kept);
4. starts the new container and waits for its health check, or starts the
   previous release again if it never turns healthy;
5. writes the outcome to `api-status/result.txt`, which the workflow waits for.

Rolling back the app with an older commit rolls the API back too. Releases from
before `server/` existed skip these steps.

The *API checks* workflow runs the tests, `shellcheck` and an image build with a
health check on pull requests that touch `server/` or `deploy/api/`.

### One-time server setup

As root, with the repository checked out:

```bash
# The API's folder: compose file, settings and data. Root-owned; the data
# folder belongs to the container's user (uid 1000).
install -d -m 755 /srv/lingo-api
install -d -o 1000 -g 1000 -m 750 /srv/lingo-api/data
install -m 644 deploy/api/docker-compose.yml /srv/lingo-api/
install -m 600 deploy/api/env.example /srv/lingo-api/.env   # then fill it in

# The release timer, and its upload and result folders for the deploy user.
install -m 755 deploy/api/apply-api-release.sh /usr/local/sbin/lingo-apply-api-release
install -m 644 deploy/api/lingo-api-release.service deploy/api/lingo-api-release.timer /etc/systemd/system/
install -d -o prod-deploy -g prod-deploy -m 755 /srv/lingo-prod/api /srv/lingo-prod/api-status
systemctl daemon-reload && systemctl enable --now lingo-api-release.timer
```

Then:

- Make the `<repo>-api` package on GitHub public (Packages → package settings →
  Change visibility) after the first *Production deploy*, or `docker login
  ghcr.io` on the server with a read-only token.
- In the reverse proxy, add a custom location `/api` to the app's proxy host,
  forwarding to `http://lingo-api:3000` with the original path.
- Check it: `curl https://<app address>/api/health` answers
  `{"ok":true,"version":"<SHA>","schema":1}`.

Server-only compose settings (for example `extra_hosts` for the mail server)
go in `/srv/lingo-api/docker-compose.override.yml`, never in the repository;
the release script uses that file when it exists. Paths, image and container names are variables at the top of the
script; override them in a drop-in (`systemctl edit lingo-api-release.service`).

### Backups

`data/backups/` holds a copy from before each release. Include `/srv/lingo-api/data`
in the server's regular backups as well.
