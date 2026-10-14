import { act, fireEvent, screen } from '@testing-library/react';
import { renderApp } from '../test-utils';
import { encodeWords } from '../lib/words';
import bundled from '../lib/bundledContent';
import { setContent } from '../lib/content';
import { validateItem } from '../lib/contentSchema';
import { setMicDebug } from '../lib/micDebug';

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
    this.start = () => {
      const next = script.shift();
      Promise.resolve().then(() => {
        if (next.error) this.onerror?.({ error: next.error });
        else this.onresult?.({ results: [next.said.map((transcript) => ({ transcript }))] });
        this.onend?.();
      });
    };
    this.stop = () => {};
    this.abort = () => {};
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
    expect(made[0].lang).toBe('en-GB');
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

  describe('mic debug mode', () => {
    afterEach(() => setMicDebug({ on: false, detection: 'auto', lang: 'auto' }));

    it('is off by default and turned on in practice settings', () => {
      renderApp(link);
      expect(screen.queryByRole('region', { name: 'Microphone debug' })).toBeNull();
      renderApp('/preferences');
      fireEvent.click(screen.getByRole('button', { name: /Microphone debug mode/ }));
      renderApp(link);
      expect(screen.getAllByRole('region', { name: 'Microphone debug' }).length).toBeGreaterThan(0);
    });

    it('listens in the chosen language and logs what the recogniser hears', async () => {
      const script = [];
      const made = fakeRecognition(script);
      window.SpeechRecognition.available = async () => 'available';
      setMicDebug({ on: true });
      renderApp(link);
      await act(async () => {});
      expect(screen.getByText('on device')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'fi-FI' }));
      fireEvent.click(screen.getByRole('button', { name: 'Online' }));
      await act(async () => {});
      script.push({ said: ['koira'] });
      await tapMic();
      expect(made[0].lang).toBe('fi-FI');
      expect(made[0].processLocally).toBeUndefined();
      const log = screen.getByTestId('mic-debug-log').textContent;
      expect(log).toContain('start lang=fi-FI onDevice=false');
      expect(log).toContain('result "koira"');
    });

    it('does not fall back to online when on-device is forced', async () => {
      const script = [{ error: 'language-not-supported' }];
      const made = fakeRecognition(script);
      setMicDebug({ on: true, detection: 'local' });
      renderApp(link);
      await act(async () => {});
      await tapMic();
      expect(made).toHaveLength(1);
      expect(made[0].processLocally).toBe(true);
      expect(screen.getByTestId('mic-debug-log').textContent).toContain('error error=language-not-supported');
    });

    it('can force the self check', () => {
      fakeRecognition([]);
      setMicDebug({ on: true, detection: 'self' });
      renderApp(link);
      expect(screen.getByRole('button', { name: 'I said it' })).toBeInTheDocument();
    });
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

    it('always shows the IPA and sells the Finnish reading for points', async () => {
      const script = [];
      fakeRecognition(script);
      renderApp('/say?learningLang=en-GB&nativeLang=fi');
      const first = reading[prompt()];
      expect(screen.getByTestId('prompt-ipa').textContent).toBe(first.ipa['en-GB']);
      expect(screen.queryByText(first.say.fi)).toBeNull();
      expect(screen.getByRole('button', { name: /Show how to say it/ })).toBeDisabled();

      script.push({ said: [first.text.en] });
      await tapMic();
      // Answering shows the reading, free.
      expect(screen.getByText(first.say.fi)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));

      const second = reading[prompt()];
      expect(screen.getByTestId('prompt-ipa').textContent).toBe(second.ipa['en-GB']);
      expect(screen.queryByText(second.say.fi)).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: /Show how to say it/ }));
      expect(screen.getByText(second.say.fi)).toBeInTheDocument();
      expect(screen.getByText('Read the Finnish way:')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Show how to say it/ })).toBeNull();
    });
  });
});
