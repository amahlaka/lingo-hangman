import { filterCommonWords } from '../lib/words';
import {
  addResult,
  buildChoiceQuestion,
  buildPhrasePuzzle,
  checkPhrase,
  correctPlaces,
  givenPlaces,
  emptyTally,
  isPhraseCandidate,
  phraseEnding,
  phraseTokens,
  pickDistractors,
  practicePool,
  usableWords,
} from '../games/practice/practiceLogic';
import { encodeWords } from '../lib/words';
import { wordClassOf } from '../lib/wordTypes';

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

  it('offers words of the same class as a single-word target', () => {
    const word = pool.find((w) => wordClassOf(w.learning) === 'noun' && w.categories?.includes('work'));
    for (let i = 0; i < 20; i++) {
      pickDistractors(word, pool, 3).forEach((o) => expect(wordClassOf(o.learning)).toBe('noun'));
    }
  });

  it('builds a question with the target among four options', () => {
    const target = pool[10];
    const q = buildChoiceQuestion(target, pool);
    expect(q.options).toHaveLength(4);
    expect(q.options).toContain(target);
  });
});

describe('practicePool', () => {
  it('uses every built-in word in US English by default and drops "My name is..."', () => {
    const { pairs, learningLang } = practicePool(new URLSearchParams());
    expect(learningLang).toBe('en');
    expect(pairs.some((p) => p.learning === 'Where is the bathroom?')).toBe(true);
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
    expect(correctPlaces(['how', 'you', 'are'], answer)).toEqual([0]);
    expect(correctPlaces(['are', 'how', 'you'], answer)).toEqual([2]);
    expect(correctPlaces(['How', 'you', 'you'], answer)).toEqual([0, 2]);
  });

  it('accepts please at the other end of a request', () => {
    const answer = ['please', 'take', 'your', 'shoes', 'off'];
    expect(checkPhrase(['take', 'your', 'shoes', 'off', 'please'], answer)).toBe(true);
    expect(checkPhrase(['take', 'your', 'please', 'shoes', 'off'], answer)).toBe(false);
    expect(checkPhrase(['please', 'help', 'me'], ['help', 'me', 'please'])).toBe(true);
    expect(checkPhrase(['please', 'yes'], ['yes', 'please'])).toBe(false);
  });

  it("accepts the item's other orders, with please at either end", () => {
    const answer = ['please', 'take', 'your', 'shoes', 'off'];
    const others = [['please', 'take', 'off', 'your', 'shoes']];
    expect(checkPhrase(['please', 'take', 'off', 'your', 'shoes'], answer, others)).toBe(true);
    expect(checkPhrase(['take', 'off', 'your', 'shoes', 'please'], answer, others)).toBe(true);
    expect(checkPhrase(['please', 'take', 'off', 'your', 'shoes'], answer)).toBe(false);
  });

  it('gives beginners a word or two in place on some sentences only', () => {
    const always = () => 0;
    expect(givenPlaces(['how', 'are', 'you'], always)).toHaveLength(1);
    expect(givenPlaces(['i', 'would', 'like', 'a', 'cup', 'of', 'tea'], always)).toHaveLength(2);
    expect(givenPlaces(['thank', 'you'], always)).toEqual([]);
    expect(givenPlaces(['how', 'are', 'you'], () => 0.5)).toEqual([]);
    let given = 0;
    for (let i = 0; i < 300; i++) given += givenPlaces(['how', 'are', 'you']).length > 0 ? 1 : 0;
    expect(given).toBeGreaterThan(50);
    expect(given).toBeLessThan(150);
  });

  it('hands out given words only on the easy difficulty', () => {
    const target = { learning: 'Where is the bus stop?', native: 'Missä on bussipysäkki?' };
    expect(buildPhrasePuzzle(target, () => 0, { easy: false }).given).toEqual([]);
    const easy = buildPhrasePuzzle(target, () => 0, { easy: true });
    expect(easy.given).toHaveLength(1);
    easy.given.forEach((i) => expect(i).toBeLessThan(easy.answer.length));
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
    expect(tally).toEqual({ answered: 5, correct: 4, firstTry: 3, xp: 78, run: 1, bestRun: 2 });
  });
});

describe('word pairs', () => {
  const {
    buildPairBoards,
    isPairCandidate,
  } = require('../games/practice/practiceLogic');

  it('makes boards of five with no repeated text on a board', () => {
    const pool = filterCommonWords({ learningLang: 'en-GB', nativeLang: 'fi' }).filter(isPairCandidate);
    const boards = buildPairBoards(pool);
    expect(boards).toHaveLength(2);
    boards.forEach((b) => {
      expect(b.items).toHaveLength(5);
      const native = b.items.map((i) => i.pair.native.toLowerCase());
      expect(new Set(native).size).toBe(native.length);
      expect(b.learning.map((i) => i.id).sort()).toEqual(b.native.map((i) => i.id).sort());
    });
    const all = boards.flatMap((b) => b.items.map((i) => i.pair.learning));
    expect(new Set(all).size).toBe(all.length);
  });

  it('keeps "he" and "she" off the same board, since both are "hän"', () => {
    const pool = [
      { learning: 'he', native: 'hän' },
      { learning: 'she', native: 'hän' },
      { learning: 'cat', native: 'kissa' },
      { learning: 'dog', native: 'koira' },
    ];
    const [board] = buildPairBoards(pool);
    expect(board.items).toHaveLength(3);
  });

  it('folds a short tail into the board before it', () => {
    const pool = Array.from({ length: 7 }, (_, i) => ({ learning: `w${i}`, native: `s${i}` }));
    expect(buildPairBoards(pool).map((b) => b.items.length)).toEqual([7]);
  });

  it('needs at least three pairs', () => {
    expect(buildPairBoards([{ learning: 'a', native: 'b' }, { learning: 'c', native: 'd' }])).toEqual([]);
  });
});

