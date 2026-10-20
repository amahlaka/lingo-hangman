"""CI check, run inside the container: the token is needed and two clips come
back as the right words. Prints the timings."""

import json
import sys
import time
import urllib.error
import urllib.request
import uuid

HERE = sys.argv[1] if len(sys.argv) > 1 else "/test"
TOKEN = sys.argv[2] if len(sys.argv) > 2 else "ci-token"


def post(name, token=TOKEN):
    data = open(f"{HERE}/{name}", "rb").read()
    b = uuid.uuid4().hex
    body = (
        f'--{b}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhistle\r\n'
        f'--{b}\r\nContent-Disposition: form-data; name="file"; filename="clip.wav"\r\n'
        "Content-Type: audio/wav\r\n\r\n"
    ).encode() + data + f"\r\n--{b}--\r\n".encode()
    req = urllib.request.Request(
        "http://127.0.0.1:8000/v1/audio/transcriptions",
        body,
        {"Content-Type": f"multipart/form-data; boundary={b}", "Authorization": f"Bearer {token}"},
    )
    started = time.perf_counter()
    out = json.load(urllib.request.urlopen(req, timeout=30))
    return out, time.perf_counter() - started


try:
    post("water.wav", token="wrong")
    raise SystemExit("a wrong token was accepted")
except urllib.error.HTTPError as err:
    assert err.code == 401, err.code

for _ in range(4):
    for name, want in (("water.wav", "water"), ("where-is-the-bathroom.wav", "bathroom")):
        out, took = post(name)
        print(f"{name}: {out['text']!r} in {took:.2f} s (model {out['ms']} ms)")
        assert want in out["text"].lower(), out
