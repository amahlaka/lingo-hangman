# Backend (optional)

`server/` is Lingo's optional backend. It will add accounts with passkeys,
progress shared across devices, reminders, on-demand speech, reports and
suggestions. **The app never depends on it:** progress is saved on the device
first, and every backend feature hides itself when the API can't be reached or
the learner is signed out. Previews run without a backend.

Built in phases, one pull request each:

1. Skeleton: the service, its database, image and deploys.
2. Accounts: passkeys, with a one-time email code as the fallback.
3. Reports and suggestions (signed-in learners), then progress sync.
4. On-demand speech through the Kokoro TTS server, with daily limits.
5. Reminders by web push.
6. Statistics and difficulty data, opt-in weekly leaderboards, and **My
   path** (the newest).

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
- **Admins** are the accounts whose email is in `ADMIN_EMAILS` (also an
  account made before its email was added). Admin routes also need a sign-in
  from the last day.

## Reports and suggestions

Learners with an account can report a problem with a question and suggest
words, phrases and sentences. Without an account the form still opens and
keeps what was typed until they sign in; with the API unreachable the buttons
are hidden.

- **In the app:** a game names the question on screen with
  `useReportSubject({ game, itemRef, context })` (`src/app/FeedbackContext.jsx`);
  `PracticeSession` and hangman already do. "Report a problem" then shows under
  the Next button and in the settings menu. `itemRef` is the word base item id
  when the question has one, else `answer:<answer>`; `context` is a short copy
  of what the question showed (`describeQuestion`) plus the app version.
  Suggestions are made at `/suggest` (linked from Settings and Account).
- **Outbox:** both go through a small queue in localStorage
  (`src/lib/feedback.js`) with an id per entry, so a report resent after a
  dropped connection or after signing in is stored once.
- **Limits:** 30 reports and 20 suggestions a day per account; comments up to
  1000 characters.
- **Queue:** `/admin/reports` groups open reports by question. "Open in
  editor" opens the item in the word bank editor (`/admin?item=<id>` or
  `/admin?q=<text>`); "Add in editor" starts a suggested word
  (`/admin?new=word&en=..&fi=..`). Marking a report fixed shows "Fixed, thanks"
  to the learner on their Account page. Reports are never posted to GitHub:
  the repositories are public and reports can hold personal text.

## Progress sync

While a learner is signed in, their progress follows them to every device.
Signed out, nothing is sent and the app works as before.

- **Events, not snapshots.** Every change (an answer, the daily goal, buying or
  equipping an item) still updates the local state at once and is also kept in
  an outbox in localStorage (`lingo.sync.v1`, `src/lib/sync.js`). The app sends
  it to `POST /api/sync` a few seconds after a change, when it comes back
  online and when it is hidden.
- **One set of rules.** The account's progress is all its events applied in
  time order by `src/lib/syncEvents.js`, which uses the same `progress.js` and
  `cosmetics.js` as the app. The API image copies those three files
  (`server/Dockerfile`), so a change to them is also an API change. The server
  caches the result in `account_state`; an event older than the last one
  applied (a device that was offline) makes it apply everything again from the
  start. The reply is the account's progress, and the device's state becomes
  that plus anything it recorded meanwhile. Gems are worked out from the
  events, so an edited localStorage does not spread to other devices.
- **First sign-in on a device.** An empty account takes the device's progress
  (a `baseline` event, applied before all others). An empty device takes the
  account's. When both have progress the learner chooses: *keep both*
  (`merge`: points, days, words and statistics add up; streak and goal come
  from the more recent), *use my account's* or *use this device's* (starts
  the account over).
- **Signing out** keeps the progress on the device. Changes made while signed
  out wait in the outbox and are sent if the same account signs in again;
  another account gets the choice above.
- **Limits:** 500 events per request, 300 requests an hour per account, and
  event times at most 10 minutes ahead of the server's clock.
- Settings other than the daily goal (language, theme, voice, focus areas)
  are not synced yet.

## On-demand speech

Every text in the word base has a recorded clip (`src/lib/speech.js`). For
English without one (new content before its clips are made, or a sentence a
learner types on the *Hear any sentence* page, `/hear`), a signed-in learner's
app asks `POST /api/tts { text, voice }` for an MP3 in the same voice.

- **The service.** The API forwards to the Kokoro TTS service (`TTS_URL`, the
  `kokoro-tts` container on the same Docker network) with its API key
  (`TTS_API_KEY`), so the key never reaches browsers. Voices and speed come
  from `src/lib/speechClips.js`, which the API image copies like the progress
  rules. Live clips are made from the text in one go, without the trimming
  `scripts/speech-audio.py` does, so a single word can sound a little less
  clean than a recorded one.
