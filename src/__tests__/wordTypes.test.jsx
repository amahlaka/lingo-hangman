import { fireEvent, screen, within } from '@testing-library/react';
import { renderApp, memoryStorage } from '../test-utils';
import bundled from '../lib/bundledContent';
import { getContent, setContent } from '../lib/content';
import { validateItem } from '../lib/contentSchema';
import { emptyProgress, wordKey } from '../lib/progress';
import { resetPreferences, setPreferences } from '../lib/preferences';
import { phraseTokens } from '../games/practice/practiceLogic';
import {
  SENTENCE_RULES,
  autoHints,
  hardLevels,
  parseWordType,
  sentenceLesson,
  sentencePattern,
  sentenceTypes,
  slotKind,
  typedExamples,
  wordClassOf,
} from '../lib/wordTypes';

const word = (id, en, fi, wordTypes, level = 1) => ({ id, type: 'word', text: { en, fi }, pos: 'sentence', level, wordTypes });
const fixture = {
  id: 'wt-test',
  items: [
    word('wt-anna-drinks-coffee', 'Anna drinks coffee.', 'Anna juo kahvia.', ['noun:subject', 'verb', 'noun:object']),
    word('wt-do-you-like-tea', 'Do you like tea?', 'Pidätkö teestä?', ['auxiliary', 'pronoun:subject', 'verb', 'noun:object']),
    word('wt-the-soup-is-hot', 'The soup is hot.', 'Keitto on kuumaa.', ['article', 'noun:subject', 'verb', 'adjective']),
    { id: 'wt-coffee', type: 'word', text: { en: 'coffee', fi: 'kahvi' }, pos: 'noun' },
    {
      id: 'sentence-svo', type: 'rule',
      title: { en: 'Subject, verb, object', fi: 'Subjekti, verbi, objekti' },
      explanation: { en: 'Subject first, then the verb, then the object.', fi: 'Ensin subjekti, sitten verbi ja objekti: *Anna drinks coffee*.' },
      examples: [{ en: 'We bought a sofa.', fi: 'Ostimme sohvan.', wordTypes: ['pronoun:subject', 'verb', 'article', 'noun:object'] }],
    },
    ...['sentence-be', 'sentence-questions-do'].map((id) => ({
      id, type: 'rule', title: { en: id, fi: id }, explanation: { en: `About ${id}.`, fi: `Tästä: ${id}.` },
    })),
  ],
};
const useFixture = () =>
  setContent({ index: { ...bundled.index, packs: ['wt-test'] }, languages: bundled.languages, packs: [fixture] });
const types = (...tags) => tags.map(parseWordType);

afterEach(() => {
  setContent(bundled);
  resetPreferences();
  setPreferences({ typeColors: false, typeHelp: true });
});

