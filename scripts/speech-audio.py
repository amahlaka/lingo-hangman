"""Makes the recorded speech clips listed by `speech-audio.mjs plan`.

    python scripts/speech-audio.py audio-build/todo.json --model DIR [--shard I/N]

Reads todo.json ({ items: [{ key, text, lang, folder, speaker, ipa?, words?, file? }] }) and
writes <folder of todo.json>/<folder>/<file or key>.mp3 for each item in the Kokoro
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

An item with `ipa` (the word base's US IPA) is read from that instead of
the phonemizer's guess, which matters for words like "live". An item with
`words` is the slow version of a sentence: each word said on its own, stressed,
with a pause after it, using the sounds the phonemizer gave it in the sentence.
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
SPEED = 0.8

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
# The pause after each word of a word-by-word clip, in seconds.
WORD_GAP = 0.5
# Longer texts are split by kokoro-onnx itself and get no frame.
MAX_TOKENS = 500

# Phonemizer language for each word-base language with clips.
PHONEMES = {"en": "en-us", "en-GB": "en-gb"}

# The word base writes IPA the way dictionaries do; the model learned espeak's
# spelling of it, which differs a little between US and British English.
IPA_TO_MODEL = {
    "en": [("t̬", "ɾ"), ("ɝː", "ɜː"), ("ɝ", "ɜː"), ("r", "ɹ"), ("g", "ɡ")],
    "en-GB": [("æ", "a"), ("r", "ɹ"), ("g", "ɡ")],
}
VOWELS = set("aeiouæɑɒɔəɛɜɪʊʌɐɚ")
# The model learned j and ch as one sound each (ʤ, ʧ). Spelled as two, as
# dictionaries and espeak do, it says d or t and then the sound: "jacket"
# had a double j and speech recognition heard "cheese" as "trees".
AFFRICATES = [("dʒ", "ʤ"), ("tʃ", "ʧ")]


def model_sounds(phonemes):
    """Phonemes with j and ch as the single sounds the model knows."""
    for old, new in AFFRICATES:
        phonemes = phonemes.replace(old, new)
    return phonemes


def ipa_phonemes(ipa, lang="en"):
    """The word base's IPA for one word ("/ˈwɑːt̬ɚ/") as the model's phonemes ("wˈɑːɾɚ")."""
    text = ipa.strip().strip("/").strip()
    for old, new in IPA_TO_MODEL[lang]:
        text = text.replace(old, new)
    # Syllable dots and brackets around optional sounds go; the sounds stay.
    text = "".join(c for c in text if c not in ".()")
    out = []
    for i, c in enumerate(text):
        before, after = text[i - 1:i] if i else "", text[i + 1:i + 2]
        if c == "e" and after not in ("ɪ", "ə"):
            c = "ɛ"  # bed: bˈɛd, but day: dˈeɪ and hair: hˈeə
        elif c == "ɪ" and after == "ə" and before not in VOWELS:
            c = "i"  # here: hˈiə, but fire: fˈaɪə
        out.append(c)
    # A final n or l after a consonant is its own syllable, which espeak
    # writes with a schwa: station stˈeɪʃən, apple ˈapəl.
    for i in range(len(out) - 1, 0, -1):
        if out[i] in "nl" and (i + 1 == len(out) or out[i + 1] == " ") and out[i - 1] not in VOWELS | set("ːlnɹjwŋ"):
            out.insert(i, "ə")
    text = "".join(out)
    # Dictionaries mark stress before the syllable, the model before its
    # vowel, and the model expects one even on a one-syllable word.
    if "ˈ" not in text:
        text = "ˈ" + text
    out, mark = [], ""
    for c in text:
        if c in "ˈˌ":
            mark = c
        elif mark and c in VOWELS:
            out += [mark, c]
            mark = ""
        else:
            out.append(c)
    return "".join(out)


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


def say_parts(kokoro, parts, speaker):
    """Each phoneme string in `parts` as 24 kHz samples, without the frame.

    The parts are said in one go, with a full stop between them, and cut
    apart again at the model's timings.
    """
    lead = kokoro.tokenizer.tokenize(LEAD)
    tail = kokoro.tokenizer.tokenize(TAIL)
    stop = kokoro.tokenizer.tokenize(". ")
    every, spans = list(lead), []
    for i, part in enumerate(parts):
        if i:
            every += stop
        tokens = kokoro.tokenizer.tokenize(part)
        spans.append((len(every), len(every) + len(tokens)))
        every += tokens
    every += tail
    voice = kokoro.get_voice_style(speaker)
    samples, duration = kokoro._infer(every, kokoro._style_for(voice, len(every)), SPEED)
    # duration[0] is the padding before the first phoneme.
    edges = np.cumsum(duration)
    out = []
    for first, last in spans:
        start = max(0, int(edges[first]) - START_EARLY) * FRAME
        end = (int(edges[last]) - END_EARLY) * FRAME
        part = np.array(samples[start:end], dtype=np.float32)
        fade = min(FADE, len(part) // 2)
        part[:fade] *= np.linspace(0, 1, fade, dtype=np.float32)
        part[len(part) - fade:] *= np.linspace(1, 0, fade, dtype=np.float32)
        out.append(part)
    return out


def fits(kokoro, parts):
    tokens = sum(len(kokoro.tokenizer.tokenize(p)) + 2 for p in parts)
    return all(kokoro.tokenizer.tokenize(p) for p in parts) and tokens + 10 <= MAX_TOKENS


def say(kokoro, text, speaker, lang, ipa=None):
    """The text as 24 kHz samples. `lang` is the word base's language code."""
    phonemes = ipa_phonemes(ipa, lang) if ipa else kokoro.tokenizer.phonemize(text, PHONEMES[lang])
    phonemes = model_sounds(" ".join(phonemes.split()))
    if not fits(kokoro, [phonemes]):
        samples, _ = kokoro.create(phonemes, voice=speaker, speed=SPEED, is_phonemes=True)
        return samples
    return say_parts(kokoro, [phonemes], speaker)[0]


