import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { renderApp } from '../test-utils';
import { encodeWords } from '../lib/words';
import { RESUME_MAX_AGE_MS, clearRound, latestRound, loadRound, pack, saveRound, unpack } from '../lib/resume';
import { buildSayRightRound } from '../games/say-right/sayRightLogic';
import { practicePool } from '../games/practice/practiceLogic';

const KEY = 'lingo.resume.v1';
const saved = () => JSON.parse(localStorage.getItem(KEY) || '{}');

const words = [
  { learning: 'dog', native: 'koira' },
  { learning: 'cat', native: 'kissa' },
  { learning: 'bird', native: 'lintu' },
  { learning: 'fish', native: 'kala' },
  { learning: 'horse', native: 'hevonen' },
];
const byNative = Object.fromEntries(words.map((w) => [w.native, w.learning]));
const link = (path) => `${path}?words=${encodeWords(words)}&learningLang=en-GB&nativeLang=fi`;
const prompt = () => screen.getByTestId('prompt-word').textContent;

describe('saving a round', () => {
  it('keeps shared objects shared and plain values as they were', () => {
    const target = { learning: 'dog', native: 'koira' };
    const question = { target, options: [{ learning: 'cat' }, target], odd: { $ref: 3 }, list: [1, null, 'x'] };
    const back = unpack(JSON.parse(JSON.stringify(pack({ questions: [question], results: [{ question }] }))));
    expect(back.questions[0].options[1]).toBe(back.questions[0].target);
    expect(back.results[0].question).toBe(back.questions[0]);
    expect(back.questions[0].odd).toEqual({ $ref: 3 });
    expect(back.questions[0].list).toEqual([1, null, 'x']);
  });

  it('refuses what is not plain data', () => {
    expect(() => pack({ f: () => 1 })).toThrow();
    expect(() => pack({ when: new Date() })).toThrow();
    expect(saveRound('/x', { gameId: 'meaning', n: 1, total: 2 }, { f: () => 1 })).toBe(false);
    expect(loadRound('/x')).toBeNull();
  });

  it('offers only fresh rounds, the newest on Home', () => {
    const now = 1_000_000_000_000;
    saveRound('/meaning', { gameId: 'meaning', n: 2, total: 5 }, { a: 1 }, now - 1000);
    saveRound('/word-pairs', { gameId: 'word-pairs', n: 1, total: 2 }, { a: 2 }, now);
    expect(loadRound('/meaning', now)).toMatchObject({ gameId: 'meaning', n: 2, total: 5, data: { a: 1 } });
    expect(latestRound(now)).toMatchObject({ address: '/word-pairs', gameId: 'word-pairs' });
    expect(loadRound('/meaning', now + RESUME_MAX_AGE_MS)).toBeNull();
    clearRound('/word-pairs');
    expect(latestRound(now)).toMatchObject({ address: '/meaning' });
  });

  it('can save every game\'s questions', () => {
    // The games below are played through in the tests that follow; Say it
    // right needs a verified player, so its round is checked here.
    const { pairs } = practicePool(new URLSearchParams());
    expect(() => pack(buildSayRightRound(pairs, 5))).not.toThrow();
  });
});

describe('every question game saves its round', () => {
  const games = [
    '/meaning', '/phrase', '/say', '/type-it', '/grammar', '/mixed-up', '/sounds?set=mix&practise=1',
    '/word-pairs', '/fill-the-gap', '/talk', '/spot-the-mistake', '/read', '/quick', '/hangman',
  ];
  it.each(games)('%s', (address) => {
    renderApp(address);
    const skip = screen.getAllByRole('button', { name: /^Skip this/ })[0];
    fireEvent.click(skip);
    expect(saved()[address]).toBeDefined();
    expect(saved()[address].n).toBe(2);
  });
});

