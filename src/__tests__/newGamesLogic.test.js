import { buildTalk, buildTalkRound, isTalkText, learnerSpeaker, nextTurn, pickReplies } from '../games/talk/talkLogic';
import { buildMistakeRound, mistakeQuestion, mistakeTiles } from '../games/mistake/mistakeLogic';
import { comboBonus, comboMultiplier, readBest, rushPoints, rushPool, saveBest } from '../games/rush/rushLogic';
import {
  dailyCandidates, dailyFor, emptyDaily, finishDaily, letterStates, scoreGuess, wordForDay,
} from '../games/daily/dailyLogic';
import { buildReadRound, readQuestion } from '../games/read/readLogic';
import { getGapItems, getItems, getTexts, getTopics } from '../lib/words';
import { memoryStorage } from '../test-utils';
import { validateItem } from '../lib/contentSchema';

const dialogue = (id, lines, extra = {}) => ({
  id, type: 'text', kind: 'dialogue', title: { en: id },
  sentences: lines.map(([speaker, en]) => ({ speaker, en, fi: `${en} (fi)` })), ...extra,
});
const cafe = dialogue('cafe', [['Server', 'Hi.'], ['Anna', 'A latte, please.'], ['Server', 'Here or to go?'], ['Anna', 'For here.']]);
const way = dialogue('way', [['Mikko', 'Excuse me.'], ['Woman', 'Yes?'], ['Woman', 'Go left.'], ['Mikko', 'Thanks.']], { you: 'Mikko' });

describe('Your turn', () => {
  it('plays the dialogue\'s "you", or else the second speaker', () => {
    expect(learnerSpeaker(cafe)).toBe('Anna');
    expect(learnerSpeaker(way)).toBe('Mikko');
    expect(learnerSpeaker({ ...way, you: 'Nobody' })).toBe('Woman');
  });

  it('offers a later line of the same conversation and lines from others, never the answer twice', () => {
    const replies = pickReplies('A latte, please.', ['A latte, please.', 'For here.'], ['Thanks.', 'Excuse me.']);
    expect(replies).toHaveLength(2);
    expect(replies[0]).toBe('For here.');
    expect(replies).not.toContain('A latte, please.');
    // The last line never offers one already said.
    expect(pickReplies('For here.', ['A latte, please.', 'For here.'], ['Thanks.', 'Excuse me.'])).not.toContain('A latte, please.');
  });

  it('builds options only on the learner\'s lines and finds the next turn', () => {
    const q = buildTalk(cafe, [cafe, way]);
    expect(q.you).toBe('Anna');
    expect(q.partner).toBe('Server');
    expect(q.lines.filter((l) => l.options)).toHaveLength(2);
    q.lines.filter((l) => l.mine).forEach((l) => expect(l.options).toContain(l.en));
    expect(nextTurn(q.lines, 0)).toBe(1);
    expect(nextTurn(q.lines, 4)).toBe(4);
    const w = buildTalk(way, [cafe, way]);
    expect(nextTurn(w.lines, 0)).toBe(0);
    expect(nextTurn(w.lines, 1)).toBe(3);
  });

  it('every two-person word bank dialogue makes a playable conversation', () => {
    const texts = getTexts({ kind: 'dialogue' }).filter(isTalkText);
    expect(texts.length).toBeGreaterThanOrEqual(10);
    const round = buildTalkRound(texts, { count: texts.length });
    expect(round.length).toBe(texts.length);
    round.forEach((q) => {
      const turns = q.lines.filter((l) => l.mine);
      expect(turns.length).toBeGreaterThan(0);
      turns.forEach((l) => expect(new Set(l.options).size).toBe(3));
    });
  });
});

describe('Spot the mistake', () => {
  it('puts the mistake in the gap with stuck punctuation and a capital at the start', () => {
    expect(mistakeTiles('Where ___ the toilet?', 'are').map((t) => t.text)).toEqual(['Where', 'are', 'the', 'toilet?']);
    expect(mistakeTiles('What did you ___?', 'saw').map((t) => t.text)).toEqual(['What', 'did', 'you', 'saw?']);
    expect(mistakeTiles('___ sun is bright.', 'a')[0]).toEqual({ text: 'A', wrong: true });
  });

  it('uses a hand-written wrong option and skips "no word" answers', () => {
    const q = { id: 'x', text: 'Tetris ___ out in 1984.', answer: 'came', options: ['came', 'has come', 'have come', 'went'], sentence: 'Tetris came out in 1984.' };
    const item = { answers: ['came'], distractors: ['has come', 'have come'] };
    const m = mistakeQuestion(q, item, () => 0);
    expect(m.mistake).toBe('has come');
    expect(m.tiles.find((t) => t.wrong).text).toBe('has come');
    expect(m.fixes).toEqual(expect.arrayContaining(['came', 'has come']));
    expect(m.fixes).toHaveLength(3);
    expect(mistakeQuestion({ ...q, answer: '' }, { answers: [''], distractors: ['the'] })).toBeNull();
    expect(mistakeQuestion(q, { answers: ['came'], distractors: [''] })).toBeNull();
  });

  it('makes a full round from the word bank', () => {
    const round = buildMistakeRound({ topics: [...getTopics('rule'), ...getTopics('confusable')], gaps: getGapItems() });
    expect(round).toHaveLength(10);
    round.forEach((q) => {
      expect(q.tiles.filter((t) => t.wrong)).toHaveLength(1);
      expect(q.fixes).toContain(q.answer);
      expect(q.mistake.toLowerCase()).not.toBe(q.answer.toLowerCase());
    });
  });
});