def stressed(phonemes):
    """A word's phonemes with main stress, as when it is said on its own."""
    if "ˈ" in phonemes:
        return phonemes
    if "ˌ" in phonemes:
        return phonemes.replace("ˌ", "ˈ", 1)
    for i, c in enumerate(phonemes):
        if c in VOWELS:
            return phonemes[:i] + "ˈ" + phonemes[i:]
    return phonemes


def say_words(kokoro, text, speaker, lang):
    """The text one word at a time, with a pause after each word."""
    # Phonemized as a whole, so each word keeps the reading the sentence gives
    # it ("I live here": lˈɪv), then every word is stressed, as when read from
    # a list: unstressed, "the" and "a" were so short that cut out they
    # sounded like "th".
    words = [w.strip(".,!?;:\"“”…—") for w in model_sounds(kokoro.tokenizer.phonemize(text, PHONEMES[lang])).split()]
    words = [stressed(w) for w in words if w]
    if not words or not fits(kokoro, words):
        return say(kokoro, text, speaker, lang)
    gap = np.zeros(int(WORD_GAP * 24000), dtype=np.float32)
    out = []
    for part in say_parts(kokoro, words, speaker):
        out += [part, gap]
    return np.concatenate(out[:-1])


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
                lang = item["lang"]
                if item.get("words"):
                    samples = say_words(kokoro, item["text"], item["speaker"], lang)
                else:
                    samples = say(kokoro, item["text"], item["speaker"], lang, item.get("ipa"))
                soundfile.write(wav, samples, 24000)
                out = os.path.join(base, item["folder"])
                os.makedirs(out, exist_ok=True)
                target = os.path.join(out, item.get("file", item["key"]) + ".mp3")
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