describe('continuing a question game', () => {
  it('offers the round again after leaving, and continues at the next question', () => {
    const { storage } = renderApp(link('/meaning'));
    const answer = byNative[prompt()];
    fireEvent.click(screen.getByRole('button', { name: answer }));
    cleanup();

    renderApp(link('/meaning'), { storage });
    expect(screen.getByRole('heading', { name: 'Continue your game?' })).toBeInTheDocument();
    expect(screen.getByText('You were on 2 of 5, with 19 points.')).toBeInTheDocument();
    expect(screen.getByText('Jatketaanko peliä?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('2 of 5')).toBeInTheDocument();
    expect(byNative[prompt()]).not.toBe(answer);
  });

  it('starts a new round when the learner prefers, and forgets the old one', () => {
    const { storage } = renderApp(link('/meaning'));
    fireEvent.click(screen.getByRole('button', { name: 'Skip this one' }));
    cleanup();

    renderApp(link('/meaning'), { storage });
    fireEvent.click(screen.getByRole('button', { name: 'Start a new round' }));
    expect(screen.getByText('1 of 5')).toBeInTheDocument();
    expect(saved()[link('/meaning')]).toBeUndefined();
  });

  it('forgets a finished round', () => {
    renderApp(link('/meaning'));
    for (let i = 0; i < 5; i += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Skip this one' }));
      fireEvent.click(screen.getByRole('button', { name: i === 4 ? 'See results' : 'Next' }));
    }
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('says it in Finnish in the Finnish interface', () => {
    const { storage } = renderApp(link('/meaning'), { lang: 'fi' });
    fireEvent.click(screen.getAllByRole('button')[screen.getAllByRole('button').findIndex((b) => b.textContent === byNative[prompt()])]);
    cleanup();
    renderApp(link('/meaning'), { storage, lang: 'fi' });
    expect(screen.getByRole('heading', { name: 'Jatketaanko peliä?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Jatka' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aloita uusi kierros' })).toBeInTheDocument();
  });
});

describe('Home', () => {
  it('shows the latest unfinished game and continues it without asking again', () => {
    const { storage } = renderApp(link('/meaning'));
    fireEvent.click(screen.getByRole('button', { name: 'Skip this one' }));
    cleanup();

    renderApp('/', { storage });
    expect(screen.getByRole('heading', { name: 'Continue where you left off' })).toBeInTheDocument();
    expect(screen.getByText(/You were on 2 of 5\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Continue' }));
    expect(screen.queryByText('Continue your game?')).not.toBeInTheDocument();
    expect(screen.getByText('2 of 5')).toBeInTheDocument();
  });

  it('forgets it with No thanks', () => {
    const { storage } = renderApp(link('/meaning'));
    fireEvent.click(screen.getByRole('button', { name: 'Skip this one' }));
    cleanup();
    renderApp('/', { storage });
    fireEvent.click(screen.getByRole('button', { name: 'No thanks' }));
    expect(screen.queryByText('Continue where you left off')).not.toBeInTheDocument();
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});

describe('Hangman', () => {
  it('continues the word on screen with its guesses', () => {
    const address = `/play?words=${encodeWords([{ learning: 'dog', native: 'koira' }, { learning: 'cat', native: 'kissa' }])}&learningLang=en-GB&nativeLang=fi`;
    const { storage } = renderApp(address);
    const first = screen.getByTestId('native-word').textContent;
    fireEvent.click(screen.getByRole('button', { name: /^Z\b/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Q\b/ }));
    expect(screen.getByText('4 tries left')).toBeInTheDocument();
    cleanup();

    renderApp(address, { storage });
    expect(screen.getByText('You were on 1 of 2.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByTestId('native-word').textContent).toBe(first);
    expect(screen.getByText('4 tries left')).toBeInTheDocument();
  });
});

describe('Word rush', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('keeps the time that was left', () => {
    const { storage } = renderApp('/word-rush');
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    act(() => jest.advanceTimersByTime(20_000));
    cleanup();

    renderApp('/word-rush', { storage });
    expect(screen.getByText('0 answered, 40 seconds left.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('timer')).toHaveAccessibleName('40 seconds left');
  });
});

describe('Daily word free play', () => {
  it('continues a word with its guesses', () => {
    const { storage } = renderApp('/daily/free');
    'HOUSE'.split('').forEach((l) => fireEvent.keyDown(window, { key: l }));
    fireEvent.keyDown(window, { key: 'Enter' });
    cleanup();

    renderApp('/daily/free', { storage });
    expect(screen.getByText('1 of 6 guesses used.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getAllByRole('listitem')[0]).toHaveAccessibleName(/^H /);
  });
});
