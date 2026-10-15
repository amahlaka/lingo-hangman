"""Makes the recorded speech clips listed by `speech-audio.mjs plan`.

    python scripts/speech-audio.py audio-build/todo.json --model DIR [--shard I/N]

Reads todo.json ({ items: [{ key, text, lang, folder, speaker }] }) and
writes <folder of todo.json>/<folder>/<key>.mp3 for each item in the Kokoro
voice `speaker`, with the open Kokoro
voice model (https://huggingface.co/hexgrad/Kokoro-82M, Apache-2.0) running
on the CPU through kokoro-onnx. DIR holds kokoro-v1.0.onnx and voices-v1.0.bin.
With --shard I/N only every Nth item from item I (counting from 0) is made, so
several machines can share the work. Needs ffmpeg. The text is only ever passed
to the model, never to a shell.
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time

import soundfile
from kokoro_onnx import Kokoro

# Phonemizer language for each learning language.
PHONEMES = {"en-GB": "en-gb"}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("todo")
    parser.add_argument("--model", required=True, help="folder with kokoro-v1.0.onnx and voices-v1.0.bin")
    parser.add_argument("--shard", default="0/1", help="I/N: make only this share of the items")
    args = parser.parse_args()
    shard, shards = (int(n) for n in args.shard.split("/"))

    with open(args.todo, encoding="utf-8") as f:
        todo = json.load(f)
    items = todo["items"][shard::shards]
    if not items:
        print("Nothing to make.")
        return
    base = os.path.dirname(os.path.abspath(args.todo))

    kokoro = Kokoro(os.path.join(args.model, "kokoro-v1.0.onnx"), os.path.join(args.model, "voices-v1.0.bin"))
    started = time.time()
    failed = 0
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, "clip.wav")
        for n, item in enumerate(items, 1):
            try:
                samples, rate = kokoro.create(item["text"], voice=item["speaker"], speed=1.0, lang=PHONEMES[item["lang"]])
                soundfile.write(wav, samples, rate)
                out = os.path.join(base, item["folder"])
                os.makedirs(out, exist_ok=True)
                target = os.path.join(out, item["key"] + ".mp3")
                # Mono 48 kbit/s MP3 plays everywhere and keeps a word under 10 kB.
                subprocess.run(
                    ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", wav,
                     "-ac", "1", "-codec:a", "libmp3lame", "-b:a", "48k", target + ".part.mp3"],
                    check=True,
                )
                os.replace(target + ".part.mp3", target)
            except Exception as error:  # one bad text must not stop the rest
                failed += 1
                print(f"Could not make {item['key']} ({item['text']!r}): {error}", file=sys.stderr)
            if n % 100 == 0:
                print(f"{n}/{len(items)} clips, {time.time() - started:.0f} s")
    print(f"Made {len(items) - failed} clips in {time.time() - started:.0f} s; {failed} failed.")


if __name__ == "__main__":
    main()
