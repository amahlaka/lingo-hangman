import { act, fireEvent, screen, within } from '@testing-library/react';
import { renderApp } from '../test-utils';
import { encodeWords, getGapItems, getItem, getItems } from '../lib/words';
import { dayKey } from '../lib/progress';
import { REPLY_DELAY } from '../games/talk/TalkQuestion';
import { dailyCandidates, wordForDay } from '../games/daily/dailyLogic';

beforeEach(() => localStorage.clear());
afterEach(() => jest.useRealTimers());

const group = (name) => screen.getByRole('group', { name });

describe('Home', () => {
  it('shows a card for each new game', () => {
    renderApp('/');
    ['Your turn', 'Spot the mistake', 'Word rush', 'Daily word', 'Read and understand'].forEach((name) =>
      expect(screen.getByRole('link', { name: new RegExp(name) })).toBeInTheDocument()
    );
  });
});

describe('Your turn', () => {
  it('plays a conversation: the other side answers, a miss can be retried, and it ends with a summary', () => {
    jest.useFakeTimers();
    const { storage } = renderApp('/talk?set=at-the-cafe');
    expect(screen.getByText('You are Anna, talking with Server.')).toBeInTheDocument();
    expect(screen.getByText('Hi, what can I get you?')).toBeInTheDocument();
    fireEvent.click(within(group('Replies to choose from')).getByRole('button', { name: 'Could I have a latte, please?' }));
    expect(screen.queryByRole('group', { name: 'Replies to choose from' })).not.toBeInTheDocument();
    act(() => jest.advanceTimersByTime(REPLY_DELAY));
    expect(screen.getByText('Sure. Anything to eat?')).toBeInTheDocument();

    const replies = within(group('Replies to choose from')).getAllByRole('button');
    fireEvent.click(replies.find((b) => b.textContent !== 'Yes, a cheese sandwich, please.'));
    expect(screen.getByText(/^Not quite: that (comes later in this|belongs to a different) conversation\. Try another reply\.$/)).toBeInTheDocument();
    fireEvent.click(within(group('Replies to choose from')).getByRole('button', { name: 'Yes, a cheese sandwich, please.' }));
    act(() => jest.advanceTimersByTime(REPLY_DELAY));
    fireEvent.click(within(group('Replies to choose from')).getByRole('button', { name: 'For here, thanks.' }));
    act(() => jest.advanceTimersByTime(REPLY_DELAY));

    expect(screen.getByText("That's seven fifty.")).toBeInTheDocument();
    expect(screen.getByText('Conversation done.')).toBeInTheDocument();
    expect(screen.getByText(/2 of 3 replies right on the first try/)).toBeInTheDocument();
    expect(JSON.stringify(storage.data)).toContain('for here, thanks.');
  });

  it('replays a line without its Finnish, which has its own button', () => {
    renderApp('/talk?set=at-the-cafe');
    fireEvent.click(screen.getByRole('button', { name: /Hi, what can I get you\?/ }));
    expect(screen.queryByText('Hei, mitä saisi olla?')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'In Finnish' }));
    expect(screen.getByText('Hei, mitä saisi olla?')).toHaveAttribute('lang', 'fi');
    fireEvent.click(screen.getByRole('button', { name: 'Hide Finnish' }));
    expect(screen.queryByText('Hei, mitä saisi olla?')).not.toBeInTheDocument();
  });

});