describe('word types', () => {
  it('parses classes and roles and labels places', () => {
    expect(parseWordType('noun:subject')).toEqual({ cls: 'noun', role: 'subject' });
    expect(parseWordType('verb')).toEqual({ cls: 'verb', role: null });
    expect(parseWordType('nonsense')).toBeNull();
    expect(slotKind(parseWordType('pronoun:object'))).toBe('object');
    expect(slotKind(parseWordType('adjective'))).toBe('adjective');
  });

  it('checks wordTypes in the word bank against the words of the sentence', () => {
    expect(validateItem(fixture.items[0])).toEqual([]);
    expect(validateItem({ ...fixture.items[0], wordTypes: ['noun', 'verb'] })[0]).toMatch(/2 entries but .* has 3 words/);
    expect(validateItem({ ...fixture.items[0], wordTypes: ['noun', 'verb', 'thing'] })[0]).toMatch(/word classes/);
    expect(validateItem(fixture.items[4])).toEqual([]);
    const badExample = { ...fixture.items[4], examples: [{ en: 'We bought a sofa.', wordTypes: ['verb'] }] };
    expect(validateItem(badExample)[0]).toMatch(/examples\[1\]\.wordTypes has 1 entries/);
  });

  it('picks the sentence-structure rule a sentence practises', () => {
    const pattern = (text, ...tags) => sentencePattern(types(...tags), phraseTokens(text), text);
    expect(pattern('Anna drinks coffee.', 'noun:subject', 'verb', 'noun:object')).toBe('sentence-svo');
    expect(pattern('The soup is hot.', 'article', 'noun:subject', 'verb', 'adjective')).toBe('sentence-be');
    expect(pattern('Do you like tea?', 'auxiliary', 'pronoun:subject', 'verb', 'noun:object')).toBe('sentence-questions-do');
    expect(pattern('Can you help me?', 'auxiliary', 'pronoun:subject', 'verb', 'pronoun:object')).toBe('sentence-questions-helper');
    expect(pattern('Is this dish vegetarian?', 'verb', 'pronoun', 'noun:subject', 'adjective')).toBe('sentence-questions-helper');
    expect(pattern('Where is the toilet?', 'question', 'verb', 'article', 'noun:subject')).toBe('sentence-wh-questions');
    expect(pattern("I don't eat meat.", 'pronoun:subject', 'auxiliary', 'verb', 'noun:object')).toBe('sentence-negatives');
    expect(pattern('Is there a bank?', 'verb', 'pronoun:subject', 'article', 'noun')).toBe('sentence-there-is');
    expect(pattern('Please call an ambulance!', 'interjection', 'verb', 'article', 'noun:object')).toBe('sentence-imperatives');
    expect(pattern("Don't feed the trolls.", 'auxiliary', 'verb', 'article', 'noun:object')).toBe('sentence-imperatives');
    expect(pattern('in the morning', 'preposition', 'article', 'noun')).toBeNull();
  });

  it('gives every tagged sentence in the word bank a rule the word bank has, or none', () => {
    const { items, byId } = getContent();
    for (const item of items.filter((i) => i.type === 'word' && i.wordTypes)) {
      const pair = { id: item.id, learning: item.text['en-GB'] || item.text.en };
      expect([item.id, sentenceTypes(pair, phraseTokens(pair.learning))?.length]).toEqual([item.id, item.wordTypes.length]);
      const lesson = sentenceLesson(pair);
      if (lesson) expect(SENTENCE_RULES).toContain(lesson);
    }
    for (const id of SENTENCE_RULES.filter((r) => byId.has(r))) {
      expect([id, typedExamples(byId.get(id)).length > 0]).toEqual([id, true]);
    }
  });

  it('looks up the class of a loose word', () => {
    useFixture();
    expect(wordClassOf('coffee')).toBe('noun');
    expect(wordClassOf('drinks')).toBe('verb');
    expect(wordClassOf('zebra')).toBeNull();
    expect(sentenceLesson({ id: 'wt-anna-drinks-coffee', learning: 'Anna drinks coffee.' })).toBe('sentence-svo');
    expect(sentenceLesson({ id: 'wt-do-you-like-tea', learning: 'Do you like tea?' })).toBe('sentence-questions-do');
    expect(sentenceLesson({ id: 'wt-coffee', learning: 'coffee' })).toBeUndefined();
  });
});

describe('automatic word-type help', () => {
  const lang = 'en-GB';
  const state = (recent) => {
    const s = emptyProgress();
    for (const [text, marks] of Object.entries(recent)) {
      s.words[wordKey(text, lang)] = { solved: 1, lost: 1, days: [], recent: marks };
    }
    return s;
  };
  const items = [
    { learning: 'Anna drinks coffee.', level: 1 },
    { learning: 'Do you like tea?', level: 1 },
    { learning: 'If it rains, we will stay at home.', level: 3 },
  ];

  it('marks an easy level as hard when few recent answers were quick first tries', () => {
    expect(hardLevels(state({ 'Anna drinks coffee.': '21', 'Do you like tea?': '01' }), items, lang)).toEqual(new Set([1]));
    expect(hardLevels(state({ 'Anna drinks coffee.': '22', 'Do you like tea?': '21' }), items, lang)).toEqual(new Set());
    // Too few answers to tell.
    expect(hardLevels(state({ 'Anna drinks coffee.': '0' }), items, lang)).toEqual(new Set());
    // Hard sentences don't count.
    expect(hardLevels(state({ 'If it rains, we will stay at home.': '00000' }), items, lang)).toEqual(new Set());
  });

  it('turns hints on for easy sentences of a hard level or a tricky sentence only', () => {
    const fresh = emptyProgress();
    expect(autoHints(fresh, items[0], new Set([1]), lang)).toBe(true);
    expect(autoHints(fresh, items[0], new Set(), lang)).toBe(false);
    expect(autoHints(fresh, items[2], new Set([1, 2, 3]), lang)).toBe(false);
    expect(autoHints(state({ 'Do you like tea?': '0' }), items[1], new Set(), lang)).toBe(true);
  });
});

