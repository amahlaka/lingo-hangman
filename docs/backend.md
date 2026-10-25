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
  from the last day. When it is older, the admin page's "Sign in again" button
  opens `/account?next=<page>&again=1`, which asks for a passkey or code even
  though the device is signed in, then goes back to the page. Signing in again
  to the same account renews the current session's sign-in time instead of
  starting a second session.

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
  Suggestions are made at `/suggest` (linked from Settings and Account), in
  Finnish, English or both: a learner may not know the English word. The API
  returns `given` (`fi`, `en` or `both`) so the queue and the admin MCP can
  flag Finnish-only ones as needing the English found.
- **Outbox:** both go through a small queue in localStorage
  (`src/lib/feedback.js`) with an id per entry, so a report resent after a
  dropped connection or after signing in is stored once.
- **Limits:** 30 reports and 20 suggestions a day per account; comments up to
  1000 characters.
- **Queue:** `/admin/reports` groups open reports by question. "Open in
  editor" opens the item in the word bank editor (`/admin?item=<id>` or
  `/admin?q=<text>`); "Add in editor" starts a suggested word
  (`/admin?new=word&en=..&fi=..`); a Finnish-only suggestion is marked "Find
  the English". Marking a report fixed shows "Fixed, thanks"
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
- **Settings and game records** follow the learner too, as `setting` and
  `record` events folded into the progress state's `settings` and `records`
  (`src/lib/accountSettings.js`, also copied into the API image). Settings
  (language, theme, sound, voice, focus areas, difficulty, word-type colours
  and help, My path collapsed, Grammar check / Sounds of English topics):
  the latest change wins. Records: the best score wins (Word rush, Say it
  right, Read aloud), the Daily word record of the latest day played wins
  (with that day's board, so another device shows it finished), and Say it
  right's sound history: the latest wins. The app keeps them where it always
  did in localStorage; `src/lib/localSettings.js` maps them, sends changes
  (`localChanged(key)` from each place that saves one) and stores the
  account's after every sync. On sign-in, settings the account doesn't have
  yet and records better than the account's go up from the device; the
  account's settings win otherwise. Device-only: the reminder and account
  offers, play tracking, cached difficulty numbers and the feedback outbox.

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
- **Playing it.** The app plays a made clip from a `blob:` URL, so the CSP in
  `deploy/preview/nginx.conf` allows `media-src 'self' blob:`. Without it the
  browser refuses the clip and the app falls back to the browser voice.
- **When it is on.** The app turns it on at start on a device signed in to an
  account (`lingo.sync.v1` has a user), and after signing in; it asks
  `GET /api/tts/status`. Signed out, or with `TTS_URL` unset, nothing changes.
- **One queue.** Every request to the service (on-demand speech, word-base
  clips and an admin's "Make it again" in `/admin/clips`) goes through one
  queue in `server/src/lib/ttsService.js`, one at a time. It keeps the last 50
  requests in memory and counts per day and kind in `tts_jobs_daily`
  (migration 015). A learner's own text is never kept as text there either.
- **Speech server page.** `/admin/tts` (`GET /api/admin/tts`) shows whether
  the service answers (`/health` and `/voices`, checked at most every 15 s),
  the queue now and the clips waiting to be made again, the last requests with
  how long they took and waited, and the last two weeks per day, with the
  `tts_usage` learner counts. It reloads every 3 seconds while open.

## Pronunciation scoring

*Say it right* (`src/games/say-right/`) records a learner saying a word bank
word, or reading a sentence or two aloud (Read aloud), and asks `POST /api/pronounce` (body: the clip as `audio/wav`) for the
IPA sounds in it. The app scores them against the word's IPA itself
(`src/lib/phonemes.js`).

- **The service.** The API forwards the clip to Talkies
  (psyb0t/docker-talkies, `TALKIES_URL`, on the same Docker network) with its
  bearer token (`TALKIES_TOKEN`), as `POST /v1/audio/transcriptions` with the
  phoneme model `zipa-ipa` (`TALKIES_MODEL`). It answers `{ phones, left }`.
  Without `TALKIES_URL` the game says scoring isn't available.
- **Who.** Verified learners and admins only (`role` verified or admin). Others
  get `403 not_verified`; `POST /api/pronounce/request` puts a learner on the
  `/admin/users` list, the same list as asking for more speech, where
  *Verify* lets them in. `GET /api/pronounce/status` says
  `{ available, allowed, limit, left, requested }`.
- **Limits.** Clips are 16 kHz, 16-bit mono WAV of 0.25-15 seconds (about
  480 kB at most); a word takes the recogniser two or three seconds, two
  sentences a few more. `PRONOUNCE_DAILY_LIMIT` (150) uses a learner a day,
  where a clip is one use for every 5 seconds of it (a word 1, a reading
  usually 2 or 3), and 12 clips a minute, one at
  a time per learner, and at most `PRONOUNCE_QUEUE_MAX` (6) waiting: Talkies
  scores one at a time. A Talkies answer of 429 or 409 (busy, or another
  model running) is `503 pronounce_queue_full`; nothing is counted for a
  failed clip. The daily counts live in memory and start again when the
  container restarts.
- **Privacy.** Clips are passed on and dropped: never written to disk, logged
  or kept. Only the count per learner and day is kept, in memory. The scores
  and sound counts the app works out are synced like any other answer (see
  "Statistics").

### Saved word-base clips

Every game says word-base texts with their recorded clips. When a word-base
text has no clip yet (new content the Content publish workflow hasn't voiced),
the first listen asks `POST /api/tts/clip { text, voice, words? }`, signed in
or not, and the API makes it with the TTS service and saves it where the
workflow puts clips: `CLIP_DIR/<voice folder>/<key>.mp3`, with the key added to
`CLIP_DIR/index.json`. It answers `{ folder, key, made }` and the app plays
`/content/audio/<folder>/<key>.mp3` like any recorded clip; everyone after
gets that file. The workflow never replaces an existing clip, so a saved one
stays. `words: true` asks for the slow word-by-word clip (`speakWords`).

- The API makes it with the clip maker (lib/clipMaker.js) as the workflow
  does: edges cut, a single word read from its word-base IPA, pauses between
  the words of a word-by-word clip.
- The app waits up to `SAVE_WAIT_MS` (6 s) for it; slower, it says the text
  another way that time and plays the saved clip next time. A clip the API
  won't make is not asked for again that visit.
- 120 new clips an hour per address; saved ones are free. It shares the
  service queue with on-demand speech.
- Off unless `TTS_URL`, `CONTENT_DIR` and `CLIP_DIR` are all set. On the
  server, bind-mount the live content folder read-only as `CONTENT_DIR` and its
  `audio` folder writable as `CLIP_DIR` (a `docker-compose.override.yml`), with
  the audio folder writable by the container's user (uid 1000).

### Remaking a bad clip

A clip that sounds wrong (a report with *Bad audio*) can be made again without
remaking every clip: *Remake the clip* on the report in `/admin/reports`, the
admin AI tool `remake_clip { text, voice? }`, or
`POST /api/admin/clips/remake { text, folder? }`. The clip of the text, and its
word-by-word clip, in that one voice (*Make it again* on the Recordings page
sends the voice being edited) or else both voices, leave
`CLIP_DIR/index.json` (the app reads the text another way meanwhile), and their
keys go on `CLIP_DIR/remake.json` with a revision number. `/api/tts/clip`
won't save those keys either. The next Content publish run (a word base change,
or *Run workflow* with force) sees them missing and makes only them, as
`<key>-<revision>.mp3`, because clip files are cached for a year and a remade
one needs a new name. `index.json`'s `"revisions"` tells the app which file to
play. Needs the same `CONTENT_DIR` and `CLIP_DIR` as saved clips.

With the TTS service set (`TTS_URL`), a remake doesn't wait for the workflow:
the API asks the Kokoro service (github.com/amahlaka/kokoro-tts) for the new
clips straight away, in the background (`server/src/lib/clipMaker.js`), with
`frame: true` (the service cuts off the stray sounds at the edges, as the
workflow does), `dict_ipa` for a single word the word base gives IPA for, and
`words: true` for the word-by-word clip. It saves them as
`<key>-<revision>.mp3` in each voice asked for and puts each back on its
voice's live list as soon as it is made;
the Recordings page shows "Being made on the TTS server" meanwhile. A clip the
service couldn't make stays off the list for the next Content publish. The
service needs a version with those options; an older one says the text
plainly (logged as "didn't cut the edges").

### Editing clips (Recordings)

`/admin/clips` lists every clip the word base needs, in both voices
(`GET /api/admin/clips`): live, being made again, or not made yet. Clips that
an open report's question said (its answer, the question's English, a sound
lesson's word: `src/lib/reportSpeech.js`) come first and are marked; a report
doesn't say which voice it heard, so it marks the text in both. Opening a clip
loads its MP3, draws the waveform, and lets an admin trim it, fade its ends,
add silence before or after it and change its volume in the browser. Saving encodes the result there (lamejs,
loaded only then; mono, 24 kHz, 48 kbit/s like the workflow's clips) and sends
it to `POST /api/admin/clips/edit { folder, key, audio, changes }`. The API
writes it as that voice's `<key>-<revision>.mp3`, points `index.json`'s
`"revisions"` at it, and takes the number from `remake.json` too, so a later
remake never reuses it. Nothing is deleted: every version stays in the folder
and `POST /api/admin/clips/use { folder, key, revision }` puts one back
(0 is the first, `<key>.mp3`). `CLIP_DIR/edits.json` keeps what each edit did.
The Content publish workflow keeps live revisions as they are. A clip encoded
in the browser has no gapless header, so it starts with about 50 ms of extra
silence; *Trim silence* removes it on a later edit.

## Server speech-to-text

Verified learners can have *Say it* listen with Lingo's own recogniser instead
of the browser's: Practice settings shows "Use Lingo's own recogniser" to them
(`src/lib/serverSpeech.js`, a choice kept on that device only). Say it then
records the clip itself (`src/lib/micRecorder.js`) and sends it to
`POST /api/transcribe` (body: `audio/wav`), which answers `{ text, left }`; the
game checks the words as it does the browser's. It also works in browsers
with no speech recognition (Firefox).

- **The service.** The API forwards the clip to `STT_URL` as an OpenAI-style
  `POST /v1/audio/transcriptions` (`model` = `STT_MODEL`, default `whistle`,
  `language` = `en`) with `STT_TOKEN` as its bearer token. Normally that is
  the Whistle service in `whistle/` (Cactus Compute's 16.9 MB Whistle model,
  CPU only, about 50 MB of memory, a word in 0.1 s and a short sentence in
  0.3-0.4 s on one CPU in CI), a container of its own so it never takes
  Talkies away from Say it right. Talkies answers the same request, so
  `STT_URL=http://talkies:8000` with `STT_MODEL=canary-180m-flash` works too,
  but Talkies keeps one model loaded and would swap with `zipa-ipa`.
  Without `STT_URL` the setting stays hidden.
- **Who.** Verified learners and admins only, like Say it right
  (`403 not_verified`). `GET /api/transcribe/status` says
  `{ available, allowed, limit, left }`.
- **Limits.** 16 kHz, 16-bit mono WAV of 0.25-10 seconds (Say it stops at 8).
  `STT_DAILY_LIMIT` (400) clips a learner a day, 20 a minute, one at a time
  per learner, at most `STT_QUEUE_MAX` (8) waiting. When the service fails or
  a limit is reached, Say it uses the browser's recogniser for the rest of the
  round (or the "I said it" self check where there is none); nothing is
  counted for a failed clip.
- **Privacy.** Clips and the words heard are passed on and dropped: never
  written to disk, logged or kept, by the API or by the Whistle service. Only
  the count per learner and day is kept, in memory.

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
- **Pronunciation** (Arttu, 2026-10-18): a Say it right answer also carries
  `score` (the best try, 0-100), `mode` (`words` or `read`), `phones` (each
  IPA sound of every try: times seen, missed, nearly said) and, in Read aloud,
  `wpm` (`src/lib/pronunciationStats.js`, shared with the API). `/admin/stats`
  shows scores by mode, the sounds missed most and the words and readings
  with the lowest scores, each only when 3 learners had them;
  `/admin/users/:id` shows the same for one learner with their latest 20
  scores. The admin MCP has it as `get_statistics` section `pronunciation`
  and in `get_learner`; a learner's own MCP has `get_my_pronunciation`.
- **Difficulty data:** `GET /api/difficulty` (no sign-in, cached for an hour)
  gives each word's answer count, first-try share and median time. A word is
  in it, and in the admin lists, only after 5 answers from 3 different
  learners, so its numbers never describe one person. The app loads it at
  start and keeps it a day (`lingo.difficulty.v1`, `src/lib/difficulty.js`).
- **Quick play** uses it for words the learner hasn't met yet: one that fewer
  than half of learners get right first time is a challenge, and one that 85%
  get right can be an easy win while the learner knows few words of their
  own. A learner's own answers always win once they exist.

## Play statistics

Arttu's request, 2026-10-17: how long people play, what they play, when they
give up, and visits and games for everyone. Rules in `src/lib/playSession.js`
(shared with the API), the app's side in `src/lib/playTracker.js`, the
numbers in `server/src/stats/play.js`, shown on `/admin/stats`.

- **Counts, for everyone** (`POST /api/play/count`, no sign-in): `{ visit:
  true }` once per browser tab (`sessionStorage` `lingo.visit.v1`) and `{ game
  }` at each round's first answer. The API adds 1 to `play_counts` for the
  current UTC hour: `visits`, or `games_anon` / `games_account` keyed by game,
  whether signed in read from the session cookie. Nothing about the device or
  person is stored; the client address is only used by the in-memory rate
  limit. The admin page shows visits per hour for 48 hours, visits by hour of
  the day, games played per day without an account, and the most popular games
  (all in Finnish time).
- **Not counted** (Arttu's Burp scan, 2026-10-19, made the numbers
  misleading): a browser run by a program (`navigator.webdriver`, so a
  scanner's crawler or a test robot) doesn't send counts; the API answers but
  doesn't count a User-Agent that looks like a scanner, bot, HTTP library or
  headless browser (`isAutomated` in `routes/play.js`), a game id that isn't
  in `src/lib/gameList.js`, or visits past 60 an hour from one address.
- **Hours left out** (`play_left_out`): an admin can leave out a range of
  hours on `/admin/stats` (`POST /api/admin/play/left-out` `{ from, to, note
  }`, `.../remove` `{ id }`). Those hours' counts are kept but not in the
  numbers, and the 48-hour chart marks them. Migration 014 leaves out the scan,
  2026-10-19 12:00–13:59 UTC.
- **Play sessions, signed in only** (`POST /api/play/sessions`): a session runs
  from the first game opened, across any games after it, until 30 minutes pass
  without play (`SESSION_GAP_MS`) or the page closes (`pagehide`). It is sent
  with its start, end (the last play), the learner's day and `{ gameId: {
  rounds, finished } }`. A round is one go at a game, from its first answer to
  its end screen (games call `useRoundFinished`); every game page is wrapped
  in `TrackedGame` (`src/app/PlayTracking.jsx`).
- **Giving up, signed in only**: leaving a round before its end screen sends a
  `give_ups` row with a reason guessed from how it was going: `before_first`
  (no answer, after 5 s or more), `stuck` (a minute without answering),
  `many_wrong` (2 of the last 3 wrong), `after_wrong`, `after_skip`, or
  `mid_round` (doing fine), and whether the learner went elsewhere in the app
  (`left`) or closed it (`closed`).
- The open session and round are kept in `lingo.play.v1`, so if the app is
  killed without `pagehide` they are sent at the next start. Without an
  account nothing but the counts leaves the device. Sessions and give-ups are
  in the learner's data export and go with the account.
- Housekeeping removes play data older than 90 days (`prunePlay`).

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

## AI tools (MCP)

Arttu (2026-10-17): admins can let an AI assistant review the statistics,
reports and suggestions, mark reports fixed, and plan new content from them.
The API serves a [Model Context Protocol](https://modelcontextprotocol.io)
endpoint for that at `/api/mcp`; the app itself never calls it.

- **Tokens:** `/admin/ai` (admin only, linked from Account) explains how to
  add the claude.ai connector and makes a token
  for 30, 90 or 365 days, shows it once with the Claude Code command, lists
  tokens with when they were last used, and revokes them. Only a hash is kept
  (`api_tokens`). The client sends `Authorization: Bearer <token>`. A token
  works only while its account is still an admin; expired tokens are deleted
  by housekeeping.
- **claude.ai (OAuth):** Settings → Connectors → Add custom connector with
  the URL `https://lingo.bololoo.com/api/mcp` and no advanced settings. Claude
  finds the sign-in from the endpoint's 401 (`WWW-Authenticate`
  `resource_metadata`), registers itself (`POST /api/oauth/register`, dynamic
  client registration) and opens `/api/oauth/authorize`: a small page of the
  API's own that asks a signed-in admin (sign-in from the last day) to Allow
  or Deny. Signed out, it links to `/account?next=oauth`, which after
  sign-in opens `/api/oauth/continue`: that returns to the page the server
  remembered under a short-lived cookie (the app never handles its address). Then `POST /api/oauth/token` swaps the code (PKCE S256 required)
  for an access token (1 hour) and a refresh token (90 days, replaced on each
  use). An approval is one `api_tokens` row named after the client, shown on
  `/admin/ai` as a connector; Disconnect ends both tokens. Redirects go only
  to claude.ai's callback, loopback addresses (local tools), and any in
  `OAUTH_REDIRECT_URIS`. Registration is open on purpose (claude.ai's
  connectors register without an account, and the discovery files are public
  with `Access-Control-Allow-Origin: *` as RFC 8414 expects); a registration
  alone grants nothing. The approval page marks the client's name as the
  app's own claim, says where access goes (claude.ai, a program on this
  computer with its port, or a configured host), and admin scope is checked
  again when the code and every refresh token are used. Control and
  text-direction characters are stripped from names, and registering stops
  while 500 registrations wait for approval (unapproved ones go after a day).
  Logic in `server/src/mcp/oauth.js`, routes and page
  in `server/src/routes/oauth.js`.
