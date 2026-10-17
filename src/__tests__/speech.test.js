import { getContent } from '../lib/content';
import { getSentences, getSoundLessons, filterCommonWords, sentenceFor } from '../lib/words';
import { lessonWords } from '../games/sounds/soundsLogic';
import { clipKey, spokenTexts, wordByWordTexts, wordsKey } from '../lib/speechClips';
import { RATE_SLOW, loadSpeechClips, resetSpeechClips, setClipMaker, setOnDemandSpeech, setSpeechVoice, speak, speakOnDemand, speakSaved, speakWords, stopSpeaking } from '../lib/speech';

describe('spokenTexts', () => {
  const texts = new Set(spokenTexts(getContent().raw, 'en').values());

  it('has a clip for everything the games say from the word base', () => {
    const said = [
      ...filterCommonWords({ learningLang: 'en', nativeLang: 'fi' }).map((w) => w.learning),
      ...getSentences({ learningLang: 'en', nativeLang: 'fi' }).map((s) => s.learning),
      ...getSoundLessons().flatMap((l) => lessonWords(l).map((w) => w.speak)),
    ];
    expect(said.length).toBeGreaterThan(100);
    expect(said.filter((t) => !texts.has(t.trim().replace(/\s+/g, ' ')))).toEqual([]);
  });

  it('has a word-by-word clip for every text of more than one word', () => {
    const slow = wordByWordTexts(getContent().raw, 'en');
    const long = [...texts].filter((t) => t.includes(' '));
    expect(long.length).toBeGreaterThan(50);
    expect(long.filter((t) => !slow.has(wordsKey(t, 'en')))).toEqual([]);
    expect([...slow.values()].some((t) => !t.includes(' '))).toBe(false);
    expect(wordsKey('bus stop')).not.toBe(clipKey('bus stop'));
  });

  it('keys ignore spacing but not the accent', () => {
    expect(clipKey(' knife  ', 'en')).toBe(clipKey('knife', 'en'));
    expect(clipKey('knife', 'en')).not.toBe(clipKey('knife', 'en-GB'));
    expect(clipKey('knife')).toMatch(/^[0-9a-z]+$/);
  });
});

describe('sentenceFor', () => {
  it('gives a recorded sentence that uses the word', () => {
    const word = filterCommonWords({ learningLang: 'en', nativeLang: 'fi' })
      .map((w) => w.learning)
      .find((w) => !w.includes(' ') && sentenceFor(w));
    const sentence = sentenceFor(word);
    expect(sentence.toLowerCase()).toContain(word.toLowerCase());
    expect(spokenTexts(getContent().raw, 'en').has(clipKey(sentence))).toBe(true);
  });

  it('has nothing for phrases or unknown words', () => {
    expect(sentenceFor('bus stop')).toBeNull();
    expect(sentenceFor('zzzqx')).toBeNull();
    expect(sentenceFor('')).toBeNull();
  });
});

