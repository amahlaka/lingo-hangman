import { filterCommonWords } from '../lib/words';
import {
  addResult,
  buildChoiceQuestion,
  buildPhrasePuzzle,
  checkPhrase,
  correctPrefixLength,
  emptyTally,
  isPhraseCandidate,
  phraseEnding,
  phraseTokens,
  pickDistractors,
  practicePool,
  usableWords,
} from '../games/practice/practiceLogic';
import { encodeWords } from '../lib/words';

const pool = usableWords(filterCommonWords({ learningLang: 'en', nativeLang: 'fi' }));

describe('pickDistractors', () => {
  it('never offers a word with the same meaning or text as the target', () => {
    const he = pool.find((w) => w.learning === 'he');
    for (let i = 0; i < 50; i++) {
      const options = pickDistractors(he, pool, 3);
      expect(options).toHaveLength(3);
      expect(options.map((o) => o.native)).not.toContain('hän');
      expect(new Set(options.map((o) => o.learning)).size).toBe(3);
    }
  });

  it('matches the shape of the target (word vs phrase)', () => {
    const phrase = pool.find((w) => w.learning === 'Can you help me?');
    pickDistractors(phrase, pool, 3).forEach((o) => expect(o.learning.split(' ').length).toBeGreaterThan(1));
    const word = pool.find((w) => w.learning === 'train');
    pickDistractors(word, pool, 3).forEach((o) => expect(o.learning.split(' ')).toHaveLength(1));
  });

  it('builds a question with the target among four options', () => {
    const target = pool[10];
    const q = buildChoiceQuestion(target, pool);
    expect(q.options).toHaveLength(4);
    expect(q.options).toContain(target);
  });
});

describe('practicePool', () => {
  it('uses every built-in word in British English by default and drops "My name is..."', () => {
    const { pairs, learningLang } = practicePool(new URLSearchParams());
    expect(learningLang).toBe('en-GB');
    expect(pairs.some((p) => p.learning === 'Where is the toilet?')).toBe(true);
    expect(pairs.some((p) => p.learning.includes('...'))).toBe(false);
    expect(pairs.length).toBeGreaterThan(50);
  });

  it('uses the words from a shared link', () => {
    const words = encodeWords([{ learning: 'cat', native: 'kissa' }, { learning: 'dog', native: 'koira' }]);
    const { pairs, fromLink } = practicePool(new URLSearchParams(`words=${words}`));
    expect(fromLink).toBe(true);
    expect(pairs.map((p) => p.learning).sort()).toEqual(['cat', 'dog']);
  });
});

describe('build the phrase', () => {
  it('strips punctuation and capitals but keeps "I"', () => {
    expect(phraseTokens('How much is this?')).toEqual(['how', 'much', 'is', 'this']);
    expect(phraseTokens("I don't understand")).toEqual(['I', "don't", 'understand']);
    expect(phraseTokens('help me, please')).toEqual(['help', 'me', 'please']);
    expect(phraseEnding('What time is it?')).toBe('?');
  });

  it('never hands out the phrase already in order', () => {
    const target = { learning: 'in the morning', native: 'aamulla' };
    for (let i = 0; i < 30; i++) {
      const p = buildPhrasePuzzle(target);
      expect(p.chips.map((c) => c.word)).not.toEqual(p.answer);
      expect([...p.chips.map((c) => c.word)].sort()).toEqual([...p.answer].sort());
    }
  });

  it('checks answers and counts the right start', () => {
    const answer = ['how', 'are', 'you'];
    expect(checkPhrase(['how', 'are', 'you'], answer)).toBe(true);
    expect(checkPhrase(['are', 'how', 'you'], answer)).toBe(false);
    expect(correctPrefixLength(['how', 'you', 'are'], answer)).toBe(1);
  });

  it('has enough phrases in the word bank for a round', () => {
    expect(pool.filter(isPhraseCandidate).length).toBeGreaterThanOrEqual(6);
  });
});

describe('round summary', () => {
  it('counts right answers, first tries, points and the best run', () => {
    let tally = emptyTally();
    for (let i = 0; i < 3; i++) tally = addResult(tally, { solved: true, firstTry: i > 0, xp: 19 });
    tally = addResult(tally, { solved: false, xp: 2 });
    tally = addResult(tally, { solved: true, firstTry: true, xp: 19 });
    expect(tally).toEqual({ answered: 5, correct: 4, firstTry: 3, xp: 78, run: 1, bestRun: 3 });
  });
});
