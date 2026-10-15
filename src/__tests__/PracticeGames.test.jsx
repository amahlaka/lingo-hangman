import { fireEvent, screen, within } from '@testing-library/react';
import { renderApp } from '../test-utils';
import { encodeWords } from '../lib/words';
import { resetPreferences, setPreferences } from '../lib/preferences';

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
    expect(screen.getByText('You practiced 5 words.')).toBeInTheDocument();
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

  const bank = () => screen.getByRole('group', { name: 'Words to use' });
  const built = () => screen.getByRole('generic', { name: 'Your phrase' });

  it('keeps the right start and gives the rest back', () => {
    renderApp(link('/phrase', phrases));
    ['how', 'you', 'are'].forEach((w) => fireEvent.click(within(bank()).getByRole('button', { name: w })));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(screen.getByText('Not quite yet. One word is in the right place, so it stays there.')).toBeInTheDocument();
    expect(within(bank()).getAllByRole('button')).toHaveLength(2);
  });

  it('keeps right words anywhere in the sentence and fills the open places around them', () => {
    renderApp(link('/phrase', phrases));
    ['are', 'how', 'you'].forEach((w) => fireEvent.click(within(bank()).getByRole('button', { name: w })));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(screen.getByText('Not quite yet. One word is in the right place, so it stays there.')).toBeInTheDocument();
    const kept = within(built()).getByRole('button', { name: 'you' });
    expect(kept).toBeDisabled();
    expect(screen.getAllByTestId('open-place')).toHaveLength(2);
    ['how', 'are'].forEach((w) => fireEvent.click(within(bank()).getByRole('button', { name: w })));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(screen.getByText('Yes, "How are you?" is right.')).toBeInTheDocument();
  });

  it('sometimes gives a beginner a word already in place', () => {
    setPreferences({ difficulty: 'easy' });
    const random = jest.spyOn(Math, 'random').mockReturnValue(0);
    try {
      renderApp(link('/phrase', phrases));
      const given = within(built()).getAllByRole('button');
      expect(given).toHaveLength(1);
      expect(given[0]).toBeDisabled();
      expect(within(bank()).getAllByRole('button')).toHaveLength(2);
    } finally {
      random.mockRestore();
      resetPreferences();
    }
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

describe('Word Pairs', () => {
  const tiles = (side) => screen.getAllByTestId(`${side}-tile`);
  const nativeTileFor = (learning) =>
    tiles('native').find((b) => b.textContent.includes(words.find((w) => w.learning === learning).native));

  it('matches a pair, shows the meaning under the English word and records it', () => {
    const { storage } = renderApp(link('/word-pairs'));
    const first = tiles('learning')[0];
    const en = first.textContent;
    fireEvent.click(first);
    expect(first).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(nativeTileFor(en));
    const fi = words.find((w) => w.learning === en).native;
    expect(first).toHaveAccessibleName(`${en}, ${fi}`);
    expect(within(first).getByText(fi)).toHaveAttribute('lang', 'fi');
    expect(first).toBeDisabled();
    expect(JSON.stringify(storage.data)).toContain(en);
  });

  it('says gently when two words are not a pair', () => {
    renderApp(link('/word-pairs'));
    const first = tiles('learning')[0];
    const wrong = tiles('native').find((b) => b !== nativeTileFor(first.textContent));
    fireEvent.click(first);
    fireEvent.click(wrong);
    expect(screen.getByText('Not a pair. Try another one.')).toBeInTheDocument();
    expect(first).toHaveAttribute('aria-pressed', 'false');
  });

  it('finishes the board and reaches the end screen', () => {
    renderApp(link('/word-pairs'));
    tiles('learning').forEach((tile) => {
      const en = tile.textContent;
      fireEvent.click(tile);
      fireEvent.click(nativeTileFor(en));
    });
    expect(screen.getByText('All pairs found.')).toBeInTheDocument();
    expect(screen.getByText(/Every pair on the first try\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'See results' }));
    expect(screen.getByText('You practiced 5 words.')).toBeInTheDocument();
  });
});

describe('Fill the Gap', () => {
  const sentences = [
    { learning: 'Where is the toilet?', native: 'Missä on WC?' },
    { learning: 'How are you?', native: 'Mitä kuuluu?' },
  ];
  const sentenceFor = (fi) => sentences.find((s) => s.native === fi);
  // The word that belongs in the gap, read from what's around it.
  const gapWord = () => {
    const s = sentenceFor(prompt());
    const shown = screen.getByTestId('gap-sentence').textContent.replace(/ /g, '').replace(/\s+/g, ' ').trim();
    const words = s.learning.replace(/[?.!]$/, '').split(' ');
    return words.find((w, i) => {
      const without = [...words.slice(0, i), ...words.slice(i + 1)].join(' ');
      return shown.replace(/[?.!]$/, '').replace(/\s+/g, ' ').trim() === without;
    });
  };

  it('fills the gap with the right word and shows the Finnish under the sentence', () => {
    renderApp(link('/fill-the-gap', sentences));
    const fi = prompt();
    fireEvent.click(screen.getByRole('button', { name: gapWord() }));
    expect(screen.getByText(`Yes, "${sentenceFor(fi).learning}" is right.`)).toBeInTheDocument();
    expect(screen.getByTestId('gap-sentence')).toHaveTextContent(sentenceFor(fi).learning);
    expect(screen.getByTestId('meaning-reveal')).toHaveTextContent(fi);
  });

  it('lets the learner try again, then shows the word', () => {
    renderApp(link('/fill-the-gap', sentences));
    const fi = prompt();
    const answer = gapWord();
    const wrong = within(screen.getByRole('group')).getAllByRole('button').filter((b) => b.textContent !== answer);
    fireEvent.click(wrong[0]);
    expect(screen.getByText('Not quite. Try another one.')).toBeInTheDocument();
    fireEvent.click(wrong[1]);
    expect(screen.getByText(`Not this time. The answer was "${sentenceFor(fi).learning}".`)).toBeInTheDocument();
    expect(screen.getByTestId('gap-sentence')).toHaveTextContent(sentenceFor(fi).learning);
  });
});
