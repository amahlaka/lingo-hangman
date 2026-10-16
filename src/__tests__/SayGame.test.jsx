import { act, fireEvent, screen } from '@testing-library/react';
import { memoryStorage, renderApp } from '../test-utils';
import { STORAGE_KEY, emptyProgress } from '../lib/progress';
import { encodeWords } from '../lib/words';
import bundled from '../lib/bundledContent';
import { setContent } from '../lib/content';
import { validateItem } from '../lib/contentSchema';
import { setPreferences } from '../lib/preferences';

const words = [
  { learning: 'dog', native: 'koira' },
  { learning: 'cat', native: 'kissa' },
  { learning: 'bird', native: 'lintu' },
  { learning: 'fish', native: 'kala' },
];
const link = `/say?words=${encodeWords(words)}&learningLang=en-GB&nativeLang=fi`;
const prompt = () => screen.getByTestId('prompt-word').textContent;

// A fake SpeechRecognition: each start() takes the next scripted outcome.
function fakeRecognition(script) {
  const made = [];
  function Fake() {
    made.push(this);
    this.start = (track) => {
      this.track = track;
      const next = script.shift();
      Promise.resolve().then(() => {
        if (next.error) this.onerror?.({ error: next.error });
        else this.onresult?.({ results: [next.said.map((transcript) => ({ transcript }))] });
        this.onend?.();
      });
    };
    this.stop = () => {};
    this.aborted = 0;
    this.abort = () => {
      this.aborted += 1;
    };
  }
  window.SpeechRecognition = Fake;
  return made;
}

async function tapMic() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Tap and/ }));
  });
}