describe('speak', () => {
  let spoken;
  let players;
  const knife = clipKey('knife', 'en');

  function install({ play = () => Promise.resolve() } = {}) {
    spoken = [];
    players = [];
    window.SpeechSynthesisUtterance = function (text) { this.text = text; };
    window.speechSynthesis = { speak: (u) => spoken.push(u), cancel: () => {}, getVoices: () => [] };
    window.Audio = function () {
      this.paused = true;
      this.played = [];
      this.play = () => { this.paused = false; this.played.push(this.src); return play(); };
      this.pause = () => { this.paused = true; };
      players.push(this);
    };
  }

  const NOVA = 'kokoro-1.0-v5-af_nova';
  const LIAM = 'kokoro-1.0-v5-am_liam';
  const fetchImpl = (keys, male = keys) =>
    jest.fn(async () => ({ ok: true, json: async () => ({ voices: { [NOVA]: keys, [LIAM]: male } }) }));
  const flush = () => new Promise((r) => setTimeout(r, 0));

  afterEach(() => {
    resetSpeechClips();
    delete window.speechSynthesis;
    delete window.SpeechSynthesisUtterance;
    delete window.Audio;
  });

  describe('on demand', () => {
    beforeEach(() => {
      URL.createObjectURL = jest.fn((blob) => `blob:${blob.text}`);
      URL.revokeObjectURL = jest.fn();
    });

    it('asks for English without a clip once, in the picked voice, and plays it', async () => {
      install();
      await loadSpeechClips({ fetchImpl: fetchImpl([knife], [knife]) });
      const made = jest.fn(async (text, voice) => ({ blob: { text: `${voice}:${text}` }, left: 4 }));
      setOnDemandSpeech(made);
      speak('knife');
      expect(made).not.toHaveBeenCalled();
      setSpeechVoice('male');
      speak('  a new   sentence ');
      await flush();
      speak('a new sentence');
      await flush();
      expect(made.mock.calls).toEqual([['a new sentence', 'male']]);
      expect(players[0].played.slice(-2)).toEqual(['blob:male:a new sentence', 'blob:male:a new sentence']);
      speak('fork', { lang: 'en-GB' });
      expect(made).toHaveBeenCalledTimes(1);
      expect(spoken.map((u) => u.text)).toEqual(['fork']);
    });

    it('uses the browser voice when no clip comes back, and asks again next time', async () => {
      install();
      await loadSpeechClips({ fetchImpl: fetchImpl([]) });
      const made = jest.fn(async () => ({ blob: null, left: 0, error: 'tts_limit' }));
      setOnDemandSpeech(made);
      speak('over the limit');
      await flush();
      expect(spoken.map((u) => u.text)).toEqual(['over the limit']);
      expect(await speakOnDemand('over the limit')).toEqual({ played: false, left: 0, error: 'tts_limit' });
      expect(made).toHaveBeenCalledTimes(2);
    });

    it('does not play a clip that arrives after something else was said', async () => {
      install();
      await loadSpeechClips({ fetchImpl: fetchImpl([knife]) });
      let finish;
      setOnDemandSpeech(() => new Promise((r) => { finish = r; }));
      speak('a slow one');
      speak('knife');
      finish({ blob: { text: 'late' }, left: 3 });
      await flush();
      expect(players[0].played).toEqual([`/content/audio/${NOVA}/${knife}.mp3`]);
    });
  });

  describe('saved clips', () => {
    it('has a missing word-base clip made, then plays it like a recorded one', async () => {
      install();
      await loadSpeechClips({ fetchImpl: fetchImpl([knife]) });
      const fork = clipKey('fork', 'en');
      const maker = jest.fn(async () => ({ folder: NOVA, key: fork }));
      setClipMaker(maker);
      await speakSaved('knife');
      expect(maker).not.toHaveBeenCalled();
      await speakSaved(' fork ');
      await speakSaved('fork');
      expect(maker.mock.calls).toEqual([['fork', 'female']]);
      expect(players[0].played).toEqual([
        `/content/audio/${NOVA}/${knife}.mp3`,
        `/content/audio/${NOVA}/${fork}.mp3`,
        `/content/audio/${NOVA}/${fork}.mp3`,
      ]);
    });

    it('falls back to speak when no clip can be made', async () => {
      install();
      await loadSpeechClips({ fetchImpl: fetchImpl([]) });
      setClipMaker(async () => null);
      await speakSaved('spoon');
      expect(spoken.map((u) => u.text)).toEqual(['spoon']);
    });
  });

  it('plays the recorded clip when there is one', async () => {
    install();
    const fetch = fetchImpl([knife]);
    expect(await loadSpeechClips({ fetchImpl: fetch })).toBe(true);
    expect(fetch).toHaveBeenCalledWith('/content/audio/index.json', { cache: 'no-cache' });
    expect(speak('knife')).toBe(true);
    await flush();
    expect(players[0].played).toEqual([`/content/audio/${NOVA}/${knife}.mp3`]);
    expect(players[0].playbackRate).toBe(1);
    expect(spoken).toEqual([]);

    speak('knife', { rate: RATE_SLOW });
    expect(players[0].playbackRate).toBeLessThan(1);
    expect(players[0].preservesPitch).toBe(true);
  });

  it('plays a remade clip from its new file', async () => {
    install();
    const fetch = jest.fn(async () => ({ ok: true, json: async () => ({ voices: { [NOVA]: [knife] }, revisions: { [NOVA]: { [knife]: 2 } } }) }));
    await loadSpeechClips({ fetchImpl: fetch });
    speak('knife');
    expect(players[0].played).toEqual([`/content/audio/${NOVA}/${knife}-2.mp3`]);
  });

  it('plays the male voice when it is picked', async () => {
    install();
    await loadSpeechClips({ fetchImpl: fetchImpl([knife], [knife]) });
    setSpeechVoice('male');
    speak('knife');
    expect(players[0].played).toEqual([`/content/audio/${LIAM}/${knife}.mp3`]);
  });

  it('uses the browser voice when the picked voice has no clip yet', async () => {
    install();
    await loadSpeechClips({ fetchImpl: fetchImpl([knife], []) });
    setSpeechVoice('male');
    speak('knife');
    expect(spoken.map((u) => u.text)).toEqual(['knife']);
    expect(players).toEqual([]);
  });

  it('uses the browser voice for texts without a clip and for other accents', async () => {
    install();
    await loadSpeechClips({ fetchImpl: fetchImpl([knife]) });
    speak('fork');
    speak('knife', { lang: 'en-GB' });
    expect(spoken.map((u) => [u.text, u.lang])).toEqual([['fork', 'en-US'], ['knife', 'en-GB']]);
    expect(players).toEqual([]);
  });

  it('falls back to the browser voice once when the clip will not play', async () => {
    install({ play: () => Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' })) });
    await loadSpeechClips({ fetchImpl: fetchImpl([knife]) });
    speak('knife');
    players[0].onerror?.();
    await flush();
    expect(spoken.map((u) => u.text)).toEqual(['knife']);
  });

  it('does not fall back for a clip that was stopped', async () => {
    install({ play: () => Promise.reject(Object.assign(new Error('stopped'), { name: 'NotSupportedError' })) });
    await loadSpeechClips({ fetchImpl: fetchImpl([knife]) });
    speak('knife');
    stopSpeaking();
    await flush();
    expect(spoken).toEqual([]);
  });

  it('plays a moment of silence on the first tap so phones allow later clips', async () => {
    install();
    await loadSpeechClips({ fetchImpl: fetchImpl([knife]) });
    document.dispatchEvent(new Event('pointerdown'));
    document.dispatchEvent(new Event('pointerdown'));
    expect(players[0].played).toEqual(['/silence.mp3']);
  });

  it('plays the word-by-word clip of a sentence', async () => {
    install();
    const slow = wordsKey('I live here.', 'en');
    await loadSpeechClips({ fetchImpl: fetchImpl([slow]) });
    expect(speakWords('I live here.')).toBe(true);
    expect(players[0].played).toEqual([`/content/audio/${NOVA}/${slow}.mp3`]);
    expect(players[0].playbackRate).toBe(1);
  });

  it('says each word on its own with the browser voice when there is no word-by-word clip', async () => {
    install();
    await loadSpeechClips({ fetchImpl: fetchImpl([]) });
    speakWords('I live  here.');
    expect(spoken.map((u) => [u.text, u.rate])).toEqual([['I', RATE_SLOW], ['live', RATE_SLOW], ['here.', RATE_SLOW]]);
  });

  it('keeps the browser voice when the clip list is missing', async () => {
    install();
    const fetch = jest.fn(async () => ({ ok: false, status: 404 }));
    expect(await loadSpeechClips({ fetchImpl: fetch })).toBe(false);
    speak('knife');
    expect(spoken.map((u) => u.text)).toEqual(['knife']);
  });
});
