import { act, fireEvent, screen } from '@testing-library/react';
import { renderApp } from '../test-utils';
import { encodeWords } from '../lib/words';

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
});
