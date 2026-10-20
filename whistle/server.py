"""Whistle speech-to-text for Lingo's "Say it" (the API's routes/transcribe.js).

A small HTTP service around Cactus Compute's Whistle model (16.9 MB, CPU
only, Apache-2.0). It answers the OpenAI-style request the API also sends to
Talkies, so either can sit behind STT_URL:

  POST /v1/audio/transcriptions   multipart/form-data: file (a 16 kHz, 16-bit
                                  mono WAV), language (default en); other
                                  fields (model, response_format) are ignored
                                  -> {"text": "...", "language": "en"}
  GET  /healthz                   -> {"ok": true}

With WHISTLE_TOKEN set, requests need "Authorization: Bearer <token>". Clips
are read in memory and dropped: never written to disk or logged, and neither
is what was heard. The model is loaded once at start and runs one clip at a
time (it is not thread-safe).
"""

import array
import hmac
import io
import json
import os
import sys
import threading
import time
import wave
from email.parser import BytesParser
from email.policy import HTTP
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SAMPLE_RATE = 16000
# 30 s of 16 kHz 16-bit mono plus room for the form around it.
MAX_BODY = 44 + 30 * SAMPLE_RATE * 2 + 16 * 1024
LANGUAGES = ("en", "de", "fr", "es", "it", "nl", "pl")
TOKEN = os.environ.get("WHISTLE_TOKEN", "")
WEIGHTS = os.environ.get("NEEDLE_WHISTLE_WEIGHTS", "/opt/whistle/whistle.cact")

_lock = threading.Lock()
_model = None


def load_model():
    global _model
    import needle

    _model = needle.Whistle(weights=WEIGHTS)


def wav_samples(data):
    """16 kHz mono 16-bit WAV bytes -> floats in [-1, 1], else ValueError."""
    with wave.open(io.BytesIO(data), "rb") as w:
        if w.getnchannels() != 1 or w.getsampwidth() != 2 or w.getframerate() != SAMPLE_RATE:
            raise ValueError("want 16 kHz, 16-bit mono")
        frames = w.readframes(w.getnframes())
    pcm = array.array("h")
    pcm.frombytes(frames[: len(frames) // 2 * 2])
    if sys.byteorder == "big":
        pcm.byteswap()
    if len(pcm) < SAMPLE_RATE // 10:
        raise ValueError("too short")
    return array.array("f", (v / 32768.0 for v in pcm))


def form_fields(content_type, body):
    """multipart/form-data -> {name: bytes}."""
    msg = BytesParser(policy=HTTP).parsebytes(
        b"Content-Type: " + content_type.encode("latin-1") + b"\r\n\r\n" + body
    )
    if not msg.is_multipart():
        raise ValueError("not multipart")
    fields = {}
    for part in msg.iter_parts():
        name = part.get_param("name", header="content-disposition")
        if name:
            fields[name] = part.get_payload(decode=True) or b""
    return fields


def transcribe(samples, language):
    with _lock:
        result = _model.transcribe(samples, language=language)
    return {"text": str(result.get("text", "")).strip(), "language": result.get("language") or language}


class Handler(BaseHTTPRequestHandler):
    server_version = "lingo-whistle"
    sys_version = ""

    def log_message(self, *args):
        # Request lines say nothing about the clip, but keep the log quiet anyway.
        pass

    def send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def authorised(self):
        if not TOKEN:
            return True
        given = self.headers.get("Authorization", "")
        return hmac.compare_digest(given.encode("utf-8"), f"Bearer {TOKEN}".encode("utf-8"))

    def do_GET(self):
        if self.path == "/healthz":
            return self.send_json(200, {"ok": _model is not None})
        self.send_json(404, {"error": "not_found"})

    def do_POST(self):
        if self.path.split("?")[0] != "/v1/audio/transcriptions":
            return self.send_json(404, {"error": "not_found"})
        if not self.authorised():
            return self.send_json(401, {"error": "unauthorised"})
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_BODY:
            return self.send_json(413 if length > MAX_BODY else 400, {"error": "bad_size"})
        body = self.rfile.read(length)
        try:
            fields = form_fields(self.headers.get("Content-Type", ""), body)
            samples = wav_samples(fields.get("file") or b"")
        except Exception:
            return self.send_json(400, {"error": "bad_audio"})
        language = (fields.get("language") or b"en").decode("ascii", "replace").strip().lower()
        if language not in LANGUAGES:
            language = "en"
        started = time.perf_counter()
        try:
            result = transcribe(samples, language)
        except Exception as err:
            print(f"transcription failed: {type(err).__name__}", file=sys.stderr, flush=True)
            return self.send_json(500, {"error": "failed"})
        result["ms"] = round((time.perf_counter() - started) * 1000)
        self.send_json(200, result)


def main():
    load_model()
    port = int(os.environ.get("PORT", "8000"))
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    server.daemon_threads = True
    print(f"whistle listening on {port}", file=sys.stderr, flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
