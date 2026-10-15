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

The model adds stray sounds at the very start and end of what it says: a word
that starts with a vowel came out wrong ("eat" sounded like "late", "ask" like
"lask"), and George added a vowel after some words ("fish" like "fishy"). So
each text is said inside a short frame ("say <text> now") that is cut off
again where the model's own timings say the text starts and ends.
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time

import numpy as np
import onnx
import soundfile
from kokoro_onnx import Kokoro

# Speaking speed: 1 is the model's own pace, lower is slower and calmer.
SPEED = 0.9

# Phonemes said before and after every text, then cut off ("say", "now").
LEAD = "sˈeɪ "
TAIL = " nˈaʊ"
# Audio samples per step of the model's durations (24 kHz).
FRAME = 600
# The sound runs a little ahead of the durations, so the cuts are moved this
# many steps earlier. Picked with speech recognition over word-base texts:
# less clips the "s" of "soup" or leaves the "n" of "now".
START_EARLY = 3
END_EARLY = 2
# Fade the cuts over this many samples (10 ms), so they don't click.
FADE = 240
# Longer texts are split by kokoro-onnx itself and get no frame.
MAX_TOKENS = 500

# Phonemizer language for each learning language.
PHONEMES = {"en-GB": "en-gb"}


def timed_kokoro(model_dir, tmp):
    """Kokoro with the length of each phoneme as a second model output.

    The released model computes these (the rounded, clipped durations in its
    encoder) but only returns the audio, so the output is added here.
    """
    model = onnx.load(os.path.join(model_dir, "kokoro-v1.0.onnx"))
    model.graph.node.append(
        onnx.helper.make_node("Cast", ["/encoder/Clip_output_0"], ["duration"], to=onnx.TensorProto.INT64)
    )
    model.graph.output.append(onnx.helper.make_tensor_value_info("duration", onnx.TensorProto.INT64, None))
    path = os.path.join(tmp, "kokoro-timed.onnx")
    onnx.save(model, path)
    kokoro = Kokoro(path, os.path.join(model_dir, "voices-v1.0.bin"))
    if not kokoro.has_timings:
        raise RuntimeError("the model did not report durations")
    return kokoro


def say(kokoro, text, speaker, lang):
    """The text as 24 kHz samples, without the frame around it."""
    phonemes = " ".join(kokoro.tokenizer.phonemize(text, lang).split())
    tokens = kokoro.tokenizer.tokenize(phonemes)
    lead = kokoro.tokenizer.tokenize(LEAD)
    tail = kokoro.tokenizer.tokenize(TAIL)
    every = lead + tokens + tail
    if not tokens or len(every) > MAX_TOKENS:
        samples, _ = kokoro.create(text, voice=speaker, speed=SPEED, lang=lang)
        return samples
    voice = kokoro.get_voice_style(speaker)
    samples, duration = kokoro._infer(every, kokoro._style_for(voice, len(every)), SPEED)
    # duration[0] is the padding before the first phoneme.
    edges = np.cumsum(duration)
    start = max(0, int(edges[len(lead)]) - START_EARLY) * FRAME
    end = (int(edges[len(lead) + len(tokens)]) - END_EARLY) * FRAME
    samples = np.array(samples[start:end], dtype=np.float32)
    fade = min(FADE, len(samples) // 2)
    samples[:fade] *= np.linspace(0, 1, fade, dtype=np.float32)
    samples[len(samples) - fade:] *= np.linspace(1, 0, fade, dtype=np.float32)
    return samples


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

    started = time.time()
    failed = 0
    with tempfile.TemporaryDirectory() as tmp:
        kokoro = timed_kokoro(args.model, tmp)
        wav = os.path.join(tmp, "clip.wav")
        for n, item in enumerate(items, 1):
            try:
                samples = say(kokoro, item["text"], item["speaker"], PHONEMES[item["lang"]])
                soundfile.write(wav, samples, 24000)
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
