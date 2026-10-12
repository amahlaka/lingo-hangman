import { fireEvent, screen, within } from '@testing-library/react';
import { renderApp } from '../test-utils';
import { encodeWords } from '../lib/words';

const words = [
  { learning: 'dog', native: 'koira' },
  { learning: 'cat', native: 'kissa' },
  { learning: 'bird', native: 'lintu' },
  { learning: 'fish', native: 'kala' },
  { learning: 'horse', native: 'hevonen' },
];
const byNative = Object.fromEntries(words.map((w) => [w.native, w.learning]));
const link = (path, pairs = words) => `${path}?words=${encodeWords(pairs)}&learningLang=en-GB&nativeLang=fi`;
const prompt = () => screen.getByTestId('prompt-word').textContent;

describe('Home', () => {
  it('shows a card for each practice game', () => {
    renderApp('/');
    ['Pick the meaning', 'Build the phrase', 'Listen and choose'].forEach((name) =>
      expect(screen.getByRole('link', { name: new RegExp(name) })).toBeInTheDocument()
    );
  });
});

describe('Pick the meaning', () => {
  it('celebrates a right answer, records progress and moves on', () => {
    const { storage } = renderApp(link('/meaning'));
    const answer = byNative[prompt()];
    fireEvent.click(screen.getByRole('button', { name: answer }));
    expect(screen.getByText(`Yes, "${answer}" is right.`)).toBeInTheDocument();
    expect(screen.getByText(/Right on the first try\. \+19 XP/)).toBeInTheDocument();
    expect(JSON.stringify(storage.data)).toContain(answer);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('2 of 5')).toBeInTheDocument();
  });

  it('lets the learner try again, then shows the answer gently', () => {
    renderApp(link('/meaning'));
    const answer = byNative[prompt()];
    const group = screen.getByRole('group');
    const wrong = within(group).getAllByRole('button').filter((b) => b.textContent !== answer);
    fireEvent.click(wrong[0]);
    expect(screen.getByText('Not quite. Try another one.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
    fireEvent.click(wrong[1]);
    expect(screen.getByText(`Not this time. The answer was "${answer}".`)).toBeInTheDocument();
    expect(screen.getByText(/\+2 XP/)).toBeInTheDocument();
  });

  it('shows the Finnish meaning under every option once answered', () => {
    renderApp(link('/meaning'));
    const answer = byNative[prompt()];
    const group = screen.getByRole('group');
    expect(within(group).queryByText('koira')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: answer }));
    within(group).getAllByRole('button').forEach((b) => {
      const en = b.querySelector('.pg-choice__text').textContent;
      const fi = words.find((w) => w.learning === en).native;
      expect(b).toHaveAccessibleName(`${en}, ${fi}`);
      expect(within(b).getByText(fi)).toHaveAttribute('lang', 'fi');
    });
  });

  it('reaches the end screen after the round', () => {
    renderApp(link('/meaning'));
    for (let i = 0; i < words.length; i++) {
      fireEvent.click(screen.getByRole('button', { name: byNative[prompt()] }));
      fireEvent.click(screen.getByRole('button', { name: i === words.length - 1 ? 'See results' : 'Next' }));
    }
    expect(screen.getByText('You practised 5 words.')).toBeInTheDocument();
    const recap = screen.getByRole('region', { name: 'Words from this round' });
    words.forEach((w) => {
      expect(recap).toHaveTextContent(w.learning);
      expect(recap).toHaveTextContent(w.native);
    });
    expect(screen.getByRole('button', { name: 'Play again' })).toBeInTheDocument();
  });

  it('shows the buttons in Finnish when the interface is Finnish', () => {
    renderApp(link('/meaning'), { lang: 'fi' });
    fireEvent.click(screen.getByRole('button', { name: byNative[prompt()] }));
    expect(screen.getByRole('button', { name: 'Seuraava' })).toBeInTheDocument();
  });
});

describe('Build the phrase', () => {
  const phrases = [{ learning: 'How are you?', native: 'Mitä kuuluu?' }];

  it('builds the phrase from tapped words', () => {
    renderApp(link('/phrase', phrases));
    const bank = screen.getByRole('group', { name: 'Words to use' });
    ['how', 'are', 'you'].forEach((w) => fireEvent.click(within(bank).getByRole('button', { name: w })));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(screen.getByText('Yes, "How are you?" is right.')).toBeInTheDocument();
    expect(screen.getByTestId('meaning-reveal')).toHaveTextContent('Mitä kuuluu?');
  });

  it('keeps the right start and gives the rest back', () => {
    renderApp(link('/phrase', phrases));
    const bank = () => screen.getByRole('group', { name: 'Words to use' });
    ['how', 'you', 'are'].forEach((w) => fireEvent.click(within(bank()).getByRole('button', { name: w })));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(screen.getByText('Not quite yet. The first word is in the right place.')).toBeInTheDocument();
    expect(within(bank()).getAllByRole('button')).toHaveLength(2);
  });
});

describe('Listen and choose', () => {
  afterEach(() => {
    delete window.speechSynthesis;
    delete window.SpeechSynthesisUtterance;
  });

  it('explains when the browser cannot speak', () => {
    renderApp(link('/listening'));
    expect(screen.getByText(/can't play sound/)).toBeInTheDocument();
  });

  it('speaks the word and accepts the one heard', () => {
    const spoken = [];
    window.SpeechSynthesisUtterance = function (text) { this.text = text; };
    window.speechSynthesis = { speak: (u) => spoken.push(u), cancel: () => {}, getVoices: () => [] };
    renderApp(link('/listening'));
    const heard = spoken[spoken.length - 1].text;
    expect(spoken[spoken.length - 1].lang).toBe('en-GB');
    fireEvent.click(screen.getByRole('button', { name: 'Listen slowly' }));
    expect(spoken[spoken.length - 1].rate).toBeLessThan(0.9);
    fireEvent.click(screen.getByRole('button', { name: heard }));
    expect(screen.getByText(`Yes, "${heard}" is right.`)).toBeInTheDocument();
    const fi = words.find((w) => w.learning === heard).native;
    expect(screen.getByRole('button', { name: `${heard}, ${fi}` })).toBeInTheDocument();
  });
});