describe('Word rush', () => {
  it('multiplies the score for answers in a row and adds time every five', () => {
    expect([1, 2, 3, 5, 6, 10].map(comboMultiplier)).toEqual([1, 1, 2, 2, 3, 3]);
    expect(rushPoints(1)).toBe(10);
    expect(rushPoints(6)).toBe(30);
    expect([4, 5, 6, 10].map(comboBonus)).toEqual([0, 3, 0, 3]);
  });

  it('keeps short words and remembers the best score', () => {
    expect(rushPool([{ learning: 'dog', native: 'koira' }, { learning: 'how are you today', native: 'mitä kuuluu' }])).toHaveLength(1);
    const storage = memoryStorage();
    expect(readBest(storage)).toBe(0);
    saveBest(120, storage);
    expect(readBest(storage)).toBe(120);
  });
});

describe('Daily word', () => {
  it('marks letters like the classic game, counting repeated letters once', () => {
    expect(scoreGuess('HOUSE', 'HORSE')).toEqual(['hit', 'hit', 'miss', 'hit', 'hit']);
    expect(scoreGuess('LLAMA', 'HELLO')).toEqual(['near', 'near', 'miss', 'miss', 'miss']);
    expect(scoreGuess('EERIE', 'THERE')).toEqual(['near', 'miss', 'near', 'miss', 'hit']);
    expect(letterStates(['HOUSE', 'HORSE'], 'HORSE')).toMatchObject({ H: 'hit', R: 'hit', U: 'miss' });
  });

  it('gives everyone the same word for a day and keeps it all day', () => {
    const candidates = dailyCandidates(getItems({ type: 'word' }));
    expect(candidates.length).toBeGreaterThan(30);
    candidates.forEach((c) => expect(c.word).toMatch(/^[A-Z]{5}$/));
    expect(wordForDay(candidates, '2026-10-16')).toEqual(wordForDay(candidates, '2026-10-16'));
    expect(wordForDay(candidates, '2026-10-16')).not.toEqual(wordForDay(candidates, '2026-10-17'));
    const today = dailyFor(emptyDaily(), '2026-10-16', candidates);
    const played = { ...today, guesses: ['HOUSE'] };
    // A changed word list doesn't change today's word or guesses.
    expect(dailyFor(played, '2026-10-16', candidates.slice(1))).toBe(played);
    expect(dailyFor(played, '2026-10-17', candidates).guesses).toEqual([]);
  });

  it('keeps a streak of days found in a row', () => {
    let s = finishDaily(emptyDaily(), { won: true, key: '2026-10-15', yesterday: '2026-10-14' });
    s = finishDaily(s, { won: true, key: '2026-10-16', yesterday: '2026-10-15' });
    expect(s).toMatchObject({ played: 2, won: 2, streak: 2, bestStreak: 2 });
    s = finishDaily(s, { won: false, key: '2026-10-17', yesterday: '2026-10-16' });
    expect(s).toMatchObject({ played: 3, won: 2, streak: 0, bestStreak: 2 });
    s = finishDaily(s, { won: true, key: '2026-10-19', yesterday: '2026-10-18' });
    expect(s.streak).toBe(1);
  });
});

describe('Read and understand', () => {
  it('turns every word bank text into questions with the answer among the options', () => {
    const texts = getTexts();
    const round = buildReadRound(texts, { count: texts.length });
    expect(round.length).toBe(texts.length);
    round.forEach((q) => {
      expect(q.questions.length).toBeGreaterThan(0);
      q.questions.forEach((x) => {
        expect(x.options).toContain(x.answer);
        expect(x.options.length).toBeLessThanOrEqual(4);
      });
    });
    expect(readQuestion(cafe).questions).toEqual([]);
  });
});

describe('Dialogue "you" in the word bank schema', () => {
  const ctx = { languageCodes: new Set(['en', 'fi']) };
  it('must name one of the speakers', () => {
    expect(validateItem({ ...way, title: { en: 'Way' } }, ctx).join()).not.toMatch(/you/);
    expect(validateItem({ ...way, you: 'Nobody', title: { en: 'Way' } }, ctx).join()).toMatch(/you must be the name/);
  });
});
