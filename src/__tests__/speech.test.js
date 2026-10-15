import { getContent } from '../lib/content';
import { getSentences, getSoundLessons, filterCommonWords } from '../lib/words';
import { lessonWords } from '../games/sounds/soundsLogic';
import { clipKey, spokenTexts } from '../lib/speechClips';
import { RATE_SLOW, loadSpeechClips, resetSpeechClips, setSpeechVoice, speak, stopSpeaking } from '../lib/speech';

describe('spokenTexts', () => {
  const texts = new Set(spokenTexts(getContent().raw, 'en-GB').values());

  it('has a clip for everything the games say from the word base', () => {
    const said = [
      ...filterCommonWords({ learningLang: 'en-GB', nativeLang: 'fi' }).map((w) => w.learning),
      ...getSentences({ learningLang: 'en-GB', nativeLang: 'fi' }).map((s) => s.learning),
      ...getSoundLessons().flatMap((l) => lessonWords(l).map((w) => w.speak)),
    ];
    expect(said.length).toBeGreaterThan(100);
    expect(said.filter((t) => !texts.has(t.trim().replace(/\s+/g, ' ')))).toEqual([]);
  });

  it('keys ignore spacing but not the accent', () => {
    expect(clipKey(' knife  ', 'en-GB')).toBe(clipKey('knife', 'en-GB'));
    expect(clipKey('knife', 'en-GB')).not.toBe(clipKey('knife', 'en-US'));
    expect(clipKey('knife')).toMatch(/^[0-9a-z]+$/);
  });
});

describe('speak', () => {
  let spoken;
  let players;
  const knife = clipKey('knife', 'en-GB');

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

  const EMMA = 'kokoro-1.0-bf_emma';
  const GEORGE = 'kokoro-1.0-bm_george';
  const fetchImpl = (keys, male = keys) =>
    jest.fn(async () => ({ ok: true, json: async () => ({ voices: { [EMMA]: keys, [GEORGE]: male } }) }));
  const flush = () => new Promise((r) => setTimeout(r, 0));

  afterEach(() => {
    resetSpeechClips();
    delete window.speechSynthesis;
    delete window.SpeechSynthesisUtterance;
    delete window.Audio;
  });

  it('plays the recorded clip when there is one', async () => {
    install();
    const fetch = fetchImpl([knife]);
    expect(await loadSpeechClips({ fetchImpl: fetch })).toBe(true);
    expect(fetch).toHaveBeenCalledWith('/content/audio/index.json', { cache: 'no-cache' });
    expect(speak('knife')).toBe(true);
    await flush();
    expect(players[0].played).toEqual([`/content/audio/${EMMA}/${knife}.mp3`]);
    expect(players[0].playbackRate).toBe(1);
    expect(spoken).toEqual([]);

    speak('knife', { rate: RATE_SLOW });
    expect(players[0].playbackRate).toBeLessThan(1);
    expect(players[0].preservesPitch).toBe(true);
  });

  it('plays the male voice when it is picked', async () => {
    install();
    await loadSpeechClips({ fetchImpl: fetchImpl([knife], [knife]) });
    setSpeechVoice('male');
    speak('knife');
    expect(players[0].played).toEqual([`/content/audio/${GEORGE}/${knife}.mp3`]);
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
    speak('knife', { lang: 'en' });
    expect(spoken.map((u) => [u.text, u.lang])).toEqual([['fork', 'en-GB'], ['knife', 'en-US']]);
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

  it('keeps the browser voice when the clip list is missing', async () => {
    install();
    const fetch = jest.fn(async () => ({ ok: false, status: 404 }));
    expect(await loadSpeechClips({ fetchImpl: fetch })).toBe(false);
    speak('knife');
    expect(spoken.map((u) => u.text)).toEqual(['knife']);
  });
});