- **Limits.** New clips a day: 10 for every signed-in learner
  (`TTS_DAILY_LIMIT`), 200 for learners an admin verifies under
  `/admin/users` (`TTS_VERIFIED_LIMIT`). Learners ask for more on `/hear`, which
  puts them at the top of that list. Clips already made, by anyone, are free.
  Text is at most 200 characters of Latin letters, digits and everyday
  punctuation. One clip at a time per learner, and at most 20 waiting for the
  service (`TTS_QUEUE_MAX`), which makes one at a time. A failed clip isn't
  counted. Past the limit, or with any error, the app uses the browser voice.
- **Cache.** Clips are kept in `TTS_CACHE_DIR`, by default a `tts-cache`
  folder next to the database (`/data/tts-cache` in the container, on the
  data volume, since the container's own files are read-only), by a hash of
  the voice, speed and text, and shared between learners. Least recently used ones go when it
  passes `TTS_CACHE_MB` (2 GB). Typed text is never logged or stored as text;
  `tts_usage` keeps only a count per learner and day.
- **When it is on.** The app turns it on at start on a device signed in to an
  account (`lingo.sync.v1` has a user), and after signing in; it asks
  `GET /api/tts/status`. Signed out, or with `TTS_URL` unset, nothing changes.

## Reminders

A signed-in learner can get one short reminder a day by web push, on days they
haven't played yet. Settings live under Account (`src/app/Reminders.jsx`).

- **Asked, not pushed.** Home offers reminders once, to a signed-in learner who
  has played on at least 3 days, on a device that can show them. "No thanks"
  is remembered on that device (`lingo.remindersOffer.v1`). The browser asks
  for permission only after a tap.
- **What the learner picks:** on or off, a time of day (18:00 by default), and
  which reminders: *daily goal waiting* and *streak could break*. A streak at
  risk is mentioned first. "New lessons added" from the plan is left for later.
- **Which devices.** The setting is per account; each device subscribes itself
  (Account shows "This device gets reminders" and a test button). A
  subscription belongs to the session that made it, so signing a device out,
  or the session expiring, stops its reminders. At most 10 devices.
- **The scheduler** runs in the API process every 5 minutes
  (`PUSH_INTERVAL_MS`, `server/src/push/reminders.js`). It works in the
  learner's time zone (sent with the settings, and updated when the app starts
  somewhere else) and on the learner's own day key, the same one answers are
  recorded under. At most one reminder a day; none if the learner already
  played that day, whatever they played, judged from their synced progress.
  A reminder missed by more than 3 hours (the server was down) is skipped.
  Turning reminders on after today's time starts them tomorrow.
- **Sending.** `web-push` signs with the VAPID keys and encrypts the text for
  the device, so the browser's push service (Google, Apple, Mozilla or
  Microsoft) can't read it. Subscriptions are only accepted for those
  services' addresses. A subscription the service says is gone is deleted.
  Logs never include a subscription's address.
- **The app's side.** `public/push-sw.js` is loaded into the generated service
  worker (`workbox.importScripts` in `vite.config.js`); it shows the
  notification and opens or focuses Lingo when it is tapped. `src/lib/push.js`
  subscribes and unsubscribes and, at start, sends the current subscription
  again in case the browser replaced it.
- **iPhone and iPad** allow push only for apps on the Home Screen (iOS 16.4
  and later); there, Account explains how to add it instead of the switch.
- **Off** without `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`: `GET /api/push`
  says `available: false` and the app hides everything about reminders. Make
  the keys once on the server (`npx web-push generate-vapid-keys`); the private
  key stays in the server's `.env`. Changing the keys invalidates every
  subscription, so devices have to turn reminders on again.

```
GET    /api/push                 → { available, publicKey, enabled, time, timeZone, kinds, devices, thisDevice }
PUT    /api/push/settings        { enabled?, time?, timeZone?, kinds?, lang? }
POST   /api/push/subscribe       { endpoint, keys: { p256dh, auth } }   (this device)
DELETE /api/push/subscribe                                              (this device)
POST   /api/push/test            → a test reminder to this device (5 an hour)
```

## Statistics

Numbers over everyone's answers from the `answer`
events that sync stores (`server/src/stats/aggregate.js`). Only learners with
an account are counted, since only they sync.

- **The job** runs in the API process shortly after start and then every 6
  hours (`STATS_INTERVAL_MS`). It reads the last 90 days of answers once and
  replaces `stats_daily` (per learner day: learners, answers and first-try
  answers per game, new accounts) and `stats_cache` (the lists below) in one
  transaction.
- **/admin/stats** (admin only) shows totals (accounts, learners who played
  this week, reminders on, open reports), learners per day for the last 35
  days, each game's answers, first-try share and median time, and the words
  most often missed and slowest.