describe('Say it', () => {
  afterEach(() => {
    delete window.SpeechRecognition;
    setPreferences({ recognition: 'auto' });
  });

  it('is listed on the home screen', () => {
    renderApp('/');
    expect(screen.getByRole('link', { name: /Say it/ })).toBeInTheDocument();
  });

  it('lets the learner check themselves when the browser cannot listen', () => {
    renderApp(link);
    expect(screen.getByText(/can't listen to speech/)).toBeInTheDocument();
    const said = prompt();
    fireEvent.click(screen.getByRole('button', { name: 'I said it' }));
    expect(screen.getByText(`Nicely said: "${said}".`)).toBeInTheDocument();
  });

  it('accepts the word when the recogniser hears it', async () => {
    const script = [];
    const made = fakeRecognition(script);
    const { storage } = renderApp(link);
    const target = prompt();
    script.push({ said: ['um', `the ${target}`] });
    await tapMic();
    expect(made[0].lang).toBe('en-US');
    // The microphone is let go once the browser has finished listening.
    expect(made[0].aborted).toBe(1);
    expect(screen.getByText(`Nicely said: "${target}".`)).toBeInTheDocument();
    expect(screen.getByText(/Clear on the first try\./)).toBeInTheDocument();
    expect(JSON.stringify(storage.data)).toContain(target);
    expect(screen.getByText(/online service/)).toBeInTheDocument();
  });

  it('is gentle about misses and silence, and moves on after three tries', async () => {
    const script = [];
    fakeRecognition(script);
    renderApp(link);
    const target = prompt();
    script.push({ error: 'no-speech' });
    await tapMic();
    expect(screen.getByText(/didn't catch that/)).toBeInTheDocument();
    expect(screen.queryByText(/tries left/)).not.toBeInTheDocument();

    script.push({ said: ['banana'] });
    await tapMic();
    expect(screen.getByText('Not quite. Listen once more and try again.')).toBeInTheDocument();
    expect(screen.getByText('2 tries left')).toBeInTheDocument();

    script.push({ said: ['banana'] }, { said: ['banana'] });
    await tapMic();
    await tapMic();
    expect(screen.getByText(`Let's leave "${target}" for now.`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
  });

  it('switches to checking yourself when the microphone is blocked', async () => {
    const script = [{ error: 'not-allowed' }];
    fakeRecognition(script);
    renderApp(link);
    await tapMic();
    expect(screen.getByText(/can't use the microphone/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'I said it' })).toBeInTheDocument();
  });

  it('asks the browser to listen on the device when it can', async () => {
    const script = [];
    const made = fakeRecognition(script);
    window.SpeechRecognition.available = async () => 'available';
    renderApp(link);
    await act(async () => {});
    expect(screen.getByText(/on this device/)).toBeInTheDocument();
    script.push({ said: [prompt()] });
    await tapMic();
    expect(made[0].processLocally).toBe(true);
  });

  it('falls back to online recognition when on-device recognition fails', async () => {
    const script = [{ error: 'language-not-supported' }];
    const made = fakeRecognition(script);
    window.SpeechRecognition.available = async () => 'available';
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    renderApp(link);
    await act(async () => {});
    const said = prompt();
    script.push({ said: [said] });
    await tapMic();
    await act(async () => {});
    expect(made).toHaveLength(2);
    expect(made[1].processLocally).toBeUndefined();
    expect(screen.getByText(`Nicely said: "${said}".`)).toBeInTheDocument();
    expect(screen.getByText(/online service/)).toBeInTheDocument();
    warn.mockRestore();
  });

  it('opens and stops the microphone itself where the browser can listen to it', async () => {
    const script = [];
    const made = fakeRecognition(script);
    window.SpeechRecognition.available = async () => 'unavailable';
    const track = { stop: jest.fn() };
    const stream = { getAudioTracks: () => [track], getTracks: () => [track] };
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: jest.fn(async () => stream) } });
    try {
      renderApp(link);
      await act(async () => {});
      script.push({ said: [prompt()] });
      await tapMic();
      await act(async () => {});
      expect(made[0].track).toBe(track);
      expect(track.stop).toHaveBeenCalled();
    } finally {
      delete navigator.mediaDevices;
    }
  });

  it('lets the browser open its own microphone when listening to the track hears nothing', async () => {
    const script = [{ error: 'audio-capture' }];
    const made = fakeRecognition(script);
    window.SpeechRecognition.available = async () => 'unavailable';
    const track = { stop: jest.fn() };
    const stream = { getAudioTracks: () => [track], getTracks: () => [track] };
    const getUserMedia = jest.fn(async () => stream);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      renderApp(link);
      await act(async () => {});
      const said = prompt();
      script.push({ said: [said] });
      await tapMic();
      await act(async () => {});
      expect(made).toHaveLength(2);
      expect(made[0].track).toBe(track);
      expect(made[1].track).toBeUndefined();
      expect(screen.getByText(`Nicely said: "${said}".`)).toBeInTheDocument();
      // And from then on.
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      script.push({ said: [prompt()] });
      await tapMic();
      expect(made[2].track).toBeUndefined();
      expect(getUserMedia).toHaveBeenCalledTimes(1);
    } finally {
      delete navigator.mediaDevices;
      warn.mockRestore();
    }
  });

  it('lets go of the microphone when the learner leaves the page', async () => {
    const made = [];
    window.SpeechRecognition = function Fake() {
      made.push(this);
      this.start = () => {};
      this.stop = () => {};
      this.aborted = 0;
      this.abort = () => {
        this.aborted += 1;
      };
    };
    renderApp(link);
    await tapMic();
    expect(screen.getByText(/Listening\./)).toBeInTheDocument();
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    try {
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
    } finally {
      delete document.visibilityState;
    }
    expect(made[0].aborted).toBe(1);
    expect(screen.queryByText(/Listening\./)).toBeNull();
  });

  it('listens online only when the learner chose online recognition', async () => {
    const script = [];
    const made = fakeRecognition(script);
    window.SpeechRecognition.available = async () => 'available';
    setPreferences({ recognition: 'online' });
    renderApp(link);
    await act(async () => {});
    expect(screen.getByText(/online service/)).toBeInTheDocument();
    script.push({ said: [prompt()] });
    await tapMic();
    expect(made[0].processLocally).toBeUndefined();
  });

  it('never falls back to online when the learner chose on-device recognition', async () => {
    const script = [{ error: 'language-not-supported' }];
    const made = fakeRecognition(script);
    window.SpeechRecognition.available = async () => 'available';
    window.SpeechRecognition.install = async () => true;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    setPreferences({ recognition: 'local' });
    renderApp(link);
    await act(async () => {});
    expect(screen.getByText(/on this device/)).toBeInTheDocument();
    await tapMic();
    await act(async () => {});
    expect(made).toHaveLength(1);
    expect(made[0].processLocally).toBe(true);
    expect(screen.getByText(/can't recognize speech on this device/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'I said it' })).toBeInTheDocument();
    warn.mockRestore();
  });

  it('checks yourself when on-device recognition was chosen but the browser has none', async () => {
    fakeRecognition([]);
    window.SpeechRecognition.available = async () => 'unavailable';
    setPreferences({ recognition: 'local' });
    renderApp(link);
    await act(async () => {});
    expect(screen.getByText(/can't recognize speech on this device/)).toBeInTheDocument();
  });

  describe('pronunciation', () => {
    const item = (id, en, fi, ipa, say) => ({ id, type: 'word', text: { en, fi }, pos: 'noun', ipa: { 'en-GB': ipa }, say: { fi: say } });
    const pack = {
      id: 'say-test',
      items: [
        item('say-water', 'water', 'vesi', '/ˈwɔːtə/', 'wooter'),
        item('say-house', 'house', 'talo', '/haʊs/', 'haus'),
        item('say-three', 'three', 'kolme', '/θriː/', 'thrii'),
        item('say-church', 'church', 'kirkko', '/tʃɜːtʃ/', 'tšöötš'),
      ],
    };
    const reading = Object.fromEntries(pack.items.map((i) => [i.text.en, i]));
    beforeEach(() => setContent({ index: { ...bundled.index, packs: ['say-test'] }, languages: bundled.languages, packs: [pack] }));
    afterEach(() => setContent(bundled));

    it('checks the reading like other text', () => {
      expect(validateItem(pack.items[0])).toEqual([]);
      expect(validateItem({ ...pack.items[0], say: { fi: '' } })[0]).toMatch(/say.fi is empty/);
    });

    it('shows the IPA and the Finnish reading for free', async () => {
      const script = [];
      fakeRecognition(script);
      renderApp('/say?learningLang=en-GB&nativeLang=fi');
      const first = reading[prompt()];
      expect(screen.getByTestId('prompt-ipa').textContent).toBe(first.ipa['en-GB']);
      expect(screen.getByText(first.say.fi)).toBeInTheDocument();
      expect(screen.getByText('Read the Finnish way:')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Show how to say it/ })).toBeNull();
    });

    it('keeps the reading one free tap away for words the learner says well', async () => {
      const script = [];
      fakeRecognition(script);
      const known = { solved: 2, lost: 0, days: ['2026-10-15'], recent: '22' };
      const words = Object.fromEntries(pack.items.map((i) => [`en:${i.text.en}`, known]));
      const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify({ ...emptyProgress(), words }) });
      renderApp('/say?learningLang=en-GB&nativeLang=fi', { storage });
      const first = reading[prompt()];
      expect(screen.getByTestId('prompt-ipa').textContent).toBe(first.ipa['en-GB']);
      expect(screen.queryByText(first.say.fi)).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Show how to say it' }));
      expect(screen.getByText(first.say.fi)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Show how to say it/ })).toBeNull();
      script.push({ said: [first.text.en] });
      await tapMic();
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));

      // Answering shows it too.
      const second = reading[prompt()];
      expect(screen.queryByText(second.say.fi)).toBeNull();
      script.push({ said: [second.text.en] });
      await tapMic();
      expect(screen.getByText(second.say.fi)).toBeInTheDocument();
    });
  });
});