describe('fill the gap', () => {
  const { buildGapQuestion, buildGapRound, isGapCandidate, pickGapOptions } = require('../games/practice/practiceLogic');
  const pool = filterCommonWords({ learningLang: 'en-GB', nativeLang: 'fi' });
  const fixed = () => 0.42;

  it('offers grammar words from the same group', () => {
    const options = pickGapOptions('is', ['Where', 'is', 'the', 'toilet'], pool, 3, fixed);
    expect(options).toHaveLength(3);
    options.forEach((o) => expect(['are', 'am', 'was', 'were']).toContain(o));
  });

  it('never offers a word that is already in the sentence', () => {
    const options = pickGapOptions('the', ['the', 'man', 'opens', 'the', 'door', 'this'], pool, 3, fixed);
    expect(options).not.toContain('the');
    expect(options).not.toContain('this');
  });

  it('splits the sentence around the gap and keeps its punctuation', () => {
    const q = buildGapQuestion({ learning: 'Where is the toilet?', native: 'Missä on WC?' }, pool);
    expect(q.options).toContain(q.answer);
    expect(q.options).toHaveLength(4);
    expect(new Set(q.options).size).toBe(4);
    const rebuilt = `${q.before ? q.before + ' ' : ''}${q.answer}${q.after}`;
    expect(rebuilt).toBe('Where is the toilet?');
  });

  it('capitalises every option when the gap starts the sentence', () => {
    for (let i = 0; i < 20; i++) {
      const q = buildGapQuestion({ learning: 'Where is the toilet?', native: 'Missä on WC?' }, pool);
      if (q.before === '') q.options.forEach((o) => expect(o[0]).toBe(o[0].toUpperCase()));
      else if (q.answer !== 'I') q.options.filter((o) => o !== 'I').forEach((o) => expect(o[0]).toBe(o[0].toLowerCase()));
    }
  });

  it('never gaps a capitalised name or day in mid-sentence', () => {
    for (let i = 0; i < 20; i++) {
      const q = buildGapQuestion({ learning: 'See you on Monday in London', native: 'Nähdään maanantaina Lontoossa' }, pool);
      expect(['Monday', 'London']).not.toContain(q.answer);
    }
  });

  it('never gaps a contraction', () => {
    for (let i = 0; i < 20; i++) {
      const q = buildGapQuestion({ learning: "It's nine o'clock", native: 'Kello on yhdeksän' }, pool);
      expect(q.answer).toBe('nine');
      expect(q.after).toBe(" o'clock");
    }
  });

  it('builds a full round from the built-in sentences', () => {
    const sentences = pool.filter(isGapCandidate);
    const round = buildGapRound(sentences, pool, 8);
    expect(round).toHaveLength(8);
  });
});

describe('fill the gap with the word bank', () => {
  const { buildGapRound, gapItemQuestion } = require('../games/practice/practiceLogic');
  const { getGapItems, getSentences } = require('../lib/words');
  const item = {
    id: 'a-or-an-2', type: 'gap', lang: 'en', sentence: 'She has ___ new car.', answers: ['a'], distractors: ['an'],
    translation: { fi: 'Hänellä on uusi auto.' }, explanation: { fi: 'New alkaa konsonanttiäänteellä.' },
  };

  it('keeps a hand-written item as written, two options and all', () => {
    const q = gapItemQuestion(item, 'fi');
    expect(q.answer).toBe('a');
    expect(q.options.sort()).toEqual(['a', 'an']);
    expect(q.before).toBe('She has');
    expect(q.after).toBe(' new car.');
    expect(q.target).toEqual({ learning: 'She has a new car.', native: 'Hänellä on uusi auto.', id: 'a-or-an-2' });
    expect(q.explanation.fi).toMatch(/konsonantti/);
  });

  it('skips an item with no translation in the learner’s language', () => {
    expect(gapItemQuestion(item, 'sv')).toBeNull();
  });

  it('never offers a second right answer as a wrong one', () => {
    const q = gapItemQuestion({ ...item, answers: ['bill', 'check'], distractors: ['check', 'menu'], sentence: 'The ___, please.' }, 'fi');
    expect(q.options.sort()).toEqual(['bill', 'menu']);
  });

  it('mixes word bank items and sentences without repeating a sentence', () => {
    const items = getGapItems({ lang: 'en-GB' });
    const sentences = getSentences({ learningLang: 'en-GB', nativeLang: 'fi' });
    expect(items.length).toBeGreaterThan(0);
    const round = buildGapRound(sentences, sentences, 30, Math.random, { items, nativeLang: 'fi' });
    expect(round).toHaveLength(30);
    const texts = round.map((q) => q.target.learning.toLowerCase());
    expect(new Set(texts).size).toBe(texts.length);
    round.forEach((q) => {
      expect(q.options).toContain(q.answer);
      expect(`${q.before ? q.before + ' ' : ''}${q.answer}${q.after}`).toBe(q.target.learning);
    });
  });
});