describe('Spot the mistake', () => {
  const current = () => {
    const fi = document.querySelector('.gp-translation').textContent;
    const item = getGapItems().find((g) => g.topic && g.translation?.fi === fi);
    const before = item.sentence.split('___')[0].trim();
    const tiles = within(group('Words of the sentence')).getAllByRole('button');
    return { item, tiles, wrong: before ? before.split(/\s+/).length : 0 };
  };

  it('finds the wrong word, fixes it and explains why', () => {
    const { storage } = renderApp('/spot-the-mistake');
    const { item, tiles, wrong } = current();
    expect(screen.getByText('Tap the word that is wrong')).toBeInTheDocument();
    fireEvent.click(tiles[wrong]);
    expect(screen.getByText('Well spotted. What should it be?')).toBeInTheDocument();
    const answer = item.answers[0];
    fireEvent.click(
      within(group('Words to fix it with')).getAllByRole('button').find((b) => b.textContent.toLowerCase() === answer.toLowerCase())
    );
    expect(screen.getByText(/^Well spotted: "/)).toBeInTheDocument();
    expect(screen.getByText(/Right on the first try/)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Why' })).toBeInTheDocument();
    expect(JSON.stringify(storage.data)).toContain('spot-mistake');
    // Finding and fixing it without a miss is one first-try answer.
    const saved = JSON.parse(Object.values(storage.data).find((v) => v.includes('"spot-mistake"')));
    expect(saved.stats.games['spot-mistake']).toMatchObject({ n: 1, solved: 1, firstTry: 1 });
  });

  it('clears the wrong-word message once the mistake is found', () => {
    renderApp('/spot-the-mistake');
    const { tiles, wrong } = current();
    fireEvent.click(tiles.find((_, i) => i !== wrong));
    expect(screen.getByText('That word is fine. Look again.')).toBeInTheDocument();
    fireEvent.click(tiles[wrong]);
    expect(screen.queryByText('That word is fine. Look again.')).not.toBeInTheDocument();
    expect(screen.queryByText('Not quite. Try another one.')).not.toBeInTheDocument();
  });

  it('shows the fix after two misses', () => {
    renderApp('/spot-the-mistake');
    const { tiles, wrong } = current();
    const fine = tiles.filter((_, i) => i !== wrong);
    fireEvent.click(fine[0]);
    expect(screen.getByText('That word is fine. Look again.')).toBeInTheDocument();
    fireEvent.click(fine[1]);
    expect(screen.getByText(/Not this time. The right sentence is/)).toBeInTheDocument();
  });
});

describe('Word rush', () => {
  const words = [
    { learning: 'dog', native: 'koira' },
    { learning: 'cat', native: 'kissa' },
    { learning: 'bird', native: 'lintu' },
    { learning: 'fish', native: 'kala' },
    { learning: 'horse', native: 'hevonen' },
    { learning: 'cow', native: 'lehmä' },
  ];
  const byNative = Object.fromEntries(words.map((w) => [w.native, w.learning]));
  const link = `/word-rush?words=${encodeWords(words)}&learningLang=en&nativeLang=fi`;
  const prompt = () => screen.getByTestId('prompt-word').textContent;

  it('scores answers in a row higher and ends when every word is asked', () => {
    jest.useFakeTimers();
    const { storage } = renderApp(link);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    for (let i = 0; i < 3; i++) {
      fireEvent.click(within(group('Options')).getByRole('button', { name: new RegExp(`^\\d?${byNative[prompt()]}$`) }));
    }
    expect(screen.getByText('×2')).toBeInTheDocument();
    expect(screen.getByLabelText('Score 40')).toBeInTheDocument();
    // A miss resets the run and shows the answer for a moment.
    const answer = byNative[prompt()];
    fireEvent.click(within(group('Options')).getAllByRole('button').find((b) => !b.textContent.endsWith(answer)));
    expect(screen.queryByText('×2')).not.toBeInTheDocument();
    act(() => jest.advanceTimersByTime(1000));
    for (let i = 0; i < 2; i++) {
      fireEvent.click(within(group('Options')).getByRole('button', { name: new RegExp(`^\\d?${byNative[prompt()]}$`) }));
    }
    act(() => jest.advanceTimersByTime(200));
    expect(screen.getByText('New best score: 60')).toBeInTheDocument();
    expect(JSON.stringify(storage.data)).toContain('rush');
  });

  it('ends when the minute is up', () => {
    jest.useFakeTimers();
    renderApp(link);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    act(() => jest.advanceTimersByTime(61000));
    expect(screen.getByText('You scored 0 points.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play again' })).toBeInTheDocument();
  });
});

describe('Daily word', () => {
  const today = () => wordForDay(dailyCandidates(getItems({ type: 'word' })), dayKey());
  const typeWord = (w) => {
    for (const l of w) fireEvent.keyDown(window, { key: l });
    fireEvent.keyDown(window, { key: 'Enter' });
  };

  it('shows the Finnish clue, marks a guess and celebrates the right word', () => {
    const { storage } = renderApp('/daily');
    const word = today();
    expect(screen.getByText(word.fi)).toBeInTheDocument();
    const wrong = word.word === 'ZZZZZ' ? 'YYYYY' : 'ZZZZZ';
    typeWord(wrong);
    expect(screen.getByText(/5 tries left/)).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: /^Z not in the word/ })).toBeInTheDocument();
    typeWord(word.word);
    expect(screen.getByText(`You found it: ${word.word.toLowerCase()}`)).toBeInTheDocument();
    expect(screen.getByText('You found it in 2 tries.')).toBeInTheDocument();
    expect(JSON.stringify(storage.data)).toContain(word.word.toLowerCase());
  });

  it('asks for five letters and keeps the day\'s game after a reload', () => {
    const first = renderApp('/daily');
    typeWord('ABC');
    expect(screen.getByText('The word has 5 letters.')).toBeInTheDocument();
    for (let i = 0; i < 2; i++) fireEvent.keyDown(window, { key: 'Backspace' });
    typeWord('BCDEX');
    first.unmount();
    renderApp('/daily');
    expect(screen.getByRole('listitem', { name: /^A /, exact: false })).toBeInTheDocument();
    expect(screen.getByText(/5 tries left/)).toBeInTheDocument();
  });
});

describe('Read and understand', () => {
  it('reads a text, shows Finnish on tap and asks its questions', () => {
    const { storage } = renderApp('/read?set=at-the-cafe');
    const text = getItem('at-the-cafe');
    fireEvent.click(screen.getByRole('button', { name: /Could I have a latte, please\?/ }));
    expect(screen.queryByText('Saisinko latten, kiitos?')).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'In Finnish' })[1]);
    expect(screen.getByText('Saisinko latten, kiitos?')).toHaveAttribute('lang', 'fi');
    expect(screen.getByText('Question 1 of 3')).toBeInTheDocument();
    text.questions.forEach((q, i) => {
      if (i === 1) {
        fireEvent.click(within(group('Answers to choose from')).getByRole('button', { name: q.distractors[0] }));
        expect(screen.getByText('Not quite. Look at the text again.')).toBeInTheDocument();
      }
      fireEvent.click(within(group('Answers to choose from')).getByRole('button', { name: q.answers[0] }));
    });
    expect(screen.getByText('Text done.')).toBeInTheDocument();
    expect(screen.getByText(/2 of 3 right on the first try/)).toBeInTheDocument();
    expect(JSON.stringify(storage.data)).toContain('a latte');
  });
});
