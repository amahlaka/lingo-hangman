# Whistle speech-to-text

A small service that turns a short English clip into text for *Say it*, when a
verified learner picks Lingo's own recogniser (see docs/backend.md, "Server
speech-to-text"). It runs [Whistle](https://huggingface.co/Cactus-Compute/whistle)
by Cactus Compute: a 16.9 MB model, Apache-2.0, CPU only, through the
`cactus-needle` package.

- `server.py`: `POST /v1/audio/transcriptions` (multipart `file`, a 16 kHz
  16-bit mono WAV, and `language`, default `en`) answers `{ text, language, ms }`;
  `GET /healthz`. With `WHISTLE_TOKEN` set it wants `Authorization: Bearer`.
  One clip at a time. Clips and the text are never written or logged.
- `Dockerfile`: downloads the weights and the engine while building, so the
  container runs with no internet. Usage counts to Cactus are switched off.
- `compose.yml`: the server's container, `lingo-whistle` on the proxy network
  with no published port, 1 CPU and 384 MB.
- `.github/workflows/whistle.yml` builds it, starts it with no network and the
  same limits, and checks two clips in `test/` (made with Lingo's af_nova and
  am_liam voices) come back right.

On the server: copy this folder, put `WHISTLE_TOKEN=<random>` in a `.env`
beside `compose.yml`, run `PROXY_NETWORK=<the proxy network> docker compose up -d --build`,
then set the API's `STT_URL=http://lingo-whistle:8000` and `STT_TOKEN` to the
same token.