describe('Build the phrase hints', () => {
  const answers = Object.fromEntries(fixture.items.filter((i) => i.wordTypes).map((i) => [i.text.fi, i.text.en]));
  const bank = () => screen.getByRole('group', { name: 'Words to use' });
  const solve = () => {
    const answer = answers[screen.getByTestId('prompt-word').textContent];
    for (const w of phraseTokens(answer)) fireEvent.click(within(bank()).getAllByRole('button', { name: new RegExp(`^${w}`) })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    return answer;
  };

  it('gives place labels and word types as hints, free at first', () => {
    useFixture();
    renderApp('/phrase');
    expect(screen.getByRole('button', { name: 'Show what goes where (free)' })).toBeEnabled();
    expect(screen.getByText('Free hints left in this game: 3')).toBeInTheDocument();
    solve();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    fireEvent.click(screen.getByRole('button', { name: /Show what goes where/ }));
    const answer = answers[screen.getByTestId('prompt-word').textContent];
    const slots = screen.getAllByTestId('phrase-slot');
    expect(slots).toHaveLength(phraseTokens(answer).length);
    expect(slots.some((s) => s.textContent === 'subject')).toBe(true);
    expect(screen.queryByRole('button', { name: /Show what goes where/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Show word types/ }));
    expect(within(bank()).getAllByRole('button').some((b) => /verb$/.test(b.textContent))).toBe(true);
    solve();
    // The rule comes after answering.
    expect(screen.getAllByText(/Sentence structure/).length).toBeGreaterThan(0);
  });

  it('shows word types for free on an easy sentence that has been hard', () => {
    useFixture();
    const progress = emptyProgress();
    for (const i of fixture.items.filter((x) => x.wordTypes)) {
      progress.words[wordKey(i.text.en, 'en-GB')] = { solved: 0, lost: 2, days: [], recent: '00' };
    }
    renderApp('/phrase', { storage: memoryStorage({ 'lingo.progress.v1': JSON.stringify(progress) }) });
    expect(screen.getByText('Word types are shown to help with this one.')).toBeInTheDocument();
    expect(screen.getAllByTestId('phrase-slot').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Show word types/ })).toBeNull();
  });

  it('colours words by type when the setting is on', () => {
    useFixture();
    setPreferences({ typeColors: true });
    renderApp('/phrase');
    expect(within(bank()).getAllByRole('button').every((b) => /lg-wt--/.test(b.className))).toBe(true);
    expect(screen.getByRole('list', { name: 'Colors' })).toBeInTheDocument();
  });

  it('opens the sentence rules over the round and comes back', () => {
    useFixture();
    renderApp('/phrase');
    const prompt = screen.getByTestId('prompt-word').textContent;
    fireEvent.click(screen.getByRole('button', { name: 'Sentence rules' }));
    expect(screen.getByRole('heading', { name: 'Subject, verb, object' })).toBeInTheDocument();
    expect(screen.getByText('We bought a sofa.'.split(' ')[0])).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to the game' }));
    expect(screen.getByTestId('prompt-word').textContent).toBe(prompt);
  });
});

describe('Practice settings', () => {
  it('turns word colours on and automatic help off', () => {
    renderApp('/preferences');
    fireEvent.click(screen.getByRole('button', { name: /Color words by type/ }));
    fireEvent.click(screen.getByRole('button', { name: /Help with easy sentences/ }));
    const saved = JSON.parse(localStorage.getItem('lingoPreferences'));
    expect(saved).toMatchObject({ typeColors: true, typeHelp: false });
  });
});