- **One learner** (Arttu's decision, 2026-10-16: admins see individual
  statistics): `/admin/users` shows when each learner last played, and each
  email opens `/admin/users/:id` (`GET /api/admin/users/:id`) with that
  learner's level, streak, recent days, games, most missed words, devices
  and reminder setting, read from their synced progress. Read only. The
  privacy page says the maintainer can see this.
- **How learners go wrong** (Arttu, 2026-10-16): each answer carries
  `wrong`, what the learner picked, typed, built or was heard saying on each
  wrong try (at most 8, 120 characters each), and `skipped` when they skipped.
  `src/lib/mistakes.js` sorts each one into a kind: spelling ("oltmil" for
  "oatmeal"), letters or words in the wrong order, words missing, a different
  word, a wrong option, sound, pair or letter, misheard, skipped.
  `/admin/stats` shows the kinds per game and wrong answers that at least 3
  different learners gave; `/admin/users/:id` shows that learner's counts by
  kind and their latest 30 mistakes.
- **Difficulty data:** `GET /api/difficulty` (no sign-in, cached for an hour)
  gives each word's answer count, first-try share and median time. A word is
  in it, and in the admin lists, only after 5 answers from 3 different
  learners, so its numbers never describe one person. The app loads it at
  start and keeps it a day (`lingo.difficulty.v1`, `src/lib/difficulty.js`).
- **Quick play** uses it for words the learner hasn't met yet: one that fewer
  than half of learners get right first time is a challenge, and one that 85%
  get right can be an easy win while the learner knows few words of their
  own. A learner's own answers always win once they exist.

## Leaderboards

Opt-in weekly boards (`server/src/leaderboard/board.js`,
`routes/leaderboard.js`, `src/app/Leaderboard.jsx`).

- **Joining** (Settings > Account, or `/leaderboard`) gives a random nickname
  such as "Calm Otter 42". It can be re-rolled (20 times an hour) but never
  typed, so there is nothing to moderate. Only `leaderboard_members` (user,
  nickname, joined) is stored. Leaving deletes the row, and deleting the
  account removes it too; the account download includes it.
- **The week** runs Monday to Sunday in Finnish time. A learner's XP for the
  week is the sum of `days[day].xp` in their synced progress, read when the
  board is asked for, so there is no separate score to keep in step. The page
  sends the device's waiting answers first.
- **Groups:** members are sorted by their XP over the 4 weeks before this
  one and split into groups of about 30, so learners meet others at a
  similar level and the groups stay the same all week.
- **What a board shows:** the top 10 of the group, plus the 2 learners above
  and below you when you're further down. Learners with no XP yet this week
  aren't listed. Nicknames and XP only, never emails. `GET /api/leaderboard`,
  `POST /api/leaderboard/join`, `POST /api/leaderboard/nickname`,
  `DELETE /api/leaderboard/join`, all signed in.

## My path

A short weekly plan on Home (`src/lib/path.js`, `src/app/MyPath.jsx`). The
planner is a pure function over the learner's progress, so it works the same
offline and signed out; signed in, `GET`/`PUT /api/path` keeps the current
path (table `paths`, checked by `src/lib/pathFormat.js`) so every device
shows the same one.

- **Placement:** with fewer than 20 answers the path is a mixed Quick play
  round of 10 questions (any answers count), then Pick the meaning and Listen
  and choose. Once the learner has 20 answers and an overall level, the path
  is planned again from the results.
- **A placed path** has four steps of 10 answers each, in this order: the
  weakest skill, a skill not tried yet, the next weakest, and one going well.
  Each skill is practised with its game played least. Focus areas and
  difficulty from Preferences still apply inside the games.
- **Re-planning:** every Monday, after placement, or when the learner taps
  "Plan more steps" on a finished path. Progress is counted from each step's
  `base` (the game's answer count when planned), so it follows synced
  progress across devices.
- **Which path wins:** a later week, then the one planned later; on the same
  day the account's. A device reads the account's path before sending its
  own, so a new device doesn't replace it.

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

The release script never updates `/srv/lingo-api/docker-compose.yml` from
the repository, so when a PR changes `deploy/api/docker-compose.yml`, copy it
again (the `install -m 644` line above). Settings the API needs have working
defaults in the image, so an older copy keeps working.

Server-only compose settings (for example `extra_hosts` for the mail server)
go in `/srv/lingo-api/docker-compose.override.yml`, never in the repository;
the release script uses that file when it exists. Paths, image and container names are variables at the top of the
script; override them in a drop-in (`systemctl edit lingo-api-release.service`).

### Backups

`data/backups/` holds a copy from before each release. Include `/srv/lingo-api/data`
in the server's regular backups as well.