- **Discovery files:** clients read the authorization server's metadata from
  the site root (`/.well-known/oauth-authorization-server`, also
  `openid-configuration` and `oauth-protected-resource`), which the reverse
  proxy sends to the static nginx, not the API. `deploy/preview/nginx.conf`
  returns fixed copies of `/api/oauth/metadata` and
  `/api/oauth/protected-resource` for lingo.bololoo.com; a server test fails
  if they drift. `PUBLIC_URL` (default: the first of `ORIGINS`) is the
  address the API puts in them.
- **Tokens by hand:** Claude Code:
  `claude mcp add --transport http lingo-admin https://lingo.bololoo.com/api/mcp --header "Authorization: Bearer <token>"`.
  Clients that only run local servers (Claude Desktop's config file) can go
  through `mcp-remote`:
  `{"command": "npx", "args": ["mcp-remote", "https://lingo.bololoo.com/api/mcp", "--header", "Authorization:${LINGO_TOKEN}"], "env": {"LINGO_TOKEN": "Bearer <token>"}}`.
  Never commit a token: the repositories are public.
- **Protocol:** Streamable HTTP without sessions or an event stream: each
  POST is one JSON-RPC message answered with JSON (`server/src/mcp/protocol.js`),
  versions 2025-03-26 to 2025-11-25. GET answers 405. Browsers' requests
  must come from an origin in `ORIGINS`. It and `/api/oauth/` are exempt
  from the app's `X-Lingo` header check: they use tokens or plain forms, and
  the approval form checks its Origin and request id itself.
- **Admin tools** (`server/src/mcp/adminTools.js`): `get_overview`,
  `get_statistics` (days, games, words, mistakes or play), `list_reports`,
  `set_report_status`, `list_suggestions`, `set_suggestion_status`,
  `list_learners` and `get_learner`. They give the same numbers as the admin
  pages (`server/src/adminData.js`), but learners appear by account id only:
  no emails or devices. Status changes are logged with the token id. Prompts
  `triage_reports` and `plan_content` walk the assistant through reviewing
  reports and planning lessons.
- **Content stays reviewed:** the tools never write word base content. The
  instructions and prompts send new and fixed items to
  [lingo-wordbase](https://github.com/amahlaka/lingo-wordbase) as a pull
  request following its AUTHORING.md, and say to mark a report fixed only
  after the fix is merged ("fixed" shows "Fixed, thanks" to the learner).
- **Learners' own assistant** (Arttu, 2026-10-18: "an mcp that players can
  use for their own stats, learning analysis"): `/api/mcp/me`, for any
  account. Account → AI assistant shows the address for a claude.ai custom
  connector (the OAuth page then asks the learner, in their app language, and
  needs no admin), makes tokens (scope `learner`, at most 10, `/api/me/tokens`)
  with the Claude Code command, and lists and revokes both. Each endpoint
  takes only tokens of its own scope, and its 401 points to its own
  protected-resource metadata (`/api/oauth/protected-resource/me`, also at
  `/.well-known/oauth-protected-resource/api/mcp/me`). The scope of an OAuth
  approval comes from its `scope` or `resource` parameter (neither: admin),
  and is kept on the code (migration 013). Tools
  (`server/src/mcp/learnerTools.js`): `get_my_overview`, `get_my_words`,
  `get_my_mistakes`, `get_my_pronunciation` (Say it right scores and weakest
  sounds), `analyze_my_learning` (the Profile page's insights and My
  path, `src/lib/insights.js` and `path.js`, with games named and linked from
  `src/lib/gameList.js`, a copy of the registry that a test keeps equal) and
  `get_my_leaderboard`, plus prompts `review_my_progress`, `practice_plan` and
  `explain_my_mistakes`. All read only, and none takes an account id: they
  read the token's own account. No email, devices or other learners (tricky
  words show only the published all-learner difficulty).
- **Later: personalised content.** A learner tool that saves a personal
  practice set would go in `learnerTools.js`; the privacy page already says a
  learner's own assistant reads their progress under that assistant's terms.

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
