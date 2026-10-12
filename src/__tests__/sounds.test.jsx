import { fireEvent, screen } from '@testing-library/react';
import { renderApp } from '../test-utils';
import { encodeWords } from '../lib/words';

// A fake Web Audio context that counts the notes played.
function installAudio() {
  const played = [];
  const param = () => ({ setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  window.AudioContext = function () {
    this.currentTime = 0;
    this.state = 'running';
    this.destination = {};
    this.createGain = () => ({ gain: param(), connect: (n) => n });
    this.createOscillator = () => ({
      frequency: param(),
      connect: (n) => n,
      start: () => played.push(1),
      stop() {},
    });
  };
  return played;
}

const words = [
  { learning: 'dog', native: 'koira' },
  { learning: 'cat', native: 'kissa' },
  { learning: 'bird', native: 'lintu' },
  { learning: 'fish', native: 'kala' },
];
const link = `/meaning?words=${encodeWords(words)}&learningLang=en-GB&nativeLang=fi`;
const answer = () => words.find((w) => w.native === screen.getByTestId('prompt-word').textContent).learning;

describe('Sound effects', () => {
  afterEach(() => {
    delete window.AudioContext;
    localStorage.removeItem('lingoSound');
  });

  it('plays a sound for a right answer', () => {
    const played = installAudio();
    renderApp(link);
    fireEvent.click(screen.getByRole('button', { name: answer() }));
    expect(played.length).toBeGreaterThan(0);
  });

  it('stays quiet when sound effects are turned off in settings', () => {
    const played = installAudio();
    renderApp(link);
    fireEvent.click(screen.getAllByRole('button', { name: 'Settings' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Off' }));
    expect(localStorage.getItem('lingoSound')).toBe('off');
    fireEvent.click(screen.getByRole('button', { name: answer() }));
    expect(played).toHaveLength(0);
  });
});
